/**
 * Offline tests for RAG in "Ask the Judgment": chunking, indexing, caching, hybrid search and fallbacks.
 * NVIDIA embeddings are replaced by a small deterministic "concept" embedder, so no API calls are made.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config/index.js';
import { NvidiaClient, ChatMessage } from '../src/services/nvidiaClient.js';
import { buildChunks } from '../src/services/sourceGrounding.js';
import { RagIndex, cosine } from '../src/services/ragIndex.js';
import { documentChunkStore } from '../src/models/DocumentChunk.js';
import { QuestionAnsweringService, detectSmallTalk } from '../src/services/questionAnswering.js';
import { TextExtractor, PageText } from '../src/services/textExtractor.js';
import { FIXTURE_PAGES } from './helpers.js';

// Safety: never reach the real NVIDIA API (or spend credits) from tests.
config.nvidiaApiKey = 'test-key-not-real';
config.nvidiaBaseUrl = 'http://127.0.0.1:9/v1';
config.nvidiaMaxRetries = 0;

const original = { embed: NvidiaClient.embed, chat: NvidiaClient.chat, isConfigured: NvidiaClient.isConfigured };

// Words with related meanings share a dimension, so "money to be paid" lands near "costs of Rs. 25,000".
const CONCEPTS: string[][] = [
  ['costs', 'cost', 'money', 'pay', 'paid', 'deposit', 'rs', 'rupees', 'amount', 'crores'],
  ['cheating', 'cheat', 'fraud', 'dishonest', 'dishonestly', 'induced', 'deceive'],
  ['civil', 'contract', 'breach', 'agreement', 'commercial'],
  ['quashed', 'quash', 'allowed', 'cancel', 'cancelled', 'set', 'aside'],
  ['petitioner', 'accused', 'applicant'],
  ['covid', 'pandemic', 'disruption', 'disruptions', 'delay'],
];
function fakeEmbed(text: string): number[] {
  const v = new Array(CONCEPTS.length).fill(0);
  for (const word of text.toLowerCase().split(/[^a-z0-9]+/)) {
    CONCEPTS.forEach((group, i) => {
      if (group.includes(word)) v[i] += 1;
    });
  }
  return v.some((x) => x) ? v : v.map(() => 0.001);
}

let embedCalls: Array<{ count: number; type: string }> = [];
let pages: PageText[] = [];

before(() => {
  pages = FIXTURE_PAGES.map((text, i) => ({ page: i + 1, text }));
});

beforeEach(() => {
  embedCalls = [];
  NvidiaClient.isConfigured = () => true;
  NvidiaClient.embed = (async (texts: string[], type: string) => {
    embedCalls.push({ count: texts.length, type });
    return texts.map(fakeEmbed);
  }) as any;
});

after(() => {
  Object.assign(NvidiaClient, original);
});

test('chunks keep page numbers, overlap with the previous chunk, and cover all text', () => {
  const longPages: PageText[] = [
    { page: 1, text: Array.from({ length: 40 }, (_, i) => `${i + 1}. Paragraph number ${i + 1} of the judgment on page one.`).join('\n') },
    { page: 2, text: 'Final paragraph on page two. In the result, the appeal is dismissed.' },
  ];
  const chunks = buildChunks(longPages, 600, 120);
  assert.ok(chunks.length >= 4);
  for (const c of chunks) assert.ok(c.text.length <= 600 + 10, `chunk too long: ${c.text.length}`);
  // Every chunk after the first starts with text repeated from the previous chunk.
  const tailWords = chunks[0].text.split(' ').slice(-3).join(' ');
  assert.ok(chunks[1].text.includes(tailWords));
  // The chunk that starts on page 2 carries overlap from page 1 and cites both pages.
  const last = chunks[chunks.length - 1];
  assert.deepEqual(last.pages, [1, 2]);
  assert.ok(last.text.includes('appeal is dismissed'));
  // Nothing lost
  assert.ok(chunks.some((c) => c.text.includes('Paragraph number 40')));
});

test('TXT segments also chunk correctly', () => {
  const segs = TextExtractor.segmentText('Short judgment text about costs.');
  const chunks = buildChunks(segs);
  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0].pages, [1]);
});

test('index is built once with "passage" embeddings, then reused', async () => {
  await RagIndex.deleteIndex('doc-cache');
  const first = await RagIndex.ensureIndex('doc-cache', pages);
  assert.equal(first.indexedNow, true);
  assert.ok(embedCalls.length >= 1);
  assert.ok(embedCalls.every((c) => c.type === 'passage'));
  const stored = await documentChunkStore.getForDocument('doc-cache');
  assert.equal(stored.length, first.chunks.length);
  assert.ok(stored.every((c) => c.embedding.length > 0 && c.embeddingModel === config.nvidiaEmbeddingModel));

  embedCalls = [];
  const second = await RagIndex.ensureIndex('doc-cache', pages);
  assert.equal(second.indexedNow, false);
  assert.equal(embedCalls.length, 0, 'no embeddings should be requested for an unchanged document');
});

test('two simultaneous questions share one indexing run', async () => {
  await RagIndex.deleteIndex('doc-concurrent');
  await Promise.all([RagIndex.ensureIndex('doc-concurrent', pages), RagIndex.ensureIndex('doc-concurrent', pages)]);
  const passageCalls = embedCalls.filter((c) => c.type === 'passage').length;
  const batches = Math.ceil(buildChunks(pages, config.ragChunkChars, config.ragChunkOverlap).length / config.ragEmbedBatchSize);
  assert.equal(passageCalls, batches);
});

test('changing the embedding model re-indexes the document', async () => {
  await RagIndex.ensureIndex('doc-model', pages);
  const previous = config.nvidiaEmbeddingModel;
  config.nvidiaEmbeddingModel = 'nvidia/some-other-embedder';
  embedCalls = [];
  const res = await RagIndex.ensureIndex('doc-model', pages);
  assert.equal(res.indexedNow, true);
  assert.ok(embedCalls.length > 0);
  config.nvidiaEmbeddingModel = previous;
});

test('meaning-based search finds the costs direction even without the word "costs"', async () => {
  await RagIndex.deleteIndex('doc-search');
  const res = await RagIndex.search('doc-search', pages, 'How much money does the petitioner have to pay?', 2);
  assert.equal(res.mode, 'hybrid');
  assert.ok(res.chunks.length > 0);
  assert.ok(res.chunks.some((c) => c.pages.includes(3) && c.text.includes('Rs. 25,000')));
  // The question itself is embedded as a "query"
  assert.ok(embedCalls.some((c) => c.type === 'query' && c.count === 1));
});

test('falls back to keyword search if embeddings fail', async () => {
  NvidiaClient.embed = (async () => {
    throw new Error('NVIDIA API 503: busy');
  }) as any;
  await RagIndex.deleteIndex('doc-fallback');
  const res = await RagIndex.search('doc-fallback', pages, 'What costs were imposed?');
  assert.equal(res.mode, 'keyword');
  assert.match(res.note || '', /keyword search/);
  assert.ok(res.chunks.some((c) => c.pages.includes(3)));
});

test('Ask the Judgment uses RAG passages with page labels and reports the search mode', async () => {
  let prompt = '';
  NvidiaClient.chat = (async (messages: ChatMessage[]) => {
    prompt = messages[messages.length - 1].content;
    return { content: 'The petitioner must deposit Rs. 25,000 (p. 3).', finishReason: 'stop' };
  }) as any;
  await RagIndex.deleteIndex('doc-ask');
  const res = await QuestionAnsweringService.ask('How much money must be paid?', pages, 'pdf', [], 'doc-ask');
  assert.equal(res.retrievalMode, 'hybrid');
  assert.equal(res.indexedNow, true);
  assert.match(prompt, /\[Pages? [\d, ]*3\]/);
  assert.ok(res.sources.some((s) => s.pages.includes(3)));
  assert.equal(res.grounded, true);

  // Second question reuses the index
  const again = await QuestionAnsweringService.ask('Was the FIR quashed?', pages, 'pdf', [], 'doc-ask');
  assert.equal(again.indexedNow, false);
});

test('deleting the index removes stored chunks', async () => {
  await RagIndex.ensureIndex('doc-delete', pages);
  await RagIndex.deleteIndex('doc-delete');
  assert.equal((await documentChunkStore.getForDocument('doc-delete')).length, 0);
});

test('cosine similarity basics', () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.equal(cosine([0, 0], [1, 1]), 0);
});

test('small talk is answered instantly without searching or calling NVIDIA', async () => {
  let calls = 0;
  NvidiaClient.embed = (async () => {
    calls++;
    return [];
  }) as any;
  NvidiaClient.chat = (async () => {
    calls++;
    return { content: '', finishReason: 'stop' };
  }) as any;

  for (const msg of ['hi', 'Hello!', 'hii', 'Namaste', 'good morning', 'thanks', 'Thank you', 'ok', 'what can you do?', 'help', 'bye']) {
    const res = await QuestionAnsweringService.ask(msg, pages, 'pdf', [], 'doc-smalltalk');
    assert.equal(res.retrievalMode, 'none', msg);
    assert.ok(res.answer && res.answer.length > 0, msg);
    assert.equal(res.sources.length, 0);
  }
  const hi = await QuestionAnsweringService.ask('hi', pages, 'pdf', [], 'doc-smalltalk');
  assert.ok((hi.suggestions || []).length >= 3);
  assert.equal(calls, 0, 'small talk must not use NVIDIA credits');
});

test('real questions are never treated as small talk', () => {
  for (const q of [
    'hi, what was the final order?',
    'What did the court order?',
    'help me understand the costs',
    'Was the petition allowed?',
    'ok so who won the case',
    'thanks, and what about Section 482?',
  ]) {
    assert.equal(detectSmallTalk(q), null, q);
  }
});
