/**
 * Live check of the NVIDIA integration (uses your NVIDIA_API_KEY from backend/.env).
 *   npm run test:nvidia                    -> connection test + full report on a small fictional judgment
 *   npm run test:nvidia -- path/to/file.pdf -> full report on your own PDF/DOCX/TXT
 * The API key itself is never printed.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { config } from '../src/config/index.js';
import { NvidiaClient } from '../src/services/nvidiaClient.js';
import { TextExtractor } from '../src/services/textExtractor.js';
import { JudgmentPipeline } from '../src/services/judgmentPipeline.js';
import { QuestionAnsweringService } from '../src/services/questionAnswering.js';
import { LegalAnalysisResultSchema } from '../src/schemas/analysisSchema.js';
import { buildPdf, FIXTURE_PAGES } from '../tests/helpers.js';

async function main() {
  if (!NvidiaClient.isConfigured()) {
    console.log('SKIPPED: NVIDIA_API_KEY is not set in backend/.env, so the live NVIDIA test cannot run.');
    process.exit(2);
  }
  console.log(`Endpoint: ${config.nvidiaBaseUrl}`);
  console.log(`Model:    ${config.nvidiaModel}`);

  // 1. Connection
  const t0 = Date.now();
  const pong = await NvidiaClient.ping();
  console.log(`1) Connection OK in ${Date.now() - t0} ms. Model replied: ${JSON.stringify(pong.slice(0, 40))}`);

  // 2. Full pipeline
  let filePath = process.argv[2];
  let tmpDir = '';
  if (!filePath) {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nyaya-live-'));
    filePath = path.join(tmpDir, 'fictional_judgment.pdf');
    fs.writeFileSync(filePath, buildPdf(FIXTURE_PAGES));
  }
  const mime = filePath.toLowerCase().endsWith('.pdf') ? 'application/pdf' : filePath.toLowerCase().endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'text/plain';
  const extraction = await TextExtractor.extract(filePath, mime);
  console.log(`2) Extracted ${extraction.pages.length} ${extraction.pageSource === 'pdf' ? 'pages' : 'segments'} (${extraction.wordCount} words). Blank pages: ${extraction.emptyPages.join(', ') || 'none'}`);

  const t1 = Date.now();
  const result = await JudgmentPipeline.analyze(extraction.pages, extraction.pageSource, extraction.emptyPages, path.basename(filePath));
  LegalAnalysisResultSchema.parse(result);
  const r = result.detailedReport!;
  const all = [...r.background, ...r.reasoning, ...r.legalIssues, ...r.finalOutcome.directions, ...r.argumentsByParty.flatMap((a) => a.points)];
  const verified = all.filter((p) => p.verification === 'verified' || p.verification === 'approximate').length;

  console.log(`3) Report generated in ${Math.round((Date.now() - t1) / 1000)} s`);
  console.log(`   Court: ${r.caseDetails.court} | Date: ${r.caseDetails.date} | Case: ${r.caseDetails.caseNumber}`);
  console.log(`   Outcome: ${r.finalOutcome.outcomeCategory} (order verification: ${r.finalOutcome.verification.status})`);
  console.log(`   Background facts: ${r.background.length}, timeline events: ${r.timeline.length}, issues: ${r.legalIssues.length}, reasoning points: ${r.reasoning.length}, directions: ${r.finalOutcome.directions.length}`);
  console.log(`   Points whose quote was found in the source text: ${verified}/${all.length}`);
  console.log(`   Flagged uncertain claims: ${r.uncertainClaims.length}`);
  console.log('   Directions:');
  for (const d of r.finalOutcome.directions) console.log(`     - [${d.verification}] ${d.text} (pages ${d.pages.join(', ') || '?'})`);

  // 3. Grounded Q&A
  const qa = await QuestionAnsweringService.ask('What did the court finally order?', extraction.pages, extraction.pageSource);
  console.log(`4) Q&A answer: ${(qa.answer || '').slice(0, 400)}`);
  console.log(`   Sources: ${qa.sources.map((s) => s.page).join(', ')}`);

  const outPath = path.join(os.tmpdir(), 'nyaya-nvidia-report.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`Full JSON report written to ${outPath}`);
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
});
