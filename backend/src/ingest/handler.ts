import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const WATCHLIST = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA"];
const TABLE_NAME = process.env.TABLE_NAME!;
const SECRET_ID = process.env.SECRET_ID!;

const secretsClient = new SecretsManagerClient({});
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface GroupedBar {
  T: string; // ticker
  o: number; // open
  c: number; // close
}

interface GroupedResponse {
  status: string;
  resultsCount: number;
  results?: GroupedBar[];
}

/** Most recent weekday before today, as YYYY-MM-DD (UTC). */
function getTargetDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().slice(0, 10);
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/** Fetch with up to 3 retries and exponential backoff (1s, 2s, 4s). */
async function fetchWithRetry(url: string, maxRetries = 3): Promise<GroupedResponse> {
  let lastError: Error = new Error("unreachable");
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delayMs = 1000 * 2 ** (attempt - 1);
      console.log(`Retry ${attempt}/${maxRetries} after ${delayMs}ms`);
      await sleep(delayMs);
    }
    try {
      const response = await fetch(url);
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`Retryable HTTP ${response.status}`);
        continue;
      }
      if (!response.ok) {
        throw new Error(`Non-retryable HTTP ${response.status}: ${await response.text()}`);
      }
      return (await response.json()) as GroupedResponse;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Non-retryable")) throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw new Error(`API failed after ${maxRetries} retries: ${lastError.message}`);
}

export const handler = async (event?: { date?: string }): Promise<void> => {
  const date = event?.date ?? getTargetDate();
  console.log(`Ingesting top mover for ${date}`);

  const secret = await secretsClient.send(new GetSecretValueCommand({ SecretId: SECRET_ID }));
  const apiKey = secret.SecretString;
  if (!apiKey) throw new Error("API key not found in Secrets Manager");

  const url = `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${date}?adjusted=true&apiKey=${apiKey}`;
  const data = await fetchWithRetry(url);

  if (!data.results || data.resultsCount === 0) {
    console.log(`No market data for ${date} (likely a holiday). Exiting cleanly.`);
    return;
  }

  const watchlistBars = data.results.filter((bar) => WATCHLIST.includes(bar.T));
  if (watchlistBars.length === 0) {
    throw new Error(`No watchlist tickers found in ${data.resultsCount} results`);
  }
  const missing = WATCHLIST.filter((t) => !watchlistBars.some((b) => b.T === t));
  if (missing.length > 0) {
    console.warn(`Missing tickers in response: ${missing.join(", ")}`);
  }

  const movers = watchlistBars.map((bar) => ({
    ticker: bar.T,
    pctChange: ((bar.c - bar.o) / bar.o) * 100,
    closePrice: bar.c,
  }));
  const topMover = movers.reduce((max, m) =>
    Math.abs(m.pctChange) > Math.abs(max.pctChange) ? m : max
  );

  console.log(`Top mover: ${topMover.ticker} ${topMover.pctChange.toFixed(2)}%`);

  await ddbClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: "MOVER",
        SK: date,
        ticker: topMover.ticker,
        pctChange: Number(topMover.pctChange.toFixed(4)),
        closePrice: topMover.closePrice,
      },
    })
  );
  console.log(`Wrote ${topMover.ticker} for ${date} to ${TABLE_NAME}`);
};