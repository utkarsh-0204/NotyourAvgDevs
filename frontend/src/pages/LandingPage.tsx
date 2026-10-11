import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Scale,
  Upload,
  PlayCircle,
  FileText,
  BookOpen,
  FileCheck,
  Download,
  ArrowRight,
  Users,
  Landmark,
  Search,
  CheckCircle2,
  Menu,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<'home' | 'features' | 'how-it-works' | 'about'>('home');

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 120;
      const featuresEl = document.getElementById('features');
      const howItWorksEl = document.getElementById('how-it-works');
      const aboutEl = document.getElementById('about');

      if (aboutEl && scrollPosition >= aboutEl.offsetTop) {
        setActiveSection('about');
      } else if (howItWorksEl && scrollPosition >= howItWorksEl.offsetTop) {
        setActiveSection('how-it-works');
      } else if (featuresEl && scrollPosition >= featuresEl.offsetTop) {
        setActiveSection('features');
      } else {
        setActiveSection('home');
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = (e: React.MouseEvent) => {
    e.preventDefault();
    setActiveSection('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setMobileMenuOpen(false);
  };

  const scrollToSection = (e: React.MouseEvent, sectionId: 'features' | 'how-it-works' | 'about') => {
    e.preventDefault();
    setActiveSection(sectionId);
    setMobileMenuOpen(false);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F6F2] text-[#263449] flex flex-col justify-between selection:bg-[#EAE4D3] selection:text-[#14243D]">
      {/* ================================================== */}
      {/* 4. NAVBAR (78px tall, centered in shared 1260px container) */}
      {/* ================================================== */}
      <header className="sticky top-0 z-40 h-[78px] w-full border-b border-[#E7E2D9] bg-[#F7F6F2] shadow-none">
        <div className="w-full max-w-[1260px] mx-auto h-full px-6 lg:px-8 flex items-center justify-between">
          {/* LEFT: Branding */}
          <div className="flex items-center shrink-0">
            <Link to="/" onClick={scrollToTop} className="flex items-center space-x-2.5">
              <Scale className="w-5 h-5 text-[#A88A4A]" />
              <span className="font-serif font-semibold text-[24px] tracking-tight text-[#14243D]">
                NyayaDrishti
              </span>
            </Link>
          </div>

          {/* CENTER: Navigation Links (approx. 28-32px horizontal gap, 15px medium) */}
          <nav className="hidden md:flex items-center space-x-[30px] text-[15px] font-medium">
            <a
              href="/"
              onClick={scrollToTop}
              className={`transition-colors duration-150 cursor-pointer ${
                activeSection === 'home'
                  ? 'text-[#14243D]'
                  : 'text-[#667085] hover:text-[#14243D]'
              }`}
            >
              Home
            </a>
            <a
              href="#features"
              onClick={(e) => scrollToSection(e, 'features')}
              className={`transition-colors duration-150 cursor-pointer ${
                activeSection === 'features'
                  ? 'text-[#14243D]'
                  : 'text-[#667085] hover:text-[#14243D]'
              }`}
            >
              Features
            </a>
            <a
              href="#how-it-works"
              onClick={(e) => scrollToSection(e, 'how-it-works')}
              className={`transition-colors duration-150 cursor-pointer ${
                activeSection === 'how-it-works'
                  ? 'text-[#14243D]'
                  : 'text-[#667085] hover:text-[#14243D]'
              }`}
            >
              How It Works
            </a>
            <a
              href="#about"
              onClick={(e) => scrollToSection(e, 'about')}
              className={`transition-colors duration-150 cursor-pointer ${
                activeSection === 'about'
                  ? 'text-[#14243D]'
                  : 'text-[#667085] hover:text-[#14243D]'
              }`}
            >
              About
            </a>
          </nav>

          {/* RIGHT: Authentication Actions */}
          <div className="hidden sm:flex items-center space-x-5 shrink-0">
            {isAuthenticated ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center justify-center h-[42px] px-5 rounded-md bg-[#14243D] hover:bg-[#0D182A] text-white text-[15px] font-medium transition-colors shadow-subtle"
              >
                <span>Dashboard</span>
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-[15px] font-medium text-[#14243D] hover:text-[#0D182A] transition-colors"
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center justify-center h-[42px] px-5 rounded-md bg-[#14243D] hover:bg-[#0D182A] text-white text-[15px] font-medium transition-colors shadow-subtle"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>

          {/* Mobile Hamburger Toggle */}
          <div className="flex md:hidden items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-[#14243D] hover:text-[#0D182A] focus:outline-none"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* MOBILE NAVIGATION MENU */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-[#E7E2D9] bg-[#F7F6F2] px-6 py-5 space-y-4">
          <nav className="flex flex-col space-y-3 text-[15px] font-medium">
            <a
              href="/"
              onClick={scrollToTop}
              className={`py-1 transition-colors ${
                activeSection === 'home' ? 'text-[#14243D]' : 'text-[#667085] hover:text-[#14243D]'
              }`}
            >
              Home
            </a>
            <a
              href="#features"
              onClick={(e) => scrollToSection(e, 'features')}
              className={`py-1 transition-colors ${
                activeSection === 'features' ? 'text-[#14243D]' : 'text-[#667085] hover:text-[#14243D]'
              }`}
            >
              Features
            </a>
            <a
              href="#how-it-works"
              onClick={(e) => scrollToSection(e, 'how-it-works')}
              className={`py-1 transition-colors ${
                activeSection === 'how-it-works' ? 'text-[#14243D]' : 'text-[#667085] hover:text-[#14243D]'
              }`}
            >
              How It Works
            </a>
            <a
              href="#about"
              onClick={(e) => scrollToSection(e, 'about')}
              className={`py-1 transition-colors ${
                activeSection === 'about' ? 'text-[#14243D]' : 'text-[#667085] hover:text-[#14243D]'
              }`}
            >
              About
            </a>
          </nav>
          <div className="pt-4 border-t border-[#E7E2D9] flex items-center space-x-3">
            {isAuthenticated ? (
              <Link
                to="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full inline-flex items-center justify-center h-[42px] rounded-md bg-[#14243D] text-white text-[15px] font-medium"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-1/2 text-center py-2 text-[15px] font-medium text-[#14243D] hover:text-[#0D182A]"
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-1/2 inline-flex items-center justify-center h-[42px] rounded-md bg-[#14243D] text-white text-[15px] font-medium"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      )}

      {/* ================================================== */}
      {/* 1 & 2. HERO SECTION (56%/44% Layout, 3-Line Heading, Rounded Image) */}
      {/* ================================================== */}
      <section className="w-full max-w-[1260px] mx-auto px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-14 items-center">
          {/* LEFT COLUMN (~56% of width: 7/12 grid span) */}
          <div className="lg:col-span-7 flex flex-col justify-center">
            {/* 1. Eyebrow label */}
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#A88A4A] mb-4">
              AI-POWERED LEGAL DOCUMENT INTELLIGENCE
            </div>

            {/* 2. Main 3-line heading (Highest Priority) */}
            <h1 className="hero-heading text-4xl sm:text-5xl lg:text-[54px] xl:text-[58px] font-normal sm:font-medium text-[#14243D] tracking-tight text-left leading-[1.12]">
              <span className="block text-[#14243D]">Understand</span>
              <span className="block text-[#14243D]">Indian Court Judgements</span>
              <span className="hero-heading-accent block text-[#A88A4A]">in Minutes</span>
            </h1>

            {/* 3. Supporting paragraph (~18px on desktop, muted slate-navy, controlled width) */}
            <p className="text-[16px] lg:text-[18px] text-[#263449] leading-[1.6] max-w-xl mt-6 mb-7">
              Upload any Indian court judgment in PDF and get a structured analysis with case summary, parties, legal provisions, court reasoning, and final outcome — all with source references.
            </p>

            {/* 4. Action Buttons */}
            <div className="flex flex-wrap items-center gap-3.5 mb-8">
              <Link
                to="/upload"
                className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-md bg-[#14243D] hover:bg-[#0D182A] text-white text-[15px] font-medium transition-colors shadow-subtle"
              >
                <Upload className="w-4 h-4" />
                <span>Upload Document</span>
              </Link>

              <a
                href="#how-it-works"
                onClick={(e) => scrollToSection(e, 'how-it-works')}
                className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-md border border-[#D5D0C5] bg-white hover:bg-[#F3F1EB] text-[#14243D] text-[15px] font-medium transition-colors shadow-subtle cursor-pointer"
              >
                <PlayCircle className="w-4 h-4 text-[#A88A4A]" />
                <span>See How It Works</span>
              </a>
            </div>

            {/* 5. Four Compact Feature Summaries (Directly below hero CTA in clean horizontal row) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-[#E7E2D9]">
              <div className="space-y-1">
                <div className="flex items-center space-x-1.5">
                  <FileText className="w-4 h-4 text-[#A88A4A] shrink-0" />
                  <span className="text-xs font-semibold text-[#14243D]">Case Summary</span>
                </div>
                <p className="text-[11px] text-[#667085]">in simple language</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center space-x-1.5">
                  <BookOpen className="w-4 h-4 text-[#A88A4A] shrink-0" />
                  <span className="text-xs font-semibold text-[#14243D]">Key Legal Provisions</span>
                </div>
                <p className="text-[11px] text-[#667085]">with references</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center space-x-1.5">
                  <FileCheck className="w-4 h-4 text-[#A88A4A] shrink-0" />
                  <span className="text-xs font-semibold text-[#14243D]">Arguments & Reasoning</span>
                </div>
                <p className="text-[11px] text-[#667085]">from original text</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center space-x-1.5">
                  <Download className="w-4 h-4 text-[#A88A4A] shrink-0" />
                  <span className="text-xs font-semibold text-[#14243D]">Downloadable Report</span>
                </div>
                <p className="text-[11px] text-[#667085]">in PDF format</p>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN (~44% of width: 5/12 grid span, More Rounded 26px Border Radius) */}
          <div className="lg:col-span-5 relative flex justify-center">
            <div className="relative w-full rounded-[26px] overflow-hidden border border-[#E7E2D9] bg-white shadow-[0_4px_24px_-4px_rgba(20,36,61,0.06)]">
              <img
                src="/supreme-court.jpg"
                alt="Supreme Court of India architectural facade"
                className="w-full h-[380px] sm:h-[420px] lg:h-[450px] object-cover object-center"
              />

              {/* Floating Quote Card with Vertical Gold Bar */}
              <div className="absolute bottom-5 left-5 right-5 sm:right-auto sm:max-w-xs p-3.5 rounded-xl bg-white/95 backdrop-blur-xs border border-[#E7E2D9]">
                <div className="border-l-2 border-[#A88A4A] pl-3">
                  <p className="text-xs font-serif italic text-[#14243D] leading-snug">
                    "Making legal information more accessible"
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ================================================== */}
        {/* 6. HONEST PRODUCT HIGHLIGHTS STRIP                 */}
        {/* ================================================== */}
        <div className="mt-16 pt-8 border-t border-[#E7E2D9]">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-[#E7E2D9] text-center">
            <div className="py-3 px-4">
              <div className="font-serif text-[17px] font-semibold text-[#14243D]">
                Multiple document formats
              </div>
              <div className="text-xs text-[#667085] mt-1">
                Work with supported legal documents.
              </div>
            </div>

            <div className="py-3 px-4">
              <div className="font-serif text-[17px] font-semibold text-[#14243D]">
                Structured analysis
              </div>
              <div className="text-xs text-[#667085] mt-1">
                Facts, parties, laws, and outcomes.
              </div>
            </div>

            <div className="py-3 px-4">
              <div className="font-serif text-[17px] font-semibold text-[#14243D]">
                Source-linked results
              </div>
              <div className="text-xs text-[#667085] mt-1">
                Inspect the original supporting text.
              </div>
            </div>

            <div className="py-3 px-4">
              <div className="font-serif text-[17px] font-semibold text-[#14243D]">
                Document privacy
              </div>
              <div className="text-xs text-[#667085] mt-1">
                Review how your files are handled.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================== */}
      {/* FEATURES SECTION                                  */}
      {/* ================================================== */}
      <section
        id="features"
        className="scroll-mt-24 border-t border-[#E7E2D9] bg-[#F7F6F2] py-16 lg:py-20 w-full"
      >
        <div className="w-full max-w-[1260px] mx-auto px-6 lg:px-8">
          {/* Section Heading & Subtitle */}
          <div className="max-w-2xl mb-12">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#A88A4A] mb-2">
              Capabilities
            </div>
            <h2 className="font-serif text-2xl sm:text-[32px] font-semibold text-[#14243D] tracking-tight leading-snug">
              Everything you need to understand a judgment
            </h2>
            <p className="mt-2.5 text-[16px] text-[#263449] leading-[1.6]">
              Turn lengthy Indian court documents into structured, searchable legal insights.
            </p>
          </div>

          {/* 6 Feature Blocks (2 Rows, 3 Columns on Desktop) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* FEATURE 1 */}
            <div className="p-6 rounded-lg border border-[#E7E2D9] bg-white flex flex-col justify-between hover:border-[#D5CFC2] transition-colors shadow-subtle">
              <div>
                <div className="w-8 h-8 rounded bg-[#F7F6F2] border border-[#E7E2D9] flex items-center justify-center mb-4">
                  <Landmark className="w-4 h-4 text-[#A88A4A]" />
                </div>
                <h3 className="font-serif text-[17px] font-semibold text-[#14243D] mb-2">
                  Intelligent Case Classification
                </h3>
                <p className="text-[14px] text-[#263449] leading-[1.6]">
                  Automatically identify the nature of a case, including civil, criminal, constitutional, commercial, and other relevant categories.
                </p>
              </div>
            </div>

            {/* FEATURE 2 */}
            <div className="p-6 rounded-lg border border-[#E7E2D9] bg-white flex flex-col justify-between hover:border-[#D5CFC2] transition-colors shadow-subtle">
              <div>
                <div className="w-8 h-8 rounded bg-[#F7F6F2] border border-[#E7E2D9] flex items-center justify-center mb-4">
                  <FileText className="w-4 h-4 text-[#A88A4A]" />
                </div>
                <h3 className="font-serif text-[17px] font-semibold text-[#14243D] mb-2">
                  Structured Case Summaries
                </h3>
                <p className="text-[14px] text-[#263449] leading-[1.6]">
                  Understand the facts, legal issues, arguments, court reasoning, and final decision without manually reading the entire document.
                </p>
              </div>
            </div>

            {/* FEATURE 3 */}
            <div className="p-6 rounded-lg border border-[#E7E2D9] bg-white flex flex-col justify-between hover:border-[#D5CFC2] transition-colors shadow-subtle">
              <div>
                <div className="w-8 h-8 rounded bg-[#F7F6F2] border border-[#E7E2D9] flex items-center justify-center mb-4">
                  <Users className="w-4 h-4 text-[#A88A4A]" />
                </div>
                <h3 className="font-serif text-[17px] font-semibold text-[#14243D] mb-2">
                  Party Identification
                </h3>
                <p className="text-[14px] text-[#263449] leading-[1.6]">
                  Identify petitioners, respondents, appellants, judges, advocates, and other entities when supported by the source document.
                </p>
              </div>
            </div>

            {/* FEATURE 4 */}
            <div className="p-6 rounded-lg border border-[#E7E2D9] bg-white flex flex-col justify-between hover:border-[#D5CFC2] transition-colors shadow-subtle">
              <div>
                <div className="w-8 h-8 rounded bg-[#F7F6F2] border border-[#E7E2D9] flex items-center justify-center mb-4">
                  <BookOpen className="w-4 h-4 text-[#A88A4A]" />
                </div>
                <h3 className="font-serif text-[17px] font-semibold text-[#14243D] mb-2">
                  Legal Provision Extraction
                </h3>
                <p className="text-[14px] text-[#263449] leading-[1.6]">
                  Extract references to statutes, sections, constitutional articles, regulations, and cited judgments.
                </p>
              </div>
            </div>

            {/* FEATURE 5 */}
            <div className="p-6 rounded-lg border border-[#E7E2D9] bg-white flex flex-col justify-between hover:border-[#D5CFC2] transition-colors shadow-subtle">
              <div>
                <div className="w-8 h-8 rounded bg-[#F7F6F2] border border-[#E7E2D9] flex items-center justify-center mb-4">
                  <Search className="w-4 h-4 text-[#A88A4A]" />
                </div>
                <h3 className="font-serif text-[17px] font-semibold text-[#14243D] mb-2">
                  Evidence-Linked Insights
                </h3>
                <p className="text-[14px] text-[#263449] leading-[1.6]">
                  Show the passages supporting extracted facts and analysis, including page references when available.
                </p>
              </div>
            </div>

            {/* FEATURE 6 */}
            <div className="p-6 rounded-lg border border-[#E7E2D9] bg-white flex flex-col justify-between hover:border-[#D5CFC2] transition-colors shadow-subtle">
              <div>
                <div className="w-8 h-8 rounded bg-[#F7F6F2] border border-[#E7E2D9] flex items-center justify-center mb-4">
                  <Download className="w-4 h-4 text-[#A88A4A]" />
                </div>
                <h3 className="font-serif text-[17px] font-semibold text-[#14243D] mb-2">
                  Downloadable Analysis
                </h3>
                <p className="text-[14px] text-[#263449] leading-[1.6]">
                  Allow users to export their structured analysis in a readable report format.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================== */}
      {/* HOW IT WORKS SECTION                              */}
      {/* ================================================== */}
      <section
        id="how-it-works"
        className="scroll-mt-24 border-t border-[#E7E2D9] bg-[#F3F1EB] py-16 lg:py-20 w-full"
      >
        <div className="w-full max-w-[1260px] mx-auto px-6 lg:px-8">
          {/* Section Header */}
          <div className="max-w-2xl mb-12">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#A88A4A] mb-2">
              Workflow
            </div>
            <h2 className="font-serif text-2xl sm:text-[32px] font-semibold text-[#14243D] tracking-tight leading-snug">
              From judgment to understanding in minutes
            </h2>
            <p className="mt-2.5 text-[16px] text-[#263449] leading-[1.6]">
              A simple workflow for reviewing complex legal documents.
            </p>
          </div>

          {/* 4 Steps */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* STEP 01 */}
            <div className="p-6 rounded-lg bg-white border border-[#E7E2D9] flex flex-col justify-between shadow-subtle">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-serif text-2xl font-semibold text-[#A88A4A]">
                    01
                  </span>
                  <Upload className="w-4 h-4 text-[#667085]" />
                </div>
                <h3 className="font-serif text-[15px] font-semibold text-[#14243D] mb-2">
                  Upload a Document
                </h3>
                <p className="text-[13px] text-[#263449] leading-[1.6]">
                  Upload a supported Indian court judgment or order.
                </p>
              </div>
            </div>

            {/* STEP 02 */}
            <div className="p-6 rounded-lg bg-white border border-[#E7E2D9] flex flex-col justify-between shadow-subtle">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-serif text-2xl font-semibold text-[#A88A4A]">
                    02
                  </span>
                  <FileText className="w-4 h-4 text-[#667085]" />
                </div>
                <h3 className="font-serif text-[15px] font-semibold text-[#14243D] mb-2">
                  Extract the Content
                </h3>
                <p className="text-[13px] text-[#263449] leading-[1.6]">
                  The system extracts document text and prepares it for analysis.
                </p>
              </div>
            </div>

            {/* STEP 03 */}
            <div className="p-6 rounded-lg bg-white border border-[#E7E2D9] flex flex-col justify-between shadow-subtle">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-serif text-2xl font-semibold text-[#A88A4A]">
                    03
                  </span>
                  <Scale className="w-4 h-4 text-[#667085]" />
                </div>
                <h3 className="font-serif text-[15px] font-semibold text-[#14243D] mb-2">
                  Analyze the Judgment
                </h3>
                <p className="text-[13px] text-[#263449] leading-[1.6]">
                  The application identifies relevant parties, legal provisions, case facts, court reasoning, and outcomes using the configured analysis pipeline.
                </p>
              </div>
            </div>

            {/* STEP 04 */}
            <div className="p-6 rounded-lg bg-white border border-[#E7E2D9] flex flex-col justify-between shadow-subtle">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-serif text-2xl font-semibold text-[#A88A4A]">
                    04
                  </span>
                  <FileCheck className="w-4 h-4 text-[#667085]" />
                </div>
                <h3 className="font-serif text-[15px] font-semibold text-[#14243D] mb-2">
                  Review Your Results
                </h3>
                <p className="text-[13px] text-[#263449] leading-[1.6]">
                  Explore the structured summary, inspect supporting passages, and download the analysis when available.
                </p>
              </div>
            </div>
          </div>

          {/* Workflow CTA */}
          <div className="mt-12 text-center">
            <Link
              to="/upload"
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-md bg-[#14243D] hover:bg-[#0D182A] text-white text-[15px] font-medium transition-colors shadow-subtle"
            >
              <Upload className="w-4 h-4" />
              <span>Analyze a Document</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ================================================== */}
      {/* ABOUT SECTION                                     */}
      {/* ================================================== */}
      <section
        id="about"
        className="scroll-mt-24 border-t border-[#E7E2D9] bg-[#F7F6F2] py-16 lg:py-20 w-full"
      >
        <div className="w-full max-w-[1260px] mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            {/* Left Column: Mission (~60%) */}
            <div className="lg:col-span-7 space-y-6">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#A88A4A]">
                About NyayaDrishti
              </div>

              <h2 className="font-serif text-2xl sm:text-[32px] font-semibold text-[#14243D] tracking-tight leading-snug">
                Making legal information easier to understand
              </h2>

              <p className="text-[16px] text-[#263449] leading-[1.65]">
                NyayaDrishti is a legal document intelligence platform designed to help legal professionals, researchers, students, and citizens navigate lengthy Indian court judgments more efficiently.
              </p>

              {/* Mission Objectives */}
              <div className="space-y-3 pt-2">
                <div className="flex items-start space-x-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#A88A4A] mt-2 shrink-0" />
                  <p className="text-[14px] text-[#263449] leading-[1.6]">
                    Reduce the time spent locating important information in long documents.
                  </p>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#A88A4A] mt-2 shrink-0" />
                  <p className="text-[14px] text-[#263449] leading-[1.6]">
                    Organize legal facts and references into a consistent structure.
                  </p>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#A88A4A] mt-2 shrink-0" />
                  <p className="text-[14px] text-[#263449] leading-[1.6]">
                    Make court documents easier to navigate and review.
                  </p>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#A88A4A] mt-2 shrink-0" />
                  <p className="text-[14px] text-[#263449] leading-[1.6]">
                    Keep extracted information connected to its original source wherever possible.
                  </p>
                </div>
              </div>

              {/* Restrained Legal Disclaimer */}
              <div className="p-4 rounded-lg bg-[#F3F1EB] border border-[#E7E2D9] mt-6">
                <p className="text-[13px] text-[#667085] leading-relaxed">
                  <strong className="text-[#14243D]">Important Notice:</strong> NyayaDrishti assists with document review and information extraction. It does not replace professional legal advice or the original court judgment.
                </p>
              </div>
            </div>

            {/* Right Column: Intended Audiences (~40%) */}
            <div className="lg:col-span-5 bg-white border border-[#E7E2D9] rounded-lg p-6 sm:p-7 shadow-subtle">
              <h3 className="font-serif text-[18px] font-semibold text-[#14243D] mb-3">
                Built for clearer legal research
              </h3>
              <p className="text-[14px] text-[#667085] mb-5 leading-relaxed">
                NyayaDrishti provides consistent document synthesis tailored for all stakeholders of the justice system:
              </p>

              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <CheckCircle2 className="w-4 h-4 text-[#A88A4A] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-[14px] font-semibold text-[#14243D]">Lawyers and legal researchers</h4>
                    <p className="text-[12px] text-[#667085] mt-0.5 leading-relaxed">Quickly extract cited statutes, arguments, and judge benches for case briefs.</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <CheckCircle2 className="w-4 h-4 text-[#A88A4A] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-[14px] font-semibold text-[#14243D]">Court staff</h4>
                    <p className="text-[12px] text-[#667085] mt-0.5 leading-relaxed">Classify incoming judgments and maintain structured record registries.</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <CheckCircle2 className="w-4 h-4 text-[#A88A4A] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-[14px] font-semibold text-[#14243D]">Law students</h4>
                    <p className="text-[12px] text-[#667085] mt-0.5 leading-relaxed">Understand complex constitutional and appellate cases through structured facts and ratios.</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <CheckCircle2 className="w-4 h-4 text-[#A88A4A] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-[14px] font-semibold text-[#14243D]">Citizens seeking to understand court documents</h4>
                    <p className="text-[12px] text-[#667085] mt-0.5 leading-relaxed">Demystify legal language and follow outcomes in plain, transparent language.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================== */}
      {/* FOOTER                                            */}
      {/* ================================================== */}
      <footer className="border-t border-[#E7E2D9] bg-[#F3F1EB] py-12 px-6 lg:px-8 text-xs text-[#667085] w-full">
        <div className="w-full max-w-[1260px] mx-auto space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            {/* Left Brand & Mission (md:col-span-6) */}
            <div className="md:col-span-6 space-y-3">
              <div className="flex items-center space-x-2.5">
                <Scale className="w-5 h-5 text-[#A88A4A]" />
                <span className="font-serif font-semibold text-lg text-[#14243D]">
                  NyayaDrishti
                </span>
              </div>
              <p className="text-xs text-[#667085] max-w-sm leading-relaxed">
                Indian court document review and legal intelligence platform. Structured analysis, source citations, and clear summaries for judicial records.
              </p>
            </div>

            {/* Right Links (md:col-span-6) */}
            <div className="md:col-span-6 grid grid-cols-2 sm:grid-cols-3 gap-6">
              {/* Product */}
              <div className="space-y-2">
                <div className="font-semibold text-[11px] text-[#14243D] uppercase tracking-wider">
                  Product
                </div>
                <ul className="space-y-1.5 text-xs text-[#667085]">
                  <li>
                    <a
                      href="#features"
                      onClick={(e) => scrollToSection(e, 'features')}
                      className="hover:text-[#14243D] transition-colors cursor-pointer"
                    >
                      Features
                    </a>
                  </li>
                  <li>
                    <a
                      href="#how-it-works"
                      onClick={(e) => scrollToSection(e, 'how-it-works')}
                      className="hover:text-[#14243D] transition-colors cursor-pointer"
                    >
                      How It Works
                    </a>
                  </li>
                  <li>
                    <Link to="/upload" className="hover:text-[#14243D] transition-colors">
                      Upload Document
                    </Link>
                  </li>
                </ul>
              </div>

              {/* Organization / About */}
              <div className="space-y-2">
                <div className="font-semibold text-[11px] text-[#14243D] uppercase tracking-wider">
                  Platform
                </div>
                <ul className="space-y-1.5 text-xs text-[#667085]">
                  <li>
                    <a
                      href="#about"
                      onClick={(e) => scrollToSection(e, 'about')}
                      className="hover:text-[#14243D] transition-colors cursor-pointer"
                    >
                      About NyayaDrishti
                    </a>
                  </li>
                  <li>
                    <Link to="/library" className="hover:text-[#14243D] transition-colors">
                      Document Library
                    </Link>
                  </li>
                  <li>
                    <Link to="/settings" className="hover:text-[#14243D] transition-colors">
                      System Status
                    </Link>
                  </li>
                </ul>
              </div>

              {/* Account */}
              <div className="space-y-2">
                <div className="font-semibold text-[11px] text-[#14243D] uppercase tracking-wider">
                  Access
                </div>
                <ul className="space-y-1.5 text-xs text-[#667085]">
                  {isAuthenticated ? (
                    <li>
                      <Link to="/dashboard" className="hover:text-[#14243D] transition-colors font-medium">
                        Workspace Dashboard
                      </Link>
                    </li>
                  ) : (
                    <>
                      <li>
                        <Link to="/login" className="hover:text-[#14243D] transition-colors">
                          Log in
                        </Link>
                      </li>
                      <li>
                        <Link to="/register" className="hover:text-[#14243D] transition-colors">
                          Create Account
                        </Link>
                      </li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          </div>

          {/* Bottom Copyright & Disclaimer */}
          <div className="pt-6 border-t border-[#E7E2D9] flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-[#667085]">
            <p>
              NyayaDrishti is a document review and information-extraction tool. It is not an official court website and does not provide legal advice.
            </p>
            <p className="shrink-0">
              © {new Date().getFullYear()} NyayaDrishti. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};
