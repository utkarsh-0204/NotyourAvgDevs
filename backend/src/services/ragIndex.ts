import crypto from 'crypto';
import { config } from '../config/index.js';
import { documentChunkStore, IDocumentChunk } from '../models/DocumentChunk.js';
import { NvidiaClient } from './nvidiaClient.js';
import { PageText } from './textExtractor.js';
import { buildChunks, retrievePassages } from './sourceGrounding.js';

/**
 * Retrieval-Augmented Generation (RAG) index for one judgment.
 *
 * - Indexing: the judgment is split into overlapping, page-aware chunks; each chunk is turned into an
 *   embedding (a list of numbers that captures its meaning) with NVIDIA's embedding model and stored.
 *   This happens once per document; it is redone only if the text or embedding model changes.
 * - Search: the question is embedded the same way and compared with every chunk (meaning match), and
 *   the existing BM25 keyword search runs too (exact matches like "Section 482" or case names).
 *   Both rankings are merged with Reciprocal Rank Fusion.
 */

export interface RetrievedChunk {
  chunkIndex: number;
  pages: number[];
  text: string;
  score: number;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  mode: 'hybrid' | 'keyword';
  /** True when this request had to build the index first (slower, one-time). */
  indexedNow: boolean;
  note?: string;
}

const RRF_K = 60;
const indexing = new Map<string, Promise<{ chunks: IDocumentChunk[]; indexedNow: boolean }>>();

const hash = (text: string) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 32);

export class RagIndex {
  /** Returns the stored, embedded chunks for a document, building them on first use. */
  public static async ensureIndex(documentId: string, pages: PageText[]): Promise<{ chunks: IDocumentChunk[]; indexedNow: boolean }> {
    // Two questions arriving together share one indexing run instead of paying for it twice.
    const running = indexing.get(documentId);
    if (running) return running;

    const job = this.buildIndex(documentId, pages).finally(() => indexing.delete(documentId));
    indexing.set(documentId, job);
    return job;
  }

  private static async buildIndex(documentId: string, pages: PageText[]): Promise<{ chunks: IDocumentChunk[]; indexedNow: boolean }> {
    const planned = buildChunks(pages, config.ragChunkChars, config.ragChunkOverlap);
    const model = config.nvidiaEmbeddingModel;
    const existing = await documentChunkStore.getForDocument(documentId);

    const upToDate =
      existing.length === planned.length &&
      existing.every((c, i) => c.embeddingModel === model && c.textHash === hash(planned[i].text) && c.embedding?.length > 0);
    if (upToDate) return { chunks: existing, indexedNow: false };

    // Re-use embeddings for unchanged chunks (same text and model) so a partial change is cheap.
    const reusable = new Map(existing.filter((c) => c.embeddingModel === model).map((c) => [c.textHash, c.embedding]));
    const result: IDocumentChunk[] = planned.map((c) => ({
      documentId,
      chunkIndex: c.chunkIndex,
      pages: c.pages,
      text: c.text,
      textHash: hash(c.text),
      embedding: reusable.get(hash(c.text)) || [],
      embeddingModel: model,
    }));

    const missing = result.filter((c) => c.embedding.length === 0);
    const started = Date.now();
    for (let i = 0; i < missing.length; i += config.ragEmbedBatchSize) {
      const batch = missing.slice(i, i + config.ragEmbedBatchSize);
      const vectors = await NvidiaClient.embed(
        batch.map((c) => c.text),
        'passage',
        `embed ${documentId} ${i + 1}-${i + batch.length}/${missing.length}`
      );
      batch.forEach((c, j) => (c.embedding = vectors[j]));
    }
    await documentChunkStore.replaceForDocument(documentId, result);
    console.log(`[RagIndex] Indexed ${documentId}: ${result.length} chunks (${missing.length} embedded) in ${Date.now() - started} ms with ${model}`);
    return { chunks: result, indexedNow: missing.length > 0 };
  }

  /** Finds the chunks most relevant to a question. Falls back to keyword search if embeddings fail. */
  public static async search(documentId: string, pages: PageText[], question: string, topK = config.ragTopK): Promise<RetrievalResult> {
    const keywordChunks = buildChunks(pages, config.ragChunkChars, config.ragChunkOverlap);
    const keywordRanked = retrievePassages(question, keywordChunks, topK * 3);

    if (!NvidiaClient.isConfigured()) {
      return { chunks: keywordRanked.slice(0, topK).map(this.toResult), mode: 'keyword', indexedNow: false };
    }

    try {
      const { chunks, indexedNow } = await this.ensureIndex(documentId, pages);
      const [queryVector] = await NvidiaClient.embed([question], 'query', `embed query ${documentId}`);

      const denseRanked = chunks
        .map((c) => ({ chunkIndex: c.chunkIndex, score: cosine(queryVector, c.embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK * 3);

      // Reciprocal Rank Fusion: reward chunks ranked highly by either method.
      const fused = new Map<number, number>();
      denseRanked.forEach((c, rank) => fused.set(c.chunkIndex, (fused.get(c.chunkIndex) || 0) + 1 / (RRF_K + rank + 1)));
      keywordRanked.forEach((c, rank) => fused.set(c.chunkIndex, (fused.get(c.chunkIndex) || 0) + 1 / (RRF_K + rank + 1)));

      const byIndex = new Map(chunks.map((c) => [c.chunkIndex, c]));
      const top = Array.from(fused.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, topK)
        .map(([index, score]) => {
          const c = byIndex.get(index)!;
          return { chunkIndex: c.chunkIndex, pages: c.pages, text: c.text, score };
        });

      return { chunks: top, mode: 'hybrid', indexedNow };
    } catch (err: any) {
      console.warn(`[RagIndex] Semantic search unavailable for ${documentId} (${err.message}); using keyword search.`);
      return {
        chunks: keywordRanked.slice(0, topK).map(this.toResult),
        mode: 'keyword',
        indexedNow: false,
        note: `Meaning-based search was unavailable (${err.message}), so keyword search was used.`,
      };
    }
  }

  public static async deleteIndex(documentId: string): Promise<void> {
    await documentChunkStore.deleteForDocument(documentId);
  }

  private static toResult(c: { chunkIndex: number; pages: number[]; text: string; score: number }): RetrievedChunk {
    return { chunkIndex: c.chunkIndex, pages: c.pages, text: c.text, score: c.score };
  }
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
