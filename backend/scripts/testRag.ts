/**
 * Small live check of RAG for "Ask the Judgment" (uses NVIDIA_API_KEY from backend/.env).
 * Uses a tiny fictional 3-page judgment: about 2 embedding requests + 1 chat request.
 * The index is kept in memory only (MongoDB is not touched). The API key is never printed.
 */
import { config } from '../src/config/index.js';
import { NvidiaClient } from '../src/services/nvidiaClient.js';
import { QuestionAnsweringService } from '../src/services/questionAnswering.js';
import { RagIndex } from '../src/services/ragIndex.js';
import { FIXTURE_PAGES } from '../tests/helpers.js';

async function main() {
  if (!NvidiaClient.isConfigured()) {
    console.log('SKIPPED: NVIDIA_API_KEY is not set in backend/.env.');
    process.exit(2);
  }
  console.log(`Embedding model: ${config.nvidiaEmbeddingModel}`);
  const pages = FIXTURE_PAGES.map((text, i) => ({ page: i + 1, text }));
  const docId = 'live-rag-check';

  const t0 = Date.now();
  const { chunks, indexedNow } = await RagIndex.ensureIndex(docId, pages);
  console.log(`1) Indexed ${chunks.length} chunk(s) in ${Date.now() - t0} ms (embedded now: ${indexedNow}); vector size ${chunks[0].embedding.length}`);

  // Deliberately avoids the judgment's own words ("costs", "deposit") to test meaning-based search.
  const question = 'How much money does the petitioner have to pay, and to whom?';
  const t1 = Date.now();
  const res = await QuestionAnsweringService.ask(question, pages, 'pdf', [], docId);
  console.log(`2) Search mode: ${res.retrievalMode} | sources: ${res.sources.map((s) => s.pages.join('+')).join(', ')} | ${Date.now() - t1} ms`);
  console.log(`3) Answer: ${res.answer || res.message}`);
  if (res.retrievalMode !== 'hybrid') process.exit(1);
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
});
