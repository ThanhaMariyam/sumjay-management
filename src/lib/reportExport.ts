type ExportRowValue = string | number;
const MAX_TABLE_WIDTH_CHARS = 105;
const MAX_COLUMN_WIDTH = 22;
const MIN_COLUMN_WIDTH = 4;

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdfBlob(lines: string[]): Blob {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 40;
  const lineHeight = 14;
  const startY = pageHeight - margin;
  const linesPerPage = Math.max(1, Math.floor((pageHeight - margin * 2) / lineHeight));
  const chunks: string[][] = [];

  for (let i = 0; i < lines.length; i += linesPerPage) {
    chunks.push(lines.slice(i, i + linesPerPage));
  }
  if (chunks.length === 0) {
    chunks.push(['No data']);
  }

  const objects: string[] = [];
  const addObject = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const pageObjNums: number[] = [];
  const contentObjNums: number[] = [];
  const fontObjNum = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  chunks.forEach((chunk) => {
    const textLines = chunk
      .map((line) => `(${escapePdfText(line)}) Tj\nT*`)
      .join('\n');
    const stream = `BT\n/F1 11 Tf\n${margin} ${startY} Td\n${lineHeight} TL\n${textLines}\nET`;
    const contentObjNum = addObject(
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
    contentObjNums.push(contentObjNum);
  });

  const pagesObjNum = addObject('placeholder-pages');

  contentObjNums.forEach((contentObjNum) => {
    const pageObjNum = addObject(
      `<< /Type /Page /Parent ${pagesObjNum} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> /Contents ${contentObjNum} 0 R >>`,
    );
    pageObjNums.push(pageObjNum);
  });

  objects[pagesObjNum - 1] = `<< /Type /Pages /Count ${pageObjNums.length} /Kids [${pageObjNums
    .map((n) => `${n} 0 R`)
    .join(' ')}] >>`;
  const catalogObjNum = addObject(`<< /Type /Catalog /Pages ${pagesObjNum} 0 R >>`);

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${offsets[i].toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObjNum} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}

function triggerFileDownload(blob: Blob, filename: string) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadCsvFile(rows: Record<string, ExportRowValue>[], filename: string) {
  if (rows.length === 0) {
    const emptyBlob = new Blob(['No data found for selected filter'], { type: 'text/plain;charset=utf-8;' });
    triggerFileDownload(emptyBlob, filename.replace(/\.csv$/i, '.txt'));
    return;
  }

  const headers = Object.keys(rows[0]);
  const escapeCsvValue = (value: ExportRowValue) => {
    const text = String(value ?? '');
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header] ?? '')).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  triggerFileDownload(blob, filename);
}

export function downloadPdfTable(
  rows: Record<string, ExportRowValue>[],
  filename: string,
  title: string,
  summaryLines: string[] = [],
) {
  const normalizeText = (value: ExportRowValue | undefined) =>
    String(value ?? '').replace(/\s+/g, ' ').trim();

  const fitCell = (value: string, width: number) => {
    if (value.length <= width) return value.padEnd(width, ' ');
    if (width <= 3) return value.slice(0, width);
    return `${value.slice(0, width - 3)}...`;
  };

  const buildTableLine = (headers: string[], widths: number[], row?: Record<string, ExportRowValue>) => {
    return headers
      .map((header, index) => {
        const raw = row ? normalizeText(row[header]) : header;
        return fitCell(raw, widths[index]);
      })
      .join(' | ');
  };

  const buildColumnChunks = (headers: string[], widths: number[]) => {
    const chunks: Array<{ headers: string[]; widths: number[] }> = [];
    let currentHeaders: string[] = [];
    let currentWidths: number[] = [];
    let currentSize = 0;

    headers.forEach((header, index) => {
      const width = widths[index];
      const additionalSize = width + (currentHeaders.length > 0 ? 3 : 0);
      if (currentHeaders.length > 0 && currentSize + additionalSize > MAX_TABLE_WIDTH_CHARS) {
        chunks.push({ headers: currentHeaders, widths: currentWidths });
        currentHeaders = [header];
        currentWidths = [width];
        currentSize = width;
        return;
      }
      currentHeaders.push(header);
      currentWidths.push(width);
      currentSize += additionalSize;
    });

    if (currentHeaders.length > 0) {
      chunks.push({ headers: currentHeaders, widths: currentWidths });
    }

    return chunks;
  };

  const lines: string[] = [title, ''];

  summaryLines.forEach((summary) => lines.push(summary));
  if (summaryLines.length > 0) {
    lines.push('', '----------------------------------------', '');
  }

  if (rows.length === 0) {
    lines.push('No data found for selected filter.');
    triggerFileDownload(buildPdfBlob(lines), filename);
    return;
  }

  const headers = Object.keys(rows[0]);
  const columnWidths = headers.map((header) => {
    const maxDataLength = rows.reduce((max, row) => {
      const length = normalizeText(row[header]).length;
      return Math.max(max, length);
    }, header.length);
    return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, maxDataLength));
  });
  const chunks = buildColumnChunks(headers, columnWidths);

  chunks.forEach((chunk, chunkIndex) => {
    if (chunkIndex > 0) {
      lines.push('', `Continued (${chunkIndex + 1}/${chunks.length})`, '');
    }

    const headerLine = buildTableLine(chunk.headers, chunk.widths);
    lines.push(headerLine);
    lines.push('-'.repeat(headerLine.length));

    rows.forEach((row) => {
      lines.push(buildTableLine(chunk.headers, chunk.widths, row));
    });

    lines.push('');
  });

  triggerFileDownload(buildPdfBlob(lines), filename);
}
