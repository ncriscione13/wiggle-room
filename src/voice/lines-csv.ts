// CSV parser for voice/lines.en.csv (M1.6). Minimal RFC-ish parsing: fields
// may be double-quoted to contain commas. Shared by the render tool, the
// runtime manifest and the tests -- one source of truth for line defs.

export interface LineDef {
  id: string;
  /** 1 safety/tracking · 2 timing · 3 instruction · 4 praise. */
  priority: 1 | 2 | 3 | 4;
  /** Repeat suppression for help lines (0 = none). */
  cooldownS: number;
  wordings: string[];
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line.charAt(i);
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      out.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

export function parseLinesCsv(csv: string): Map<string, LineDef> {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== '');
  const out = new Map<string, LineDef>();
  for (const [i, row] of lines.entries()) {
    if (i === 0) continue; // header
    const fields = splitCsvLine(row);
    const id = fields[0]?.trim() ?? '';
    const priority = Number(fields[1]);
    const cooldownS = Number(fields[2]);
    if (id === '' || !Number.isFinite(priority) || !Number.isFinite(cooldownS)) {
      throw new Error(`lines.csv row ${String(i + 1)}: bad id/priority/cooldown`);
    }
    if (out.has(id)) throw new Error(`lines.csv: duplicate id "${id}"`);
    const wordings = fields
      .slice(3)
      .map((w) => w.trim())
      .filter((w) => w !== '');
    out.set(id, { id, priority: priority as 1 | 2 | 3 | 4, cooldownS, wordings });
  }
  return out;
}
