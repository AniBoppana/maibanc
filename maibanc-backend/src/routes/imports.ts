import { randomUUID } from "crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { encrypt } from "../services/encryption";
import {
  applyMapping,
  detectFormat,
  guessColumnMapping,
  parseCsvBuffer,
  parseOfxBuffer,
  parseQifBuffer,
  parseXlsxBuffer,
} from "../services/importService";

export const importsRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

/**
 * POST /api/imports/preview
 * multipart/form-data, field "file". Detects the format and parses it.
 * CSV/XLSX come back needing a column mapping (bank export column names
 * vary too much to guess blindly); OFX/QFX/QIF are unambiguous formats and
 * come back with transactions already normalized.
 */
importsRouter.post("/preview", requireAuth, upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded." });
    return;
  }

  const format = detectFormat(req.file.originalname);
  if (!format) {
    res.status(400).json({
      error: "Unsupported file type. Accepted: .csv, .xlsx, .xls, .ofx, .qfx, .qif",
    });
    return;
  }

  try {
    if (format === "csv") {
      const { headers, rows } = parseCsvBuffer(req.file.buffer);
      res.json({ format, needsMapping: true, headers, rows, suggestedMapping: guessColumnMapping(headers) });
      return;
    }
    if (format === "xlsx") {
      const { headers, rows } = await parseXlsxBuffer(req.file.buffer);
      res.json({ format, needsMapping: true, headers, rows, suggestedMapping: guessColumnMapping(headers) });
      return;
    }
    if (format === "ofx") {
      const transactions = parseOfxBuffer(req.file.buffer);
      res.json({ format, needsMapping: false, transactions });
      return;
    }
    const transactions = parseQifBuffer(req.file.buffer);
    res.json({ format, needsMapping: false, transactions });
  } catch (err) {
    console.error("Import preview failed:", err);
    res.status(400).json({ error: "Could not parse this file. Check that it's a valid export from your bank." });
  }
});

const mappingSchema = z.object({
  date: z.string().nullable(),
  name: z.string().nullable(),
  amount: z.string().nullable(),
  debit: z.string().nullable(),
  credit: z.string().nullable(),
});

const commitSchema = z.object({
  accountId: z.string().optional(),
  newAccount: z
    .object({
      name: z.string().min(1).max(80),
      type: z.enum(["depository", "credit"]),
      isBusiness: z.boolean().optional(),
    })
    .optional(),
  // Either raw rows + mapping (CSV/XLSX path) or already-normalized transactions (OFX/QIF path).
  rows: z.array(z.record(z.string(), z.string())).optional(),
  mapping: mappingSchema.optional(),
  flipSign: z.boolean().optional(),
  transactions: z.array(z.object({ date: z.string(), name: z.string(), amount: z.number() })).optional(),
  applyTaxCategory: z.string().nullable().optional(),
});

/** Every manually-imported account hangs off one placeholder "item" per user — see services/importService.ts header note. */
async function ensureManualItem(userId: string) {
  const existing = await prisma.plaidItem.findUnique({ where: { plaidItemId: `manual-${userId}` } });
  if (existing) return existing;
  return prisma.plaidItem.create({
    data: {
      userId,
      plaidItemId: `manual-${userId}`,
      accessToken: encrypt("manual-import-placeholder"),
      institutionName: "Manually Imported",
      // Deliberately not "active": excludes this item from every Plaid sync
      // loop (transactions, investments), which all filter on status ===
      // "active" — there's no real access token here to sync with.
      status: "manual",
    },
  });
}

importsRouter.post("/commit", requireAuth, async (req, res) => {
  const parsed = commitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { accountId, newAccount, rows, mapping, flipSign, applyTaxCategory } = parsed.data;
  let { transactions } = parsed.data;

  if (!transactions && rows && mapping) {
    transactions = applyMapping(rows, mapping, flipSign);
  }
  if (!transactions || transactions.length === 0) {
    res.status(400).json({ error: "No transactions to import." });
    return;
  }
  if (!accountId && !newAccount) {
    res.status(400).json({ error: "Provide an accountId or newAccount." });
    return;
  }

  let targetAccountId = accountId;

  if (!targetAccountId && newAccount) {
    const item = await ensureManualItem(req.userId!);
    const account = await prisma.account.create({
      data: {
        plaidAccountId: `manual-${randomUUID()}`,
        itemId: item.id,
        name: newAccount.name,
        type: newAccount.type,
        isBusiness: newAccount.isBusiness ?? false,
      },
    });
    targetAccountId = account.id;
  } else if (targetAccountId) {
    const account = await prisma.account.findFirst({
      where: { id: targetAccountId, item: { userId: req.userId! } },
    });
    if (!account) {
      res.status(404).json({ error: "Target account not found." });
      return;
    }
  }

  const created = await prisma.transaction.createMany({
    data: transactions.map((t) => ({
      plaidTransactionId: `manual-${randomUUID()}`,
      accountId: targetAccountId!,
      amount: t.amount,
      date: new Date(t.date),
      name: t.name,
      taxCategory: applyTaxCategory || null,
      pending: false,
    })),
  });

  res.status(201).json({ accountId: targetAccountId, imported: created.count });
});
