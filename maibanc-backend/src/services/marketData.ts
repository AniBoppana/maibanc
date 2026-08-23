// Simple in-memory cache — Alpha Vantage's free tier is rate-limited
// (25 requests/day), and this is daily data that doesn't need refetching
// more than a few times a day.
let cache: { fetchedAt: number; series: { date: string; close: number }[] } | null = null;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Real S&P 500 proxy (SPY ETF) daily close history from Alpha Vantage.
 * Returns [] (never throws to the caller) when no API key is configured or
 * the request fails, so the UI can render an honest "not available" state
 * instead of crashing.
 */
export async function getSP500History(days = 90): Promise<{ date: string; close: number }[]> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return [];

  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.series.slice(-days);
  }

  try {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=SPY&outputsize=compact&apikey=${apiKey}`;
    const resp = await fetch(url);
    const data = (await resp.json()) as any;
    const series = data["Time Series (Daily)"];
    if (!series) {
      console.error("Alpha Vantage response missing series:", data["Note"] ?? data["Information"] ?? data);
      return cache?.series.slice(-days) ?? [];
    }

    const parsed = Object.entries(series)
      .map(([date, values]: [string, any]) => ({
        date,
        close: Number(values["4. close"]),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    cache = { fetchedAt: Date.now(), series: parsed };
    return parsed.slice(-days);
  } catch (err) {
    console.error("Alpha Vantage fetch failed:", err);
    return cache?.series.slice(-days) ?? [];
  }
}
