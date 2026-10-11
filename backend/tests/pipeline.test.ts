/**
 * Offline tests for page extraction, source grounding and the NVIDIA judgment pipeline.
 * The network call (NvidiaClient.chat) is replaced with scripted model replies so the real
 * chunking, merging, verification and report-building code runs without an API key.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { config } from '../src/config/index.js';
import { TextExtractor, PageText } from '../src/services/textExtractor.js';
import { verifyQuote, sanitizePages, buildPassages, retrievePassages } from '../src/services/sourceGrounding.js';
import { NvidiaClient, NvidiaContextLengthError, NvidiaRequestError, ChatMessage } from '../src/services/nvidiaClient.js';
import { JudgmentPipeline } from '../src/services/judgmentPipeline.js';
import { LegalAnalysisResultSchema } from '../src/schemas/analysisSchema.js';
import { QuestionAnsweringService } from '../src/services/questionAnswering.js';
import { buildPdf, FIXTURE_PAGES } from './helpers.js';

// Safety: never reach the real NVIDIA API (or spend credits) from tests, even though backend/.env has a key.
config.nvidiaApiKey = 'test-key-not-real';
config.nvidiaBaseUrl = 'http://127.0.0.1:9/v1';
config.nvidiaMaxRetries = 0;

const originalChat = NvidiaClient.chat;
const originalIsConfigured = NvidiaClient.isConfigured;
const originalChunkChars = config.nvidiaChunkChars;
let tmpDir = '';
let pages: PageText[] = [];
let emptyPages: number[] = [];

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nyaya-test-'));
  const pdfPath = path.join(tmpDir, 'fixture.pdf');
  fs.writeFileSync(pdfPath, buildPdf(FIXTURE_PAGES));
  const extraction = await TextExtractor.extract(pdfPath, 'application/pdf');
  pages = extraction.pages;
  emptyPages = extraction.emptyPages;
});

after(() => {
  NvidiaClient.chat = originalChat;
  NvidiaClient.isConfigured = originalIsConfigured;
  config.nvidiaChunkChars = originalChunkChars;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('PDF extraction keeps real page numbers and flags blank pages', () => {
  assert.equal(pages.length, 3);
  assert.match(pages[0].text, /Arjun Mehta/);
  assert.equal(pages[1].text, '');
  assert.match(pages[2].text, /In the result, the petition is allowed/);
  assert.deepEqual(emptyPages, [2]);
});

test('TXT/DOCX text is split into ~400-word segments', () => {
  const words = Array.from({ length: 1000 }, (_, i) => `word${i}`);
  const text = words.map((w, i) => (i % 20 === 19 ? `${w}\n` : w)).join(' ');
  const segs = TextExtractor.segmentText(text);
  assert.equal(segs.length, 3);
  assert.deepEqual(segs.map((s) => s.page), [1, 2, 3]);
  assert.equal(segs.map((s) => s.text).join(' ').split(/\s+/).filter(Boolean).length, 1000);
});

test('quote verification confirms, corrects pages, and flags invented quotes', () => {
  const pageMap = new Map(pages.map((p) => [p.page, p.text]));
  assert.deepEqual(verifyQuote('the petition is allowed. FIR No. 248/2021 and all proceedings', [3], pageMap), {
    verification: 'verified',
    pages: [3],
  });
  // Right quote, wrong page -> page corrected
  assert.deepEqual(verifyQuote('the dispute is essentially of a civil nature arising from breach of contract', [1], pageMap).pages, [3]);
  // Invented quote -> unverified
  assert.equal(verifyQuote('the petitioner admitted his guilt before the trial court', [3], pageMap).verification, 'unverified');
  // Page numbers that do not exist are removed
  assert.deepEqual(sanitizePages([3, 99, '1', -2, 3], pageMap), [1, 3]);
});

test('passage retrieval finds the operative order for a question about the result', () => {
  const hits = retrievePassages('What did the court order about costs and the FIR?', buildPassages(pages), 3);
  assert.ok(hits.length > 0);
  assert.equal(hits[0].page, 3);
});

/** Scripted model replies. Quotes are copied from the fixture except where a test needs a fabricated one. */
function scriptedModel(calls: string[], options: { failFirstMultiPageChunk?: boolean } = {}) {
  let failed = false;
  return async (messages: ChatMessage[], opts: { label?: string } = {}) => {
    const label = opts.label || '';
    const prompt = messages[messages.length - 1].content;
    calls.push(label);
    const reply = (obj: unknown) => ({ content: '```json\n' + JSON.stringify(obj) + '\n```', finishReason: 'stop' });

    if (label.startsWith('chunk')) {
      const markerPages = Array.from(prompt.matchAll(/\[\[PAGE (\d+)\]\]/g)).map((m) => Number(m[1]));
      if (options.failFirstMultiPageChunk && !failed && markerPages.length > 1) {
        failed = true;
        throw new NvidiaContextLengthError('NVIDIA API 400: maximum context length exceeded');
      }
      const notes: any = { metadata: {}, parties: [], facts: [], timeline: [], arguments: [], issues: [], provisions: [], precedents: [], reasoning: [], orders: [], caseTypeHints: [] };
      if (markerPages.includes(1)) {
        notes.metadata = { court: 'High Court of Delhi', caseNumber: 'CRL.M.C. 3192/2022', decisionDate: '14th November 2022', bench: ['R.K. Verma, J.'] };
        notes.parties.push({ name: 'Arjun Mehta', role: 'Petitioner', pages: [1, 99] });
        notes.facts.push({ text: 'Complainant alleges inducement to pay Rs. 2.5 crores.', status: 'party_allegation', pages: [1], quote: 'The complainant alleges that the petitioner induced it to pay Rs. 2.5 crores' });
      }
      if (markerPages.includes(3)) {
        notes.reasoning.push({ text: 'Dispute is civil in nature.', status: 'court_finding', pages: [3], quote: 'the dispute is essentially of a civil nature arising from breach of contract' });
        notes.orders.push({ text: 'Petition allowed; FIR quashed.', pages: [3], quote: 'the petition is allowed. FIR No. 248/2021 and all proceedings emanating therefrom are quashed' });
      }
      return reply(notes);
    }

    if (label === 'synthesis A') {
      assert.match(prompt, /CONSOLIDATED NOTES/);
      return reply({
        overview: 'The High Court quashed an FIR because the dispute was civil.\n\nCosts were imposed.',
        classification: { primary: 'Criminal', secondary: ['Commercial'], confidence: 0.9, evidence: ['Section 482 CrPC petition'] },
        metadata: { title: 'Arjun Mehta v. State (NCT of Delhi)', court: 'High Court of Delhi', caseNumber: 'CRL.M.C. 3192/2022', decisionDate: '14th November 2022', bench: ['R.K. Verma, J.'], jurisdiction: 'Delhi' },
        parties: [{ name: 'Arjun Mehta', role: 'Petitioner', pages: [1] }, { name: 'State (NCT of Delhi)', role: 'Respondent', pages: [1] }],
        background: [
          { text: 'The complainant alleges it was induced to pay Rs. 2.5 crores under a share purchase agreement.', status: 'party_allegation', pages: [1], quote: 'The complainant alleges that the petitioner induced it to pay Rs. 2.5 crores' },
          // Fabricated: not in the judgment. Must be flagged.
          { text: 'The petitioner admitted guilt.', status: 'court_finding', pages: [3], quote: 'the petitioner admitted his guilt before the trial court' },
        ],
        timeline: [{ date: '10 March 2020', event: 'Share purchase agreement executed.', status: 'undisputed_fact', pages: [1], quote: 'share purchase agreement dated 10 March 2020' }],
        argumentsByParty: [
          { party: 'Petitioner (Arjun Mehta)', points: [{ text: 'The dispute is purely civil.', pages: [3], quote: 'the dispute is purely civil and arises from delay caused by COVID-19 disruptions' }] },
          { party: 'State', points: [{ text: 'Investigation revealed a prima facie case of cheating.', pages: [3], quote: 'the investigation revealed a prima facie case of cheating' }] },
        ],
        legalIssues: [{ text: 'Whether the FIR should be quashed under Section 482 CrPC.', pages: [1], quote: 'Petition under Section 482 of the Code of Criminal Procedure seeks quashing of FIR No. 248/2021' }],
      });
    }

    if (label === 'synthesis B') {
      return reply({
        provisions: [{ name: 'Section 482, Code of Criminal Procedure', type: 'Statutory Section', plainExplanation: 'Inherent power of the High Court.', howUsed: 'Used to quash the FIR.', pages: [1] }],
        precedents: [],
        // Correct quote but wrong page: pipeline must correct to page 3.
        reasoning: [{ text: 'The dispute is civil in nature.', status: 'court_finding', pages: [1], quote: 'the dispute is essentially of a civil nature arising from breach of contract' }],
        finalOutcome: {
          outcomeCategory: 'allowed',
          summary: 'Petition allowed and FIR quashed.',
          directions: [
            { text: 'FIR No. 248/2021 and all proceedings are quashed.', pages: [3], quote: 'FIR No. 248/2021 and all proceedings emanating therefrom are quashed' },
            { text: 'Petitioner to pay costs of Rs. 50,000.', pages: [3], quote: '' },
          ],
        },
        practicalMeaning: [{ text: 'Commercial disputes should not be given a criminal colour.', pages: [3] }],
        limitations: ['The Court did not decide the civil claim for recovery.'],
        uncertainClaims: [],
      });
    }

    if (label === 'verify final order') {
      assert.match(prompt, /\[\[PAGE 3\]\]/);
      return reply({
        outcomeCategory: 'Allowed',
        outcomeSupported: true,
        outcomeQuote: 'In the result, the petition is allowed',
        outcomePages: [3],
        correctedSummary: null,
        directions: [
          { index: 0, supported: 'yes', correctedText: null, pages: [3], quote: 'FIR No. 248/2021 and all proceedings emanating therefrom are quashed' },
          { index: 1, supported: 'partial', correctedText: 'Petitioner to deposit costs of Rs. 25,000 with the Delhi High Court Legal Services Committee within four weeks.', pages: [3], quote: 'The petitioner shall deposit costs of Rs. 25,000 with the Delhi High Court Legal Services Committee within four weeks' },
        ],
        // Invented direction: must not be added because its quote is not in the text.
        missedDirections: [{ text: 'Police to pay compensation.', pages: [3], quote: 'the police shall pay compensation of Rs. 1 lakh to the petitioner' }],
        notes: ['Costs amount in draft was wrong.'],
      });
    }
    throw new Error(`Unexpected label ${label}`);
  };
}

test('NVIDIA pipeline builds a grounded, verified report (mocked model)', async () => {
  const calls: string[] = [];
  NvidiaClient.isConfigured = () => true;
  NvidiaClient.chat = scriptedModel(calls) as any;

  const result = await JudgmentPipeline.analyze(pages, 'pdf', emptyPages, 'fixture.pdf');
  LegalAnalysisResultSchema.parse(result);
  const r = result.detailedReport!;

  assert.equal(result.aiAnalysisInfo.method, 'nvidia-ai');
  assert.equal(result.aiAnalysisInfo.isDemoMode, false);

  // Allegation stays an allegation and is verified
  assert.equal(r.background[0].status, 'party_allegation');
  assert.equal(r.background[0].verification, 'verified');
  // Fabricated claim is flagged
  assert.equal(r.background[1].verification, 'unverified');
  assert.equal(r.background[1].status, 'uncertain');
  assert.ok(r.uncertainClaims.some((u) => u.claim.includes('admitted guilt')));
  // Wrong page corrected from the quote
  assert.deepEqual(r.reasoning[0].pages, [3]);
  // Final order verified against the text: wrong costs corrected, invented direction rejected
  assert.equal(r.finalOutcome.outcomeCategory, 'Allowed');
  assert.equal(r.finalOutcome.directions.length, 2);
  assert.match(r.finalOutcome.directions[1].text, /25,000/);
  assert.equal(r.finalOutcome.directions[1].verification, 'verified');
  assert.ok(!r.finalOutcome.directions.some((d) => /compensation/.test(d.text)));
  assert.equal(r.finalOutcome.verification.status, 'verified');
  // Coverage and blank-page warning
  assert.deepEqual(r.coverage.emptyPages, [2]);
  assert.ok(r.limitations.some((l) => /OCR/.test(l)));
  assert.ok(r.disclaimer.includes('not legal advice'));
  // Existing UI fields are populated with page references
  assert.match(result.summary.reasoning[0], /\(p\. 3\)/);
  assert.equal(result.summary.outcomeCategory, 'Allowed');
  assert.ok(result.importantPassages.length > 0);
});

test('chunks are split and retried when the model reports a context-length error', async () => {
  const calls: string[] = [];
  config.nvidiaChunkChars = 100000;
  NvidiaClient.isConfigured = () => true;
  NvidiaClient.chat = scriptedModel(calls, { failFirstMultiPageChunk: true }) as any;

  const result = await JudgmentPipeline.analyze(pages, 'pdf', emptyPages, 'fixture.pdf');
  const chunkCalls = calls.filter((c) => c.startsWith('chunk'));
  // 1 failed whole-document chunk + 2 halves
  assert.equal(chunkCalls.length, 3);
  assert.deepEqual(result.detailedReport!.coverage.failedChunks, []);
  config.nvidiaChunkChars = originalChunkChars;
});

test('small chunk size processes every page in separate chunks', async () => {
  const calls: string[] = [];
  config.nvidiaChunkChars = 400;
  NvidiaClient.isConfigured = () => true;
  NvidiaClient.chat = scriptedModel(calls) as any;

  const result = await JudgmentPipeline.analyze(pages, 'pdf', emptyPages, 'fixture.pdf');
  assert.ok(calls.filter((c) => c.startsWith('chunk')).length >= 3);
  assert.ok(result.detailedReport!.coverage.chunks >= 3);
  config.nvidiaChunkChars = originalChunkChars;
});

test('a failed chunk is reported, not silently dropped', async () => {
  const calls: string[] = [];
  config.nvidiaChunkChars = 400;
  NvidiaClient.isConfigured = () => true;
  const base = scriptedModel(calls);
  NvidiaClient.chat = (async (messages: ChatMessage[], opts: any) => {
    if (opts?.label?.startsWith('chunk') && /\[\[PAGE 1\]\]/.test(messages[messages.length - 1].content)) {
      throw new Error('NVIDIA API 500: upstream error');
    }
    return base(messages, opts);
  }) as any;

  const result = await JudgmentPipeline.analyze(pages, 'pdf', emptyPages, 'fixture.pdf');
  const r = result.detailedReport!;
  assert.ok(r.coverage.failedChunks.length > 0);
  assert.ok(r.limitations.some((l) => /could not process/.test(l)));
  config.nvidiaChunkChars = originalChunkChars;
});

test('an invalid key or model stops the pipeline immediately with a clear error', async () => {
  let callCount = 0;
  config.nvidiaChunkChars = 400;
  NvidiaClient.isConfigured = () => true;
  NvidiaClient.chat = (async () => {
    callCount++;
    throw new NvidiaRequestError('NVIDIA API 401: Unauthorized Check NVIDIA_API_KEY in backend/.env.', 401);
  }) as any;
  await assert.rejects(() => JudgmentPipeline.analyze(pages, 'pdf', emptyPages, 'fixture.pdf'), /401/);
  // Concurrency is 2, so at most the two in-flight chunks are attempted, not all of them.
  assert.ok(callCount <= config.nvidiaConcurrency, `expected <= ${config.nvidiaConcurrency} calls, got ${callCount}`);
  config.nvidiaChunkChars = originalChunkChars;
});

test('retrieval understands everyday legal wording ("what did the court order")', () => {
  const hits = retrievePassages('What did the court finally order?', buildPassages(pages), 3);
  assert.ok(hits.length > 0);
  assert.equal(hits[0].page, 3);
});

test('Q&A without an API key returns relevant passages and no invented answer', async () => {
  NvidiaClient.isConfigured = () => false;
  const res = await QuestionAnsweringService.ask('What costs were imposed?', pages, 'pdf');
  assert.equal(res.answer, null);
  assert.equal(res.grounded, false);
  assert.ok(res.sources.some((s) => s.pages.includes(3)));
});

test('Q&A sends only retrieved passages with page labels to the model', async () => {
  let seenPrompt = '';
  NvidiaClient.isConfigured = () => true;
  NvidiaClient.chat = (async (messages: ChatMessage[]) => {
    seenPrompt = messages[messages.length - 1].content;
    return { content: 'Costs of Rs. 25,000 were imposed (p. 3).', finishReason: 'stop' };
  }) as any;
  const res = await QuestionAnsweringService.ask('What costs were imposed?', pages, 'pdf');
  assert.match(seenPrompt, /\[Pages? [\d, ]*3\]/);
  assert.equal(res.grounded, true);
  assert.match(res.answer!, /25,000/);
});
