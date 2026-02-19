export type IDSMarket = {
  readonly market: string;
  readonly price: number | null;
  readonly min_price: number | null;
  readonly type: string;
};

export type IDSResult = {
  readonly isRegistered: boolean | null;
  readonly label: string;
  readonly tld: string;
  readonly czdap: boolean;
  readonly securityTrails: boolean;
  readonly markets: readonly IDSMarket[];
  readonly etldCount: number | null;
};

export type DomainInfo = {
  readonly name: string;
  readonly tld: string;
  readonly available: boolean;
  readonly purchasable: boolean;
  readonly priceUSD: number | null;
  readonly market: string | null;
};

const REQUEST_TIMEOUT_MS = 15_000;

const idsHashCode = (name: string, seed: number = 42): string => {
  const hash = [...name].reduce(
    (r, ch) => ((r << 5) - r + (ch.codePointAt(0) ?? 0)) | 0,
    seed
  );
  return String(hash);
};

const findCheapest = (
  markets: readonly IDSMarket[]
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
    { usd: null, market: null }
  );

const toDomainInfo = (r: IDSResult, maxPriceUSD: number): DomainInfo => {
  // "available" requires multiple signals to agree — isRegistered alone is unreliable
  // because IDS sometimes returns isRegistered=false for domains that are actually taken
  const isFree = r.isRegistered === false && !r.czdap && !r.securityTrails;
  const cheapest = findCheapest(r.markets);
  const purchasable = !isFree && cheapest.usd !== null && cheapest.usd <= maxPriceUSD;

  return {
    name: r.label,
    tld: r.tld,
    available: isFree,
    purchasable,
    priceUSD: cheapest.usd,
    market: cheapest.market,
  };
};

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

export const checkDomainsViaIDS = async (params: {
  readonly names: readonly string[];
  readonly tlds?: readonly string[];
  readonly maxPriceUSD: number;
}): Promise<ReadonlyMap<string, DomainInfo>> => {
  const { names, tlds = ["com"], maxPriceUSD } = params;

  const payload = {
    names: names.map((name) => ({
      name,
      hash: idsHashCode(name),
      tlds,
    })),
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
      .map((r) => [`${r.label}.${r.tld}`, toDomainInfo(r, maxPriceUSD)] as const)
  );
};
