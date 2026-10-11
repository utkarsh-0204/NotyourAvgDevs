import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { storageService } from '../services/storageService.js';
import { TextExtractor } from '../services/textExtractor.js';
import { AIService } from '../services/aiService.js';
import { QuestionAnsweringService } from '../services/questionAnswering.js';
import { LEGAL_DISCLAIMER } from '../services/judgmentPipeline.js';
import { IDocumentRecord } from '../models/Document.js';
import { SAMPLE_DOCUMENTS } from '../utils/sampleDocuments.js';
import { config } from '../config/index.js';
import { DetailedReport, SourcedPoint } from '../schemas/analysisSchema.js';

// Documents currently being analysed in this process, to avoid running the (slow, paid) pipeline twice.
const analysesInProgress = new Set<string>();

/** Page text is large and only needed server-side, so it is left out of API responses. */
function withoutPages(doc: IDocumentRecord): Omit<IDocumentRecord, 'pages'> {
  const { pages, ...rest } = doc;
  return rest;
}

/** Ensures a record has per-page text, re-extracting older uploads that were stored before pages were tracked. */
async function ensurePages(doc: IDocumentRecord): Promise<void> {
  if (doc.pages?.length) return;
  if (doc.filePath && fs.existsSync(doc.filePath) && /pdf/i.test(doc.mimeType + path.extname(doc.filePath))) {
    try {
      const extraction = await TextExtractor.extract(doc.filePath, doc.mimeType);
      doc.pages = extraction.pages;
      doc.pageSource = extraction.pageSource;
      doc.emptyPages = extraction.emptyPages;
      return;
    } catch (err: any) {
      console.warn(`[DocumentController] Could not re-extract pages for ${doc.id}: ${err.message}`);
    }
  }
  doc.pages = TextExtractor.segmentText(doc.extractedText || '');
  doc.pageSource = 'segment';
  doc.emptyPages = [];
}

function renderDetailedReportMarkdown(r: DetailedReport): string {
  const unit = r.coverage.pageReferenceType === 'pdf' ? 'p.' : 'seg.';
  const ref = (pages: number[]) => (pages.length ? ` _(${unit} ${pages.join(', ')})_` : '');
  const statusLabel: Record<string, string> = {
    court_finding: 'Court finding',
    party_allegation: 'Party claim',
    undisputed_fact: 'Undisputed',
    procedural: 'Procedural',
    uncertain: 'Uncertain',
  };
  const point = (p: SourcedPoint) =>
    `- ${p.status ? `**[${statusLabel[p.status] || p.status}]** ` : ''}${p.text}${ref(p.pages)}${p.verification === 'unverified' ? ' (not verified against the text)' : ''}`;
  const list = (items: SourcedPoint[]) => (items.length ? items.map(point).join('\n') : '_Not stated in the judgment._');

  return `## 7. DETAILED JUDGMENT REPORT

### Case overview
${r.overview}

- Court: ${r.caseDetails.court || 'Not stated'}
- Date: ${r.caseDetails.date || 'Not stated'}
- Case number: ${r.caseDetails.caseNumber || 'Not stated'}
- Bench: ${r.caseDetails.bench.join(', ') || 'Not stated'}
${r.caseDetails.parties.map((p) => `- ${p.role}: ${p.name}${ref(p.pages)}`).join('\n')}

### Background facts
${list(r.background)}

### Timeline
${r.timeline.length ? r.timeline.map((t) => `- **${t.date}**: ${t.event}${ref(t.pages)}${t.verification === 'unverified' ? ' (not verified)' : ''}`).join('\n') : '_No dated events identified._'}

### Arguments of each party
${r.argumentsByParty.map((a) => `#### ${a.party}\n${list(a.points)}`).join('\n\n') || '_Not stated._'}

### Legal issues considered
${list(r.legalIssues)}

### Laws and provisions (explained simply)
${r.provisions.map((p) => `- **${p.name}**: ${p.plainExplanation}\n  - How it was used: ${p.howUsed}${ref(p.pages)}`).join('\n') || '_None identified._'}

### Precedents cited
${r.precedents.map((p) => `- **${p.name}**: ${p.howUsed}${ref(p.pages)}`).join('\n') || '_None identified._'}

### Court's reasoning and findings
${list(r.reasoning)}

### Final judgment and directions
**Outcome:** ${r.finalOutcome.outcomeCategory}

${r.finalOutcome.summary}

${list(r.finalOutcome.directions)}

**Order verification:** ${r.finalOutcome.verification.status.replace('_', ' ')} (checked ${unit} ${r.finalOutcome.verification.checkedPages.join(', ') || 'n/a'})
${r.finalOutcome.verification.notes.map((n) => `- ${n}`).join('\n')}

### Practical meaning
${list(r.practicalMeaning)}

### Limitations
${r.limitations.map((l) => `- ${l}`).join('\n') || '- None noted.'}

### Uncertain or unsupported claims
${r.uncertainClaims.map((u) => `- ${u.claim} - _${u.reason}_`).join('\n') || '- None flagged.'}

_Coverage: ${r.coverage.pagesWithText}/${r.coverage.totalPages} ${r.coverage.pageReferenceType === 'pdf' ? 'pages' : 'segments'} with text, analysed in ${r.coverage.chunks} chunk(s)._
`;
}

export class DocumentController {
  /**
   * Upload Document & Extract Text
   */
  public static async uploadDocument(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded. Please select a PDF, DOCX, or TXT file.' });
        return;
      }

      const file = req.file;
      const docId = `doc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      // Perform text extraction
      let extraction;
      try {
        extraction = await TextExtractor.extract(file.path, file.mimetype);
      } catch (extractErr: any) {
        // Safe cleanup if corrupted
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        res.status(422).json({
          error: `Failed to extract text from document: ${extractErr.message || 'Corrupted or unreadable format.'}`,
        });
        return;
      }

      const isScanned = extraction.isScannedPdf;
      const status = isScanned ? 'error' : 'extracted';
      const errorMessage = isScanned
        ? 'Scanned image-only PDF detected. This document contains no extractable text layer and requires Optical Character Recognition (OCR). OCR processing is not available for this file.'
        : undefined;

      const record: IDocumentRecord = {
        id: docId,
        originalName: file.originalname,
        filename: file.filename,
        fileSize: file.size,
        mimeType: file.mimetype,
        filePath: file.path,
        extractedText: extraction.text,
        pages: extraction.pages,
        pageSource: extraction.pageSource,
        emptyPages: extraction.emptyPages,
        pageCount: extraction.pageCount,
        isScannedPdf: isScanned,
        ocrRequired: isScanned,
        status,
        errorMessage,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const saved = await storageService.save(record);

      res.status(201).json({
        message: 'File uploaded and extracted successfully.',
        document: {
          id: saved.id,
          originalName: saved.originalName,
          fileSize: saved.fileSize,
          mimeType: saved.mimeType,
          pageCount: saved.pageCount,
          charCount: extraction.charCount,
          wordCount: extraction.wordCount,
          isScannedPdf: saved.isScannedPdf,
          ocrRequired: saved.ocrRequired,
          emptyPages: extraction.emptyPages,
          status: saved.status,
          errorMessage: saved.errorMessage,
          textSnippet: extraction.text.substring(0, 500),
          createdAt: saved.createdAt,
        },
      });
    } catch (err: any) {
      console.error('[DocumentController.uploadDocument] Error:', err);
      res.status(500).json({ error: err.message || 'Internal server error during upload.' });
    }
  }

  /**
   * Run Legal AI Analysis on an uploaded document
   */
  public static async analyzeDocument(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const apiKeyHeader = req.headers['x-gemini-api-key'] as string | undefined;

      const doc = await storageService.getById(id);
      if (!doc) {
        res.status(404).json({ error: `Document with ID '${id}' was not found.` });
        return;
      }

      if (doc.isScannedPdf || (doc.extractedText && doc.extractedText.trim().length < 50)) {
        res.status(400).json({
          error: 'Document text is insufficient for legal review. This appears to be a scanned image-only PDF requiring an external OCR service.',
        });
        return;
      }

      if (analysesInProgress.has(id)) {
        res.status(409).json({ error: 'Analysis is already running for this document. Please wait for it to finish.' });
        return;
      }
      analysesInProgress.add(id);

      try {
        await ensurePages(doc);

        // Update status to analyzing
        doc.status = 'analyzing';
        await storageService.save(doc);

        // Execute AI analysis or fallback
        const analysis = await AIService.analyzeDocument({
          text: doc.extractedText,
          originalFilename: doc.originalName,
          pages: doc.pages,
          pageSource: doc.pageSource,
          emptyPages: doc.emptyPages,
          overrideGeminiApiKey: apiKeyHeader,
        });

        doc.analysis = analysis;
        doc.status = 'analyzed';
        doc.errorMessage = undefined;
        const updated = await storageService.save(doc);

        res.json({
          message: 'Document analyzed successfully.',
          document: withoutPages(updated),
        });
      } finally {
        analysesInProgress.delete(id);
      }
    } catch (err: any) {
      console.error('[DocumentController.analyzeDocument] Error:', err);
      if (req.params.id) {
        const doc = await storageService.getById(req.params.id);
        if (doc) {
          doc.status = 'error';
          doc.errorMessage = err.message || 'Analysis pipeline failure';
          await storageService.save(doc);
        }
      }
      res.status(500).json({ error: err.message || 'Failed to complete analysis pipeline.' });
    }
  }

  /**
   * Answer a follow-up question about one document, grounded in its own passages
   */
  public static async askQuestion(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
      if (!question) {
        res.status(400).json({ error: 'Please enter a question.' });
        return;
      }
      if (question.length > 2000) {
        res.status(400).json({ error: 'Question is too long (maximum 2000 characters).' });
        return;
      }
      const history = Array.isArray(req.body?.history)
        ? req.body.history
            .filter((h: any) => typeof h?.question === 'string' && typeof h?.answer === 'string')
            .slice(-3)
            .map((h: any) => ({ question: h.question.slice(0, 2000), answer: h.answer.slice(0, 4000) }))
        : [];

      const doc = await storageService.getById(id);
      if (!doc) {
        res.status(404).json({ error: `Document with ID '${id}' was not found.` });
        return;
      }
      if (!doc.extractedText || doc.extractedText.trim().length < 50) {
        res.status(400).json({ error: 'This document has no extractable text to answer questions from.' });
        return;
      }

      await ensurePages(doc);
      const result = await QuestionAnsweringService.ask(question, doc.pages || [], doc.pageSource || 'segment', history, doc.id);
      res.json({ ...result, pageReferenceType: doc.pageSource || 'segment' });
    } catch (err: any) {
      console.error('[DocumentController.askQuestion] Error:', err);
      res.status(502).json({ error: `Could not answer the question: ${err.message || 'AI provider error'}` });
    }
  }

  /**
   * List all documents with filters
   */
  public static async listDocuments(req: Request, res: Response): Promise<void> {
    try {
      const { search, caseType, status } = req.query;
      const docs = await storageService.list({
        search: search ? String(search) : undefined,
        caseType: caseType ? String(caseType) : undefined,
        status: status ? String(status) : undefined,
      });

      // Avoid sending massive full extractedText in large lists
      const summaryList = docs.map((d) => ({
        id: d.id,
        originalName: d.originalName,
        fileSize: d.fileSize,
        mimeType: d.mimeType,
        pageCount: d.pageCount,
        status: d.status,
        isScannedPdf: d.isScannedPdf,
        caseType: d.analysis?.caseClassification?.primary || 'Unanalyzed',
        court: d.analysis?.documentMetadata?.court || null,
        caseNumber: d.analysis?.documentMetadata?.caseNumber || null,
        outcome: d.analysis?.summary?.outcomeCategory || null,
        analysisMethod: d.analysis?.aiAnalysisInfo?.method || null,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      }));

      res.json({ documents: summaryList, total: summaryList.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to list documents.' });
    }
  }

  /**
   * Get single document by ID
   */
  public static async getDocument(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const doc = await storageService.getById(id);
      if (!doc) {
        res.status(404).json({ error: 'Document not found.' });
        return;
      }
      res.json({ document: withoutPages(doc) });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to retrieve document.' });
    }
  }

  /**
   * Get Analysis only
   */
  public static async getDocumentAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const doc = await storageService.getById(id);
      if (!doc) {
        res.status(404).json({ error: 'Document not found.' });
        return;
      }
      if (!doc.analysis) {
        res.status(404).json({ error: 'No analysis found for this document. Please trigger analysis first.' });
        return;
      }
      res.json({ analysis: doc.analysis, documentId: doc.id, filename: doc.originalName });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to retrieve analysis.' });
    }
  }

  /**
   * Download original file securely
   */
  public static async downloadDocument(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const doc = await storageService.getById(id);
      if (!doc || !fs.existsSync(doc.filePath)) {
        res.status(404).json({ error: 'File not found on server.' });
        return;
      }

      // Prevent path traversal
      const safeUploadPath = path.resolve(config.uploadDir);
      const safeFilePath = path.resolve(doc.filePath);
      if (!safeFilePath.startsWith(safeUploadPath)) {
        res.status(403).json({ error: 'Access denied: Path traversal detected.' });
        return;
      }

      res.download(doc.filePath, doc.originalName);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to download file.' });
    }
  }

  /**
   * Download structured analysis export (JSON or formatted Markdown report)
   */
  public static async downloadAnalysisExport(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const format = (req.query.format as string) || 'json';
      const doc = await storageService.getById(id);

      if (!doc || !doc.analysis) {
        res.status(404).json({ error: 'Analysis not found for download.' });
        return;
      }

      const an = doc.analysis;
      if (format === 'markdown' || format === 'txt') {
        const report = `# LEGAL COURT DOCUMENT REVIEW REPORT: ${an.documentMetadata?.title || doc.originalName}

## 1. CASE METADATA & CLASSIFICATION
- Court: ${an.documentMetadata?.court || 'N/A'}
- Case Number: ${an.documentMetadata?.caseNumber || 'N/A'}
- Jurisdiction: ${an.documentMetadata?.jurisdiction || 'N/A'}
- Decision Date: ${an.documentMetadata?.decisionDate || 'N/A'}
- Primary Case Type: ${an.caseClassification.primary}
- Secondary Classifications: ${an.caseClassification.secondary.join(', ') || 'None'}
- Confidence: ${(an.caseClassification.confidence * 100).toFixed(0)}%
- Bench / Coram: ${an.documentMetadata?.bench?.join(', ') || 'N/A'}

## 2. PARTIES & ADVOCATES
${an.parties.map((p) => `- **${p.name}** (${p.role}) - Context: ${p.evidence}`).join('\n')}

## 3. FINAL COURT OUTCOME
- Finding: ${an.summary.outcomeCategory}
- Operative Order: ${an.summary.outcome}

## 4. STRUCTURED CASE SUMMARY
- Overview: ${an.summary.overview}
- Facts:
${an.summary.facts.map((f) => `  * ${f}`).join('\n')}
- Legal Issues:
${an.summary.legalIssues.map((i) => `  * ${i}`).join('\n')}
- Submissions & Arguments:
${an.summary.arguments.map((a) => `  * ${a}`).join('\n')}
- Court's Reasoning:
${an.summary.reasoning.map((r) => `  * ${r}`).join('\n')}

## 5. STATUTORY PROVISIONS & CITATIONS
${an.legalProvisions.map((lp) => `- **${lp.name}** [${lp.type}]: ${lp.context}`).join('\n')}

## 6. KEY EXTRACTED PASSAGES
${an.importantPassages.map((ip) => `> "${ip.text}"\n> *Purpose: ${ip.purpose}*${ip.page ? ` (p. ${ip.page})` : ''}\n`).join('\n')}

${an.detailedReport ? renderDetailedReportMarkdown(an.detailedReport) : ''}

---
Generated by NyayaDrishti Legal Tech Engine
Analysis Mode: ${an.aiAnalysisInfo.method} (${an.aiAnalysisInfo.model})
Generated at: ${an.aiAnalysisInfo.analyzedAt}
DISCLAIMER: ${LEGAL_DISCLAIMER}
`;
        res.setHeader('Content-Type', 'text/markdown');
        res.setHeader('Content-Disposition', `attachment; filename="${doc.originalName.replace(/\.[^/.]+$/, '')}_analysis_report.md"`);
        res.send(report);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${doc.originalName.replace(/\.[^/.]+$/, '')}_analysis.json"`);
        res.send(JSON.stringify(an, null, 2));
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to export analysis.' });
    }
  }

  /**
   * Delete Document
   */
  public static async deleteDocument(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const success = await storageService.delete(id);
      if (!success) {
        res.status(404).json({ error: 'Document not found or already deleted.' });
        return;
      }
      res.json({ message: 'Document deleted successfully.', id });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to delete document.' });
    }
  }

  /**
   * Dashboard Statistics
   */
  public static async getDashboardStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await storageService.getDashboardStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to get dashboard statistics.' });
    }
  }

  /**
   * List available built-in sample Indian Court documents
   */
  public static async getSampleDocuments(req: Request, res: Response): Promise<void> {
    res.json({
      samples: SAMPLE_DOCUMENTS.map((s) => ({
        id: s.id,
        title: s.title,
        filename: s.filename,
        caseType: s.caseType,
        court: s.court,
        description: s.description,
      })),
    });
  }

  /**
   * Load and initialize one of the built-in sample Indian Court documents into the system
   */
  public static async loadSampleDocument(req: Request, res: Response): Promise<void> {
    try {
      const { sampleId } = req.body;
      const sample = SAMPLE_DOCUMENTS.find((s) => s.id === sampleId) || SAMPLE_DOCUMENTS[0];

      const docId = `sample_${Date.now()}_${sample.id}`;
      const sampleFileName = `${Date.now()}_${sample.filename}`;
      const filePath = path.join(config.uploadDir, sampleFileName);

      // Write sample text to disk
      await fs.promises.writeFile(filePath, sample.content, 'utf-8');

      const wordCount = sample.content.split(/\s+/).filter(Boolean).length;

      const record: IDocumentRecord = {
        id: docId,
        originalName: sample.filename,
        filename: sampleFileName,
        fileSize: Buffer.byteLength(sample.content, 'utf-8'),
        mimeType: 'text/plain',
        filePath,
        extractedText: sample.content,
        pages: TextExtractor.segmentText(sample.content),
        pageSource: 'segment',
        emptyPages: [],
        pageCount: Math.ceil(wordCount / 400),
        isScannedPdf: false,
        ocrRequired: false,
        status: 'extracted',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const saved = await storageService.save(record);

      res.status(201).json({
        message: `Sample document '${sample.title}' loaded successfully!`,
        document: withoutPages(saved),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load sample document.' });
    }
  }

  /**
   * Health & AI Provider Status
   */
  public static async getHealthAndStatus(req: Request, res: Response): Promise<void> {
    const isNvidiaReady = AIService.isNvidiaConfigured();
    const isGeminiReady = AIService.isGeminiConfigured();
    const provider = isNvidiaReady ? 'nvidia' : isGeminiReady ? 'gemini' : 'local';
    // Only non-secret configuration is reported here; API keys are never included.
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: storageService.isConnectedToMongo() ? 'Connected (MongoDB)' : 'In-Memory Fallback',
      aiProvider: {
        configured: isNvidiaReady || isGeminiReady,
        provider,
        service:
          provider === 'nvidia'
            ? 'NVIDIA API Catalog (hosted inference)'
            : provider === 'gemini'
            ? 'Google Gemini API'
            : 'Local Rule-Based Deterministic Engine (Demo Mode)',
        model: provider === 'nvidia' ? config.nvidiaModel : config.geminiModel,
        fallback: provider === 'nvidia' && isGeminiReady ? `Google Gemini (${config.geminiModel})` : 'Local Rule-Based Engine',
        questionAnswering: isNvidiaReady,
        isDemoMode: !(isNvidiaReady || isGeminiReady),
        supportedFormats: ['PDF (.pdf)', 'Word (.docx)', 'Plain Text (.txt)'],
        maxFileSizeMB: config.maxFileSize / (1024 * 1024),
      },
    });
  }
}
