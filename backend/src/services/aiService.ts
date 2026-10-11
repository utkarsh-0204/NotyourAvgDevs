import { GoogleGenAI, Type } from '@google/genai';
import { config } from '../config/index.js';
import { LegalAnalysisResult, LegalAnalysisResultSchema } from '../schemas/analysisSchema.js';
import { DeterministicLegalExtractor } from './deterministicExtractor.js';
import { NvidiaClient } from './nvidiaClient.js';
import { JudgmentPipeline, LEGAL_DISCLAIMER } from './judgmentPipeline.js';
import { PageText, PageSource, TextExtractor } from './textExtractor.js';

export interface AnalysisInput {
  text: string;
  originalFilename: string;
  pages?: PageText[];
  pageSource?: PageSource;
  emptyPages?: number[];
  overrideGeminiApiKey?: string;
}

export class AIService {
  private static geminiClient: GoogleGenAI | null = null;

  public static isGeminiConfigured(): boolean {
    return Boolean(config.geminiApiKey && config.geminiApiKey.trim().length > 0);
  }

  private static getClient(): GoogleGenAI | null {
    if (!this.isGeminiConfigured()) return null;
    if (!this.geminiClient) {
      this.geminiClient = new GoogleGenAI({ apiKey: config.geminiApiKey });
    }
    return this.geminiClient;
  }

  public static isNvidiaConfigured(): boolean {
    return NvidiaClient.isConfigured();
  }

  /**
   * Main analysis method.
   * Order of preference: NVIDIA detailed chunked pipeline -> Gemini (single call) -> deterministic rule-based extractor.
   */
  public static async analyzeDocument(input: AnalysisInput): Promise<LegalAnalysisResult> {
    const { text, originalFilename, overrideGeminiApiKey } = input;
    const fallbackNotes: string[] = [];

    if (NvidiaClient.isConfigured()) {
      try {
        const pages = input.pages?.length ? input.pages : TextExtractor.segmentText(text);
        const pageSource: PageSource = input.pages?.length ? input.pageSource || 'pdf' : 'segment';
        console.log(`[AIService] Initiating NVIDIA analysis for ${originalFilename} using model ${config.nvidiaModel}`);
        return await JudgmentPipeline.analyze(pages, pageSource, input.emptyPages || [], originalFilename);
      } catch (error: any) {
        console.warn(`[AIService] NVIDIA analysis failed: ${error.message}. Trying fallback provider.`);
        fallbackNotes.push(`NVIDIA AI analysis failed (${error.message || 'API error'}), so a fallback engine produced this result. It is less detailed and has no verified page references.`);
      }
    }

    const effectiveApiKey = overrideGeminiApiKey || config.geminiApiKey;

    if (effectiveApiKey && effectiveApiKey.trim().length > 0) {
      try {
        console.log(`[AIService] Initiating Gemini analysis for ${originalFilename} using model ${config.geminiModel}`);
        const result = await this.analyzeWithGemini(text, originalFilename, effectiveApiKey);
        if (text.length > 60000) {
          fallbackNotes.push(
            'The Gemini fallback only reads the beginning, a middle section and the end of very long judgments, so parts of this document were not analysed. Configure NVIDIA_API_KEY for full-length analysis.'
          );
        }
        result.summary.limitations.push(...fallbackNotes, LEGAL_DISCLAIMER);
        return result;
      } catch (error: any) {
        console.warn(`[AIService] Gemini API call failed or encountered error: ${error.message}. Falling back to Local Rule-Based Engine.`);
        const fallback = DeterministicLegalExtractor.analyze(text, originalFilename);
        fallback.summary.limitations.push(
          ...fallbackNotes,
          `Primary Gemini AI call failed (${error.message || 'API error'}). Results computed via deterministic Indian legal rules.`
        );
        return fallback;
      }
    }

    console.log(`[AIService] No AI provider succeeded or configured. Using Local Rule-Based Engine (Demo Mode).`);
    const fallback = DeterministicLegalExtractor.analyze(text, originalFilename);
    fallback.summary.limitations.push(...fallbackNotes);
    return fallback;
  }

  /**
   * Analyzes legal document using official @google/genai SDK with structured output
   */
  private static async analyzeWithGemini(
    text: string,
    originalFilename: string,
    apiKey: string
  ): Promise<LegalAnalysisResult> {
    const client = new GoogleGenAI({ apiKey });

    // Truncate/prepare text window if extremely long (preserving headnote and concluding order)
    const processedText = this.prepareDocumentContext(text);

    const systemInstruction = `
You are an expert Indian Legal Document Analysis Engine. You analyze Indian court judgments, orders, petitions, and legal filings.
You extract objective facts, categorize the case, extract legal citations (Articles, Sections, Rules, Case Laws), summarize the facts, legal issues, arguments, reasoning, and determine the exact court outcome.

IMPORTANT CONSTRAINTS:
1. Do not act as a lawyer or provide legal advice. Maintain objective legal-tech extraction standards.
2. Clearly distinguish extracted facts from legal interpretations.
3. Classify case categories contextually: Civil, Criminal, Constitutional, Writ Petition, Service and employment, Property, Family, Commercial, Tax, Administrative, Other. Do NOT categorize as Criminal simply because the word "appeal" appears.
4. Extract only entities (Petitioner, Respondent, Judge, Advocate, Appellant, Accused) supported by the text.
5. Identify the court outcome verbatim and accurately: 'Allowed', 'Dismissed', 'Partly Allowed', 'Remanded', 'Conviction', 'Acquittal', 'Disposed of with Directions', 'Interim Relief Granted', or 'Other'.
6. Return only valid JSON conforming strictly to the requested schema.
`;

    const prompt = `
Analyze the following Indian court document (Filename: "${originalFilename}"):

DOCUMENT TEXT:
\"\"\"
${processedText}
\"\"\"

Provide a comprehensive, structured Indian legal analysis in the exact JSON schema requested.
`;

    const response = await client.models.generateContent({
      model: config.geminiModel,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            caseClassification: {
              type: Type.OBJECT,
              properties: {
                primary: { type: Type.STRING },
                secondary: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                confidence: { type: Type.NUMBER },
                evidence: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['primary', 'confidence'],
            },
            documentMetadata: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                court: { type: Type.STRING },
                caseNumber: { type: Type.STRING },
                decisionDate: { type: Type.STRING },
                bench: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                jurisdiction: { type: Type.STRING },
              },
            },
            parties: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  role: { type: Type.STRING },
                  evidence: { type: Type.STRING },
                },
                required: ['name', 'role'],
              },
            },
            legalProvisions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  type: { type: Type.STRING },
                  context: { type: Type.STRING },
                  evidence: { type: Type.STRING },
                },
                required: ['name', 'type', 'context'],
              },
            },
            summary: {
              type: Type.OBJECT,
              properties: {
                overview: { type: Type.STRING },
                facts: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                legalIssues: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                arguments: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                reasoning: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                outcome: { type: Type.STRING },
                outcomeCategory: { type: Type.STRING },
                limitations: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['overview', 'outcome', 'outcomeCategory'],
            },
            importantPassages: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  purpose: { type: Type.STRING },
                  page: { type: Type.NUMBER },
                },
                required: ['text', 'purpose'],
              },
            },
          },
          required: ['caseClassification', 'parties', 'legalProvisions', 'summary', 'importantPassages'],
        },
      },
    });

    const rawText = response.text || '';
    const parsedJson = JSON.parse(rawText);

    // Validate with Zod
    const validated = LegalAnalysisResultSchema.safeParse({
      ...parsedJson,
      aiAnalysisInfo: {
        method: 'gemini-ai',
        model: config.geminiModel,
        analyzedAt: new Date().toISOString(),
        isDemoMode: false,
      },
    });

    if (!validated.success) {
      console.warn('[AIService] Zod validation issue on Gemini response, patching defaults:', validated.error);
      // Clean up fallback or patch
      const patched: LegalAnalysisResult = {
        caseClassification: {
          primary: parsedJson.caseClassification?.primary || 'Civil',
          secondary: parsedJson.caseClassification?.secondary || [],
          confidence: Number(parsedJson.caseClassification?.confidence || 0.85),
          evidence: parsedJson.caseClassification?.evidence || [],
        },
        documentMetadata: {
          title: parsedJson.documentMetadata?.title || originalFilename,
          court: parsedJson.documentMetadata?.court || 'High Court / Judicial Body',
          caseNumber: parsedJson.documentMetadata?.caseNumber || null,
          decisionDate: parsedJson.documentMetadata?.decisionDate || null,
          bench: parsedJson.documentMetadata?.bench || [],
          jurisdiction: parsedJson.documentMetadata?.jurisdiction || null,
        },
        parties: Array.isArray(parsedJson.parties) ? parsedJson.parties : [],
        legalProvisions: Array.isArray(parsedJson.legalProvisions) ? parsedJson.legalProvisions : [],
        summary: {
          overview: parsedJson.summary?.overview || 'Legal matter analyzed by Gemini AI.',
          facts: Array.isArray(parsedJson.summary?.facts) ? parsedJson.summary.facts : [],
          legalIssues: Array.isArray(parsedJson.summary?.legalIssues) ? parsedJson.summary.legalIssues : [],
          arguments: Array.isArray(parsedJson.summary?.arguments) ? parsedJson.summary.arguments : [],
          reasoning: Array.isArray(parsedJson.summary?.reasoning) ? parsedJson.summary.reasoning : [],
          outcome: parsedJson.summary?.outcome || 'Order pronounced by Court.',
          outcomeCategory: (parsedJson.summary?.outcomeCategory as any) || 'Other',
          limitations: Array.isArray(parsedJson.summary?.limitations) ? parsedJson.summary.limitations : [],
        },
        importantPassages: Array.isArray(parsedJson.importantPassages) ? parsedJson.importantPassages : [],
        aiAnalysisInfo: {
          method: 'gemini-ai',
          model: config.geminiModel,
          analyzedAt: new Date().toISOString(),
          isDemoMode: false,
        },
      };
      return patched;
    }

    return validated.data;
  }

  /**
   * For extremely long judgments, preserve the critical parts:
   * 1. Header (Court, Parties, Case Number, Roster) - first 12,000 chars
   * 2. Middle (Issues & Arguments) - middle 12,000 chars
   * 3. End (Findings, Operative Order, Directions) - last 16,000 chars
   */
  private static prepareDocumentContext(text: string): string {
    const maxLength = 60000; // ~15,000 tokens safe limit
    if (text.length <= maxLength) return text;

    const headLength = 18000;
    const tailLength = 22000;
    const midLength = 12000;

    const head = text.substring(0, headLength);
    const tail = text.substring(text.length - tailLength);

    const midStart = Math.floor(text.length / 2) - Math.floor(midLength / 2);
    const mid = text.substring(midStart, midStart + midLength);

    return `${head}\n\n[... TEXT REDACTED FOR CONTEXT EFFICIENCY: MIDDLE PORTIONS RETAINED BELOW ...]\n\n${mid}\n\n[... TEXT REDACTED FOR CONTEXT EFFICIENCY: OPERATIVE ORDER & FINAL HOLDING PORTIONS RETAINED BELOW ...]\n\n${tail}`;
  }
}
