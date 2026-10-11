import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  FileText,
  Download,
  ExternalLink,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  Calendar,
  Landmark,
  Scale
} from 'lucide-react';
import { api } from '../services/api';
import { DocumentRecord } from '../types';

export const ReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await api.listDocuments({ status: 'analyzed' });
      setDocuments(res.documents || []);
    } catch (err: any) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const filteredReports = documents.filter((doc) => {
    const title = (doc.analysis?.documentMetadata?.title || doc.originalName).toLowerCase();
    const caseNum = (doc.caseNumber || doc.analysis?.documentMetadata?.caseNumber || '').toLowerCase();
    const court = (doc.court || doc.analysis?.documentMetadata?.court || '').toLowerCase();
    const query = searchQuery.toLowerCase().trim();

    const matchesSearch = !query || title.includes(query) || caseNum.includes(query) || court.includes(query);
    const matchesType =
      typeFilter === 'all' ||
      doc.analysis?.caseClassification?.primary?.toLowerCase() === typeFilter.toLowerCase();

    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E5E2DA]">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#14243D] tracking-tight">
            Reports
          </h1>
          <p className="text-xs sm:text-sm text-[#737986] mt-0.5">
            Generated legal analysis reports, operative orders, and statutory breakdowns.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={fetchReports}
            title="Refresh reports"
            className="p-2 rounded-md border border-[#E5E2DA] bg-white hover:bg-[#F3F1EB] text-[#737986] hover:text-[#14243D] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link
            to="/upload"
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-md bg-[#14243D] hover:bg-[#0D182A] text-white text-xs font-medium shadow-subtle shrink-0 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Upload Document</span>
          </Link>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#737986]" />
          <input
            type="text"
            placeholder="Filter reports by judgment title, case number, or court..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border border-[#E5E2DA] bg-white text-[#17243A] placeholder-[#737986] focus:outline-none focus:border-[#14243D] transition-colors"
          />
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter reports by case category"
            className="px-2.5 py-1.5 text-xs rounded-md border border-[#E5E2DA] bg-white text-[#3F4754] focus:outline-none focus:border-[#14243D]"
          >
            <option value="all">All Categories</option>
            <option value="Constitutional">Constitutional</option>
            <option value="Civil">Civil</option>
            <option value="Criminal">Criminal</option>
            <option value="Commercial">Commercial</option>
            <option value="Tax">Tax</option>
          </select>
        </div>
      </div>

      {/* Reports Table or Empty State */}
      {loading ? (
        <div className="py-20 text-center text-xs text-[#737986] border border-[#E5E2DA] rounded-lg bg-white shadow-card">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#A98A4B] mb-2" />
          <span>Loading analysis reports...</span>
        </div>
      ) : filteredReports.length > 0 ? (
        <div className="border border-[#E5E2DA] rounded-lg bg-white shadow-card overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#E5E2DA] bg-[#FAF9F5] text-[11px] font-semibold text-[#737986]">
                <th className="py-3 px-4 font-semibold">Report Title</th>
                <th className="py-3 px-4 font-semibold">Court / Case Details</th>
                <th className="py-3 px-4 font-semibold">Classification</th>
                <th className="py-3 px-4 font-semibold">Generated Date</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E2DA]">
              {filteredReports.map((doc) => {
                const title = doc.analysis?.documentMetadata?.title || doc.originalName;
                const caseNum = doc.caseNumber || doc.analysis?.documentMetadata?.caseNumber || 'N/A';
                const court = doc.court || doc.analysis?.documentMetadata?.court || 'Supreme Court of India';
                const classification = doc.analysis?.caseClassification?.primary || 'General';
                const outcomeCategory = doc.analysis?.summary?.outcomeCategory;
                const dateStr = doc.analysis?.aiAnalysisInfo?.analyzedAt || doc.createdAt;

                return (
                  <tr
                    key={doc.id}
                    className="hover:bg-[#FBFBF9] cursor-pointer transition-colors"
                    onClick={() => navigate(`/analysis/${doc.id}`)}
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-7 h-8 rounded-xs bg-[#FDEDED] border border-[#F5C2C2] flex items-center justify-center shrink-0 text-[#C44B4B] font-bold text-[9px] uppercase tracking-tighter">
                          PDF
                        </div>
                        <div>
                          <div className="font-semibold text-[#14243D] line-clamp-1 max-w-xs sm:max-w-md">
                            {title}
                          </div>
                          <div className="text-[11px] text-[#737986] mt-0.5 line-clamp-1">
                            Source document: {doc.originalName}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="text-[#3F4754] font-medium">{caseNum}</div>
                      <div className="text-[11px] text-[#737986]">{court}</div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-[#FAF4E8] text-[#8F733C] border border-[#EBE3D0]">
                        <Scale className="w-3 h-3 text-[#A98A4B]" />
                        <span>{classification}</span>
                      </div>
                      {outcomeCategory && (
                        <div className="text-[10px] text-[#737986] mt-1">
                          Finding: <span className="font-medium text-[#14243D]">{outcomeCategory}</span>
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-[#737986] whitespace-nowrap">
                      <div className="flex items-center space-x-1.5">
                        <Calendar className="w-3.5 h-3.5 text-[#737986]" />
                        <span>
                          {new Date(dateStr).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#EBF7F1] text-[#23845D]">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Report Ready</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center space-x-1.5">
                        <button
                          onClick={() => navigate(`/analysis/${doc.id}`)}
                          className="px-2.5 py-1 rounded border border-[#E5E2DA] bg-white hover:bg-[#F3F1EB] text-xs font-medium text-[#14243D] transition-colors flex items-center space-x-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>View</span>
                        </button>

                        <a
                          href={api.getAnalysisExportUrl(doc.id, 'markdown')}
                          download
                          title="Download Markdown Report"
                          className="p-1 rounded border border-[#E5E2DA] bg-white hover:bg-[#F3F1EB] text-[#737986] hover:text-[#14243D] transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border border-[#E5E2DA] rounded-lg bg-white p-12 text-center space-y-3 shadow-card">
          <div className="w-12 h-12 rounded-full bg-[#FAF4E8] flex items-center justify-center text-[#A98A4B] mx-auto">
            <FileText className="w-6 h-6" />
          </div>
          <h2 className="font-serif text-lg font-bold text-[#14243D]">
            {searchQuery || typeFilter !== 'all' ? 'No Matching Reports' : 'No Analysis Reports Yet'}
          </h2>
          <p className="text-xs text-[#737986] max-w-md mx-auto leading-relaxed">
            {searchQuery || typeFilter !== 'all'
              ? 'Try modifying your search query or category filter.'
              : 'When you upload an Indian court judgment and run the legal review pipeline, the generated analysis reports with legal provisions, operative orders, and arguments will be cataloged here.'}
          </p>
          {!searchQuery && typeFilter === 'all' && (
            <div className="pt-2">
              <Link
                to="/upload"
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-md bg-[#14243D] hover:bg-[#0D182A] text-white text-xs font-medium transition-colors shadow-subtle"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Upload a Document to Generate Report</span>
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
