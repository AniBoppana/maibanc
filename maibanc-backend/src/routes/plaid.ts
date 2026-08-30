import { Router } from "express";
import { CountryCode, Products } from "plaid";
import { plaidClient } from "../services/plaidClient";
import { encrypt, decrypt } from "../services/encryption";
import { prisma } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { syncTransactionsForItem } from "../services/transactionSync";
import { syncInvestmentsForItem } from "../services/investmentsSync";
import { verifyPlaidWebhook } from "../services/plaidWebhookVerify";


export const plaidRouter = Router();

/**
 * POST /api/plaid/link-token
 * Creates a Link token so the client can open Plaid Link.
 */
plaidRouter.post("/link-token", requireAuth, async (req, res) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: req.userId! },
      client_name: process.env.PLAID_CLIENT_NAME ?? "Personal Finance App",
      products: [Products.Transactions, Products.Investments],
      country_codes: [CountryCode.Us],
      language: "en",
      webhook: process.env.PLAID_WEBHOOK_URL || undefined,
      // Required for OAuth institutions (Fidelity, many large brokerages):
      // Plaid navigates the whole tab to the bank's login page, then back to
      // this exact URL. Must also be registered in the Plaid Dashboard under
      // Team Settings -> API -> Allowed redirect URIs.
      redirect_uri: process.env.PLAID_REDIRECT_URI || undefined,
    });
    res.json({ linkToken: response.data.link_token });
  } catch (err: any) {
    console.error("link-token error:", err?.response?.data ?? err);
    res.status(500).json({ error: "Failed to create link token." });
  }
});

/**
 * POST /api/plaid/link-token/update
 * Creates a Link token in "update mode" for an item that needs
 * re-authentication (e.g. a bank forced a re-login). Reuses the item's
 * existing access token instead of creating a new connection, so accounts,
 * transaction history, and IDs stay the same after the user reconnects.
 */
plaidRouter.post("/link-token/update", requireAuth, async (req, res) => {
  const { itemId } = req.body as { itemId?: string };
  if (!itemId) {
    res.status(400).json({ error: "itemId is required." });
    return;
  }

  const item = await prisma.plaidItem.findFirst({ where: { id: itemId, userId: req.userId! } });
  if (!item) {
    res.status(404).json({ error: "Item not found." });
    return;
  }

  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: req.userId! },
      client_name: process.env.PLAID_CLIENT_NAME ?? "Personal Finance App",
      country_codes: [CountryCode.Us],
      language: "en",
      access_token: decrypt(item.accessToken),
      webhook: process.env.PLAID_WEBHOOK_URL || undefined,
      redirect_uri: process.env.PLAID_REDIRECT_URI || undefined,
    });
    res.json({ linkToken: response.data.link_token });
  } catch (err: any) {
    console.error("link-token update error:", err?.response?.data ?? err);
    res.status(500).json({ error: "Failed to create update link token." });
  }
});

/**
 * POST /api/plaid/exchange-public-token
 * Body: { publicToken: string }
 * Exchanges the short-lived public token from Plaid Link for a permanent
 * access token, stores it encrypted, syncs accounts and initial transactions.
 */
plaidRouter.post("/exchange-public-token", requireAuth, async (req, res) => {
  const { publicToken } = req.body as { publicToken?: string };
  if (!publicToken) {
    res.status(400).json({ error: "publicToken is required." });
    return;
  }

  try {
    const exchange = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = exchange.data.access_token;
    const plaidItemId = exchange.data.item_id;

    const itemInfo = await plaidClient.itemGet({ access_token: accessToken });
    const institutionId = itemInfo.data.item.institution_id ?? null;

    let institutionName: string | null = null;
    if (institutionId) {
      const inst = await plaidClient.institutionsGetById({
        institution_id: institutionId,
        country_codes: [CountryCode.Us],
      });
      institutionName = inst.data.institution.name;
    }

    const item = await prisma.plaidItem.create({
      data: {
        userId: req.userId!,
        plaidItemId,
        accessToken: encrypt(accessToken),
        institutionId,
        institutionName,
      },
    });

    const accountsResp = await plaidClient.accountsGet({ access_token: accessToken });
    await Promise.all(
      accountsResp.data.accounts.map((acct) =>
        prisma.account.create({
          data: {
            plaidAccountId: acct.account_id,
            itemId: item.id,
            name: acct.name,
            officialName: acct.official_name ?? null,
            type: acct.type,
            subtype: acct.subtype ?? null,
            mask: acct.mask ?? null,
            currentBalance: acct.balances.current ?? null,
            availableBalance: acct.balances.available ?? null,
            isoCurrencyCode: acct.balances.iso_currency_code ?? "USD",
          },
        })
      )
    );

    // A freshly linked real (non-sandbox) institution often hasn't finished
    // Plaid's own background historical pull yet — /transactions/sync can
    // legitimately come back empty or with PRODUCT_NOT_READY at this exact
    // moment. That's not a failure to link the account (already created
    // above), just a "not ready yet": the SYNC_UPDATES_AVAILABLE webhook (or
    // the manual Sync button) picks up the rest once Plaid finishes. Letting
    // this throw here would 500 the whole response despite the account
    // having linked successfully.
    try {
      await syncTransactionsForItem(item.id, accessToken);
    } catch (err: any) {
      console.error(`Initial transaction sync failed for item ${item.id}:`, err?.response?.data ?? err);
    }
    try {
      await syncInvestmentsForItem(item.id, accessToken);
    } catch (err: any) {
      console.error(`Initial investments sync failed for item ${item.id}:`, err?.response?.data ?? err);
    }

    res.json({
      itemId: item.id,
      institutionName,
      accountCount: accountsResp.data.accounts.length,
    });
  } catch (err: any) {
    console.error("exchange-public-token error:", err?.response?.data ?? err);
    res.status(500).json({ error: "Failed to exchange public token." });
  }
});

/**
 * GET /api/plaid/items
 * Lists all connected bank items for the signed-in user.
 */
plaidRouter.get("/items", requireAuth, async (req, res) => {
  const items = await prisma.plaidItem.findMany({
    where: { userId: req.userId! },
    select: {
      id: true,
      institutionName: true,
      institutionId: true,
      status: true,
      errorCode: true,
      createdAt: true,
      accounts: {
        select: {
          id: true,
          name: true,
          nickname: true,
          type: true,
          mask: true,
          currentBalance: true,
          isBusiness: true,
        },
      },
    },
  });
  res.json({ items });
});

/**
 * DELETE /api/plaid/items/:id
 * Disconnects a bank by removing the item and revoking the Plaid access token.
 */
plaidRouter.delete("/items/:id", requireAuth, async (req, res) => {
  const item = await prisma.plaidItem.findUnique({ where: { id: req.params.id } });
  if (!item || item.userId !== req.userId) {
    res.status(404).json({ error: "Item not found." });
    return;
  }
  try {
    await plaidClient.itemRemove({ access_token: decrypt(item.accessToken) });
  } catch {
    // Proceed with local deletion even if Plaid revocation fails
  }
  await prisma.plaidItem.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

/**
 * POST /api/plaid/items/:id/reconnected
 * Called by the client right after Plaid Link's update-mode flow reports
 * success, to clear the item's error state immediately rather than waiting
 * on the next webhook.
 */
plaidRouter.post("/items/:id/reconnected", requireAuth, async (req, res) => {
  const item = await prisma.plaidItem.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!item) {
    res.status(404).json({ error: "Item not found." });
    return;
  }
  await prisma.plaidItem.update({
    where: { id: item.id },
    data: { status: "active", errorCode: null },
  });
  res.status(204).send();
});

/**
 * POST /api/plaid/webhook
 * Plaid calls this when new transaction data is ready or an item errors.
 * Verifies Plaid's signature (Plaid-Verification header) before trusting
 * the payload — see services/plaidWebhookVerify.ts.
 */
plaidRouter.post("/webhook", async (req, res) => {
  const verified = await verifyPlaidWebhook(req.header("Plaid-Verification"), req.rawBody);
  if (!verified) {
    res.status(401).json({ error: "Invalid webhook signature." });
    return;
  }

  const { webhook_type, webhook_code, item_id, error } = req.body ?? {};

  try {
    if (
      webhook_type === "TRANSACTIONS" &&
      (webhook_code === "SYNC_UPDATES_AVAILABLE" || webhook_code === "DEFAULT_UPDATE")
    ) {
      const item = await prisma.plaidItem.findUnique({ where: { plaidItemId: item_id } });
      if (item) {
        const accessToken = decrypt(item.accessToken);
        await syncTransactionsForItem(item.id, accessToken);
      }
    }

    if (webhook_type === "ITEM" && webhook_code === "ERROR") {
      await prisma.plaidItem.updateMany({
        where: { plaidItemId: item_id },
        data: { status: "error", errorCode: error?.error_code ?? null },
      });
    }

    if (webhook_type === "ITEM" && webhook_code === "PENDING_EXPIRATION") {
      await prisma.plaidItem.updateMany({
        where: { plaidItemId: item_id },
        data: { status: "expiring" },
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook handling error:", err);
    res.sendStatus(200); // Always ack — log and fix rather than trigger retries
  }
});
