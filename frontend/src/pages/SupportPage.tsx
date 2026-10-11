import React, { useState } from 'react';
import {
  HelpCircle,
  Mail,
  Send,
  AlertCircle,
  CheckCircle2,
  Info,
  Clock,
  ShieldCheck,
  Scale
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const SupportPage: React.FC = () => {
  const { user } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [submittedData, setSubmittedData] = useState<{
    name: string;
    email: string;
    subject: string;
    message: string;
    submittedAt: string;
  } | null>(null);

  const validate = () => {
    const newErrors: { [key: string]: string } = {};

    if (!name.trim()) {
      newErrors.name = 'Please provide your name.';
    }

    if (!email.trim()) {
      newErrors.email = 'Please provide your email address.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = 'Please provide a valid email address.';
    }

    if (!subject.trim()) {
      newErrors.subject = 'Please specify a subject.';
    }

    if (!message.trim()) {
      newErrors.message = 'Please describe your inquiry or issue.';
    } else if (message.trim().length < 10) {
      newErrors.message = 'Please provide at least 10 characters describing your issue.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    // Record submission state and display honest development status
    setSubmittedData({
      name: name.trim(),
      email: email.trim(),
      subject: subject.trim(),
      message: message.trim(),
      submittedAt: new Date().toLocaleTimeString(),
    });
  };

  const handleReset = () => {
    setSubmittedData(null);
    setSubject('');
    setMessage('');
    setErrors({});
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn pb-12">
      {/* Header */}
      <div className="pb-3 border-b border-[#E5E2DA]">
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#14243D] tracking-tight">
          Contact Support
        </h1>
        <p className="text-xs sm:text-sm text-[#737986] mt-1">
          Have an inquiry, experiencing an issue with document parsing, or need technical assistance? Describe your case below.
        </p>
      </div>

      {submittedData ? (
        <div className="border border-[#E5E2DA] rounded-lg bg-white p-6 shadow-card space-y-5 animate-fadeIn">
          <div className="p-4 rounded-lg bg-[#FAF4E8] border border-[#EBE3D0] flex items-start space-x-3 text-xs">
            <Info className="w-5 h-5 text-[#A98A4B] shrink-0 mt-0.5" />
            <div className="space-y-1.5 text-[#3F4754]">
              <div className="font-semibold text-[#14243D]">
                Inquiry Form Processed (Development Environment Notice)
              </div>
              <p className="leading-relaxed">
                Direct automated email delivery and ticketing integration are currently in preview mode for this deployment. As an external mail server is not configured in this sandbox, your message cannot yet be dispatched via SMTP.
              </p>
              <p className="leading-relaxed">
                For immediate assistance during testing, you can reach out directly via our official channels:
              </p>
              <div className="pt-1 flex flex-wrap gap-3 font-mono text-[11px] text-[#14243D]">
                <span className="px-2 py-1 rounded bg-white border border-[#E5E2DA]">Email: support@nyayadrishti.in</span>
                <span className="px-2 py-1 rounded bg-white border border-[#E5E2DA]">GitHub: utkarsh-0204/NotyourAvgDevs</span>
              </div>
            </div>
          </div>

          {/* Submission Details Preview */}
          <div className="border border-[#E5E2DA] rounded-md p-4 bg-[#FAF9F5] space-y-2 text-xs">
            <div className="text-[11px] font-semibold text-[#737986] uppercase tracking-wider">
              Recorded Submission Summary
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
              <div>
                <span className="text-[#737986]">From:</span>{' '}
                <span className="font-medium text-[#14243D]">{submittedData.name} ({submittedData.email})</span>
              </div>
              <div>
                <span className="text-[#737986]">Time:</span>{' '}
                <span className="font-medium text-[#14243D]">{submittedData.submittedAt}</span>
              </div>
            </div>
            <div className="text-[11px] pt-1">
              <span className="text-[#737986]">Subject:</span>{' '}
              <span className="font-medium text-[#14243D]">{submittedData.subject}</span>
            </div>
            <div className="text-[11px] pt-1">
              <div className="text-[#737986] mb-1">Message:</div>
              <p className="text-[#3F4754] bg-white p-2.5 rounded border border-[#E5E2DA] whitespace-pre-wrap leading-relaxed">
                {submittedData.message}
              </p>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-md border border-[#E5E2DA] bg-white hover:bg-[#F3F1EB] text-[#14243D] text-xs font-medium transition-colors"
            >
              Submit Another Inquiry
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="border border-[#E5E2DA] rounded-lg bg-white p-6 shadow-card space-y-4">
          {/* Name Field */}
          <div>
            <label className="block text-xs font-semibold text-[#14243D] mb-1.5">
              Your Name <span className="text-[#C44B4B]">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
              }}
              placeholder="e.g. Adv. Harish Prasad"
              className={`w-full px-3 py-2 text-xs rounded-md border ${
                errors.name ? 'border-[#F5C2C2] bg-[#FDF0F0]' : 'border-[#E5E2DA] bg-white'
              } text-[#14243D] placeholder-[#737986] focus:outline-none focus:border-[#14243D] transition-colors`}
            />
            {errors.name && (
              <p className="text-[11px] text-[#C44B4B] mt-1 flex items-center space-x-1">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span>{errors.name}</span>
              </p>
            )}
          </div>

          {/* Email Field */}
          <div>
            <label className="block text-xs font-semibold text-[#14243D] mb-1.5">
              Email Address <span className="text-[#C44B4B]">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
              }}
              placeholder="advocate@example.com"
              className={`w-full px-3 py-2 text-xs rounded-md border ${
                errors.email ? 'border-[#F5C2C2] bg-[#FDF0F0]' : 'border-[#E5E2DA] bg-white'
              } text-[#14243D] placeholder-[#737986] focus:outline-none focus:border-[#14243D] transition-colors`}
            />
            {errors.email && (
              <p className="text-[11px] text-[#C44B4B] mt-1 flex items-center space-x-1">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span>{errors.email}</span>
              </p>
            )}
          </div>

          {/* Subject Field */}
          <div>
            <label className="block text-xs font-semibold text-[#14243D] mb-1.5">
              Subject <span className="text-[#C44B4B]">*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                if (errors.subject) setErrors((prev) => ({ ...prev, subject: '' }));
              }}
              placeholder="e.g. Issue reviewing judgment PDF or feature request"
              className={`w-full px-3 py-2 text-xs rounded-md border ${
                errors.subject ? 'border-[#F5C2C2] bg-[#FDF0F0]' : 'border-[#E5E2DA] bg-white'
              } text-[#14243D] placeholder-[#737986] focus:outline-none focus:border-[#14243D] transition-colors`}
            />
            {errors.subject && (
              <p className="text-[11px] text-[#C44B4B] mt-1 flex items-center space-x-1">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span>{errors.subject}</span>
              </p>
            )}
          </div>

          {/* Message Textarea */}
          <div>
            <label className="block text-xs font-semibold text-[#14243D] mb-1.5">
              Message <span className="text-[#C44B4B]">*</span>
            </label>
            <textarea
              rows={5}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                if (errors.message) setErrors((prev) => ({ ...prev, message: '' }));
              }}
              placeholder="Describe your issue or question in detail (e.g. which judgment was being processed, error messages encountered, etc.)..."
              className={`w-full px-3 py-2 text-xs rounded-md border ${
                errors.message ? 'border-[#F5C2C2] bg-[#FDF0F0]' : 'border-[#E5E2DA] bg-white'
              } text-[#14243D] placeholder-[#737986] focus:outline-none focus:border-[#14243D] transition-colors`}
            />
            {errors.message && (
              <p className="text-[11px] text-[#C44B4B] mt-1 flex items-center space-x-1">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span>{errors.message}</span>
              </p>
            )}
          </div>

          {/* Submit Button */}
          <div className="pt-2 flex items-center justify-between">
            <p className="text-[11px] text-[#737986]">
              All inquiries are logged for platform quality assurance.
            </p>
            <button
              type="submit"
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-md bg-[#14243D] hover:bg-[#0D182A] text-white text-xs font-medium shadow-subtle transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Submit Inquiry</span>
            </button>
          </div>
        </form>
      )}

      {/* Support FAQ & Channels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <div className="p-4 rounded-lg border border-[#E5E2DA] bg-white shadow-subtle space-y-1.5">
          <div className="flex items-center space-x-2 text-xs font-semibold text-[#14243D]">
            <Clock className="w-4 h-4 text-[#A98A4B]" />
            <span>Response Timeline</span>
          </div>
          <p className="text-[11px] text-[#737986] leading-relaxed">
            Our team reviews hackathon demo queries and technical inquiries typically within 24 business hours.
          </p>
        </div>

        <div className="p-4 rounded-lg border border-[#E5E2DA] bg-white shadow-subtle space-y-1.5">
          <div className="flex items-center space-x-2 text-xs font-semibold text-[#14243D]">
            <ShieldCheck className="w-4 h-4 text-[#A98A4B]" />
            <span>Document Confidentiality</span>
          </div>
          <p className="text-[11px] text-[#737986] leading-relaxed">
            Court judgment reviews are processed strictly in accordance with local Indian court review privacy standards.
          </p>
        </div>
      </div>
    </div>
  );
};
