export type TextRun = {
  str: string;
  x: number;
  y: number;
  fontSize: number;
  hasEOL: boolean;
};

export type PageLine = {
  text: string;
  top: number;
  bottom: number;
};

const SCRIPT_TOKEN = /^[-−–+]?\d{1,4}$/;

// Raised or lowered numbers in the PDF text layer are separate runs.
// This records them as 10^{8} or r_{1}. It does not recover marks that were
// never present as text. Line boxes use the same text so a figure can be
// placed by vertical position without changing the question wording.
export function assemblePageText(items: TextRun[]): string {
  return assemblePageLayout(items).text;
}

export function assemblePageLayout(items: TextRun[]): {
  text: string;
  lines: PageLine[];
} {
  let text = '';
  let base: TextRun | null = null;
  let line = '';
  let top: number | null = null;
  let bottom: number | null = null;
  const lines: PageLine[] = [];

  const remember = (item: TextRun) => {
    const itemTop = item.y + Math.max(item.fontSize, 0);
    const itemBottom = item.y;
    top = top === null ? itemTop : Math.max(top, itemTop);
    bottom = bottom === null ? itemBottom : Math.min(bottom, itemBottom);
  };

  const closeLine = () => {
    const trimmed = line.trim();
    if (trimmed.length > 0 && top !== null && bottom !== null) {
      lines.push({ text: trimmed, top, bottom });
    }
    line = '';
    top = null;
    bottom = null;
  };

  const append = (value: string, item: TextRun) => {
    text += value;
    line += value;
    remember(item);
  };

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.str.trim() === '') {
      if (!nextContentIsScript(items, index, base)) {
        text += item.str;
        line += item.str;
      }
      if (item.hasEOL) {
        text += '\n';
        closeLine();
        base = null;
      }
      continue;
    }

    const token = item.str.trim();
    if (base && SCRIPT_TOKEN.test(token) && isSuperscript(item, base)) {
      append(`^{${token}}`, item);
    } else if (base && SCRIPT_TOKEN.test(token) && isSubscript(item, base)) {
      append(`_{${token}}`, item);
    } else {
      append(item.str, item);
      base = item;
    }

    if (item.hasEOL) {
      text += '\n';
      closeLine();
      base = null;
    }
  }

  closeLine();
  return { text, lines };
}

function isSuperscript(item: TextRun, base: TextRun): boolean {
  if (item.fontSize > base.fontSize * 0.85) {
    return false;
  }
  const rise = item.y - base.y;
  return rise > base.fontSize * 0.12 && rise < base.fontSize * 0.8;
}

function isSubscript(item: TextRun, base: TextRun): boolean {
  if (item.fontSize > base.fontSize * 0.85) {
    return false;
  }
  const drop = base.y - item.y;
  return drop > base.fontSize * 0.08 && drop < base.fontSize * 0.8;
}

function nextContentIsScript(
  items: TextRun[],
  index: number,
  base: TextRun | null,
): boolean {
  if (!base) {
    return false;
  }
  for (let cursor = index + 1; cursor < items.length; cursor += 1) {
    const candidate = items[cursor];
    if (candidate.str.trim() === '') {
      continue;
    }
    return (
      SCRIPT_TOKEN.test(candidate.str.trim()) &&
      (isSuperscript(candidate, base) || isSubscript(candidate, base))
    );
  }
  return false;
}
