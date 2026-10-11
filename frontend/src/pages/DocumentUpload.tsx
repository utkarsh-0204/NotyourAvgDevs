import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload,
  FileText,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  X,
  FileCheck,
  AlertTriangle,
  Scale
} from 'lucide-react';
import { api } from '../services/api';
import { DocumentRecord, SampleDocumentItem } from '../types';

export const DocumentUpload: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadedDoc, setUploadedDoc] = useState<DocumentRecord | null>(null);
  const [samples, setSamples] = useState<SampleDocumentItem[]>([]);
  const [loadingSampleId, setLoadingSampleId] = useState<string | null>(null);

  useEffect(() => {
    api.getSampleDocuments()
      .then((res) => setSamples(res.samples))
      .catch((err) => console.warn(err));
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const validateFile = (file: File): string | null => {
    const validExtensions = ['.pdf', '.docx', '.txt'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!validExtensions.includes(ext)) {
      return `Unsupported format '${ext}'. Please upload an Indian court judgment in PDF, DOCX, or TXT format.`;
    }
    const maxSize = 25 * 1024 * 1024;
    if (file.size > maxSize) {
      return `File size exceeds the 25 MB limit.`;
    }
    return null;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = async (file: File) => {
    setErrorMessage(null);
    setUploadedDoc(null);
    const validationError = validateFile(file);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setSelectedFile(file);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const response = await api.uploadDocument(file, (progress) => {
        setUploadProgress(progress);
      });
      setUploadedDoc(response.document);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to upload document.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleTriggerAnalysis = async () => {
    if (!uploadedDoc) return;
    setIsAnalyzing(true);
    setErrorMessage(null);

    try {
      const res = await api.analyzeDocument(uploadedDoc.id);
      navigate(`/analysis/${res.document.id}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Legal analysis pipeline failed.');
      setIsAnalyzing(false);
    }
  };

  const handleQuickLoadSample = async (sampleId: string) => {
    setLoadingSampleId(sampleId);
    setErrorMessage(null);
    try {
      const res = await api.loadSampleDocument(sampleId);
      navigate(`/analysis/${res.document.id}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not load sample document.');
    } finally {
      setLoadingSampleId(null);
    }
  };

  const resetSelection = () => {
    setSelectedFile(null);
    setUploadedDoc(null);
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fadeIn pb-12">
      {/* Top Heading */}
      <div className="space-y-1 text-center sm:text-left">
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#14243D] tracking-tight">
          Upload a court document
        </h1>
        <p className="text-xs sm:text-sm text-[#737986] leading-relaxed">
          Analyze Indian judgments and orders to identify key facts, legal provisions, and outcomes.
        </p>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-3.5 rounded-lg border border-[#F5C2C2] bg-[#FDF0F0] text-[#C44B4B] text-xs flex items-start space-x-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#C44B4B]" />
          <div className="flex-1 leading-relaxed">{errorMessage}</div>
        </div>
      )}

      {/* Upload Box (CourtLens Warm Ivory Style) */}
      {!uploadedDoc && (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-10 sm:p-14 text-center cursor-pointer transition-colors bg-white ${
            dragActive
              ? 'border-[#14243D] bg-[#F3F1EB]'
              : 'border-[#E5E2DA] hover:border-[#A98A4B]'
          } shadow-card`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="flex flex-col items-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#FAF4E8] flex items-center justify-center text-[#A98A4B]">
              {isUploading ? (
                <RefreshCw className="w-5 h-5 animate-spin text-[#14243D]" />
              ) : (
                <Upload className="w-6 h-6 text-[#A98A4B]" />
              )}
            </div>

            <div className="text-xs sm:text-sm text-[#14243D]">
              <span className="font-semibold">Drop your document here</span>{' '}
              <span className="text-[#737986]">or browse files</span>
            </div>

            <p className="text-[11px] text-[#737986]">
              Supported formats: PDF, DOCX, TXT • Up to 25 MB
            </p>
          </div>

          {/* Upload Progress Bar */}
          {isUploading && (
            <div className="mt-6 max-w-xs mx-auto space-y-1.5">
              <div className="flex justify-between text-[11px] text-[#737986]">
                <span>Extracting text...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-[#F3F1EB] rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-[#14243D] h-1.5 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Selected File Details & Extraction Confirmation */}
      {uploadedDoc && (
        <div className="border border-[#E5E2DA] rounded-lg bg-white p-5 shadow-card space-y-5">
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#E5E2DA]">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-10 rounded-sm bg-[#FDEDED] border border-[#F5C2C2] flex items-center justify-center text-[#C44B4B] font-bold text-[10px]">
                PDF
              </div>
              <div>
                <div className="text-xs font-semibold text-[#14243D]">
                  {uploadedDoc.originalName}
                </div>
                <div className="text-[11px] text-[#737986] mt-0.5">
                  {(uploadedDoc.fileSize / 1024).toFixed(1)} KB • {uploadedDoc.mimeType} • Est. {uploadedDoc.pageCount || 1} pages
                </div>
              </div>
            </div>

            <button
              onClick={resetSelection}
              className="text-xs text-[#737986] hover:text-[#14243D] flex items-center space-x-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Replace file</span>
            </button>
          </div>

          {/* Scanned PDF warning if text layer is empty */}
          {uploadedDoc.isScannedPdf ? (
            <div className="p-3.5 rounded-md border border-[#F5C2C2] bg-[#FDF0F0] text-xs text-[#C44B4B] space-y-1">
              <div className="font-semibold flex items-center space-x-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>Scanned Image Document Detected</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                This PDF consists of scanned raster images without a selectable text layer. OCR processing is required before this file can be reviewed.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <span className="text-[11px] uppercase tracking-wider text-[#737986] font-semibold">
                  Extracted Document Opening
                </span>
                <div className="p-3.5 rounded-md border border-[#E5E2DA] bg-[#FAF9F5] font-serif text-[11px] text-[#3F4754] max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {(uploadedDoc.extractedText || uploadedDoc.textSnippet)?.substring(0, 900) || 'No text extracted.'}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleTriggerAnalysis}
                  disabled={isAnalyzing}
                  className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-md bg-[#14243D] hover:bg-[#0D182A] text-white text-xs font-medium shadow-subtle transition-colors disabled:opacity-60"
                >
                  {isAnalyzing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Reviewing Judgment...</span>
                    </>
                  ) : (
                    <>
                      <span>Analyze Document</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Try Preloaded Landmark Judgments */}
      <div className="space-y-3 pt-4 border-t border-[#E5E2DA]">
        <div className="flex items-center space-x-2">
          <Scale className="w-4 h-4 text-[#A98A4B]" />
          <h2 className="font-serif font-bold text-xs uppercase tracking-wider text-[#14243D]">
            Or select a landmark judgment to analyze
          </h2>
        </div>

        <div className="divide-y divide-[#E5E2DA] border border-[#E5E2DA] rounded-lg bg-white shadow-card">
          {samples.map((s) => (
            <div
              key={s.id}
              onClick={() => handleQuickLoadSample(s.id)}
              className="p-3.5 flex items-center justify-between hover:bg-[#FAF9F5] cursor-pointer transition-colors"
            >
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-[#14243D]">
                  {s.title}
                </div>
                <div className="text-[11px] text-[#737986]">
                  {s.court} • {s.caseType}
                </div>
              </div>

              <span className="text-xs text-[#14243D] font-medium shrink-0 pl-3 flex items-center space-x-1">
                <span>{loadingSampleId === s.id ? 'Loading...' : 'Select'}</span>
                {loadingSampleId === s.id ? (
                  <RefreshCw className="w-3 h-3 animate-spin ml-1" />
                ) : (
                  <ArrowRight className="w-3.5 h-3.5" />
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
