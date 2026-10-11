import React, { useEffect, useState } from 'react';
import {
  Cpu,
  Database,
  FileCheck,
  Shield,
  Info
} from 'lucide-react';
import { api } from '../services/api';
import { SystemStatus } from '../types';

export const SettingsInfo: React.FC = () => {
  const [status, setStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    api.getSystemStatus()
      .then(setStatus)
      .catch(console.warn);
  }, []);

  const isAiConnected = status?.aiProvider?.configured === true;

  return (
    <div className="space-y-8 max-w-2xl animate-fadeIn pb-12">
      {/* Top Heading */}
      <div className="space-y-1 pb-2 border-b border-[#E5E2DA]">
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#14243D] tracking-tight">
          Settings & System Info
        </h1>
        <p className="text-xs sm:text-sm text-[#737986]">
          AI processing engine status, document persistence, and privacy policies.
        </p>
      </div>

      {/* AI Processing Engine Status */}
      <div className="border border-[#E5E2DA] rounded-lg bg-white p-5 shadow-card space-y-4">
        <div className="flex items-center space-x-2">
          <Cpu className="w-5 h-5 text-[#A98A4B]" />
          <h2 className="font-serif font-bold text-sm text-[#14243D]">
            Legal AI Processing Status
          </h2>
        </div>

        <div className="space-y-3 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-[#E5E2DA]">
            <span className="text-[#737986]">Processing Engine:</span>
            <div className="flex items-center space-x-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  isAiConnected ? 'bg-[#23845D]' : 'bg-[#B7791F]'
                }`}
              />
              <span className="font-semibold text-[#14243D]">
                {isAiConnected ? status?.aiProvider?.service : 'Deterministic Legal Rule Engine (Demo)'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pb-2 border-b border-[#E5E2DA]">
            <span className="text-[#737986]">Configured Model:</span>
            <span className="font-mono text-[#14243D]">
              {status?.aiProvider?.model || 'Not configured'}
            </span>
          </div>

          <p className="text-[#616875] leading-relaxed pt-1">
            {isAiConnected
              ? `Connected to ${status?.aiProvider?.service}. Judgments are analysed page by page into a detailed, page-referenced report. Fallback: ${status?.aiProvider?.fallback || 'Local Rule-Based Engine'}.`
              : `External LLM key is not configured in backend environment. NyayaDrishti is executing in deterministic Indian legal extraction mode (extracts parties, provisions, and court orders via verified pattern heuristics).`}
          </p>

          <div className="p-3 rounded-md bg-[#FAF9F5] border border-[#E5E2DA] text-[11px] text-[#737986] space-y-1">
            <span className="font-semibold text-[#14243D]">To enable NVIDIA AI (recommended):</span>
            <p>
              Set <code className="font-mono text-[#14243D]">NVIDIA_API_KEY</code> and <code className="font-mono text-[#14243D]">NVIDIA_MODEL</code> in <code className="font-mono text-[#14243D]">backend/.env</code> and restart the server.
              Optionally set <code className="font-mono text-[#14243D]">GEMINI_API_KEY</code> as a fallback. Keys stay on the server and are never sent to the browser.
            </p>
          </div>
        </div>
      </div>

      {/* Database & Document Storage */}
      <div className="border border-[#E5E2DA] rounded-lg bg-white p-5 shadow-card space-y-3">
        <div className="flex items-center space-x-2">
          <Database className="w-5 h-5 text-[#14243D]" />
          <h2 className="font-serif font-bold text-sm text-[#14243D]">
            Storage & Persistence
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs pt-1">
          <div>
            <span className="text-[11px] text-[#737986] block">Database Engine</span>
            <span className="font-semibold text-[#14243D]">{status?.database || 'MongoDB'}</span>
          </div>
          <div>
            <span className="text-[11px] text-[#737986] block">Upload Limit</span>
            <span className="font-semibold text-[#14243D]">25 MB per document</span>
          </div>
          <div className="col-span-2">
            <span className="text-[11px] text-[#737986] block">Supported Formats</span>
            <span className="font-semibold text-[#14243D]">PDF (.pdf), Word (.docx), Plain Text (.txt)</span>
          </div>
        </div>
      </div>

      {/* Privacy & Handling Notice */}
      <div className="border border-[#E5E2DA] rounded-lg bg-white p-5 shadow-card space-y-2 text-xs text-[#616875] leading-relaxed">
        <div className="flex items-center space-x-2 text-[#14243D] font-semibold">
          <Shield className="w-4 h-4 text-[#A98A4B]" />
          <span>Privacy & Data Handling</span>
        </div>
        <p>
          Uploaded court judgments are processed locally within the server sandbox and stored in your dedicated database instance.
          API keys and authentication credentials are maintained strictly server-side and never exposed to the client.
        </p>
      </div>

      {/* Statutory Legal Notice */}
      <div className="p-4 rounded-md border border-[#E5E2DA] bg-[#FAF9F5] text-[11px] text-[#737986] space-y-1">
        <span className="font-semibold text-[#14243D]">Statutory Notice:</span>
        <p>
          NyayaDrishti is an automated research and document structuring tool designed to assist legal research. It does not provide legal advice, represent parties before courts, or substitute for professional judgment by an advocate enrolled under the Advocates Act, 1961. Always inspect certified court copies.
        </p>
      </div>
    </div>
  );
};
