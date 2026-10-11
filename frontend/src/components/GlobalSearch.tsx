import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Loader2, FileText, ArrowRight, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { api } from '../services/api';
import { DocumentRecord } from '../types';

export const GlobalSearch: React.FC = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchSeqRef = useRef<number>(0);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      setError(null);
      setIsOpen(false);
      return;
    }

    const currentSeq = ++searchSeqRef.current;
    setLoading(true);
    setError(null);
    setIsOpen(true);

    const timer = setTimeout(async () => {
      try {
        const res = await api.listDocuments({ search: trimmed });
        // Prevent stale responses from overwriting newer ones
        if (currentSeq === searchSeqRef.current) {
          setResults(res.documents || []);
          setLoading(false);
        }
      } catch (err: any) {
        if (currentSeq === searchSeqRef.current) {
          setError(err.message || 'Error searching documents');
          setLoading(false);
        }
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setIsOpen(false);
      navigate(`/library?search=${encodeURIComponent(query.trim())}`);
    }
  };

  const handleSelectDoc = (docId: string) => {
    setIsOpen(false);
    navigate(`/analysis/${docId}`);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    setError(null);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <form onSubmit={handleSubmit} className="relative w-full">
        <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#737986] pointer-events-none" />
        <input
          type="text"
          placeholder="Search documents by title, case number, or court..."
          value={query}
          onFocus={() => {
            if (query.trim()) setIsOpen(true);
          }}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-9 pr-8 py-1.5 text-xs rounded-md border border-[#E5E2DA] bg-[#FFFFFF] text-[#17243A] placeholder-[#737986] focus:outline-none focus:border-[#14243D] transition-colors"
        />
        <div className="absolute right-2.5 top-2.5 flex items-center">
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 text-[#737986] animate-spin" />
          ) : query ? (
            <button
              type="button"
              onClick={handleClear}
              className="text-[#737986] hover:text-[#14243D] transition-colors focus:outline-none"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      </form>

      {/* SEARCH RESULTS DROPDOWN */}
      {isOpen && query.trim().length > 0 && (
        <div className="absolute left-0 right-0 mt-1.5 bg-white border border-[#E5E2DA] rounded-lg shadow-lg z-50 overflow-hidden max-h-[380px] flex flex-col animate-fadeIn">
          {loading && results.length === 0 ? (
            <div className="py-6 px-4 text-center text-xs text-[#737986] flex items-center justify-center space-x-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#A98A4B]" />
              <span>Searching documents...</span>
            </div>
          ) : error ? (
            <div className="py-4 px-4 text-center text-xs text-[#C44B4B] bg-[#FDF0F0]">
              {error}
            </div>
          ) : results.length === 0 ? (
            <div className="py-6 px-4 text-center text-xs text-[#737986]">
              <p className="font-medium text-[#14243D]">No documents found</p>
              <p className="text-[11px] text-[#737986] mt-0.5">
                No indexed judgments matched &ldquo;{query}&rdquo;
              </p>
            </div>
          ) : (
            <>
              <div className="px-3 py-2 bg-[#FAF9F5] border-b border-[#E5E2DA] text-[11px] font-semibold text-[#737986] flex items-center justify-between">
                <span>Matching Documents ({results.length})</span>
                <span className="text-[10px] font-normal text-[#737986]">Press Enter to view all</span>
              </div>
              <div className="overflow-y-auto divide-y divide-[#E5E2DA]/60">
                {results.slice(0, 6).map((doc) => {
                  const title = doc.analysis?.documentMetadata?.title || doc.originalName;
                  const caseNum = doc.caseNumber || doc.analysis?.documentMetadata?.caseNumber;
                  const court = doc.court || doc.analysis?.documentMetadata?.court;

                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => handleSelectDoc(doc.id)}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-[#F7F6F2] transition-colors flex items-start space-x-3 group"
                    >
                      <div className="w-6 h-7 rounded-xs bg-[#FDEDED] border border-[#F5C2C2] flex items-center justify-center shrink-0 text-[#C44B4B] font-bold text-[8px] uppercase mt-0.5">
                        PDF
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-[#14243D] group-hover:text-[#A98A4B] transition-colors truncate">
                          {title}
                        </div>
                        <div className="flex items-center space-x-2 text-[10px] text-[#737986] mt-0.5 truncate">
                          {caseNum && <span>{caseNum}</span>}
                          {caseNum && court && <span>•</span>}
                          {court && <span>{court}</span>}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center space-x-1.5 self-center">
                        {doc.status === 'analyzed' ? (
                          <span className="inline-flex items-center text-[10px] text-[#23845D]">
                            <CheckCircle2 className="w-3 h-3 mr-0.5" /> Ready
                          </span>
                        ) : doc.status === 'error' ? (
                          <span className="inline-flex items-center text-[10px] text-[#C44B4B]">
                            <XCircle className="w-3 h-3 mr-0.5" /> Error
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[10px] text-[#4269A8]">
                            <Clock className="w-3 h-3 mr-0.5" /> In progress
                          </span>
                        )}
                        <ArrowRight className="w-3 h-3 text-[#737986] opacity-0 group-hover:opacity-100 transition-opacity ml-1" />
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="p-2 bg-[#FAF9F5] border-t border-[#E5E2DA] text-center">
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="w-full py-1.5 text-xs font-medium text-[#14243D] hover:underline flex items-center justify-center space-x-1"
                >
                  <span>View all results in Library</span>
                  <ArrowRight className="w-3 h-3 text-[#A98A4B]" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
