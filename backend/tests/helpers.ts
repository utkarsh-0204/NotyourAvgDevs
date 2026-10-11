/** Builds a minimal valid PDF with one text block per page ('' produces a blank page). */
export function buildPdf(pageTexts: string[]): Buffer {
  const objects: string[] = [];
  const pageIds: number[] = [];
  // 1: catalog, 2: pages, 3: font, then (page, content) pairs
  const fontId = 3;
  let nextId = 4;
  const pageObjs: Array<{ id: number; contentId: number; stream: string }> = [];
  for (const text of pageTexts) {
    const lines = text.split('\n');
    const ops = lines
      .map((line, i) => `BT /F1 11 Tf 50 ${760 - i * 16} Td (${line.replace(/([()\\])/g, '\\$1')}) Tj ET`)
      .join('\n');
    const stream = text ? ops : '';
    pageObjs.push({ id: nextId, contentId: nextId + 1, stream });
    pageIds.push(nextId);
    nextId += 2;
  }

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  objects[fontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  for (const p of pageObjs) {
    objects[p.id] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${p.contentId} 0 R >>`;
    objects[p.contentId] = `<< /Length ${Buffer.byteLength(p.stream)} >>\nstream\n${p.stream}\nendstream`;
  }

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(out);
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  // Buffer.alloc gives the PDF its own memory; small Buffer.from() results share a pool that pdf.js misreads.
  const buf = Buffer.alloc(Buffer.byteLength(out, 'latin1'));
  buf.write(out, 'latin1');
  return buf;
}

/** A short, entirely fictional High Court judgment (names and numbers are invented) used as a fixture. Each array entry is one PDF page. */
export const FIXTURE_PAGES = [
  `IN THE HIGH COURT OF DELHI AT NEW DELHI
CRL.M.C. 3192/2022
Arjun Mehta ... Petitioner
VERSUS
State (NCT of Delhi) and Anr. ... Respondents
CORAM: HON'BLE MR. JUSTICE R.K. VERMA
DATE OF DECISION: 14th November 2022
1. Petition under Section 482 of the Code of Criminal Procedure seeks quashing of FIR No. 248/2021.
2. The complainant alleges that the petitioner induced it to pay Rs. 2.5 crores under a share purchase agreement dated 10 March 2020.`,
  '',
  `3. Learned counsel for the petitioner submits that the dispute is purely civil and arises from delay caused by COVID-19 disruptions.
4. Learned APP for the State submits that the investigation revealed a prima facie case of cheating.
5. Having considered the material, this Court finds that the dispute is essentially of a civil nature arising from breach of contract.
6. There is no material to show dishonest intention at the inception of the transaction.
7. In the result, the petition is allowed. FIR No. 248/2021 and all proceedings emanating therefrom are quashed.
8. The petitioner shall deposit costs of Rs. 25,000 with the Delhi High Court Legal Services Committee within four weeks.`,
];
