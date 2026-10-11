import React, { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
  Search,
  X,
  Trash2,
  ExternalLink,
  Download,
  Plus,
  RefreshCw,
  MoreVertical,
  FileText
} from 'lucide-react';
import { api } from '../services/api';
import { DocumentRecord } from '../types';

export const DocumentLibrary: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = searchParams.get('search') || '';

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(urlSearch);
  const [caseTypeFilter, setCaseTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Sync state whenever URL search param changes
  useEffect(() => {
    setSearchQuery(urlSearch);
  }, [urlSearch]);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const res = await api.listDocuments({
        search: urlSearch || undefined,
        caseType: caseTypeFilter !== 'all' ? caseTypeFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
      setDocuments(res.documents || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, [caseTypeFilter, statusFilter, urlSearch]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newParams = new URLSearchParams(searchParams);
    if (searchQuery.trim()) {
      newParams.set('search', searchQuery.trim());
    } else {
      newParams.delete('search');
    }
    setSearchParams(newParams);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('search');
    setSearchParams(newParams);
  };

  const handleDelete = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Delete '${name}' from archives?`)) return;

    setDeletingId(id);
    try {
      await api.deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E5E2DA]">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#14243D] tracking-tight">
            My Documents
          </h1>
          <p className="text-xs sm:text-sm text-[#737986] mt-0.5">
            Indexed court judgments, orders, and review analyses.
          </p>
        </div>

        <Link
          to="/upload"
          className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-md bg-[#14243D] hover:bg-[#0D182A] text-white text-xs font-medium shadow-subtle shrink-0 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Upload Document</span>
        </Link>
      </div>

      {/* Search and Filters Bar */}
      <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#737986]" />
          <input
            type="text"
            placeholder="Search by title, court, or case number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-xs rounded-md border border-[#E5E2DA] bg-white text-[#17243A] placeholder-[#737986] focus:outline-none focus:border-[#14243D] transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-2.5 top-2.5 text-[#737986] hover:text-[#14243D]"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <select
          value={caseTypeFilter}
          onChange={(e) => setCaseTypeFilter(e.target.value)}
          className="py-1.5 px-3 text-xs rounded-md border border-[#E5E2DA] bg-white text-[#3F4754] focus:outline-none focus:border-[#14243D]"
        >
          <option value="all">All Case Types</option>
          <option value="Constitutional Law">Constitutional Law</option>
          <option value="Writ Petition">Writ Petition</option>
          <option value="Criminal">Criminal</option>
          <option value="Civil">Civil</option>
          <option value="Commercial">Commercial</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="py-1.5 px-3 text-xs rounded-md border border-[#E5E2DA] bg-white text-[#3F4754] focus:outline-none focus:border-[#14243D]"
        >
          <option value="all">All Statuses</option>
          <option value="analyzed">Completed</option>
          <option value="extracted">Processing</option>
          <option value="error">Failed</option>
        </select>

        <button
          type="submit"
          className="px-3.5 py-1.5 rounded-md border border-[#E5E2DA] bg-white hover:bg-[#F3F1EB] text-xs font-medium text-[#14243D]"
        >
          Search
        </button>
      </form>

      {/* Documents Table */}
      <div className="border border-[#E5E2DA] rounded-lg bg-white shadow-card overflow-x-auto">
        {loading ? (
          <div className="py-16 text-center space-y-2">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#14243D]" />
            <p className="text-xs text-[#737986]">Loading documents...</p>
          </div>
        ) : documents.length > 0 ? (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#E5E2DA] bg-[#FAF9F5] text-[11px] font-semibold text-[#737986]">
                <th className="py-3 px-4 font-semibold">Title</th>
                <th className="py-3 px-4 font-semibold">Category</th>
                <th className="py-3 px-4 font-semibold">Court</th>
                <th className="py-3 px-4 font-semibold">Upload Date</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E2DA]">
              {documents.map((doc) => (
                <tr
                  key={doc.id}
                  onClick={() => navigate(`/analysis/${doc.id}`)}
                  className="hover:bg-[#FBFBF9] cursor-pointer transition-colors"
                >
                  <td className="py-3.5 px-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-7 h-8 rounded-sm bg-[#FDEDED] border border-[#F5C2C2] flex items-center justify-center shrink-0 text-[#C44B4B] font-bold text-[9px]">
                        PDF
                      </div>
                      <div>
                        <div className="font-semibold text-[#14243D] line-clamp-1 max-w-sm">
                          {doc.originalName}
                        </div>
                        <div className="text-[11px] text-[#737986]">
                          {(doc.fileSize / 1024).toFixed(1)} KB • {doc.pageCount || 1} pages
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="py-3.5 px-4 text-[#616875] whitespace-nowrap">
                    {doc.caseType || 'General'}
                  </td>

                  <td className="py-3.5 px-4 text-[#616875] max-w-[160px] truncate">
                    {doc.court || 'Supreme Court of India'}
                  </td>

                  <td className="py-3.5 px-4 text-[#737986] whitespace-nowrap">
                    {new Date(doc.createdAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric'
                    })}
                  </td>

                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {doc.status === 'analyzed' ? (
                      <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#EBF7F1] text-[#23845D]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#23845D]"></span>
                        <span>Completed</span>
                      </div>
                    ) : doc.status === 'error' ? (
                      <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#FDF0F0] text-[#C44B4B]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#C44B4B]"></span>
                        <span>Failed</span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#EEF4FD] text-[#4269A8]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#4269A8]"></span>
                        <span>Processing</span>
                      </div>
                    )}
                  </td>

                  <td className="py-3.5 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center space-x-1.5">
                      <button
                        onClick={() => navigate(`/analysis/${doc.id}`)}
                        className="px-2.5 py-1 rounded border border-[#E5E2DA] bg-white hover:bg-[#F3F1EB] text-xs font-medium text-[#14243D] transition-colors"
                      >
                        View
                      </button>

                      <a
                        href={api.getOriginalDownloadUrl(doc.id)}
                        download
                        title="Download file"
                        className="p-1 rounded text-[#737986] hover:text-[#14243D]"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>

                      <button
                        onClick={(e) => handleDelete(doc.id, doc.originalName, e)}
                        disabled={deletingId === doc.id}
                        title="Delete"
                        className="p-1 rounded text-[#737986] hover:text-[#C44B4B]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-16 text-center space-y-3">
            <FileText className="w-10 h-10 text-[#A98A4B] mx-auto opacity-70" />
            <h3 className="font-serif font-bold text-sm text-[#14243D]">No documents found</h3>
            <p className="text-xs text-[#737986] max-w-sm mx-auto">
              No files match your search criteria.
            </p>
            <Link
              to="/upload"
              className="inline-block mt-2 px-4 py-2 rounded-md bg-[#14243D] text-white text-xs font-medium"
            >
              Upload Document
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};
