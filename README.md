# NyayaDrishti — Indian Court Document Review & Legal Intelligence

> Minimalist, production-grade legal tech application for reviewing Indian court judgments, statutory provisions, and operative orders.

---

## 1. Product Overview

**NyayaDrishti** provides an editorial, distraction-free environment for court clerks, advocates, researchers, and citizens to rapidly digest lengthy judgments from the Supreme Court of India, State High Courts, and commercial tribunals.

Key capabilities:
- **Text Layer Extraction**: Supports PDF, Word (.docx), and plain text (.txt). Automatically detects scanned raster-only files and warns that OCR is required.
- **Contextual Case Classification**: Accurately recognizes Civil, Criminal, Constitutional, Writ Petitions, Commercial/Arbitration, Service/Employment, Property, and Tax matters without naive keyword matching.
- **Entity & Role Extraction**: Extracts Petitioners, Respondents, Appellants, Accused, Advocates, and Bench/Judges with supporting source passages.
- **Statutory Provisions**: Extracts Articles of the Constitution of India (e.g. Art. 21, 32, 226), statutory codes (IPC/BNS, CrPC/BNSS, CPC), and specialized statutes (Arbitration Act, Negotiable Instruments Act, etc.).
- **Editorial Structured Summary**: Generates Executive Overview, Case Facts, Legal Issues, Submissions, Ratio Decidendi (Reasoning), and Final Disposition.
- **Operative Holding Identification**: Highlights the final decision (*Allowed*, *Dismissed*, *Partly Allowed*, *Remanded*, etc.) with verbatim holding excerpts.
- **Exports**: Markdown case briefs and structured JSON exports.

---

## 2. Design System & Philosophy

Built with a restrained, minimalist aesthetic inspired by modern SaaS interfaces:
- **Clean Typography & Whitespace**: Generous line heights, subtle borders (`#292E35` dark / `#E5E7EB` light), and quiet editorial hierarchy.
- **No Clutter**: Zero oversized card containers, zero glassmorphism, no fake glowing borders, and no marketing dashboard fluff.
- **True Dark & Light Modes**:
  - Dark: Page `#0B0D0F`, Surface `#121519`, Secondary `#171B20`, Borders `#292E35`, Text `#F4F5F6`, Accent `#4778F5`
  - Light: Page `#FAFAF8`, Surface `#FFFFFF`, Secondary `#F4F5F6`, Borders `#E5E7EB`, Text `#17191D`, Accent `#315FEA`

---

## 3. Technology Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide React, React Router.
- **Backend**: Node.js, Express, TypeScript, Multer, `pdf-parse`, `mammoth`, MongoDB with Mongoose (with resilient in-memory fallback).
- **AI Intelligence**: NVIDIA API Catalog hosted inference (`https://integrate.api.nvidia.com/v1`, default model `nvidia/nemotron-3-super-120b-a12b`) for detailed, page-referenced judgment reports and grounded Q&A. Google Gemini (`@google/genai`) is kept as a fallback, followed by the deterministic rule-based engine.

---

## 4. Getting Started

### Prerequisites
- Node.js >= 18
- MongoDB (Optional: automatically connects if available at `mongodb://127.0.0.1:27017/nyayadrishti`, or falls back gracefully to in-memory store)

### Installation
```bash
# Clone or navigate to the project directory
cd NotUravgDEvs

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

### Running Locally

In **Terminal 1** (Backend):
```bash
cd backend
npm run dev
# Starts on http://localhost:5001
```

In **Terminal 2** (Frontend):
```bash
cd frontend
npm run dev
# Starts on http://localhost:5173
```

---

## 5. Environment Variables & AI Configuration

Create `backend/.env` (or copy from `backend/.env.example`):

```bash
PORT=5001
MONGODB_URI=mongodb://127.0.0.1:27017/nyayadrishti

# NVIDIA hosted inference (primary). Keep the key only in backend/.env.
NVIDIA_API_KEY=
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=nvidia/nemotron-3-super-120b-a12b

# Optional: Google Gemini API Key (fallback if NVIDIA is not configured or fails)
# If no AI key works, NyayaDrishti runs in deterministic Indian Legal Rule-Based Demo Mode
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
NODE_ENV=development
```

See `backend/.env.example` for optional tuning (timeouts, retries, chunk size, concurrency).

### How the NVIDIA judgment report works
1. Text is extracted **page by page** (real PDF page numbers; TXT/DOCX are split into ~400-word segments). Pages without a text layer are listed as needing OCR (OCR itself is not built in).
2. The judgment is split into page-aligned chunks; each chunk is summarised into detailed, page-referenced notes. Oversized chunks are split automatically; failed chunks are reported in the report, never silently dropped.
3. Notes are consolidated and turned into a structured plain-English report: overview, background facts, timeline, arguments of each party, issues, provisions explained simply, reasoning, final order and directions, practical meaning and limitations.
4. Each point carries the pages it came from and a short verbatim quote. The backend checks every quote against the extracted text, corrects wrong page numbers and flags anything it cannot find.
5. The final order is re-checked against the concluding pages of the original text.
6. Follow-up questions ("Ask the Judgment", `POST /api/documents/:id/ask`) use **RAG**: the first question splits the judgment into overlapping, page-aware chunks and embeds them with NVIDIA's embedding model (`NVIDIA_EMBEDDING_MODEL`, default `nvidia/nemotron-3-embed-1b`), stored in MongoDB collection `documentchunks` (in-memory if MongoDB is down). Each question is matched by meaning (embeddings) and by keywords (BM25), the best passages are sent to the NVIDIA chat model, and the answer cites pages. If embeddings fail, keyword search is used automatically. Chunks are deleted with their document and rebuilt only if the text or embedding model changes.

### Tests
```bash
cd backend
npm test             # offline tests (no API key needed)
npm run test:nvidia  # live test against NVIDIA using backend/.env (optionally: npm run test:nvidia -- path/to/judgment.pdf)
npm run test:rag     # small live check of RAG search (~3 small NVIDIA requests)
```

---

## 6. API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | System health and AI provider configuration status |
| `GET` | `/api/stats` | Dashboard metrics and case distribution |
| `GET` | `/api/samples` | List of preloaded Indian legal judgments |
| `POST` | `/api/samples/load` | Instant 1-click loading of a sample judgment |
| `POST` | `/api/documents/upload` | Multipart file upload and text extraction |
| `POST` | `/api/documents/:id/analyze`| Runs NVIDIA detailed analysis (fallback: Gemini, then deterministic extraction) |
| `POST` | `/api/documents/:id/ask` | Grounded follow-up question about one judgment (`{ "question": "..." }`) |
| `GET` | `/api/documents` | List stored court documents (with search & filters) |
| `GET` | `/api/documents/:id` | Full document record with analysis |
| `GET` | `/api/documents/:id/export?format=markdown` | Download formatted markdown case brief |
| `GET` | `/api/documents/:id/export?format=json` | Download raw structured JSON |
| `GET` | `/api/documents/:id/download` | Download original uploaded document |
| `DELETE` | `/api/documents/:id` | Permanently deletes document and record |

---

## 7. Legal Notice & Ethics

**Statutory Notice**: NyayaDrishti is an automated research and document structuring tool designed to assist legal research. It does not provide legal advice, represent parties before courts, or substitute for professional judgment by an advocate enrolled under the Advocates Act, 1961. Always inspect certified court copies.
