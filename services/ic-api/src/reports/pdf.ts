import PDFDocument from 'pdfkit';
import { INSTACOM_LOGO_PNG } from './logo';

// Instacom corporate palette.
const NAVY = '#16237d';
const SKY = '#1ca9e0';
const GOLD = '#c98a2e';
const INK = '#14213a';
const MUTED = '#586781';
const LINE = '#dde7f1';
const ROW_ALT = '#f5f9fd';
const TINT = '#f6fafe';

export interface PdfColumn {
  key: string;
  label: string;
  weight: number; // proportional column width
  align?: 'left' | 'right';
  money?: boolean;
}
export interface PdfMeta {
  title: string;
  periodFrom: string;
  periodTo: string;
  generatedAt: string;
  scope: string;
}
export interface PdfSummaryItem { label: string; value: string }

/** Integer ngwee string → grouped major.minor (no currency prefix). */
export function formatZmw(ngwee: string | null | undefined): string {
  if (ngwee === null || ngwee === undefined || ngwee === '') return '-';
  const raw = String(ngwee);
  const neg = raw.startsWith('-');
  const digits = (neg ? raw.slice(1) : raw).padStart(3, '0');
  const major = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${major}.${digits.slice(-2)}`;
}

export function buildReportPdf(
  meta: PdfMeta,
  columns: PdfColumn[],
  rows: Array<Record<string, string | null>>,
  summary: PdfSummaryItem[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const contentW = right - left;

    // ── Header: logo + title block ──
    try {
      doc.image(Buffer.from(INSTACOM_LOGO_PNG, 'base64'), left, 30, { width: 150 });
    } catch { /* logo optional */ }
    doc.font('Helvetica-Bold').fontSize(18).fillColor(NAVY).text(meta.title, left, 32, { width: contentW, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
      .text(`Period:  ${meta.periodFrom}  to  ${meta.periodTo}`, { width: contentW, align: 'right' })
      .text(`Scope:  ${meta.scope}`, { width: contentW, align: 'right' })
      .text(`Generated:  ${meta.generatedAt}`, { width: contentW, align: 'right' });

    let y = 92;
    doc.rect(left, y, contentW, 3).fill(SKY);
    doc.rect(left, y, 130, 3).fill(GOLD);
    y += 18;

    // ── Summary cards ──
    if (summary.length > 0) {
      const gap = 10;
      const boxW = (contentW - gap * (summary.length - 1)) / summary.length;
      const boxH = 42;
      summary.forEach((s, i) => {
        const x = left + i * (boxW + gap);
        doc.roundedRect(x, y, boxW, boxH, 6).fillAndStroke(TINT, LINE);
        doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
          .text(s.label.toUpperCase(), x + 10, y + 9, { width: boxW - 20, characterSpacing: 0.5, lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY)
          .text(s.value, x + 10, y + 21, { width: boxW - 20, lineBreak: false });
      });
      y += boxH + 18;
    }

    // ── Table ──
    const totalWeight = columns.reduce((a, c) => a + c.weight, 0);
    const colW = columns.map((c) => (c.weight / totalWeight) * contentW);
    const colX: number[] = [];
    let acc = left;
    columns.forEach((_, i) => { colX[i] = acc; acc += colW[i]; });

    const headerH = 22;
    const rowH = 18;
    const bottom = doc.page.height - doc.page.margins.bottom - 26;

    const drawHeader = (): void => {
      doc.rect(left, y, contentW, headerH).fill(NAVY);
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
      columns.forEach((c, i) => {
        doc.text(c.label.toUpperCase(), colX[i] + 6, y + 7, {
          width: colW[i] - 12, align: c.align ?? 'left', characterSpacing: 0.3, lineBreak: false,
        });
      });
      y += headerH;
    };

    drawHeader();
    rows.forEach((row, idx) => {
      if (y + rowH > bottom) {
        doc.addPage();
        y = doc.page.margins.top;
        drawHeader();
      }
      if (idx % 2 === 1) doc.rect(left, y, contentW, rowH).fill(ROW_ALT);
      doc.font('Helvetica').fontSize(8).fillColor(INK);
      columns.forEach((c, i) => {
        const raw = row[c.key];
        const val = c.money ? formatZmw(raw) : raw == null || raw === '' ? '—' : String(raw);
        doc.text(val, colX[i] + 6, y + 5, {
          width: colW[i] - 12, align: c.align ?? 'left', lineBreak: false, ellipsis: true,
        });
      });
      y += rowH;
    });
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(LINE).stroke();
    if (rows.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED)
        .text('No records in this period.', left, y + 12, { width: contentW, align: 'center' });
    }

    // ── Footer on every page ──
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const fy = doc.page.height - doc.page.margins.bottom - 8;
      doc.moveTo(left, fy - 6).lineTo(right, fy - 6).lineWidth(0.5).strokeColor(LINE).stroke();
      doc.font('Helvetica').fontSize(7.5).fillColor(MUTED);
      doc.text('Instacom Payment Solutions Limited · Lusaka, Zambia · Confidential', left, fy, {
        width: contentW / 2, align: 'left', lineBreak: false,
      });
      doc.text(`Page ${i + 1} of ${range.count}`, left + contentW / 2, fy, {
        width: contentW / 2, align: 'right', lineBreak: false,
      });
    }

    doc.end();
  });
}
