import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Send, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import { DetailedReport, QuestionAnswerResponse, SourcedPoint, SourceStatus } from '../types';

const STATUS_STYLES: Record<SourceStatus, { label: string; className: string }> = {
  court_finding: { label: 'Court finding', className: 'bg-[#EBF7F1] text-[#23845D]' },
  party_allegation: { label: 'Party claim', className: 'bg-[#FDF6E7] text-[#9A6B12]' },
  undisputed_fact: { label: 'Undisputed', className: 'bg-[#EEF4FD] text-[#315FEA]' },
  procedural: { label: 'Procedural', className: 'bg-[#F3F1EB] text-[#616875]' },
  uncertain: { label: 'Uncertain', className: 'bg-[#FBEBEB] text-[#C44B4B]' },
};

export const PageRef: React.FC<{ pages: number[]; type: 'pdf' | 'segment' }> = ({ pages, type }) =>
  pages.length ? (
    <span className="ml-1.5 text-[11px] font-mono text-[#4269A8] whitespace-nowrap">
      ({type === 'pdf' ? 'p.' : 'seg.'} {pages.join(', ')})
    </span>
  ) : null;

const Point: React.FC<{ point: SourcedPoint; type: 'pdf' | 'segment' }> = ({ point, type }) => {
  const status = point.status ? STATUS_STYLES[point.status] : null;
  return (
    <li className="flex items-start space-x-2 text-xs sm:text-sm text-[#3F4754] leading-relaxed">
      <span className="text-[#A98A4B] font-bold mt-0.5">•</span>
      <div className="space-y-1">
        <div>
          {status && (
            <span className={`inline-block mr-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${status.className}`}>
              {status.label}
            </span>
          )}
          <span>{point.text}</span>
          <PageRef pages={point.pages} type={type} />
          {point.verification === 'unverified' && (
            <span
              title="The supporting quote could not be found in the extracted text. Check the original judgment."
              className="inline-flex items-center ml-1.5 text-[10px] font-semibold text-[#C44B4B]"
            >
              <AlertTriangle className="w-3 h-3 mr-0.5" /> not verified
            </span>
          )}
        </div>
        {point.quote && point.verification !== 'unverified' && (
          <blockquote className="font-serif italic text-[11px] text-[#737986] border-l-2 border-[#E5E2DA] pl-2">"{point.quote}"</blockquote>
        )}
      </div>
    </li>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-2.5 pt-5 border-t border-[#E5E2DA] first:border-t-0 first:pt-0">
    <h3 className="font-serif font-bold text-sm sm:text-base text-[#14243D]">{title}</h3>
    {children}
  </section>
);

const PointList: React.FC<{ items: SourcedPoint[]; type: 'pdf' | 'segment'; empty?: string }> = ({ items, type, empty }) =>
  items.length ? (
    <ul className="space-y-2">
      {items.map((p, i) => (
        <Point key={i} point={p} type={type} />
      ))}
    </ul>
  ) : (
    <p className="text-xs text-[#737986] italic">{empty || 'Not stated in the judgment.'}</p>
  );

export const DetailedReportView: React.FC<{ report: DetailedReport; hideOverview?: boolean }> = ({ report, hideOverview }) => {
  const type = report.coverage.pageReferenceType;
  // The Summary tab already shows the overview, so Analysis can start from the background facts.
  const n = (section: number) => (hideOverview ? section - 1 : section);
  const v = report.finalOutcome.verification;
  const verificationStyle =
    v.status === 'verified'
      ? 'bg-[#EBF7F1] text-[#23845D]'
      : v.status === 'partially_verified'
      ? 'bg-[#FDF6E7] text-[#9A6B12]'
      : 'bg-[#FBEBEB] text-[#C44B4B]';

  return (
    <div className="border border-[#E5E2DA] rounded-lg bg-white p-6 shadow-card space-y-5">
      <div className="p-3 rounded-md bg-[#FDF6E7] border border-[#F0E2C2] text-[11px] text-[#7A5A12] leading-relaxed">
        <span className="font-semibold">Informational only, not legal advice.</span> {report.disclaimer}
      </div>

      {!hideOverview && (
      <Section title="1. Case overview">
        <div className="space-y-2 text-xs sm:text-sm text-[#3F4754] leading-relaxed">
          {report.overview.split(/\n\s*\n/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
          <div>
            <span className="text-[11px] text-[#737986] block">Court</span>
            <span className="font-medium text-[#14243D]">{report.caseDetails.court || 'Not stated'}</span>
          </div>
          <div>
            <span className="text-[11px] text-[#737986] block">Date of judgment</span>
            <span className="font-medium text-[#14243D]">{report.caseDetails.date || 'Not stated'}</span>
          </div>
          <div>
            <span className="text-[11px] text-[#737986] block">Case number</span>
            <span className="font-medium text-[#14243D]">{report.caseDetails.caseNumber || 'Not stated'}</span>
          </div>
          <div>
            <span className="text-[11px] text-[#737986] block">Bench</span>
            <span className="font-medium text-[#14243D]">{report.caseDetails.bench.join(', ') || 'Not stated'}</span>
          </div>
          <div className="sm:col-span-2">
            <span className="text-[11px] text-[#737986] block">Parties</span>
            {report.caseDetails.parties.length ? (
              <ul className="space-y-0.5">
                {report.caseDetails.parties.map((p, i) => (
                  <li key={i} className="text-[#14243D]">
                    <span className="font-medium">{p.name}</span> <span className="text-[#737986]">— {p.role}</span>
                    <PageRef pages={p.pages} type={type} />
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-[#737986]">Not stated</span>
            )}
          </div>
        </div>
      </Section>

      )}

      <Section title={`${n(2)}. Background facts`}>
        <PointList items={report.background} type={type} />
      </Section>

      <Section title={`${n(3)}. Timeline`}>
        {report.timeline.length ? (
          <ol className="space-y-2 border-l border-[#E5E2DA] pl-4">
            {report.timeline.map((t, i) => (
              <li key={i} className="text-xs sm:text-sm text-[#3F4754] leading-relaxed">
                <span className="font-semibold text-[#14243D]">{t.date}</span> — {t.event}
                <PageRef pages={t.pages} type={type} />
                {t.verification === 'unverified' && <span className="ml-1.5 text-[10px] font-semibold text-[#C44B4B]">not verified</span>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-[#737986] italic">No dated events identified.</p>
        )}
      </Section>

      <Section title={`${n(4)}. Arguments made by each party`}>
        <p className="text-[11px] text-[#737986]">These are what the parties claimed or argued. They are not findings of the court unless marked "Court finding".</p>
        {report.argumentsByParty.length ? (
          report.argumentsByParty.map((a, i) => (
            <div key={i} className="space-y-1.5">
              <h4 className="text-xs font-semibold text-[#14243D] uppercase tracking-wider">{a.party}</h4>
              <PointList items={a.points} type={type} />
            </div>
          ))
        ) : (
          <p className="text-xs text-[#737986] italic">Not stated in the judgment.</p>
        )}
      </Section>

      <Section title={`${n(5)}. Legal issues the court considered`}>
        <PointList items={report.legalIssues} type={type} />
      </Section>

      <Section title={`${n(6)}. Laws and provisions, explained simply`}>
        {report.provisions.length ? (
          <ul className="space-y-3">
            {report.provisions.map((p, i) => (
              <li key={i} className="text-xs sm:text-sm text-[#3F4754] leading-relaxed">
                <div className="font-semibold text-[#14243D]">
                  {p.name}
                  <PageRef pages={p.pages} type={type} />
                </div>
                <div>{p.plainExplanation}</div>
                {p.howUsed && <div className="text-[#616875]"><span className="font-medium">How it was used:</span> {p.howUsed}</div>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[#737986] italic">No provisions identified.</p>
        )}
        {report.precedents.length > 0 && (
          <div className="pt-2 space-y-1.5">
            <h4 className="text-xs font-semibold text-[#14243D] uppercase tracking-wider">Precedents cited</h4>
            <ul className="space-y-1.5">
              {report.precedents.map((p, i) => (
                <li key={i} className="text-xs sm:text-sm text-[#3F4754]">
                  <span className="font-semibold text-[#14243D]">{p.name}</span> — {p.howUsed}
                  <PageRef pages={p.pages} type={type} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title={`${n(7)}. Court's reasoning and findings`}>
        <PointList items={report.reasoning} type={type} />
      </Section>

      <Section title={`${n(8)}. Final judgment, outcome and directions`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase bg-[#EBF7F1] text-[#23845D]">
            {report.finalOutcome.outcomeCategory}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${verificationStyle}`}>
            {v.status === 'verified' ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
            Order {v.status.replace('_', ' ')} against {type === 'pdf' ? 'pages' : 'segments'} {v.checkedPages.join(', ') || 'n/a'}
          </span>
        </div>
        <p className="text-xs sm:text-sm text-[#14243D] font-serif leading-relaxed">{report.finalOutcome.summary}</p>
        <PointList items={report.finalOutcome.directions} type={type} empty="No specific directions identified." />
        {v.notes.length > 0 && (
          <ul className="text-[11px] text-[#737986] space-y-0.5 list-disc pl-4">
            {v.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`${n(9)}. Practical meaning`}>
        <PointList items={report.practicalMeaning} type={type} />
      </Section>

      <Section title={`${n(10)}. Limitations of this judgment and this report`}>
        <ul className="text-xs sm:text-sm text-[#3F4754] space-y-1 list-disc pl-4">
          {report.limitations.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </Section>

      {report.uncertainClaims.length > 0 && (
        <Section title="Flagged: uncertain or unsupported claims">
          <ul className="text-xs text-[#3F4754] space-y-1.5">
            {report.uncertainClaims.map((u, i) => (
              <li key={i} className="flex items-start space-x-2">
                <AlertTriangle className="w-3.5 h-3.5 text-[#C44B4B] shrink-0 mt-0.5" />
                <span>
                  {u.claim} <span className="text-[#737986]">— {u.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <p className="text-[11px] text-[#737986] pt-3 border-t border-[#E5E2DA]">
        Coverage: {report.coverage.pagesWithText} of {report.coverage.totalPages} {type === 'pdf' ? 'pages' : 'segments'} contained text and were analysed in {report.coverage.chunks} part(s).
        {report.coverage.emptyPages.length > 0 && ` Pages without extractable text: ${report.coverage.emptyPages.join(', ')}.`}
        {type === 'segment' && ' This file has no printed page numbers, so "seg." refers to ~400-word segments of the text.'}
      </p>
    </div>
  );
};

const STARTER_QUESTIONS = [
  'What is this case about?',
  'What did the court finally order?',
  'What were the main arguments of each party?',
  'Which laws or sections were discussed?',
];

interface Turn {
  question: string;
  response: QuestionAnswerResponse;
}

export const AskJudgmentPanel: React.FC<{ documentId: string }> = ({ documentId }) => {
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e?: React.FormEvent, preset?: string) => {
    e?.preventDefault();
    const q = (preset ?? question).trim();
    if (!q || asking) return;
    setAsking(true);
    setError(null);
    try {
      const history = turns
        .filter((t) => t.response.answer && t.response.retrievalMode !== 'none')
        .map((t) => ({ question: t.question, answer: t.response.answer as string }));
      const response = await api.askQuestion(documentId, q, history);
      setTurns((prev) => [...prev, { question: q, response }]);
      setQuestion('');
    } catch (err: any) {
      setError(err.message || 'Could not answer the question.');
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="border border-[#E5E2DA] rounded-lg bg-white p-6 shadow-card space-y-4">
      <div className="space-y-1">
        <h2 className="font-serif font-bold text-base text-[#14243D]">Ask about this judgment</h2>
        <p className="text-[11px] text-[#737986]">
          Your question is matched by meaning and keywords against the passages of this judgment, and the answer is written only from those passages, with page references. Informational only, not legal advice.
        </p>
      </div>

      <div className="space-y-4">
        {turns.map((t, i) => {
          const unit = t.response.pageReferenceType === 'pdf' ? 'p.' : 'seg.';
          const sourcePages = (s: { page: number; pages?: number[] }) => (s.pages?.length ? s.pages : [s.page]).join(', ');
          return (
            <div key={i} className="space-y-2">
              <div className="text-xs font-semibold text-[#14243D]">Q: {t.question}</div>
              {t.response.answer ? (
                <div className="p-3 rounded-md bg-[#FAF9F5] border border-[#E5E2DA] text-xs sm:text-sm text-[#3F4754] leading-relaxed whitespace-pre-wrap">
                  {t.response.answer}
                </div>
              ) : (
                <div className="p-3 rounded-md bg-[#FDF6E7] border border-[#F0E2C2] text-xs text-[#7A5A12]">{t.response.message}</div>
              )}
              {(t.response.suggestions?.length || 0) > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {t.response.suggestions!.map((sq) => (
                    <button
                      key={sq}
                      type="button"
                      disabled={asking}
                      onClick={() => submit(undefined, sq)}
                      className="px-2.5 py-1 rounded-full border border-[#E5E2DA] bg-white hover:bg-[#F3F1EB] text-[11px] text-[#14243D] disabled:opacity-50"
                    >
                      {sq}
                    </button>
                  ))}
                </div>
              )}
              {t.response.sources.length > 0 && (
                <details className="text-[11px] text-[#737986]">
                  <summary className="cursor-pointer select-none">
                    Source passages ({Array.from(new Set(t.response.sources.flatMap((s) => s.pages?.length ? s.pages : [s.page])))
                      .sort((a, b) => a - b)
                      .map((p) => `${unit} ${p}`)
                      .join(', ')})
                    {' · '}
                    {t.response.retrievalMode === 'hybrid' ? 'found by meaning + keyword search' : 'found by keyword search'}
                  </summary>
                  <div className="space-y-2 pt-2">
                    {t.response.sources.map((s, j) => (
                      <div key={j} className="p-2 rounded border border-[#E5E2DA] bg-white">
                        <span className="font-semibold text-[#14243D]">
                          {unit} {sourcePages(s)}
                        </span>
                        <p className="font-serif whitespace-pre-wrap mt-1">{s.excerpt}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>

      {turns.length === 0 && (
        <div className="space-y-1.5">
          <span className="text-[11px] text-[#737986]">Try asking:</span>
          <div className="flex flex-wrap gap-1.5">
            {STARTER_QUESTIONS.map((sq) => (
              <button
                key={sq}
                type="button"
                disabled={asking}
                onClick={() => submit(undefined, sq)}
                className="px-2.5 py-1 rounded-full border border-[#E5E2DA] bg-white hover:bg-[#F3F1EB] text-[11px] text-[#14243D] disabled:opacity-50"
              >
                {sq}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-[#C44B4B]">{error}</p>}

      <form onSubmit={submit} className="flex items-end space-x-2">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) submit(e);
          }}
          rows={2}
          maxLength={2000}
          placeholder="e.g. What exactly did the court order? Which sections were discussed?"
          className="flex-1 resize-none rounded-md border border-[#E5E2DA] bg-white px-3 py-2 text-xs sm:text-sm text-[#14243D] focus:outline-none focus:ring-1 focus:ring-[#4269A8]"
        />
        <button
          type="submit"
          disabled={asking || !question.trim()}
          className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-md bg-[#14243D] hover:bg-[#0D182A] disabled:opacity-50 text-white text-xs font-medium"
        >
          {asking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          <span>{asking ? 'Searching…' : 'Ask'}</span>
        </button>
      </form>
      {asking && turns.length === 0 && (
        <p className="text-[11px] text-[#737986]">
          The first question prepares this judgment for search (one time only). For long judgments this can take a little longer.
        </p>
      )}
    </div>
  );
};
