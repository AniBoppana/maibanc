import { parse as parseCsvSync } from "csv-parse/sync";
import ExcelJS from "exceljs";

export type RawRow = Record<string, string>;
export type ParsedTransaction = { date: string; name: string; amount: number };

export type PreviewResult =
  | { format: "csv" | "xlsx"; needsMapping: true; headers: string[]; rows: RawRow[]; suggestedMapping: ColumnMapping }
  | { format: "ofx" | "qif"; needsMapping: false; transactions: ParsedTransaction[] };

export type ColumnMapping = {
  date: string | null;
  name: string | null;
  // Either `amount` (a single signed column) or both `debit`/`credit` are used, never both schemes at once.
  amount: string | null;
  debit: string | null;
  credit: string | null;
};

const DATE_ALIASES = ["date", "transaction date", "posted date", "posting date", "trans date"];
const NAME_ALIASES = ["description", "name", "payee", "merchant", "transaction", "details", "memo"];
const AMOUNT_ALIASES = ["amount", "transaction amount", "net amount"];
const DEBIT_ALIASES = ["debit", "withdrawal", "withdrawals", "money out", "debit amount"];
const CREDIT_ALIASES = ["credit", "deposit", "deposits", "money in", "credit amount"];

function findColumn(headers: string[], aliases: string[]): string | null {
  const normalized = headers.map((h) => ({ raw: h, clean: h.trim().toLowerCase() }));
  for (const alias of aliases) {
    const hit = normalized.find((h) => h.clean === alias);
    if (hit) return hit.raw;
  }
  for (const alias of aliases) {
    const hit = normalized.find((h) => h.clean.includes(alias));
    if (hit) return hit.raw;
  }
  return null;
}

export function guessColumnMapping(headers: string[]): ColumnMapping {
  return {
    date: findColumn(headers, DATE_ALIASES),
    name: findColumn(headers, NAME_ALIASES),
    amount: findColumn(headers, AMOUNT_ALIASES),
    debit: findColumn(headers, DEBIT_ALIASES),
    credit: findColumn(headers, CREDIT_ALIASES),
  };
}

export function detectFormat(filename: string): "csv" | "xlsx" | "ofx" | "qif" | null {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "csv") return "csv";
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  if (ext === "ofx" || ext === "qfx") return "ofx";
  if (ext === "qif") return "qif";
  return null;
}

export function parseCsvBuffer(buffer: Buffer): { headers: string[]; rows: RawRow[] } {
  const records: RawRow[] = parseCsvSync(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
  const headers = records.length > 0 ? Object.keys(records[0]) : [];
  return { headers, rows: records };
}

export async function parseXlsxBuffer(buffer: Buffer): Promise<{ headers: string[]; rows: RawRow[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? `Column ${colNumber}`).trim();
  });

  const rows: RawRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: RawRow = {};
    let hasValue = false;
    headers.forEach((header, i) => {
      const cell = row.getCell(i + 1);
      let value = cell.value;
      if (value instanceof Date) value = value.toISOString().slice(0, 10);
      else if (value && typeof value === "object" && "result" in (value as any)) value = (value as any).result;
      const str = value == null ? "" : String(value).trim();
      if (str) hasValue = true;
      obj[header] = str;
    });
    if (hasValue) rows.push(obj);
  });

  return { headers, rows };
}

/**
 * OFX/QFX: tag-value SGML (OFX 1.x, often no closing tags) or XML (OFX 2.x) —
 * either way, matching "<TAG>value up to the next tag or line end" handles
 * both. Sign convention: OFX's TRNAMT is negative for money out, positive
 * for money in — the opposite of this app's internal convention (positive
 * = spend), so it's flipped here at the parse boundary.
 */
export function parseOfxBuffer(buffer: Buffer): ParsedTransaction[] {
  const text = buffer.toString("utf8");
  const blocks = text.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi) ?? [];
  const transactions: ParsedTransaction[] = [];

  for (const block of blocks) {
    const field = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}>([^<\r\n]*)`, "i"));
      return m ? m[1].trim() : null;
    };

    const dtposted = field("DTPOSTED");
    const trnamt = field("TRNAMT");
    const name = field("NAME") ?? field("PAYEE") ?? field("MEMO") ?? "Imported transaction";
    if (!dtposted || !trnamt) continue;

    const year = dtposted.slice(0, 4);
    const month = dtposted.slice(4, 6);
    const day = dtposted.slice(6, 8);
    const rawAmount = parseFloat(trnamt);
    if (Number.isNaN(rawAmount)) continue;

    transactions.push({ date: `${year}-${month}-${day}`, name, amount: -rawAmount });
  }

  return transactions;
}

/**
 * QIF: line-based, one field per line, records separated by a line
 * containing only "^". D=date, T/U=amount, P=payee, M=memo. Same sign flip
 * as OFX — QIF also records money out as negative.
 */
export function parseQifBuffer(buffer: Buffer): ParsedTransaction[] {
  const lines = buffer.toString("utf8").split(/\r?\n/);
  const transactions: ParsedTransaction[] = [];
  let current: { date?: string; amount?: number; payee?: string; memo?: string } = {};

  for (const line of lines) {
    if (!line) continue;
    const code = line[0];
    const value = line.slice(1).trim();
    if (code === "^") {
      if (current.date && current.amount != null) {
        transactions.push({
          date: current.date,
          name: current.payee || current.memo || "Imported transaction",
          amount: -current.amount,
        });
      }
      current = {};
      continue;
    }
    if (code === "D") {
      const parsed = new Date(value);
      current.date = Number.isNaN(parsed.getTime()) ? value : parsed.toISOString().slice(0, 10);
    } else if (code === "T" || code === "U") {
      current.amount = parseFloat(value.replace(/,/g, ""));
    } else if (code === "P") {
      current.payee = value;
    } else if (code === "M") {
      current.memo = value;
    }
  }

  return transactions;
}

/**
 * Applies a confirmed column mapping to raw rows, normalizing to
 * {date, name, amount}. Debit/credit columns are unambiguous (debit -
 * credit always matches this app's positive-means-spend convention), but a
 * single signed-amount column's convention varies by bank — many export
 * negative-for-spend (a checkbook-register feel), the opposite of Plaid's
 * convention used internally here. `flipSign` lets the caller correct for
 * that after checking the preview rather than silently guessing.
 */
export function applyMapping(rows: RawRow[], mapping: ColumnMapping, flipSign = false): ParsedTransaction[] {
  const result: ParsedTransaction[] = [];
  for (const row of rows) {
    const rawDate = mapping.date ? row[mapping.date] : null;
    const name = mapping.name ? row[mapping.name] : null;
    if (!rawDate || !name) continue;

    let amount: number | null = null;
    if (mapping.amount) {
      const v = parseFloat(String(row[mapping.amount]).replace(/[$,]/g, ""));
      if (!Number.isNaN(v)) amount = flipSign ? -v : v;
    } else if (mapping.debit || mapping.credit) {
      const debit = mapping.debit ? parseFloat(String(row[mapping.debit] ?? "0").replace(/[$,]/g, "")) || 0 : 0;
      const credit = mapping.credit ? parseFloat(String(row[mapping.credit] ?? "0").replace(/[$,]/g, "")) || 0 : 0;
      amount = debit - credit;
    }
    if (amount == null) continue;

    const parsedDate = new Date(rawDate);
    const dateStr = Number.isNaN(parsedDate.getTime()) ? rawDate : parsedDate.toISOString().slice(0, 10);

    result.push({ date: dateStr, name, amount });
  }
  return result;
}
