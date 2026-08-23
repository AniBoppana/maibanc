import { plaidClient } from "./plaidClient";
import { prisma } from "../db/client";

/**
 * Syncs transactions for a single Plaid Item using the cursor-based
 * /transactions/sync endpoint. Stores the cursor after each run so
 * subsequent syncs are fast and incremental.
 */
export async function syncTransactionsForItem(itemDbId: string, accessToken: string) {
  const item = await prisma.plaidItem.findUnique({
    where: { id: itemDbId },
    include: { accounts: true },
  });
  if (!item) return;

  const accountIdByPlaidId = new Map(
    item.accounts.map((a: { plaidAccountId: string; id: string }) => [a.plaidAccountId, a.id])
  );

  const rules = await prisma.categoryRule.findMany({ where: { userId: item.userId } });
  const matchRule = (name: string, merchantName: string | null) => {
    const haystack = `${name} ${merchantName ?? ""}`.toLowerCase();
    const hit = rules.find((r: { matchValue: string }) => haystack.includes(r.matchValue.toLowerCase()));
    return hit?.category ?? null;
  };

  let cursor: string | undefined = item.cursor ?? undefined;
  let hasMore = true;

  while (hasMore) {
    const resp = await plaidClient.transactionsSync({
      access_token: accessToken,
      cursor,
    });

    const { added, modified, removed, has_more, next_cursor } = resp.data;

    for (const txn of [...added, ...modified]) {
      const accountId = accountIdByPlaidId.get(txn.account_id);
      if (!accountId) continue;

      await prisma.transaction.upsert({
        where: { plaidTransactionId: txn.transaction_id },
        create: {
          plaidTransactionId: txn.transaction_id,
          accountId,
          amount: txn.amount,
          isoCurrencyCode: txn.iso_currency_code ?? "USD",
          date: new Date(txn.date),
          name: txn.name,
          merchantName: txn.merchant_name ?? null,
          category: txn.personal_finance_category?.primary ?? txn.category?.[0] ?? null,
          userCategory: matchRule(txn.name, txn.merchant_name ?? null),
          pending: txn.pending,
        },
        update: {
          amount: txn.amount,
          date: new Date(txn.date),
          name: txn.name,
          merchantName: txn.merchant_name ?? null,
          category: txn.personal_finance_category?.primary ?? txn.category?.[0] ?? null,
          pending: txn.pending,
        },
      });
    }

    if (removed.length > 0) {
      await prisma.transaction.deleteMany({
        where: { plaidTransactionId: { in: removed.map((r) => r.transaction_id) } },
      });
    }

    cursor = next_cursor;
    hasMore = has_more;
  }

  // Persist the cursor so the next sync is incremental
  await prisma.plaidItem.update({
    where: { id: itemDbId },
    data: { cursor },
  });
}

/**
 * Syncs every active item belonging to a user.
 * Used by the manual /api/transactions/sync endpoint and the cron job.
 */
export async function syncAllItemsForUser(userId: string, decryptFn: (s: string) => string) {
  const items = await prisma.plaidItem.findMany({ where: { userId, status: "active" } });
  for (const item of items) {
    await syncTransactionsForItem(item.id, decryptFn(item.accessToken));
  }
  return items.length;
}
