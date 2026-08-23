import { plaidClient } from "./plaidClient";
import { prisma } from "../db/client";

/**
 * Syncs holdings + securities for a single Plaid Item using
 * /investments/holdings/get. Items with no investment accounts return
 * an empty holdings array from Plaid — that's a normal, non-error case.
 */
export async function syncInvestmentsForItem(itemDbId: string, accessToken: string) {
  const item = await prisma.plaidItem.findUnique({
    where: { id: itemDbId },
    include: { accounts: true },
  });
  if (!item) return;

  const accountIdByPlaidId = new Map(
    item.accounts.map((a: { plaidAccountId: string; id: string }) => [a.plaidAccountId, a.id])
  );

  let resp;
  try {
    resp = await plaidClient.investmentsHoldingsGet({ access_token: accessToken });
  } catch (err: any) {
    // ITEM_PRODUCT_NOT_READY / PRODUCT_NOT_SUPPORTED means this item was
    // never linked with the Investments product. Not an error for us.
    const code = err?.response?.data?.error_code;
    if (code === "PRODUCT_NOT_READY" || code === "INVALID_PRODUCT" || code === "PRODUCTS_NOT_SUPPORTED") {
      return;
    }
    throw err;
  }

  const { securities, holdings } = resp.data;

  for (const sec of securities) {
    await prisma.security.upsert({
      where: { plaidSecurityId: sec.security_id },
      create: {
        plaidSecurityId: sec.security_id,
        tickerSymbol: sec.ticker_symbol ?? null,
        name: sec.name ?? null,
        type: sec.type ?? null,
        closePrice: sec.close_price ?? null,
        isoCurrencyCode: sec.iso_currency_code ?? "USD",
      },
      update: {
        tickerSymbol: sec.ticker_symbol ?? null,
        name: sec.name ?? null,
        type: sec.type ?? null,
        closePrice: sec.close_price ?? null,
        isoCurrencyCode: sec.iso_currency_code ?? "USD",
      },
    });
  }

  const securityDbIdByPlaidId = new Map(
    (
      await prisma.security.findMany({
        where: { plaidSecurityId: { in: securities.map((s) => s.security_id) } },
      })
    ).map((s: { plaidSecurityId: string; id: string }) => [s.plaidSecurityId, s.id])
  );

  for (const holding of holdings) {
    const accountId = accountIdByPlaidId.get(holding.account_id);
    const securityId = securityDbIdByPlaidId.get(holding.security_id);
    if (!accountId || !securityId) continue;

    await prisma.holding.upsert({
      where: { accountId_securityId: { accountId, securityId } },
      create: {
        accountId,
        securityId,
        quantity: holding.quantity,
        costBasis: holding.cost_basis ?? null,
        institutionValue: holding.institution_value,
        institutionPrice: holding.institution_price,
        isoCurrencyCode: holding.iso_currency_code ?? "USD",
      },
      update: {
        quantity: holding.quantity,
        costBasis: holding.cost_basis ?? null,
        institutionValue: holding.institution_value,
        institutionPrice: holding.institution_price,
        isoCurrencyCode: holding.iso_currency_code ?? "USD",
      },
    });
  }
}

export async function syncInvestmentsForUser(userId: string, decryptFn: (s: string) => string) {
  const items = await prisma.plaidItem.findMany({ where: { userId, status: "active" } });
  for (const item of items) {
    await syncInvestmentsForItem(item.id, decryptFn(item.accessToken));
  }
  return items.length;
}
