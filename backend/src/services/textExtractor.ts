import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';

export interface PageText {
  page: number;
  text: string;
}

/**
 * 'pdf' means page numbers are the real PDF page numbers.
 * 'segment' means the source had no pages (TXT/DOCX), so the text was split into ~400-word segments.
 */
export type PageSource = 'pdf' | 'segment';

export interface ExtractionResult {
  text: string;
  pages: PageText[];
  pageSource: PageSource;
  emptyPages: number[];
  pageCount: number;
  isScannedPdf: boolean;
  ocrRequired: boolean;
  charCount: number;
  wordCount: number;
}

// A page with fewer characters than this is treated as blank or image-only (scanned).
const MIN_PAGE_CHARS = 25;
const WORDS_PER_SEGMENT = 400;

export class TextExtractor {
  public static async extract(filePath: string, mimeType: string): Promise<ExtractionResult> {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.txt' || mimeType.includes('text/plain')) {
      return this.extractFromTxt(filePath);
    } else if (ext === '.docx' || mimeType.includes('wordprocessingml')) {
      return this.extractFromDocx(filePath);
    } else if (ext === '.pdf' || mimeType.includes('pdf')) {
      return this.extractFromPdf(filePath);
    } else {
      throw new Error(`Unsupported file type: ${ext || mimeType}. Supported types are PDF, DOCX, and TXT.`);
    }
  }

  /**
   * Splits page-less text into ~400-word segments on line boundaries so that
   * references can still point to a stable location in the source.
   */
  public static segmentText(text: string): PageText[] {
    const lines = text.split('\n');
    const pages: PageText[] = [];
    let current: string[] = [];
    let words = 0;

    for (const line of lines) {
      current.push(line);
      words += line.split(/\s+/).filter(Boolean).length;
      if (words >= WORDS_PER_SEGMENT) {
        pages.push({ page: pages.length + 1, text: current.join('\n').trim() });
        current = [];
        words = 0;
      }
    }
    if (current.join('').trim().length > 0 || pages.length === 0) {
      pages.push({ page: pages.length + 1, text: current.join('\n').trim() });
    }
    return pages;
  }

  private static fromPlainText(text: string): ExtractionResult {
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const pages = this.segmentText(text);
    return {
      text,
      pages,
      pageSource: 'segment',
      emptyPages: [],
      pageCount: Math.max(1, Math.ceil(wordCount / WORDS_PER_SEGMENT)),
      isScannedPdf: false,
      ocrRequired: false,
      charCount: text.length,
      wordCount,
    };
  }

  private static async extractFromTxt(filePath: string): Promise<ExtractionResult> {
    const buffer = await fs.promises.readFile(filePath);
    return this.fromPlainText(buffer.toString('utf-8').trim());
  }

  private static async extractFromDocx(filePath: string): Promise<ExtractionResult> {
    const buffer = await fs.promises.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return this.fromPlainText(result.value.trim());
  }

  private static async extractFromPdf(filePath: string): Promise<ExtractionResult> {
    const buffer = await fs.promises.readFile(filePath);
    // @ts-ignore
    const pdfModule = await import('pdf-parse');
    const pdfParse = pdfModule.default || pdfModule;

    // Capture each page's text separately so page numbers can be cited later.
    // This mirrors pdf-parse's default page renderer.
    const pageTexts = new Map<number, string>();
    const pagerender = async (pageData: any): Promise<string> => {
      const textContent = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
      let lastY: number | undefined;
      let text = '';
      for (const item of textContent.items) {
        if (lastY === item.transform[5] || !lastY) {
          text += item.str;
        } else {
          text += '\n' + item.str;
        }
        lastY = item.transform[5];
      }
      pageTexts.set((pageData.pageIndex ?? pageTexts.size) + 1, text);
      return text;
    };

    // Pass a plain Uint8Array: when pdf-parse is loaded via import(), its bundled pdf.js
    // misreads Node Buffers and fails with "bad XRef entry" on every PDF.
    const data = await pdfParse(new Uint8Array(buffer) as unknown as Buffer, { pagerender });
    const rawText = (data.text || '').trim();
    const pageCount = data.numpages || 1;
    const wordCount = rawText.split(/\s+/).filter(Boolean).length;
    const charCount = rawText.length;

    const pages: PageText[] = [];
    const emptyPages: number[] = [];
    for (let p = 1; p <= pageCount; p++) {
      const text = (pageTexts.get(p) || '').trim();
      pages.push({ page: p, text });
      if (text.replace(/\s+/g, '').length < MIN_PAGE_CHARS) emptyPages.push(p);
    }

    // Whole document is treated as scanned if there is essentially no text layer at all.
    const isScanned = charCount < 60 || wordCount < 15;

    return {
      text: rawText,
      pages,
      pageSource: 'pdf',
      emptyPages,
      pageCount,
      isScannedPdf: isScanned,
      ocrRequired: isScanned,
      charCount,
      wordCount,
    };
  }
}
