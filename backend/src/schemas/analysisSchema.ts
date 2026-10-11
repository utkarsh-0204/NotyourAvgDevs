import { z } from 'zod';

export const CaseClassificationSchema = z.object({
  primary: z.string(),
  secondary: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()).default([]),
});

export const DocumentMetadataSchema = z.object({
  title: z.string().nullable().optional(),
  court: z.string().nullable().optional(),
  caseNumber: z.string().nullable().optional(),
  decisionDate: z.string().nullable().optional(),
  bench: z.array(z.string()).default([]),
  jurisdiction: z.string().nullable().optional(),
});

export const PartySchema = z.object({
  name: z.string(),
  role: z.string(), // e.g. "Petitioner", "Respondent", "Appellant", "Accused", "Judge", "Advocate for Petitioner", etc.
  evidence: z.string().default(''),
});

export const LegalProvisionSchema = z.object({
  name: z.string(), // e.g. "Article 226", "Section 482", "Order 39 Rule 1 & 2"
  type: z.string(), // "Statutory Section", "Constitutional Article", "Court Rule", "Precedent/Case Law", "Statute/Act"
  context: z.string(), // How it applies in this case
  evidence: z.string().default(''),
});

export const CaseSummarySchema = z.object({
  overview: z.string(),
  facts: z.array(z.string()).default([]),
  legalIssues: z.array(z.string()).default([]),
  arguments: z.array(z.string()).default([]), // can also include appellant/respondent breakdowns
  reasoning: z.array(z.string()).default([]),
  outcome: z.string(),
  outcomeCategory: z.enum([
    'Allowed',
    'Dismissed',
    'Partly Allowed',
    'Remanded',
    'Conviction',
    'Acquittal',
    'Disposed of with Directions',
    'Interim Relief Granted',
    'Other',
    'Unclear / Undetermined'
  ]).default('Other'),
  limitations: z.array(z.string()).default([]),
});

export const ImportantPassageSchema = z.object({
  text: z.string(),
  purpose: z.string(), // e.g., "Classification Context", "Court Holding", "Legal Interpretation", "Disposition"
  page: z.number().nullable().optional(),
});

/**
 * Detailed, page-referenced report produced by the NVIDIA chunked pipeline.
 * Every point carries the source pages it came from and whether its supporting
 * quote was found in the extracted text of those pages.
 */
export const SourceStatusSchema = z.enum([
  'court_finding', // established / held by the court
  'party_allegation', // claimed or argued by a party, not decided by the court
  'undisputed_fact', // facts the judgment records as admitted or not in dispute
  'procedural', // procedural history (filings, earlier orders)
  'uncertain', // the model could not tell or could not ground the point
]);

export const VerificationSchema = z.enum(['verified', 'approximate', 'unverified']);

export const SourcedPointSchema = z.object({
  text: z.string(),
  pages: z.array(z.number()).default([]),
  status: SourceStatusSchema.optional(),
  quote: z.string().optional(),
  verification: VerificationSchema.optional(),
});

export const DetailedReportSchema = z.object({
  overview: z.string(),
  caseDetails: z.object({
    court: z.string().nullable().optional(),
    date: z.string().nullable().optional(),
    caseNumber: z.string().nullable().optional(),
    bench: z.array(z.string()).default([]),
    parties: z.array(z.object({ name: z.string(), role: z.string(), pages: z.array(z.number()).default([]) })).default([]),
  }),
  background: z.array(SourcedPointSchema).default([]),
  timeline: z.array(z.object({
    date: z.string(),
    event: z.string(),
    pages: z.array(z.number()).default([]),
    status: SourceStatusSchema.optional(),
    quote: z.string().optional(),
    verification: VerificationSchema.optional(),
  })).default([]),
  argumentsByParty: z.array(z.object({ party: z.string(), points: z.array(SourcedPointSchema).default([]) })).default([]),
  legalIssues: z.array(SourcedPointSchema).default([]),
  provisions: z.array(z.object({
    name: z.string(),
    type: z.string().optional(),
    plainExplanation: z.string(),
    howUsed: z.string(),
    pages: z.array(z.number()).default([]),
  })).default([]),
  precedents: z.array(z.object({ name: z.string(), howUsed: z.string(), pages: z.array(z.number()).default([]) })).default([]),
  reasoning: z.array(SourcedPointSchema).default([]),
  finalOutcome: z.object({
    outcomeCategory: z.string(),
    summary: z.string(),
    directions: z.array(SourcedPointSchema).default([]),
    verification: z.object({
      status: z.enum(['verified', 'partially_verified', 'not_verified']),
      checkedPages: z.array(z.number()).default([]),
      notes: z.array(z.string()).default([]),
    }),
  }),
  practicalMeaning: z.array(SourcedPointSchema).default([]),
  limitations: z.array(z.string()).default([]),
  uncertainClaims: z.array(z.object({ claim: z.string(), reason: z.string() })).default([]),
  coverage: z.object({
    totalPages: z.number(),
    pagesWithText: z.number(),
    emptyPages: z.array(z.number()).default([]),
    pageReferenceType: z.enum(['pdf', 'segment']),
    chunks: z.number(),
    failedChunks: z.array(z.string()).default([]),
  }),
  disclaimer: z.string(),
});

export const LegalAnalysisResultSchema = z.object({
  caseClassification: CaseClassificationSchema,
  documentMetadata: DocumentMetadataSchema,
  parties: z.array(PartySchema).default([]),
  legalProvisions: z.array(LegalProvisionSchema).default([]),
  summary: CaseSummarySchema,
  importantPassages: z.array(ImportantPassageSchema).default([]),
  detailedReport: DetailedReportSchema.optional(),
  aiAnalysisInfo: z.object({
    method: z.enum(['nvidia-ai', 'gemini-ai', 'local-deterministic']),
    model: z.string(),
    analyzedAt: z.string(),
    tokenUsageEstimate: z.number().optional(),
    isDemoMode: z.boolean(),
  }),
});

export type CaseClassification = z.infer<typeof CaseClassificationSchema>;
export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>;
export type Party = z.infer<typeof PartySchema>;
export type LegalProvision = z.infer<typeof LegalProvisionSchema>;
export type CaseSummary = z.infer<typeof CaseSummarySchema>;
export type ImportantPassage = z.infer<typeof ImportantPassageSchema>;
export type SourceStatus = z.infer<typeof SourceStatusSchema>;
export type SourcedPoint = z.infer<typeof SourcedPointSchema>;
export type DetailedReport = z.infer<typeof DetailedReportSchema>;
export type LegalAnalysisResult = z.infer<typeof LegalAnalysisResultSchema>;
