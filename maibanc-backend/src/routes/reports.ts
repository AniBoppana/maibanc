import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { REPORT_TYPES, runReport, type ReportType } from "../services/reportsService";

export const reportsRouter = Router();

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  accountIds: z.string().optional(),
});

/**
 * GET /api/reports/:type?from=&to=&accountIds=a,b,c
 * type is one of REPORT_TYPES. from/to are YYYY-MM-DD (either or both may
 * be omitted for an open-ended range); accountIds is a comma-separated
 * list to scope the report to specific accounts (omit for all accounts).
 */
reportsRouter.get("/:type", requireAuth, async (req, res) => {
  const type = req.params.type as ReportType;
  if (!REPORT_TYPES.includes(type)) {
    res.status(404).json({ error: `Unknown report type "${type}".`, availableTypes: REPORT_TYPES });
    return;
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { from, to, accountIds } = parsed.data;

  try {
    const result = await runReport(type, req.userId!, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      accountIds: accountIds ? accountIds.split(",").filter(Boolean) : undefined,
    });
    res.json({ type, result });
  } catch (err) {
    console.error(`Report "${type}" failed:`, err);
    res.status(500).json({ error: "Failed to generate report." });
  }
});
