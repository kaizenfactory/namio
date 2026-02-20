import type { DomainResult } from "../types";
import { delay } from "../util";

// --- IDS API types (internal) ---

type IDSMarket = {
  readonly market: string;
  readonly price: number | null;
  readonly min_price: number | null;
  readonly type: string;
};

type IDSResult = {
  readonly isRegistered: boolean | null;
  readonly label: string;
  readonly tld: string;
  readonly czdap: boolean;
  readonly securityTrails: boolean;
  readonly markets: readonly IDSMarket[];
  readonly etldCount: number | null;
};

// --- constants ---

const REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_BATCH_DELAY_MS = 250;

// IDS requires browser-like headers — requests with generic User-Agent are blocked
const IDS_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:147.0) Gecko/20100101 Firefox/147.0",
  Accept: "application/json",
  "Accept-Language": "en",
  Referer: "https://instantdomainsearch.com/",
  "content-type": "application/json",
  Origin: "https://instantdomainsearch.com",
  "Sec-GPC": "1",
  "Alt-Used": "cloud.instantdomainsearch.com",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-site",
} as const;

// --- pure helpers ---

const idsHashCode = (name: string, seed: number = 42): string => {
  const hash = [...name].reduce(
    (r, ch) => ((r << 5) - r + (ch.codePointAt(0) ?? 0)) | 0,
    seed,
  );
  return String(hash);
};

const findCheapest = (
  markets: readonly IDSMarket[],
): { readonly usd: number | null; readonly market: string | null } =>
  markets.reduce<{ readonly usd: number | null; readonly market: string | null }>(
    (best, m) => {
      const cents = m.price ?? m.min_price ?? null;
      if (cents === null) return best;
      const dollars = cents / 100;
      return best.usd === null || dollars < best.usd
        ? { usd: dollars, market: m.market }
        : best;
    },
    { usd: null, market: null },
  );

const toDomainResult = (r: IDSResult): DomainResult => {
  // "available" requires multiple signals to agree — isRegistered alone is unreliable
  // because IDS sometimes returns isRegistered=false for domains that are actually taken
  const available = r.isRegistered === false && !r.czdap && !r.securityTrails;
  const cheapest = findCheapest(r.markets);

  return {
    name: r.label,
    tld: r.tld,
    domain: `${r.label}.${r.tld}`,
    available,
    priceUSD: cheapest.usd,
    market: cheapest.market,
  };
};

// --- raw API call (single batch) ---

const queryBatch = async (
  names: readonly string[],
  tlds: readonly string[],
): Promise<ReadonlyMap<string, DomainResult>> => {
  const payload = {
    names: names.map((name) => ({ name, hash: idsHashCode(name), tlds })),
  };

  const res = await fetch("https://cloud.instantdomainsearch.com/services/query-dns", {
    method: "POST",
    headers: IDS_HEADERS,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`IDS API error: ${res.status} ${res.statusText}${body ? ` — ${body}` : ""}`);
  }

  const data = (await res.json()) as { readonly results: readonly IDSResult[] };

  return new Map(
    data.results
      .filter((r) => tlds.includes(r.tld))
      .map((r) => [`${r.label}.${r.tld}`, toDomainResult(r)] as const),
  );
};

// --- public: rate-limited streaming client ---

export type IDSClientOpts = {
  readonly batchSize?: number;
  readonly batchDelayMs?: number;
};

export async function* checkDomains(
  names: readonly string[],
  tlds: readonly string[],
  opts: IDSClientOpts = {},
): AsyncGenerator<DomainResult> {
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const batchDelay = opts.batchDelayMs ?? DEFAULT_BATCH_DELAY_MS;

  for (let i = 0; i < names.length; i += batchSize) {
    const batch = names.slice(i, i + batchSize);
    const results = await queryBatch(batch, tlds);

    for (const name of batch) {
      for (const tld of tlds) {
        const key = `${name}.${tld}`;
        const result = results.get(key);
        if (result) yield result;
      }
    }

    if (i + batchSize < names.length) await delay(batchDelay);
  }
}
