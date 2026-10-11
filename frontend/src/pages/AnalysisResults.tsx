import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Share2,
  MoreVertical,
  Copy,
  Check,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Search,
  Printer,
  ChevronLeft,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { api } from '../services/api';
import { DocumentRecord, LegalAnalysisResult, LegalProvision } from '../types';
import { DetailedReportView, AskJudgmentPanel, PageRef } from '../components/DetailedReportView';

export const AnalysisResults: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const [documentRecord, setDocumentRecord] = useState<DocumentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Workspace Tabs
  const [activeTab, setActiveTab] = useState<
    'summary' | 'analysis' | 'ask' | 'document'
  >('summary');

  // Document Viewer state
  const [zoomLevel, setZoomLevel] = useState(125);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedThumbnail, setSelectedThumbnail] = useState(1);

  // Legal Provisions Tab state
  const [selectedProvisionIndex, setSelectedProvisionIndex] = useState(0);

  const loadDocument = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getDocument(id);
      setDocumentRecord(res.document);

      if (res.document.status === 'extracted' && !res.document.analysis) {
        runAnalysis();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load document analysis.');
    } finally {
      setLoading(false);
    }
  };

  const runAnalysis = async () => {
    if (!id) return;
    setAnalyzing(true);
    setError(null);
    try {
      const res = await api.analyzeDocument(id);
      setDocumentRecord(res.document);
    } catch (err: any) {
      // Another tab/request is already analysing this document: wait for it instead of failing.
      if (/already running/i.test(err.message || '')) {
        setDocumentRecord((prev) => (prev ? { ...prev, status: 'analyzing' } : prev));
      } else {
        setError(err.message || 'Analysis failed.');
      }
    } finally {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    loadDocument();
  }, [id]);

  // Long judgments can take several minutes. If the analysis was started elsewhere, poll until it finishes.
  useEffect(() => {
    if (!id || analyzing || documentRecord?.status !== 'analyzing') return;
    const timer = setInterval(async () => {
      try {
        const res = await api.getDocument(id);
        if (res.document.status !== 'analyzing') {
          setDocumentRecord(res.document);
        }
      } catch {
        // keep polling
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [id, analyzing, documentRecord?.status]);

  const copySummaryText = () => {
    if (!documentRecord?.analysis) return;
    const s = documentRecord.analysis.summary;
    const r = documentRecord.analysis.detailedReport;
    navigator.clipboard.writeText(
      [r?.overview || s.overview, `Outcome: ${s.outcomeCategory}`, r?.finalOutcome.summary || s.outcome].filter(Boolean).join('\n\n')
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="py-24 text-center space-y-3">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#14243D]" />
        <p className="text-xs text-[#737986]">Opening legal workspace...</p>
      </div>
    );
  }

  if (!documentRecord) {
    return (
      <div className="py-16 text-center space-y-4 max-w-md mx-auto">
        <AlertCircle className="w-6 h-6 text-[#C44B4B] mx-auto" />
        <h2 className="font-serif text-lg font-bold text-[#14243D]">Document unavailable</h2>
        <p className="text-xs text-[#737986] leading-relaxed">
          {error || 'The requested document record could not be loaded.'}
        </p>
        <Link
          to="/dashboard"
          className="inline-flex items-center space-x-1.5 text-xs text-[#14243D] font-semibold hover:underline pt-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Dashboard</span>
        </Link>
      </div>
    );
  }

  const analysis: LegalAnalysisResult | undefined = documentRecord.analysis;
  const meta = analysis?.documentMetadata;
  const report = analysis?.detailedReport;
  const refType: 'pdf' | 'segment' = report?.coverage.pageReferenceType || (documentRecord.mimeType.includes('pdf') ? 'pdf' : 'segment');
  const isBusy = analyzing || documentRecord.status === 'analyzing';
  const shorten = (t: string, max = 220) => (t.length > max ? `${t.slice(0, t.lastIndexOf(' ', max - 1) > 0 ? t.lastIndexOf(' ', max - 1) : max - 1)}…` : t);
  const keyTakeaways: string[] = (report
    ? [
        ...report.finalOutcome.directions.slice(0, 2).map((d) => d.text),
        ...report.reasoning.filter((r) => r.status === 'court_finding' && r.verification !== 'unverified').slice(0, 2).map((r) => r.text),
      ]
    : (analysis?.summary?.reasoning || []).slice(0, 4)
  ).map((t) => shorten(t));
  // Same judge written differently ("J.R. Midha" / "J.R. MIDHA, J.") is shown once.
  const benchNames = Array.from(
    new Map(
      (meta?.bench || []).map((b) => [
        b
          .toLowerCase()
          .replace(/\b(hon'?ble|honourable|mrs?|ms|dr|chief justice|justice)\b\.?/g, ' ')
          .replace(/,?\s*\b(c\.?\s?j\.?\s?i?|j)\.?\s*$/, '')
          .replace(/[^a-z]/g, ''),
        b,
      ])
    ).values()
  );
  const goToTab = (tab: 'summary' | 'analysis' | 'ask' | 'document') => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Constitutional and statutory provisions grouping
  const constitutionalProvisions = (analysis?.legalProvisions || []).filter(
    (p) => p.type.toLowerCase().includes('constitutional') || p.name.toLowerCase().includes('article')
  );
  const statutoryProvisions = (analysis?.legalProvisions || []).filter(
    (p) => !p.type.toLowerCase().includes('constitutional') && !p.name.toLowerCase().includes('article')
  );

  const allProvisions = [...constitutionalProvisions, ...statutoryProvisions];
  const activeProvision: LegalProvision | undefined =
    allProvisions[selectedProvisionIndex] || allProvisions[0];

  const totalPages = documentRecord.pageCount || 1;

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* 1. TOP CASE HEADER (Matching Screens C & D) */}
      <div className="space-y-3 pb-2 border-b border-[#E5E2DA]">
        <Link
          to="/library"
          className="inline-flex items-center space-x-1.5 text-xs text-[#737986] hover:text-[#14243D] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Documents</span>
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-3">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#14243D] tracking-tight">
                {meta?.title || documentRecord.originalName.replace(/\.[^/.]+$/, '')}
              </h1>
              {isBusy ? (
                <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#FDF6E7] text-[#9A6B12]">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Analyzing</span>
                </span>
              ) : analysis ? (
                <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#EBF7F1] text-[#23845D]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#23845D]"></span>
                  <span>Completed</span>
                </span>
              ) : null}
            </div>

            <div className="text-xs text-[#737986] flex flex-wrap items-center gap-x-2">
              <span>{meta?.court || 'Court not identified'}</span>
              <span>|</span>
              <span>{analysis?.caseClassification?.primary || 'Unclassified'}</span>
              <span>|</span>
              <span>{meta?.decisionDate || 'Date not identified'}</span>
              {analysis && (
                <>
                  <span>|</span>
                  <span>
                    {analysis.aiAnalysisInfo.method === 'nvidia-ai'
                      ? `NVIDIA AI (${analysis.aiAnalysisInfo.model})`
                      : analysis.aiAnalysisInfo.method === 'gemini-ai'
                      ? `Gemini (${analysis.aiAnalysisInfo.model})`
                      : 'Rule-based engine'}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center space-x-2.5 shrink-0">
            <a
              href={api.getAnalysisExportUrl(documentRecord.id, 'markdown')}
              download
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-md bg-[#14243D] hover:bg-[#0D182A] text-white text-xs font-medium shadow-subtle transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Report</span>
            </a>

            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: meta?.title || documentRecord.originalName, url: window.location.href });
                } else {
                  navigator.clipboard.writeText(window.location.href);
                  alert('Analysis link copied to clipboard.');
                }
              }}
              className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-md border border-[#E5E2DA] bg-white hover:bg-[#F3F1EB] text-[#14243D] text-xs font-medium shadow-subtle transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </button>

            <button
              title="More options"
              className="p-2 rounded-md border border-[#E5E2DA] bg-white hover:bg-[#F3F1EB] text-[#737986] hover:text-[#14243D] transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. HORIZONTAL TAB BAR (Matching Reference C & D) */}
        <div className="pt-2 overflow-x-auto">
          <nav className="flex space-x-6 border-b border-[#E5E2DA] text-xs whitespace-nowrap">
            {[
              // Main features first; the original document viewer is a separate tool, kept last.
              { id: 'summary', label: 'Summary' },
              { id: 'analysis', label: 'Analysis' },
              { id: 'ask', label: 'Ask the Judgment' },
              { id: 'document', label: 'Document' },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`pb-3 font-medium transition-colors relative ${
                    isActive
                      ? 'text-[#14243D] font-semibold'
                      : 'text-[#737986] hover:text-[#14243D]'
                  }`}
                >
                  {tab.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#14243D]" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {isBusy && (
        <div className="p-3 rounded-md bg-[#FDF6E7] border border-[#F0E2C2] text-xs text-[#7A5A12] flex items-center space-x-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span>
            Analysing the judgment page by page. Long judgments can take several minutes; you can leave this page open and the report will appear when ready.
          </span>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-md bg-[#FBEBEB] border border-[#F3CFCF] text-xs text-[#C44B4B] flex items-center justify-between">
          <span>{error}</span>
          <button onClick={runAnalysis} className="font-semibold hover:underline">Retry analysis</button>
        </div>
      )}
      {analysis && analysis.aiAnalysisInfo.method !== 'nvidia-ai' && !isBusy && (
        <div className="p-3 rounded-md bg-[#FAF9F5] border border-[#E5E2DA] text-[11px] text-[#737986]">
          This result was produced by the {analysis.aiAnalysisInfo.method === 'gemini-ai' ? 'Gemini fallback' : 'rule-based fallback engine'}, so the detailed page-referenced report is not available.
          {analysis.summary.limitations.length > 0 && ` ${analysis.summary.limitations[0]}`}
        </div>
      )}

      {/* 3. MAIN WORKSPACE CONTENT ACCORDING TO ACTIVE TAB */}

      {activeTab === 'analysis' && report && <DetailedReportView report={report} hideOverview />}

      {/* SUMMARY: overview, final outcome, case details and key takeaways */}
      {activeTab === 'summary' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 border border-[#E5E2DA] rounded-lg bg-white p-6 shadow-card space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E2DA]">
              <h2 className="font-serif font-bold text-lg text-[#14243D]">Case Summary</h2>
              <button
                onClick={copySummaryText}
                disabled={!analysis}
                className="inline-flex items-center space-x-1 text-xs text-[#737986] hover:text-[#14243D] transition-colors disabled:opacity-40"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <div className="space-y-2 text-xs sm:text-sm text-[#3F4754] leading-relaxed">
              {(report?.overview || analysis?.summary?.overview || (isBusy ? 'Analysis in progress…' : 'No analysis available yet.'))
                .split(/\n\s*\n/)
                .map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
            </div>

            {analysis && (
              <div className="space-y-3 pt-4 border-t border-[#E5E2DA]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs uppercase font-bold tracking-wider text-[#737986]">Final Outcome:</span>
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase bg-[#EBF7F1] text-[#23845D]">
                    {report?.finalOutcome.outcomeCategory || analysis.summary.outcomeCategory}
                  </span>
                  {report && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        report.finalOutcome.verification.status === 'verified'
                          ? 'bg-[#EBF7F1] text-[#23845D]'
                          : report.finalOutcome.verification.status === 'partially_verified'
                          ? 'bg-[#FDF6E7] text-[#9A6B12]'
                          : 'bg-[#FBEBEB] text-[#C44B4B]'
                      }`}
                    >
                      Order {report.finalOutcome.verification.status.replace('_', ' ')} against the judgment text
                    </span>
                  )}
                </div>
                {report ? (
                  <>
                    <p className="font-serif text-xs sm:text-sm text-[#14243D] leading-relaxed">{report.finalOutcome.summary}</p>
                    {report.finalOutcome.directions.length > 0 && (
                      <ul className="space-y-1.5">
                        {report.finalOutcome.directions.map((d, i) => (
                          <li key={i} className="flex items-start space-x-2 text-xs sm:text-sm text-[#3F4754]">
                            <span className="text-[#A98A4B] font-bold">•</span>
                            <span>
                              {d.text}
                              <PageRef pages={d.pages} type={refType} />
                              {d.verification === 'unverified' && <span className="ml-1.5 text-[10px] font-semibold text-[#C44B4B]">not verified</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <p className="font-serif text-xs sm:text-sm text-[#14243D] leading-relaxed whitespace-pre-line">{analysis.summary.outcome}</p>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-4 border-t border-[#E5E2DA]">
              <button
                onClick={() => goToTab('analysis')}
                className="inline-flex items-center space-x-1 px-3 py-2 rounded-md bg-[#14243D] hover:bg-[#0D182A] text-white text-xs font-medium"
              >
                <span>Read the full analysis</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => goToTab('ask')}
                className="inline-flex items-center space-x-1 px-3 py-2 rounded-md border border-[#E5E2DA] bg-white hover:bg-[#F3F1EB] text-[#14243D] text-xs font-medium"
              >
                <span>Ask a question about this judgment</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-[11px] text-[#737986]">
              Informational only, not legal advice. Always read the certified copy of the judgment.
            </p>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <div className="border border-[#E5E2DA] rounded-lg bg-white p-5 shadow-card space-y-3 text-xs">
              <h3 className="font-serif font-bold text-sm text-[#14243D]">Case Details</h3>
              {[
                ['Court', meta?.court],
                ['Judgment Date', meta?.decisionDate],
                ['Case Type', analysis?.caseClassification?.primary],
                ['Case Number', meta?.caseNumber],
                ['Bench', benchNames.length ? benchNames.join(', ') : null],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <span className="text-[11px] text-[#737986] block">{label}</span>
                  <span className="font-medium text-[#14243D]">{value || 'Not identified'}</span>
                </div>
              ))}
              {(analysis?.parties?.length || 0) > 0 && (
                <div>
                  <span className="text-[11px] text-[#737986] block">Parties</span>
                  <ul className="space-y-0.5">
                    {analysis!.parties.slice(0, 8).map((p, i) => (
                      <li key={i} className="text-[#14243D]">
                        <span className="font-medium">{p.name}</span> <span className="text-[#737986]">— {p.role}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="p-5 rounded-lg bg-[#FAF9F5] border border-[#E5E2DA] space-y-2">
              <h3 className="font-serif font-bold text-sm text-[#14243D]">Key Takeaways</h3>
              {keyTakeaways.length ? (
                <ul className="space-y-1.5 text-xs text-[#3F4754]">
                  {keyTakeaways.map((t, i) => (
                    <li key={i} className="flex items-start space-x-2">
                      <span className="text-[#A98A4B] font-bold">•</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[#737986]">{isBusy ? 'Available when the analysis finishes.' : 'No takeaways available.'}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ask' && <AskJudgmentPanel documentId={documentRecord.id} />}

      {/* TAB 1: DOCUMENT VIEW (Screen C: Left Document Canvas, Right Case Summary & Metadata) */}
      {activeTab === 'document' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT: Document / PDF Viewer (62% width on desktop) */}
          <div className="lg:col-span-12 border border-[#E5E2DA] rounded-lg bg-white shadow-card overflow-hidden flex flex-col">
            {/* Document Viewer Toolbar (Matching Screen C exactly) */}
            <div className="h-10 bg-[#2B2E33] text-[#D1D5DB] px-3 flex items-center justify-between text-xs select-none">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setSelectedThumbnail((prev) => Math.max(1, prev - 1))}
                  title="Toggle Thumbnails"
                  className="p-1 hover:text-white"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <div className="h-4 w-px bg-[#4B5563]" />
                <span className="text-[11px] font-mono">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setSelectedThumbnail((prev) => Math.min(totalPages, prev + 1))}
                  className="p-1 hover:text-white"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Zoom & Page Size */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setZoomLevel((z) => Math.max(75, z - 10))}
                  title="Zoom Out"
                  className="p-1 hover:text-white"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-mono">{zoomLevel}%</span>
                <button
                  onClick={() => setZoomLevel((z) => Math.min(200, z + 10))}
                  title="Zoom In"
                  className="p-1 hover:text-white"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <div className="h-4 w-px bg-[#4B5563]" />
                <button
                  onClick={() => setZoomLevel(100)}
                  title="Fit Width"
                  className="p-1 hover:text-white"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <button title="Print Document" className="p-1 hover:text-white">
                  <Printer className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Document Canvas Body: Left Thumbnails + Center Rendered Document */}
            <div className="flex bg-[#525659] p-4 min-h-[620px] max-h-[720px] overflow-auto">
              {/* Left Thumbnails Strip */}
              <div className="hidden sm:flex flex-col space-y-3 pr-4 border-r border-[#6B7280]/40 shrink-0 select-none">
                {[1, 2, 3, 4].map((page) => (
                  <div
                    key={page}
                    onClick={() => {
                      setSelectedThumbnail(page);
                      setCurrentPage(page);
                    }}
                    className={`cursor-pointer group flex flex-col items-center ${
                      selectedThumbnail === page ? 'opacity-100' : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    <div
                      className={`w-14 h-18 bg-white border rounded-sm p-1 shadow-xs flex flex-col justify-between overflow-hidden ${
                        selectedThumbnail === page ? 'border-[#3B82F6] ring-1 ring-[#3B82F6]' : 'border-gray-400'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="h-1 bg-gray-300 w-3/4 rounded-xs" />
                        <div className="h-1 bg-gray-200 w-full rounded-xs" />
                        <div className="h-1 bg-gray-200 w-5/6 rounded-xs" />
                      </div>
                      <div className="h-0.5 bg-gray-300 w-1/2 mx-auto" />
                    </div>
                    <span className="text-[10px] text-gray-300 mt-1">{page}</span>
                  </div>
                ))}
              </div>

              {/* Main Document Render Canvas */}
              <div className="flex-1 flex justify-center pl-2 sm:pl-4 overflow-x-auto">
                <div
                  style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
                  className="w-full max-w-xl bg-white text-black p-8 sm:p-12 shadow-2xl rounded-xs text-xs font-serif leading-relaxed space-y-5 transition-transform"
                >
                  {/* Extracted text of the uploaded document (first part) */}
                  <div className="text-[11px] leading-relaxed text-gray-900 font-serif whitespace-pre-wrap">
                    {documentRecord.extractedText
                      ? documentRecord.extractedText.slice(0, 6000)
                      : 'No extracted text is available for this document.'}
                    {documentRecord.extractedText && documentRecord.extractedText.length > 6000 && (
                      <p className="pt-3 italic text-gray-600">
                        [Showing the first part of the extracted text. Download the original file for the full judgment.]
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ANALYSIS (fallback engines): facts and issues */}
      {activeTab === 'analysis' && !report && (
        <div className="border border-[#E5E2DA] rounded-lg bg-white p-6 shadow-card space-y-6">
          <div className="space-y-2">
            <h2 className="font-serif font-bold text-lg text-[#14243D]">Executive Summary</h2>
            <p className="text-xs sm:text-sm text-[#3F4754] leading-relaxed">
              {analysis?.summary?.overview}
            </p>
          </div>

          <div className="space-y-2 pt-4 border-t border-[#E5E2DA]">
            <h3 className="font-serif font-bold text-sm text-[#14243D]">Factual Matrix</h3>
            <div className="space-y-2 text-xs text-[#3F4754]">
              {analysis?.summary?.facts.map((f, i) => (
                <div key={i} className="flex items-baseline space-x-2">
                  <span className="text-[#A98A4B] font-bold">{i + 1}.</span>
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t border-[#E5E2DA]">
            <h3 className="font-serif font-bold text-sm text-[#14243D]">Legal Issues for Adjudication</h3>
            <div className="space-y-2 text-xs text-[#3F4754]">
              {analysis?.summary?.legalIssues.map((issue, i) => (
                <div key={i} className="flex items-baseline space-x-2">
                  <span className="text-[#4269A8] font-bold">Q{i + 1}:</span>
                  <span>{issue}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PARTIES & COUNSEL */}
      {activeTab === 'analysis' && !report && (
        <div className="border border-[#E5E2DA] rounded-lg bg-white shadow-card overflow-hidden">
          <div className="p-4 bg-[#FAF9F5] border-b border-[#E5E2DA]">
            <h2 className="font-serif font-bold text-sm text-[#14243D]">Parties & Legal Counsel</h2>
          </div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#E5E2DA] bg-[#F7F6F2] text-[11px] font-semibold text-[#737986]">
                <th className="py-2.5 px-4 font-semibold">Entity / Person</th>
                <th className="py-2.5 px-4 font-semibold">Role</th>
                <th className="py-2.5 px-4 font-semibold">Source Evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E2DA]">
              {analysis?.parties.map((p, i) => (
                <tr key={i} className="hover:bg-[#FAF9F5]">
                  <td className="py-3 px-4 font-semibold text-[#14243D]">{p.name}</td>
                  <td className="py-3 px-4 text-[#616875]">{p.role}</td>
                  <td className="py-3 px-4 text-[#737986] font-mono text-[11px]">{p.evidence || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 5: ARGUMENTS */}
      {activeTab === 'analysis' && !report && (
        <div className="border border-[#E5E2DA] rounded-lg bg-white p-6 shadow-card space-y-4">
          <h2 className="font-serif font-bold text-base text-[#14243D]">Submissions & Arguments</h2>
          <div className="space-y-3">
            {analysis?.summary?.arguments.map((arg, i) => (
              <div key={i} className="p-3.5 rounded-md bg-[#FAF9F5] border border-[#E5E2DA] text-xs text-[#3F4754] leading-relaxed">
                {arg}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: LEGAL PROVISIONS (Screen D: Left Provisions List, Right Detail with Interpretation & Excerpts) */}
      {activeTab === 'analysis' && !report && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT: Constitutional & Statutory Provisions List (~38% width) */}
          <div className="lg:col-span-5 border border-[#E5E2DA] rounded-lg bg-white p-4 shadow-card space-y-5">
            {/* Constitutional Section */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-[#14243D] uppercase tracking-wider">
                Constitutional Provisions
              </h3>
              <div className="space-y-1.5">
                {constitutionalProvisions.length === 0 && <p className="text-[11px] text-[#737986]">None identified.</p>}
                {constitutionalProvisions.map((item, idx) => {
                  const isSelected = selectedProvisionIndex === idx;
                  return (
                    <div
                      key={`${item.name}-${idx}`}
                      onClick={() => setSelectedProvisionIndex(idx)}
                      className={`p-3 rounded-md cursor-pointer transition-all flex items-center justify-between border ${
                        isSelected
                          ? 'bg-[#EEF4FD] border-[#4269A8]/60 text-[#14243D]'
                          : 'bg-white border-[#E5E2DA] text-[#3F4754] hover:bg-[#FAF9F5]'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold text-[#14243D]">{item.name}</div>
                        <div className="text-[11px] text-[#737986] mt-0.5">{item.type}</div>
                      </div>
                      {isSelected && <ChevronRight className="w-4 h-4 text-[#4269A8]" />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Statutory Section */}
            <div className="space-y-2 pt-2 border-t border-[#E5E2DA]">
              <h3 className="text-xs font-semibold text-[#14243D] uppercase tracking-wider">
                Statutory Provisions
              </h3>
              <div className="space-y-1.5">
                {statutoryProvisions.length === 0 && <p className="text-[11px] text-[#737986]">None identified.</p>}
                {statutoryProvisions.map((stat, i) => {
                  const idx = constitutionalProvisions.length + i;
                  return (
                    <div
                      key={`${stat.name}-${idx}`}
                      onClick={() => setSelectedProvisionIndex(idx)}
                      className={`p-3 rounded-md border cursor-pointer transition-all ${
                        selectedProvisionIndex === idx
                          ? 'bg-[#EEF4FD] border-[#4269A8]/60 text-[#14243D]'
                          : 'bg-white border-[#E5E2DA] text-[#3F4754] hover:bg-[#FAF9F5]'
                      }`}
                    >
                      <div className="text-xs font-medium text-[#14243D]">{stat.name}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT: Detailed Provision Interpretation & Passages (~62% width) */}
          <div className="lg:col-span-7 border border-[#E5E2DA] rounded-lg bg-white p-6 shadow-card space-y-6">
            {activeProvision ? (
              <>
                <div>
                  <h2 className="font-serif font-bold text-2xl text-[#14243D]">{activeProvision.name}</h2>
                  <span className="text-[11px] text-[#737986]">{activeProvision.type}</span>
                </div>

                {activeProvision.evidence && (
                  <div className="p-4 rounded-md bg-[#FAF9F5] border border-[#E5E2DA] space-y-1">
                    <h3 className="font-serif font-bold text-xs uppercase tracking-wider text-[#14243D]">In simple words</h3>
                    <p className="text-xs sm:text-sm text-[#14243D] leading-relaxed">{activeProvision.evidence}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <h3 className="font-serif font-bold text-xs uppercase tracking-wider text-[#14243D]">
                    How it was interpreted in this case
                  </h3>
                  <p className="text-xs sm:text-sm text-[#3F4754] leading-relaxed">{activeProvision.context}</p>
                </div>

              </>
            ) : (
              <p className="text-xs text-[#737986]">No legal provisions were identified for this document.</p>
            )}

            {/* Action: View in Document */}
            <div className="pt-2">
              <button
                onClick={() => setActiveTab('document')}
                className="text-xs font-semibold text-[#14243D] hover:underline inline-flex items-center space-x-1"
              >
                <span>View in Document</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: COURT REASONING */}
      {activeTab === 'analysis' && !report && (
        <div className="border border-[#E5E2DA] rounded-lg bg-white p-6 shadow-card space-y-4">
          <h2 className="font-serif font-bold text-base text-[#14243D]">Court Reasoning & Ratio Decidendi</h2>
          <div className="space-y-3">
            {analysis?.summary?.reasoning.map((r, i) => (
              <div key={i} className="flex items-start space-x-3 text-xs sm:text-sm text-[#3F4754] leading-relaxed">
                <span className="font-serif font-bold text-[#A98A4B] text-xs mt-0.5">§{i + 1}</span>
                <span>{r}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 7: OUTCOME */}
      {activeTab === 'analysis' && !report && (
        <div className="border border-[#E5E2DA] rounded-lg bg-white p-6 shadow-card space-y-4">
          <div className="flex items-center space-x-2">
            <span className="text-xs uppercase font-bold tracking-wider text-[#737986]">Final Decision:</span>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase bg-[#EBF7F1] text-[#23845D]">
              {analysis?.summary?.outcomeCategory}
            </span>
          </div>
          <div className="p-4 rounded-md bg-[#FAF9F5] border border-[#E5E2DA] font-serif text-xs sm:text-sm text-[#14243D] leading-relaxed whitespace-pre-line">
            {analysis?.summary?.outcome}
          </div>
        </div>
      )}

    </div>
  );
};
