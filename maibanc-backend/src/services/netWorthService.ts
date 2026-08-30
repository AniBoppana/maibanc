import { prisma } from "../db/client";

const DAY_MS = 24 * 60 * 60 * 1000;
const ASSET_TYPES = ["depository", "investment"];
const LIABILITY_TYPES = ["credit", "loan"];

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Records today's real balance for every account of a user. Idempotent per day. */
export async function takeDailySnapshot(userId: string) {
  const accounts = await prisma.account.findMany({ where: { item: { userId } } });
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  await Promise.all(
    accounts.map((a: { id: string; currentBalance: number | null }) =>
      a.currentBalance == null
        ? Promise.resolve()
        : prisma.balanceSnapshot.upsert({
            where: { accountId_date: { accountId: a.id, date: today } },
            create: { accountId: a.id, date: today, balance: a.currentBalance },
            update: { balance: a.currentBalance },
          })
    )
  );
}

/**
 * Reconstructs a daily net-worth series for the trailing `days` days.
 * Days with a real BalanceSnapshot use it; earlier days are reconstructed
 * by walking each account's current balance backward through its real
 * transaction history (exact for depository/credit accounts driven purely
 * by transactions, approximate for investment accounts whose value also
 * moves with market price).
 */
export async function getNetWorthHistory(userId: string, days = 365) {
  const accounts = await prisma.account.findMany({
    where: { item: { userId } },
    include: { snapshots: true },
  });

  const windowStart = new Date();
  windowStart.setUTCHours(0, 0, 0, 0);
  windowStart.setUTCDate(windowStart.getUTCDate() - days);

  const transactions = await prisma.transaction.findMany({
    where: { account: { item: { userId } }, date: { gte: windowStart } },
    select: { accountId: true, amount: true, date: true },
  });

  const txnsByAccount = new Map<string, { amount: number; date: Date }[]>();
  for (const t of transactions) {
    if (!txnsByAccount.has(t.accountId)) txnsByAccount.set(t.accountId, []);
    txnsByAccount.get(t.accountId)!.push(t);
  }

  // Per-account daily balance series, end of day, oldest first.
  const perAccountSeries = new Map<string, Map<string, number>>();
  // The earliest day per account for which its balance is grounded in a
  // real *transaction* (not merely a snapshot) — used below to decide how
  // far back the combined total can honestly be shown. Snapshots don't
  // count for this: every account gets one from whenever the daily
  // snapshot job first ran, which says nothing about how far into the
  // past that account's balance is actually known.
  const earliestGroundedByAccount = new Map<string, string>();

  for (const account of accounts) {
    const series = new Map<string, number>();
    const snapshotByDay = new Map<string, number>(
      account.snapshots.map((s: { date: Date; balance: number }) => [dateKey(s.date), s.balance])
    );
    const txnByDay = new Map<string, number>();
    for (const t of txnsByAccount.get(account.id) ?? []) {
      const key = dateKey(t.date);
      txnByDay.set(key, (txnByDay.get(key) ?? 0) + t.amount);
    }

    let running = account.currentBalance ?? 0;
    let earliestTxnGrounded: string | null = null;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    for (let d = new Date(today); d >= windowStart; d = new Date(d.getTime() - DAY_MS)) {
      const key = dateKey(d);
      const recorded = snapshotByDay.get(key);
      const balanceForDay = recorded ?? running;
      series.set(key, balanceForDay);
      if (txnByDay.has(key)) earliestTxnGrounded = key;
      // Undo this day's transactions to step to the previous day's balance.
      running = balanceForDay + (txnByDay.get(key) ?? 0);
    }
    perAccountSeries.set(account.id, series);
    // Account types with no transaction activity at all (mortgages,
    // 401(k)s, HSAs, etc.) don't get a say in how far back the combined
    // total can go — they just contribute their flat current balance for
    // whatever range transaction-bearing accounts establish is real.
    if (earliestTxnGrounded) earliestGroundedByAccount.set(account.id, earliestTxnGrounded);
  }

  // The combined total is only meaningful from whichever grounded account's
  // history runs out soonest — before that, at least one account's
  // contribution is pure guesswork, not reconstructed from anything real.
  // If no account has any real grounding at all, don't truncate anything.
  const groundedDates = Array.from(earliestGroundedByAccount.values());
  const earliestGroundedOverall = groundedDates.length > 0 ? groundedDates.sort().reverse()[0] : dateKey(windowStart);

  const days_: {
    date: string;
    totalAssets: number;
    totalLiabilities: number;
    netWorth: number;
    reconstructed: boolean;
  }[] = [];

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let d = new Date(windowStart); d <= today; d = new Date(d.getTime() + DAY_MS)) {
    const key = dateKey(d);
    if (key < earliestGroundedOverall) continue;
    let assets = 0;
    let liabilities = 0;
    let anyRecorded = false;

    for (const account of accounts) {
      const balance = perAccountSeries.get(account.id)?.get(key) ?? 0;
      if (ASSET_TYPES.includes(account.type)) assets += balance;
      else if (LIABILITY_TYPES.includes(account.type)) liabilities += balance;
      if (account.snapshots.some((s: { date: Date }) => dateKey(s.date) === key)) anyRecorded = true;
    }

    days_.push({
      date: key,
      totalAssets: Math.round(assets * 100) / 100,
      totalLiabilities: Math.round(liabilities * 100) / 100,
      netWorth: Math.round((assets - liabilities) * 100) / 100,
      reconstructed: !anyRecorded,
    });
  }

  const breakdown = new Map<string, number>();
  for (const account of accounts) {
    const bucket = account.subtype ?? account.type;
    breakdown.set(bucket, (breakdown.get(bucket) ?? 0) + (account.currentBalance ?? 0));
  }

  return {
    series: days_,
    breakdown: Array.from(breakdown.entries()).map(([bucket, value]) => ({
      bucket,
      value: Math.round(value * 100) / 100,
    })),
  };
}
