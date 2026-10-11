export interface CaseClassification {
  primary: string;
  secondary: string[];
  confidence: number;
  evidence: string[];
}

export interface DocumentMetadata {
  title?: string | null;
  court?: string | null;
  caseNumber?: string | null;
  decisionDate?: string | null;
  bench: string[];
  jurisdiction?: string | null;
}

export interface Party {
  name: string;
  role: string;
  evidence: string;
}

export interface LegalProvision {
  name: string;
  type: string;
  context: string;
  evidence: string;
}

export interface CaseSummary {
  overview: string;
  facts: string[];
  legalIssues: string[];
  arguments: string[];
  reasoning: string[];
  outcome: string;
  outcomeCategory: 'Allowed' | 'Dismissed' | 'Partly Allowed' | 'Remanded' | 'Conviction' | 'Acquittal' | 'Disposed of with Directions' | 'Interim Relief Granted' | 'Other' | 'Unclear / Undetermined';
  limitations: string[];
}

export interface ImportantPassage {
  text: string;
  purpose: string;
  page?: number | null;
}

export type SourceStatus = 'court_finding' | 'party_allegation' | 'undisputed_fact' | 'procedural' | 'uncertain';
export type Verification = 'verified' | 'approximate' | 'unverified';

export interface SourcedPoint {
  text: string;
  pages: number[];
  status?: SourceStatus;
  quote?: string;
  verification?: Verification;
}

export interface DetailedReport {
  overview: string;
  caseDetails: {
    court?: string | null;
    date?: string | null;
    caseNumber?: string | null;
    bench: string[];
    parties: { name: string; role: string; pages: number[] }[];
  };
  background: SourcedPoint[];
  timeline: { date: string; event: string; pages: number[]; status?: SourceStatus; quote?: string; verification?: Verification }[];
  argumentsByParty: { party: string; points: SourcedPoint[] }[];
  legalIssues: SourcedPoint[];
  provisions: { name: string; type?: string; plainExplanation: string; howUsed: string; pages: number[] }[];
  precedents: { name: string; howUsed: string; pages: number[] }[];
  reasoning: SourcedPoint[];
  finalOutcome: {
    outcomeCategory: string;
    summary: string;
    directions: SourcedPoint[];
    verification: { status: 'verified' | 'partially_verified' | 'not_verified'; checkedPages: number[]; notes: string[] };
  };
  practicalMeaning: SourcedPoint[];
  limitations: string[];
  uncertainClaims: { claim: string; reason: string }[];
  coverage: {
    totalPages: number;
    pagesWithText: number;
    emptyPages: number[];
    pageReferenceType: 'pdf' | 'segment';
    chunks: number;
    failedChunks: string[];
  };
  disclaimer: string;
}

export interface QuestionAnswerResponse {
  answer: string | null;
  sources: { page: number; pages?: number[]; excerpt: string }[];
  model: string | null;
  grounded: boolean;
  /** 'hybrid' = searched by meaning + keywords (RAG); 'keyword' = keywords only. */
  retrievalMode?: 'hybrid' | 'keyword' | 'none';
  /** True when this question prepared the judgment for search (one-time, slower). */
  indexedNow?: boolean;
  /** Example questions shown as clickable buttons (e.g. after "hi"). */
  suggestions?: string[];
  disclaimer: string;
  message?: string;
  pageReferenceType: 'pdf' | 'segment';
}

export interface LegalAnalysisResult {
  caseClassification: CaseClassification;
  documentMetadata: DocumentMetadata;
  parties: Party[];
  legalProvisions: LegalProvision[];
  summary: CaseSummary;
  importantPassages: ImportantPassage[];
  detailedReport?: DetailedReport;
  aiAnalysisInfo: {
    method: 'nvidia-ai' | 'gemini-ai' | 'local-deterministic';
    model: string;
    analyzedAt: string;
    tokenUsageEstimate?: number;
    isDemoMode: boolean;
  };
}

export interface DocumentRecord {
  id: string;
  originalName: string;
  filename?: string;
  fileSize: number;
  mimeType: string;
  pageCount?: number;
  charCount?: number;
  wordCount?: number;
  isScannedPdf?: boolean;
  ocrRequired?: boolean;
  emptyPages?: number[];
  pageSource?: 'pdf' | 'segment';
  status: 'uploaded' | 'extracting' | 'extracted' | 'analyzing' | 'analyzed' | 'error';
  errorMessage?: string;
  extractedText?: string;
  /** First 500 characters of the extracted text, returned by the upload endpoint. */
  textSnippet?: string;
  analysis?: LegalAnalysisResult;
  caseType?: string;
  court?: string | null;
  caseNumber?: string | null;
  outcome?: string | null;
  analysisMethod?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  total: number;
  analyzed: number;
  pending: number;
  errors: number;
  distribution: { type: string; count: number }[];
  recent: DocumentRecord[];
  databaseType: string;
}

export interface SampleDocumentItem {
  id: string;
  title: string;
  filename: string;
  caseType: string;
  court: string;
  description: string;
}

export interface SystemStatus {
  status: string;
  timestamp: string;
  database: string;
  aiProvider: {
    configured: boolean;
    provider?: 'nvidia' | 'gemini' | 'local';
    service: string;
    model: string;
    fallback?: string;
    questionAnswering?: boolean;
    isDemoMode: boolean;
    supportedFormats: string[];
    maxFileSizeMB: number;
  };
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'advocate' | 'researcher' | 'clerk' | 'citizen';
}

export interface AuthResponse {
  message?: string;
  token: string;
  user: User;
}

