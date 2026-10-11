import { NvidiaClient } from './nvidiaClient.js';
import { PageText, PageSource } from './textExtractor.js';
import { buildChunks } from './sourceGrounding.js';
import { LEGAL_DISCLAIMER } from './judgmentPipeline.js';
import { RagIndex } from './ragIndex.js';
import { config } from '../config/index.js';

export interface QuestionAnswer {
  answer: string | null;
  /** `page` is the first page of the passage; `pages` lists every page it covers. */
  sources: Array<{ page: number; pages: number[]; excerpt: string }>;
  model: string | null;
  grounded: boolean;
  disclaimer: string;
  /** 'hybrid' = meaning + keyword search (RAG); 'keyword' = keyword search only; 'none' = small talk, no search. */
  retrievalMode: 'hybrid' | 'keyword' | 'none';
  /** True when this question triggered the one-time preparation of the judgment for search. */
  indexedNow: boolean;
  /** Example questions the user can click. */
  suggestions?: string[];
  message?: string;
}

export const SUGGESTED_QUESTIONS = [
  'What is this case about?',
  'What did the court finally order?',
  'What were the main arguments of each party?',
  'Which laws or sections were discussed?',
  'What were the important dates and events?',
];

type SmallTalk = 'greeting' | 'thanks' | 'help' | 'bye';

/**
 * Recognises short conversational messages ("hi", "thanks", "what can you do?") so they get a
 * friendly reply instantly, without searching the judgment or calling NVIDIA (no credits used).
 * Only short messages are considered, so real questions such as "hi, what was the final order?" still go to RAG.
 */
export function detectSmallTalk(message: string): SmallTalk | null {
  const text = message.toLowerCase().replace(/[^a-z\s']/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text || text.split(' ').length > 6) return null;
  if (/^(hi+|hello+|hey+|hii+|namaste|namaskar|good (morning|afternoon|evening)|greetings|yo)( there| again| all)?$/.test(text)) return 'greeting';
  if (/^(thanks?|thank you|thank you so much|thanks a lot|thx|ty|ok(ay)?|ok thanks|great|cool|nice|got it|understood|perfect)$/.test(text)) return 'thanks';
  if (/^(help|what can you do|what do you do|how does this work|how do i use (this|it)|who are you|what are you|what can i ask)$/.test(text)) return 'help';
  if (/^(bye|goodbye|see you|that's all|thats all)$/.test(text)) return 'bye';
  return null;
}

const SMALL_TALK_REPLIES: Record<SmallTalk, string> = {
  greeting:
    'Hello! I can answer questions about this judgment, using only its own text and citing page numbers. Try one of the questions below, or ask your own.',
  thanks: "You're welcome! Ask another question about this judgment whenever you like.",
  help:
    'I answer questions about this judgment only. I first find the most relevant passages in it, then write the answer from those passages with page references, so you can check them. I do not give personal legal advice. Try one of these:',
  bye: 'Goodbye! Your questions and answers stay here while this page is open.',
};

/**
 * Follow-up questions about one uploaded judgment.
 * Relevant passages are retrieved (RAG: meaning + keyword search) from the judgment's own pages
 * and the model may answer only from them.
 */
export class QuestionAnsweringService {
  public static async ask(
    question: string,
    pages: PageText[],
    pageSource: PageSource,
    history: Array<{ question: string; answer: string }> = [],
    documentId = 'adhoc'
  ): Promise<QuestionAnswer> {
    const smallTalk = detectSmallTalk(question);
    if (smallTalk) {
      return {
        answer: SMALL_TALK_REPLIES[smallTalk],
        sources: [],
        model: null,
        grounded: false,
        disclaimer: LEGAL_DISCLAIMER,
        retrievalMode: 'none',
        indexedNow: false,
        suggestions: smallTalk === 'thanks' || smallTalk === 'bye' ? [] : SUGGESTED_QUESTIONS,
      };
    }

    // Recent follow-ups often say "it" or "that order"; include the previous question in retrieval.
    const retrievalQuery = [history[history.length - 1]?.question, question].filter(Boolean).join(' ');
    const retrieval = await RagIndex.search(documentId, pages, retrievalQuery);
    let top: Array<{ chunkIndex: number; pages: number[]; text: string }> = retrieval.chunks;
    if (top.length === 0) {
      // Nothing matched: fall back to the opening and concluding passages (parties, issues and the final order).
      const all = buildChunks(pages, config.ragChunkChars, config.ragChunkOverlap);
      top = all.length <= 6 ? all : [...all.slice(0, 2), ...all.slice(-4)];
    }
    // Present passages in reading order so the model sees the judgment's flow.
    top = [...top].sort((a, b) => a.chunkIndex - b.chunkIndex);
    const label = pageSource === 'pdf' ? 'Page' : 'Segment';
    const pageLabel = (ps: number[]) => (ps.length > 1 ? `${label}s ${ps.join(', ')}` : `${label} ${ps[0]}`);
    const sources = top.map((p) => ({ page: p.pages[0], pages: p.pages, excerpt: p.text.length > 600 ? `${p.text.slice(0, 600)}…` : p.text }));
    const retrievalInfo = { retrievalMode: retrieval.mode, indexedNow: retrieval.indexedNow };

    if (top.length === 0) {
      return {
        answer: 'I could not find any passage in this judgment that relates to your question. Try rephrasing it with words that are likely to appear in the judgment.',
        sources: [],
        model: null,
        grounded: false,
        disclaimer: LEGAL_DISCLAIMER,
        ...retrievalInfo,
      };
    }

    if (!NvidiaClient.isConfigured()) {
      return {
        answer: null,
        sources,
        model: null,
        grounded: false,
        disclaimer: LEGAL_DISCLAIMER,
        ...retrievalInfo,
        message: 'AI answers need NVIDIA_API_KEY to be configured on the server. The most relevant passages from the judgment are shown instead.',
      };
    }

    const context = top.map((p) => `[${pageLabel(p.pages)}]\n${p.text}`).join('\n\n---\n\n');
    const historyText = history
      .slice(-3)
      .map((h) => `Q: ${h.question}\nA: ${h.answer}`)
      .join('\n\n');

    let result;
    try {
      result = await NvidiaClient.chat(
        [
          {
            role: 'system',
            content: `You answer questions about one Indian court judgment for a non-lawyer.
Answer ONLY from the passages provided. Cite the source after each statement as (${label === 'Page' ? 'p.' : 'seg.'} N) using the passage numbers given.
Clearly separate what the court decided from what a party alleged or argued.
If the passages do not contain the answer, do not guess. Say in one plain sentence that this judgment does not seem to address that question, then suggest two or three related questions that the passages DO answer (for example about the facts, the parties' arguments, the sections discussed or the final order).
Never invent facts, provisions, case citations or outcomes. Do not give personal legal advice; you may explain what the judgment says.
Use plain English and keep the answer focused.`,
          },
          {
            role: 'user',
            content: `${historyText ? `Earlier conversation (for context only):\n${historyText}\n\n` : ''}PASSAGES FROM THE JUDGMENT:\n${context}\n\nQUESTION: ${question}`,
          },
        ],
        { maxTokens: 2048, label: 'question' }
      );
    } catch (err: any) {
      console.warn(`[QuestionAnswering] NVIDIA call failed: ${err.message}`);
      return {
        answer: null,
        sources,
        model: null,
        grounded: false,
        disclaimer: LEGAL_DISCLAIMER,
        ...retrievalInfo,
        message: `The AI answer could not be generated (${err.message}). The most relevant passages from the judgment are shown instead.`,
      };
    }

    return {
      answer: result.content,
      sources,
      model: NvidiaClient.model,
      grounded: true,
      disclaimer: LEGAL_DISCLAIMER,
      ...retrievalInfo,
      ...(retrieval.note ? { message: retrieval.note } : {}),
    };
  }
}
