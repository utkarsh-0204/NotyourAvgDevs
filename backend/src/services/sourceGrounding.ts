import { PageText } from './textExtractor.js';

export type Verification = 'verified' | 'approximate' | 'unverified';

export interface Passage {
  page: number;
  text: string;
}

const STOPWORDS = new Set(
  'a an and are as at be by for from has have in is it its of on or that the this to was were which with will shall not no under court said dated any such than been being into upon whether what who whom when where why how did does do'.split(' ')
);

export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’“”`"']/g, '')
    .replace(/[^a-z0-9ऀ-ॿ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeForMatch(text)
    .split(' ')
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Very light stemming so "ordered"/"orders"/"ordering" all match "order". */
function stem(token: string): string {
  if (token.length <= 4 || /^\d/.test(token)) return token;
  return token.replace(/(ings|ing|edly|ed|es|s|ly)$/, '') || token;
}

// Everyday words people use in questions, mapped to words judgments actually use.
const QUERY_EXPANSIONS: Record<string, string[]> = {
  order: ['ordered', 'direct', 'directed', 'direction', 'allowed', 'dismissed', 'quashed', 'set aside', 'disposed', 'result', 'accordingly'],
  outcome: ['result', 'allowed', 'dismissed', 'quashed', 'disposed', 'accordingly', 'held'],
  result: ['allowed', 'dismissed', 'quashed', 'disposed', 'accordingly'],
  decide: ['held', 'hold', 'conclude', 'finding', 'allowed', 'dismissed'],
  decision: ['held', 'conclude', 'finding', 'allowed', 'dismissed', 'result'],
  final: ['result', 'accordingly', 'conclusion'],
  won: ['allowed', 'dismissed', 'result'],
  win: ['allowed', 'dismissed', 'result'],
  argue: ['submit', 'submission', 'contend', 'contention', 'counsel'],
  argument: ['submit', 'submission', 'contend', 'contention', 'counsel'],
  fact: ['allege', 'complainant', 'agreement', 'dated'],
  law: ['section', 'article', 'act', 'code', 'rule'],
  section: ['section', 'act', 'code'],
  cost: ['costs', 'deposit', 'compensation', 'fine'],
  penalty: ['fine', 'costs', 'sentence', 'imprisonment'],
  punishment: ['sentence', 'imprisonment', 'fine', 'convict'],
  bail: ['bail', 'release', 'custody'],
  reason: ['held', 'finds', 'considered', 'because', 'material'],
};

function expandQuery(query: string): string[] {
  const stems = tokenize(query).map(stem);
  const expanded = new Set(stems);
  for (const s of stems) {
    for (const [key, extra] of Object.entries(QUERY_EXPANSIONS)) {
      if (stem(key) === s) extra.forEach((w) => tokenize(w).forEach((t) => expanded.add(stem(t))));
    }
  }
  return Array.from(expanded);
}

/** Keep only page numbers that actually exist in the extracted document, de-duplicated and sorted. */
export function sanitizePages(pages: unknown, pageMap: Map<number, string>): number[] {
  if (!Array.isArray(pages)) return [];
  const valid = pages
    .map((p) => (typeof p === 'string' ? parseInt(p, 10) : Number(p)))
    .filter((p) => Number.isInteger(p) && pageMap.has(p));
  return Array.from(new Set(valid)).sort((a, b) => a - b);
}

/**
 * Checks a short supporting quote against the extracted text.
 * - verified: the quote appears (after normalisation) on one of the cited pages,
 *   or on another page (in which case the page reference is corrected).
 * - approximate: at least 85% of the quote's meaningful words appear on a single page.
 * - unverified: the quote could not be located, so the claim is flagged.
 */
export function verifyQuote(
  quote: string | undefined,
  citedPages: number[],
  pageMap: Map<number, string>
): { verification: Verification; pages: number[] } {
  if (!quote || normalizeForMatch(quote).length < 8) {
    return { verification: 'unverified', pages: citedPages };
  }
  const needle = normalizeForMatch(quote);
  const normalizedPages = getNormalizedPages(pageMap);

  for (const p of citedPages) {
    if (normalizedPages.get(p)?.includes(needle)) return { verification: 'verified', pages: citedPages };
  }
  // A quote can straddle a page break: check each cited page joined with the next one.
  for (const p of citedPages) {
    const joined = `${normalizedPages.get(p) || ''} ${normalizedPages.get(p + 1) || ''}`;
    if (joined.includes(needle)) return { verification: 'verified', pages: Array.from(new Set([...citedPages, p + 1])).sort((a, b) => a - b) };
  }
  for (const [p, text] of normalizedPages) {
    if (text.includes(needle)) return { verification: 'verified', pages: [p] };
  }

  const quoteTokens = tokenize(quote);
  if (quoteTokens.length >= 5) {
    let best = { page: -1, score: 0 };
    for (const [p, text] of normalizedPages) {
      const pageTokens = new Set(text.split(' '));
      const hits = quoteTokens.filter((t) => pageTokens.has(t)).length;
      const score = hits / quoteTokens.length;
      // Prefer cited pages when scores tie.
      if (score > best.score || (score === best.score && citedPages.includes(p))) best = { page: p, score };
    }
    if (best.score >= 0.85) {
      return { verification: 'approximate', pages: citedPages.includes(best.page) ? citedPages : [best.page] };
    }
  }
  return { verification: 'unverified', pages: citedPages };
}

const normalizedCache = new WeakMap<Map<number, string>, Map<number, string>>();
function getNormalizedPages(pageMap: Map<number, string>): Map<number, string> {
  let cached = normalizedCache.get(pageMap);
  if (!cached) {
    cached = new Map(Array.from(pageMap.entries()).map(([p, t]) => [p, normalizeForMatch(t)]));
    normalizedCache.set(pageMap, cached);
  }
  return cached;
}

/** Splits page text into retrieval passages of roughly `maxChars`, never crossing page boundaries. */
export function buildPassages(pages: PageText[], maxChars = 1400): Passage[] {
  const passages: Passage[] = [];
  for (const { page, text } of pages) {
    if (!text.trim()) continue;
    const paragraphs = text.split(/\n\s*\n|\n(?=\s*\d+\.\s)/);
    let buffer = '';
    for (const para of paragraphs) {
      if (buffer && buffer.length + para.length > maxChars) {
        passages.push({ page, text: buffer.trim() });
        buffer = '';
      }
      if (para.length > maxChars) {
        for (let i = 0; i < para.length; i += maxChars) passages.push({ page, text: para.slice(i, i + maxChars).trim() });
      } else {
        buffer += (buffer ? '\n' : '') + para;
      }
    }
    if (buffer.trim()) passages.push({ page, text: buffer.trim() });
  }
  return passages;
}

/** A retrieval chunk: may carry a little overlap from the previous chunk, so it can span two pages. */
export interface Chunk {
  chunkIndex: number;
  pages: number[];
  text: string;
}

/**
 * Splits pages into overlapping chunks for semantic search.
 * Chunks follow paragraph boundaries where possible, stay under `maxChars`, and repeat the last
 * `overlap` characters of the previous chunk so a sentence cut at a boundary is still searchable.
 */
export function buildChunks(pages: PageText[], maxChars = 1400, overlap = 200): Chunk[] {
  const pieces: Passage[] = buildPassages(pages, Math.max(200, maxChars - overlap));
  const chunks: Chunk[] = [];
  let prev: Passage | null = null;
  for (const piece of pieces) {
    let tail = '';
    if (prev && overlap > 0) {
      tail = prev.text.slice(-overlap);
      // Start the overlap at a word boundary.
      const space = tail.indexOf(' ');
      if (space > 0 && space < tail.length - 1) tail = tail.slice(space + 1);
    }
    const pagesForChunk = tail && prev && prev.page !== piece.page ? [prev.page, piece.page] : [piece.page];
    chunks.push({ chunkIndex: chunks.length, pages: pagesForChunk, text: tail ? `${tail}
${piece.text}` : piece.text });
    prev = piece;
  }
  return chunks;
}

/** BM25 keyword retrieval: dependency-free and good enough to find the passages a legal question refers to. */
export function retrievePassages<T extends { text: string }>(query: string, passages: T[], topK = 8): Array<T & { score: number }> {
  const queryTerms = expandQuery(query);
  if (queryTerms.length === 0 || passages.length === 0) return [];

  const docs = passages.map((p) => tokenize(p.text).map(stem));
  const avgLen = docs.reduce((sum, d) => sum + d.length, 0) / docs.length || 1;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) || 0) + 1);

  const k1 = 1.4;
  const b = 0.75;
  const N = docs.length;

  return passages
    .map((passage, i) => {
      const tf = new Map<string, number>();
      for (const t of docs[i]) tf.set(t, (tf.get(t) || 0) + 1);
      let score = 0;
      for (const term of queryTerms) {
        const f = tf.get(term) || 0;
        if (!f) continue;
        const idf = Math.log(1 + (N - (df.get(term) || 0) + 0.5) / ((df.get(term) || 0) + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * docs[i].length) / avgLen)));
      }
      return { ...passage, score };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/** Renders pages with explicit markers so the model can cite real page numbers. */
export function renderPagesWithMarkers(pages: PageText[], label: 'PAGE' | 'SEGMENT'): string {
  return pages
    .map(({ page, text }) => `[[${label} ${page}]]\n${text.trim() || '(no extractable text on this page)'}`)
    .join('\n\n');
}
