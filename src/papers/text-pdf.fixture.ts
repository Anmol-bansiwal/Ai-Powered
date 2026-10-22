function escapePdf(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

export function buildTextPdf(pages: string[][]): Buffer {
  const fontObjectId = 3;
  const objects = new Map<number, string>();
  const kids: number[] = [];
  let nextId = 4;

  for (const lines of pages) {
    const pageId = nextId++;
    const contentId = nextId++;
    kids.push(pageId);
    const commands = ['BT', '/F1 12 Tf', '72 720 Td'];
    lines.forEach((line, index) => {
      if (index > 0) {
        commands.push('0 -16 Td');
      }
      commands.push(`(${escapePdf(line)}) Tj`);
    });
    commands.push('ET');
    const stream = commands.join('\n');
    objects.set(
      contentId,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    );
    objects.set(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> >>`,
    );
  }

  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(
    2,
    `<< /Type /Pages /Kids [${kids.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  );
  objects.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n')];
  const offsets = [0];
  let cursor = chunks[0].length;
  const maxId = nextId - 1;
  for (let id = 1; id <= maxId; id++) {
    const body = objects.get(id);
    if (!body) {
      throw new Error(`Missing PDF object ${id}.`);
    }
    offsets[id] = cursor;
    const object = Buffer.from(`${id} 0 obj\n${body}\nendobj\n`);
    chunks.push(object);
    cursor += object.length;
  }

  let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id++) {
    xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  chunks.push(
    Buffer.from(
      `${xref}trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF\n`,
    ),
  );
  return Buffer.concat(chunks);
}
