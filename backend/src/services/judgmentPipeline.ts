import { config } from '../config/index.js';
import {
  DetailedReport,
  LegalAnalysisResult,
  SourcedPoint,
  SourceStatus,
} from '../schemas/analysisSchema.js';
import { NvidiaClient, NvidiaContextLengthError, NvidiaRequestError, ChatMessage } from './nvidiaClient.js';
import { PageText, PageSource } from './textExtractor.js';
import { renderPagesWithMarkers, sanitizePages, verifyQuote } from './sourceGrounding.js';

/**
 * Detailed judgment analysis with NVIDIA hosted models.
 *
 * 1. Split the judgment into page-aligned chunks (pages are never silently dropped).
 * 2. Map: extract exhaustive, page-referenced notes from every chunk.
 * 3. Consolidate notes if they are too large for one synthesis call.
 * 4. Synthesise a structured plain-English report (two calls to avoid output truncation).
 * 5. Re-read the operative portion of the original text to verify the final order.
 * 6. Check every supporting quote against the extracted page text and flag anything unsupported.
 */

export const LEGAL_DISCLAIMER =
  'This report is generated automatically for general information and research. It is not legal advice and may contain errors or omissions. ' +
  'Always read the certified copy of the judgment and consult an advocate before relying on it or acting on it.';

const OUTCOME_CATEGORIES = [
  'Allowed',
  'Dismissed',
  'Partly Allowed',
  'Remanded',
  'Conviction',
  'Acquittal',
  'Disposed of with Directions',
  'Interim Relief Granted',
  'Other',
  'Unclear / Undetermined',
] as const;
type OutcomeCategory = (typeof OUTCOME_CATEGORIES)[number];

const STATUS_VALUES: SourceStatus[] = ['court_finding', 'party_allegation', 'undisputed_fact', 'procedural', 'uncertain'];

interface Chunk {
  label: string;
  pages: PageText[];
}

class TruncatedOutputError extends Error {}

const SYSTEM_PROMPT = `You are a meticulous Indian legal analyst who explains court judgments to non-lawyers.
Rules you must always follow:
1. Use ONLY the judgment text supplied to you. Never invent facts, names, dates, amounts, case citations, statutory provisions, outcomes or page numbers.
2. The text contains markers like [[PAGE 12]] (or [[SEGMENT 12]]). Every page number you report must be the number of the marker under which that information appears.
3. Keep these categories separate and label them with "status":
   - "court_finding": what the court itself decided, held or found established.
   - "party_allegation": what a party alleged, claimed or argued (the court has not necessarily accepted it).
   - "undisputed_fact": facts the judgment records as admitted or not in dispute.
   - "procedural": procedural history (FIRs, filings, earlier orders, hearings).
   - "uncertain": you cannot tell which of the above it is.
4. "quote" must be copied character-for-character from the supplied text (8 to 30 words) and must support the point. Do not paraphrase inside "quote".
5. Write explanations in plain, simple English while keeping legal accuracy. Keep dates, amounts, section numbers and names exactly as written.
6. If there are concurring or dissenting opinions, attribute views to the judge who wrote them and identify the majority/operative order.
7. Respond with a single valid JSON object only. No markdown fences, no commentary.`;

// The two report-writing calls produce the longest outputs, so they get double the normal budget.
const SYNTHESIS_MAX_TOKENS = config.nvidiaMaxOutputTokens * 2;

const POINT = '{"text": string, "status": string, "pages": number[], "quote": string}';

export class JudgmentPipeline {
  public static async analyze(
    pages: PageText[],
    pageSource: PageSource,
    emptyPages: number[],
    originalFilename: string
  ): Promise<LegalAnalysisResult> {
    const started = Date.now();
    const pageMap = new Map(pages.map((p) => [p.page, p.text]));
    const marker = pageSource === 'pdf' ? 'PAGE' : 'SEGMENT';
    const textPages = pages.filter((p) => p.text.trim().length > 0);
    if (textPages.length === 0) throw new Error('No extractable text found in the document.');

    // 1. Chunk
    const chunks = this.chunkPages(textPages, config.nvidiaChunkChars);
    console.log(`[JudgmentPipeline] ${originalFilename}: ${pages.length} ${marker.toLowerCase()}s, ${chunks.length} chunk(s), model ${NvidiaClient.model}`);

    // 2. Map
    const failedChunks: string[] = [];
    const chunkNotes: any[] = [];
    await this.runPool(chunks, config.nvidiaConcurrency, async (chunk, i) => {
      const notes = await this.extractChunkNotes(chunk, marker, originalFilename, `${i + 1}/${chunks.length}`, failedChunks);
      chunkNotes.push(...notes);
    });
    if (chunkNotes.length === 0) {
      throw new Error(`NVIDIA analysis failed for every chunk (${failedChunks.join(', ')}).`);
    }
    chunkNotes.sort((a, b) => (a.__firstPage ?? 0) - (b.__firstPage ?? 0));
    let notes = this.mergeNotes(chunkNotes, pageMap);

    // 3. Consolidate oversized notes
    const limitations: string[] = [];
    notes = await this.consolidateIfNeeded(notes, pageMap, limitations);

    // 4. Synthesis (two calls so long reports are not cut off by the output limit)
    const notesJson = JSON.stringify(notes);
    const header = `Document: "${originalFilename}". Total ${marker.toLowerCase()}s: ${pages.length}. Page references use ${marker} numbers.\nCONSOLIDATED NOTES (extracted from the full judgment, with page references):\n${notesJson}`;

    const [partA, partB] = await Promise.all([
      this.callJson(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `${header}

Using only these notes, write PART A of a detailed report as JSON with exactly these keys:
{
  "overview": string (3-6 short paragraphs in plain English: what the case is about, who the parties are, what was decided and why it matters; separate paragraphs with \\n\\n),
  "classification": {"primary": one of ["Civil","Criminal","Constitutional","Writ Petition","Service and employment","Property","Family","Commercial","Tax","Administrative","Other"], "secondary": string[], "confidence": number 0-1, "evidence": string[]},
  "metadata": {"title": string|null, "court": string|null, "caseNumber": string|null, "decisionDate": string|null, "bench": string[], "jurisdiction": string|null},
  "parties": [{"name": string, "role": string, "pages": number[]}],
  "background": [${POINT}]  (all material background facts in logical order; keep amounts, dates and names),
  "timeline": [{"date": string, "event": string, "status": string, "pages": number[], "quote": string}]  (chronological; use the date exactly as written),
  "argumentsByParty": [{"party": string (role and name), "points": [${POINT}]}]  (status should normally be "party_allegation"),
  "legalIssues": [${POINT}]  (each question the court had to decide)
}
Preserve detail: do not merge distinct facts, events or arguments into vague generalisations. Use null or [] when information is not in the notes.`,
          },
        ],
        'synthesis A',
        SYNTHESIS_MAX_TOKENS
      ),
      this.callJson(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `${header}

Using only these notes, write PART B of a detailed report as JSON with exactly these keys:
{
  "provisions": [{"name": string (exact as cited, e.g. "Section 482, Code of Criminal Procedure, 1973"), "type": string ("Constitutional Article" | "Statutory Section" | "Statute/Act" | "Court Rule" | "Other"), "plainExplanation": string, "howUsed": string, "pages": number[]}],
  "precedents": [{"name": string (exactly as cited in the notes), "howUsed": string, "pages": number[]}],
  "reasoning": [${POINT}]  (the court's reasoning step by step; status "court_finding" for conclusions the court reached),
  "finalOutcome": {"outcomeCategory": one of ${JSON.stringify(OUTCOME_CATEGORIES)}, "summary": string, "directions": [${POINT}]  (every operative direction exactly, starting with the main disposal itself, e.g. "petition allowed / FIR quashed / appeal dismissed", then who must do what, by when, costs, amounts)},
  "practicalMeaning": [{"text": string, "pages": number[]}]  (what the decision means in practice for the parties and similar cases, cautious and tied to the judgment),
  "limitations": string[]  (what this judgment does NOT decide, open questions, liberty granted, parts that are unclear),
  "uncertainClaims": [{"claim": string, "reason": string}]  (anything in the notes that looks inconsistent or insufficiently supported)
}
For "plainExplanation": explain the provision in simple words based on how the judgment describes it. If the judgment does not describe it, give a cautious one-line description and begin it with "General description (not from the judgment): ".
Never add precedents or provisions that are not in the notes.`,
          },
        ],
        'synthesis B',
        SYNTHESIS_MAX_TOKENS
      ),
    ]);

    // 5. Verify final order against the original operative text
    const finalOutcome = await this.verifyFinalOrder(partB?.finalOutcome, pages, pageMap, marker);

    // 6. Ground every point and assemble the report
    const uncertainClaims: Array<{ claim: string; reason: string }> = this.asArray(partB?.uncertainClaims)
      .filter((u: any) => u?.claim)
      .map((u: any) => ({ claim: String(u.claim), reason: String(u.reason || 'Flagged by the model as uncertain.') }));

    const ground = (items: any[], defaultStatus?: SourceStatus, section?: string): SourcedPoint[] =>
      this.asArray(items)
        .filter((it: any) => it && (it.text || it.event))
        .map((it: any) => this.groundPoint(it, pageMap, defaultStatus, section, uncertainClaims));

    const timeline = this.asArray(partA?.timeline)
      .filter((t: any) => t?.event)
      .map((t: any) => {
        const grounded = this.groundPoint({ ...t, text: t.event }, pageMap, 'procedural', 'Timeline', uncertainClaims);
        return { date: String(t.date || 'Date not stated'), event: grounded.text, pages: grounded.pages, status: grounded.status, quote: grounded.quote, verification: grounded.verification };
      });

    const meta = partA?.metadata || notes.metadata || {};
    const coverage = {
      totalPages: pages.length,
      pagesWithText: textPages.length,
      emptyPages,
      pageReferenceType: pageSource,
      chunks: chunks.length,
      failedChunks,
    };

    if (failedChunks.length) {
      limitations.push(`The AI could not process ${marker.toLowerCase()}s ${failedChunks.join(', ')} after several retries. Details from those ${marker.toLowerCase()}s may be missing from this report.`);
    }
    if (emptyPages.length) {
      limitations.push(
        `${emptyPages.length} page(s) had no extractable text (${this.formatPageList(emptyPages)}). They may be scanned images, blank pages or stamps. OCR is not available in this application, so their content was not analysed.`
      );
    }
    if (pageSource === 'segment') {
      limitations.push('This file has no real page numbers (TXT/DOCX). References like "seg. 3" point to ~400-word segments of the extracted text, not printed page numbers.');
    }

    const detailedReport: DetailedReport = {
      overview: String(partA?.overview || 'Overview could not be generated.'),
      caseDetails: {
        court: meta.court ?? null,
        date: meta.decisionDate ?? null,
        caseNumber: meta.caseNumber ?? null,
        bench: this.uniqueJudges(this.asArray(meta.bench).map(String)),
        parties: this.asArray(partA?.parties)
          .filter((p: any) => p?.name)
          .map((p: any) => ({ name: String(p.name), role: String(p.role || 'Party'), pages: sanitizePages(p.pages, pageMap) })),
      },
      background: ground(partA?.background, 'uncertain', 'Background'),
      timeline,
      argumentsByParty: this.asArray(partA?.argumentsByParty)
        .filter((a: any) => a?.party)
        .map((a: any) => ({ party: String(a.party), points: ground(a.points, 'party_allegation', `Arguments (${a.party})`) })),
      legalIssues: ground(partA?.legalIssues, undefined, 'Legal issues'),
      provisions: this.asArray(partB?.provisions)
        .filter((p: any) => p?.name)
        .map((p: any) => ({
          name: String(p.name),
          plainExplanation: String(p.plainExplanation || ''),
          howUsed: String(p.howUsed || ''),
          pages: sanitizePages(p.pages, pageMap),
          type: String(p.type || 'Statutory Section'),
        })),
      precedents: this.asArray(partB?.precedents)
        .filter((p: any) => p?.name)
        .map((p: any) => ({ name: String(p.name), howUsed: String(p.howUsed || ''), pages: sanitizePages(p.pages, pageMap) })),
      reasoning: ground(partB?.reasoning, 'court_finding', 'Reasoning'),
      finalOutcome,
      practicalMeaning: this.asArray(partB?.practicalMeaning)
        .filter((p: any) => p?.text)
        .map((p: any) => ({ text: String(p.text), pages: sanitizePages(p.pages, pageMap) })),
      limitations: [...this.asArray(partB?.limitations).map(String), ...limitations],
      uncertainClaims,
      coverage,
      disclaimer: LEGAL_DISCLAIMER,
    };

    console.log(`[JudgmentPipeline] ${originalFilename}: report ready in ${Math.round((Date.now() - started) / 1000)}s`);
    return this.toLegacyResult(detailedReport, partA, partB, originalFilename, marker);
  }

  // ---------------------------------------------------------------------------
  // Chunking
  // ---------------------------------------------------------------------------

  private static chunkPages(pages: PageText[], maxChars: number): Chunk[] {
    // Split any single page that is larger than a chunk so nothing is dropped.
    const units: PageText[] = [];
    for (const p of pages) {
      if (p.text.length <= maxChars) {
        units.push(p);
      } else {
        for (let i = 0; i < p.text.length; i += maxChars) units.push({ page: p.page, text: p.text.slice(i, i + maxChars) });
      }
    }

    const chunks: Chunk[] = [];
    let current: PageText[] = [];
    let size = 0;
    for (const unit of units) {
      if (current.length && size + unit.text.length > maxChars) {
        chunks.push(this.makeChunk(current));
        current = [];
        size = 0;
      }
      current.push(unit);
      size += unit.text.length;
    }
    if (current.length) chunks.push(this.makeChunk(current));
    return chunks;
  }

  private static makeChunk(pages: PageText[]): Chunk {
    const first = pages[0].page;
    const last = pages[pages.length - 1].page;
    return { label: first === last ? `${first}` : `${first}-${last}`, pages };
  }

  private static async extractChunkNotes(
    chunk: Chunk,
    marker: string,
    filename: string,
    progress: string,
    failed: string[],
    depth = 0
  ): Promise<any[]> {
    const text = renderPagesWithMarkers(chunk.pages, marker as 'PAGE' | 'SEGMENT');
    try {
      const notes = await this.callJson(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Document: "${filename}". This is one part (${marker.toLowerCase()}s ${chunk.label}) of a longer Indian court judgment.
Extract EXHAUSTIVE notes from this part only. Keep every material fact, date, amount, name, section number, argument, finding and direction. Do not summarise away detail.
Return JSON with exactly these keys (use [] or null when absent in this part):
{
  "metadata": {"title": string|null, "court": string|null, "caseNumber": string|null, "decisionDate": string|null, "bench": string[], "jurisdiction": string|null},
  "parties": [{"name": string, "role": string, "pages": number[]}],
  "facts": [${POINT}],
  "timeline": [{"date": string, "event": string, "status": string, "pages": number[], "quote": string}],
  "arguments": [{"party": string, "text": string, "pages": number[], "quote": string}],
  "issues": [{"text": string, "pages": number[], "quote": string}],
  "provisions": [{"name": string, "type": string, "explanation": string, "howUsed": string, "pages": number[]}],
  "precedents": [{"name": string, "howUsed": string, "pages": number[]}],
  "reasoning": [${POINT}],
  "orders": [{"text": string, "pages": number[], "quote": string}],
  "caseTypeHints": string[]
}
"orders" is only for operative directions/final orders of THIS court (not orders of lower courts, which belong in "timeline" as procedural).

JUDGMENT TEXT:
${text}`,
          },
        ],
        `chunk ${progress} (${marker.toLowerCase()}s ${chunk.label})`
      );
      notes.__firstPage = chunk.pages[0].page;
      return [notes];
    } catch (err: any) {
      // Bad key, unknown model, etc.: every other chunk would fail the same way, so stop now.
      if (err instanceof NvidiaRequestError) throw err;
      const splittable = err instanceof NvidiaContextLengthError || err instanceof TruncatedOutputError;
      if (splittable && depth < 3 && (chunk.pages.length > 1 || chunk.pages[0].text.length > 4000)) {
        console.warn(`[JudgmentPipeline] chunk ${chunk.label} too large (${err.message}); splitting in half.`);
        const halves = this.splitChunk(chunk);
        const results: any[] = [];
        for (const half of halves) {
          results.push(...(await this.extractChunkNotes(half, marker, filename, `${progress}.${depth + 1}`, failed, depth + 1)));
        }
        return results;
      }
      console.error(`[JudgmentPipeline] chunk ${chunk.label} failed: ${err.message}`);
      if (!failed.includes(chunk.label)) failed.push(chunk.label);
      return [];
    }
  }

  private static splitChunk(chunk: Chunk): Chunk[] {
    if (chunk.pages.length > 1) {
      const mid = Math.ceil(chunk.pages.length / 2);
      return [this.makeChunk(chunk.pages.slice(0, mid)), this.makeChunk(chunk.pages.slice(mid))];
    }
    const { page, text } = chunk.pages[0];
    const mid = Math.ceil(text.length / 2);
    return [this.makeChunk([{ page, text: text.slice(0, mid) }]), this.makeChunk([{ page, text: text.slice(mid) }])];
  }

  // ---------------------------------------------------------------------------
  // Merging & consolidation
  // ---------------------------------------------------------------------------

  private static mergeNotes(list: any[], pageMap: Map<number, string>): any {
    const merged: any = {
      metadata: { title: null, court: null, caseNumber: null, decisionDate: null, bench: [] as string[], jurisdiction: null },
      parties: [],
      facts: [],
      timeline: [],
      arguments: [],
      issues: [],
      provisions: [],
      precedents: [],
      reasoning: [],
      orders: [],
      caseTypeHints: [],
    };
    const listKeys = ['parties', 'facts', 'timeline', 'arguments', 'issues', 'provisions', 'precedents', 'reasoning', 'orders'];

    for (const n of list) {
      const m = n?.metadata || {};
      for (const key of ['title', 'court', 'caseNumber', 'decisionDate', 'jurisdiction']) {
        if (!merged.metadata[key] && m[key]) merged.metadata[key] = m[key];
      }
      merged.metadata.bench = this.uniqueJudges([...merged.metadata.bench, ...this.asArray(m.bench)]);
      for (const key of listKeys) {
        for (const item of this.asArray(n?.[key])) {
          if (item && typeof item === 'object') merged[key].push({ ...item, pages: sanitizePages(item.pages, pageMap) });
        }
      }
      for (const hint of this.asArray(n?.caseTypeHints)) {
        if (hint && !merged.caseTypeHints.includes(hint)) merged.caseTypeHints.push(hint);
      }
    }
    return merged;
  }

  private static async consolidateIfNeeded(notes: any, pageMap: Map<number, string>, limitations: string[]): Promise<any> {
    const limit = config.nvidiaSynthesisMaxChars;
    let round = 0;
    while (JSON.stringify(notes).length > limit && round < 3) {
      round++;
      const listKeys = ['facts', 'timeline', 'arguments', 'issues', 'provisions', 'precedents', 'reasoning', 'orders', 'parties'];
      console.log(`[JudgmentPipeline] notes are ${JSON.stringify(notes).length} chars (> ${limit}); consolidation round ${round}.`);
      const consolidated: any = { metadata: notes.metadata, caseTypeHints: notes.caseTypeHints };

      for (const key of listKeys) {
        const items: any[] = notes[key] || [];
        // Batch each list so that a single consolidation request stays well inside the limit.
        const batches: any[][] = [];
        let batch: any[] = [];
        let size = 0;
        for (const item of items) {
          const s = JSON.stringify(item).length;
          if (batch.length && size + s > limit / 2) {
            batches.push(batch);
            batch = [];
            size = 0;
          }
          batch.push(item);
          size += s;
        }
        if (batch.length) batches.push(batch);

        consolidated[key] = [];
        for (const b of batches) {
          if (b.length < 4) {
            consolidated[key].push(...b);
            continue;
          }
          try {
            const result = await this.callJson(
              [
                { role: 'system', content: SYSTEM_PROMPT },
                {
                  role: 'user',
                  content: `Below is a JSON list of "${key}" notes extracted from different parts of one judgment. Merge exact or near duplicates and combine their page numbers, but keep every distinct fact, date, amount, argument, finding and direction. Keep "quote" values unchanged (pick one when merging). Keep the original order.
Return {"items": [...]} using the same object shape.
${JSON.stringify(b)}`,
                },
              ],
              `consolidate ${key}`
            );
            const items2 = this.asArray(result?.items).map((it: any) => ({ ...it, pages: sanitizePages(it?.pages, pageMap) }));
            consolidated[key].push(...(items2.length ? items2 : b));
          } catch (err: any) {
            console.warn(`[JudgmentPipeline] consolidation of ${key} failed (${err.message}); keeping unconsolidated notes.`);
            consolidated[key].push(...b);
          }
        }
      }
      notes = consolidated;
    }
    if (JSON.stringify(notes).length > limit) {
      limitations.push('This judgment is very long. Notes were consolidated before writing the report, so some minor details may be condensed. Check the cited pages for full detail.');
    }
    return notes;
  }

  // ---------------------------------------------------------------------------
  // Final order verification
  // ---------------------------------------------------------------------------

  private static async verifyFinalOrder(
    claimed: any,
    pages: PageText[],
    pageMap: Map<number, string>,
    marker: string
  ): Promise<DetailedReport['finalOutcome']> {
    const claimedDirections = this.asArray(claimed?.directions).filter((d: any) => d?.text);
    const outcome = {
      outcomeCategory: this.normalizeOutcome(claimed?.outcomeCategory),
      summary: String(claimed?.summary || 'The final outcome could not be determined from the extracted text.'),
      directions: [] as SourcedPoint[],
      verification: { status: 'not_verified' as 'verified' | 'partially_verified' | 'not_verified', checkedPages: [] as number[], notes: [] as string[] },
    };

    // The operative order is normally at the end. Take the last pages with text, plus any page in the
    // last third of the judgment that contains typical operative wording.
    const textPages = pages.filter((p) => p.text.trim());
    const operativeRe = /\b(in the result|accordingly|we order|it is ordered|ordered that|disposed of|stands? (allowed|dismissed)|is (hereby )?(allowed|dismissed|quashed|set aside)|appeals? (is|are) (allowed|dismissed)|no order as to costs|directions?)\b/i;
    const tailStart = Math.floor(textPages.length * 0.66);
    const selected = new Map<number, PageText>();
    for (const p of textPages.slice(-3)) selected.set(p.page, p);
    for (const p of textPages.slice(tailStart)) if (operativeRe.test(p.text)) selected.set(p.page, p);

    let operative = Array.from(selected.values()).sort((a, b) => a.page - b.page);
    // Keep within ~40k characters, preferring the final pages.
    while (operative.length > 1 && operative.reduce((s, p) => s + p.text.length, 0) > 40000) operative = operative.slice(1);
    outcome.verification.checkedPages = operative.map((p) => p.page);

    try {
      const result = await this.callJson(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Verify a draft description of the FINAL ORDER of a judgment against the original text of its concluding ${marker.toLowerCase()}s.

DRAFT OUTCOME:
${JSON.stringify({ outcomeCategory: outcome.outcomeCategory, summary: outcome.summary, directions: claimedDirections.map((d: any, i: number) => ({ index: i, text: d.text })) })}

ORIGINAL CONCLUDING TEXT:
${renderPagesWithMarkers(operative, marker as 'PAGE' | 'SEGMENT')}

Return JSON:
{
  "outcomeCategory": one of ${JSON.stringify(OUTCOME_CATEGORIES)} as supported by the original text,
  "outcomeSupported": boolean (does the original text support the draft outcomeCategory?),
  "outcomeQuote": string (verbatim words from the text stating the result, or ""),
  "outcomePages": number[],
  "correctedSummary": string|null (a corrected one-paragraph summary if the draft summary is wrong or incomplete, otherwise null),
  "directions": [{"index": number, "supported": "yes"|"partial"|"no", "correctedText": string|null, "pages": number[], "quote": string}],
  "missedDirections": [{"text": string, "pages": number[], "quote": string}] (operative directions present in the text but missing from the draft),
  "notes": string[] (any discrepancy you found)
}
If the concluding text does not contain the final order, say so in "notes" and mark directions you cannot confirm as "no".`,
          },
        ],
        'verify final order',
        4096
      );

      const verdicts = new Map<number, any>(this.asArray(result?.directions).map((d: any) => [Number(d?.index), d]));
      let supportedCount = 0;

      claimedDirections.forEach((d: any, i: number) => {
        const v = verdicts.get(i);
        const supported = v?.supported === 'yes' || v?.supported === 'partial';
        const text = v?.supported === 'partial' && v?.correctedText ? String(v.correctedText) : String(d.text);
        const point = this.groundPoint(
          { text, status: 'court_finding', pages: v?.pages?.length ? v.pages : d.pages, quote: v?.quote || d.quote },
          pageMap,
          'court_finding'
        );
        if (!supported) {
          point.status = 'uncertain';
          point.verification = 'unverified';
          outcome.verification.notes.push(`Could not confirm this direction in the concluding pages: "${this.truncate(text, 140)}"`);
        } else if (point.verification !== 'unverified') {
          supportedCount++;
        }
        outcome.directions.push(point);
      });

      for (const m of this.asArray(result?.missedDirections).filter((x: any) => x?.text)) {
        const point = this.groundPoint({ ...m, status: 'court_finding' }, pageMap, 'court_finding');
        if (point.verification !== 'unverified') {
          outcome.directions.push(point);
          supportedCount++;
          outcome.verification.notes.push('A direction missing from the first draft was added from the original order text.');
        }
      }

      const outcomeCheck = verifyQuote(result?.outcomeQuote, sanitizePages(result?.outcomePages, pageMap), pageMap);
      const verifiedCategory = this.normalizeOutcome(result?.outcomeCategory);
      if (result?.outcomeSupported === false && outcomeCheck.verification !== 'unverified' && verifiedCategory !== outcome.outcomeCategory) {
        outcome.verification.notes.push(`Outcome corrected from "${outcome.outcomeCategory}" to "${verifiedCategory}" after checking the order text.`);
        outcome.outcomeCategory = verifiedCategory;
      }
      if (result?.correctedSummary) outcome.summary = String(result.correctedSummary);
      for (const n of this.asArray(result?.notes)) if (n) outcome.verification.notes.push(String(n));

      const outcomeOk = outcomeCheck.verification !== 'unverified';
      const total = outcome.directions.length;
      if (outcomeOk && supportedCount === total) outcome.verification.status = 'verified';
      else if (outcomeOk || supportedCount > 0) outcome.verification.status = 'partially_verified';
      if (outcomeOk) {
        outcome.verification.notes.unshift(`Result confirmed by the text on ${marker.toLowerCase()} ${outcomeCheck.pages.join(', ')}: "${this.truncate(String(result.outcomeQuote), 200)}"`);
      } else {
        outcome.verification.notes.push('The wording of the final result could not be matched to the original text. Read the operative order yourself.');
      }
    } catch (err: any) {
      console.warn(`[JudgmentPipeline] final order verification failed: ${err.message}`);
      outcome.directions = claimedDirections.map((d: any) => this.groundPoint(d, pageMap, 'court_finding'));
      outcome.verification.notes.push(`Automatic verification of the final order could not be completed (${err.message}). Quotes were still checked against the text.`);
      outcome.verification.status = outcome.directions.some((d) => d.verification !== 'unverified') ? 'partially_verified' : 'not_verified';
    }
    return outcome;
  }

  // ---------------------------------------------------------------------------
  // Grounding helpers
  // ---------------------------------------------------------------------------

  private static groundPoint(
    item: any,
    pageMap: Map<number, string>,
    defaultStatus?: SourceStatus,
    section?: string,
    uncertainClaims?: Array<{ claim: string; reason: string }>
  ): SourcedPoint {
    const text = String(item.text ?? item.event ?? '').trim();
    const cited = sanitizePages(item.pages, pageMap);
    const quote = typeof item.quote === 'string' && item.quote.trim() ? item.quote.trim() : undefined;
    const check = verifyQuote(quote, cited, pageMap);
    let status: SourceStatus | undefined = STATUS_VALUES.includes(item.status) ? item.status : defaultStatus;

    if (check.verification === 'unverified') {
      if (uncertainClaims && section) {
        uncertainClaims.push({
          claim: `${section}: ${this.truncate(text, 180)}`,
          reason: quote ? 'The supporting quote could not be found in the extracted text.' : 'No supporting quote was provided, so this could not be checked.',
        });
      }
      status = status === 'party_allegation' ? status : 'uncertain';
    }

    return {
      text,
      pages: check.pages,
      ...(status ? { status } : {}),
      ...(quote ? { quote } : {}),
      verification: check.verification,
    };
  }

  // ---------------------------------------------------------------------------
  // Legacy (existing UI) fields
  // ---------------------------------------------------------------------------

  private static toLegacyResult(report: DetailedReport, partA: any, partB: any, filename: string, marker: string): LegalAnalysisResult {
    const ref = (pages: number[]) => (pages.length ? ` (${marker === 'PAGE' ? 'p.' : 'seg.'} ${pages.join(', ')})` : '');
    const cls = partA?.classification || {};
    const confidence = Number(cls.confidence);

    const importantPassages = [
      ...report.finalOutcome.directions.map((d) => ({ ...d, purpose: 'Operative Order / Direction' })),
      ...report.reasoning.map((r) => ({ ...r, purpose: 'Court Reasoning' })),
      ...report.legalIssues.map((r) => ({ ...r, purpose: 'Legal Issue' })),
    ]
      .filter((p) => p.quote && p.verification !== 'unverified')
      .slice(0, 12)
      .map((p) => ({ text: p.quote as string, purpose: p.purpose, page: p.pages[0] ?? null }));

    return {
      caseClassification: {
        primary: String(cls.primary || 'Other'),
        secondary: this.asArray(cls.secondary).map(String),
        confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.7,
        evidence: this.asArray(cls.evidence).map(String),
      },
      documentMetadata: {
        title: partA?.metadata?.title || filename,
        court: report.caseDetails.court ?? null,
        caseNumber: report.caseDetails.caseNumber ?? null,
        decisionDate: report.caseDetails.date ?? null,
        bench: report.caseDetails.bench,
        jurisdiction: partA?.metadata?.jurisdiction ?? null,
      },
      parties: report.caseDetails.parties.map((p) => ({ name: p.name, role: p.role, evidence: p.pages.length ? `Referenced on${ref(p.pages)}` : '' })),
      legalProvisions: report.provisions.map((p: any) => ({
        name: p.name,
        type: p.type || 'Statutory Section',
        context: `${p.howUsed}${ref(p.pages)}`,
        evidence: p.plainExplanation,
      })),
      summary: {
        overview: report.overview,
        facts: report.background.map((f) => `${f.text}${ref(f.pages)}`),
        legalIssues: report.legalIssues.map((i) => `${i.text}${ref(i.pages)}`),
        arguments: report.argumentsByParty.flatMap((a) => a.points.map((p) => `${a.party}: ${p.text}${ref(p.pages)}`)),
        reasoning: report.reasoning.map((r) => `${r.text}${ref(r.pages)}`),
        outcome: [report.finalOutcome.summary, ...report.finalOutcome.directions.map((d) => `• ${d.text}${ref(d.pages)}`)].join('\n'),
        outcomeCategory: report.finalOutcome.outcomeCategory as OutcomeCategory,
        limitations: [...report.limitations, LEGAL_DISCLAIMER],
      },
      importantPassages,
      detailedReport: report,
      aiAnalysisInfo: {
        method: 'nvidia-ai',
        model: NvidiaClient.model,
        analyzedAt: new Date().toISOString(),
        isDemoMode: false,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Model call + JSON parsing
  // ---------------------------------------------------------------------------

  private static async callJson(messages: ChatMessage[], label: string, maxTokens?: number): Promise<any> {
    let lastErr: Error | null = null;
    let retryHint = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const msgs = attempt === 0 ? messages : [...messages, { role: 'user' as const, content: retryHint }];
      const result = await NvidiaClient.chat(msgs, { label, maxTokens });
      try {
        return this.parseJson(result.content);
      } catch (err: any) {
        lastErr = err;
        if (result.finishReason === 'length') {
          if (attempt === 1) throw new TruncatedOutputError(`Model output for ${label} hit the output token limit.`);
          retryHint =
            'Your previous answer was cut off because it was too long. Reply again with the complete JSON object, keeping each point to at most two sentences and each quote short, but still keep every distinct fact, date, amount and direction.';
        } else {
          retryHint = 'Your previous reply was not valid JSON. Reply again with ONLY the JSON object, no markdown fences or commentary.';
        }
        console.warn(`[JudgmentPipeline] ${label}: ${result.finishReason === 'length' ? 'output truncated' : `invalid JSON (${err.message})`}, retrying once.`);
      }
    }
    throw lastErr || new Error(`Invalid JSON from model for ${label}`);
  }

  public static parseJson(raw: string): any {
    let text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('No JSON object found in model output');
    text = text.slice(start, end + 1);
    try {
      return JSON.parse(text);
    } catch {
      // Common model slip: trailing commas.
      return JSON.parse(text.replace(/,\s*([}\]])/g, '$1'));
    }
  }

  // ---------------------------------------------------------------------------
  // Small utilities
  // ---------------------------------------------------------------------------

  private static async runPool<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
    let next = 0;
    const runners = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
      while (next < items.length) {
        const i = next++;
        await worker(items[i], i);
      }
    });
    await Promise.all(runners);
  }

  private static normalizeOutcome(value: unknown): OutcomeCategory {
    const v = String(value || '').toLowerCase().trim();
    const exact = OUTCOME_CATEGORIES.find((c) => c.toLowerCase() === v);
    if (exact) return exact;
    if (v.includes('partly') || v.includes('partially')) return 'Partly Allowed';
    if (v.includes('remand')) return 'Remanded';
    if (v.includes('acquit')) return 'Acquittal';
    if (v.includes('convict')) return 'Conviction';
    if (v.includes('direction') || v.includes('disposed')) return 'Disposed of with Directions';
    if (v.includes('interim')) return 'Interim Relief Granted';
    if (v.includes('allow')) return 'Allowed';
    if (v.includes('dismiss')) return 'Dismissed';
    return v ? 'Other' : 'Unclear / Undetermined';
  }

  /** "J.R. Midha", "J.R. MIDHA, J." and "Hon'ble Mr. Justice J.R. Midha" are the same judge. */
  public static uniqueJudges(names: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of names) {
      const name = String(raw || '').trim();
      const key = name
        .toLowerCase()
        .replace(/\b(hon'?ble|honourable|mrs?|ms|dr|chief justice|justice)\b\.?/g, ' ')
        .replace(/,?\s*\b(c\.?\s?j\.?\s?i?|j)\.?\s*$/, '')
        .replace(/[^a-z]/g, '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
    return out;
  }

  private static asArray(value: unknown): any[] {
    return Array.isArray(value) ? value : [];
  }

  private static truncate(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  private static formatPageList(pages: number[]): string {
    if (pages.length <= 12) return `pages ${pages.join(', ')}`;
    return `pages ${pages.slice(0, 12).join(', ')} and ${pages.length - 12} more`;
  }
}
