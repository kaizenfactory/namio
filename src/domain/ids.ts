export type IDSMarket = {
  market: string;
  price: number | null; // cents (USD)
  min_price: number | null;
  type: string;
};

export type IDSResult = {
  isRegistered: boolean | null;
  label: string;
  tld: string;
  czdap: boolean;
  securityTrails: boolean;
  markets: IDSMarket[];
  etldCount: number | null;
  [key: string]: unknown;
};

export type DomainInfo = {
  name: string;
  tld: string;
  available: boolean;
  purchasable: boolean;
  priceUSD: number | null;
  market: string | null;
};

export function idsHashCode(name: string, seed: number = 42): string {
  let r = seed;
  for (const ch of name) {
    r = (r << 5) - r + (ch.codePointAt(0) ?? 0);
    r &= r;
  }
  return String(r);
}

export async function checkDomainsViaIDS(params: {
  names: string[];
  tlds?: string[];
  maxPriceUSD: number;
}): Promise<Map<string, DomainInfo>> {
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
    headers: {
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
      "Sec-Fetch-Site": "same-site"
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`IDS API error: ${res.status} ${res.statusText}${body ? ` — ${body}` : ""}`);
  }

  const data = (await res.json()) as { results: IDSResult[] };
  const result = new Map<string, DomainInfo>();

  for (const r of data.results) {
    if (!tlds.includes(r.tld)) continue;

    // "available" only when multiple signals agree. `isRegistered=false` alone is unreliable.
    const isFree = r.isRegistered === false && !r.czdap && !r.securityTrails;

    let cheapestUSD: number | null = null;
    let cheapestMarket: string | null = null;

    for (const m of r.markets ?? []) {
      const cents = m.price ?? m.min_price ?? null;
      if (cents === null) continue;
      const dollars = cents / 100;
      if (cheapestUSD === null || dollars < cheapestUSD) {
        cheapestUSD = dollars;
        cheapestMarket = m.market;
      }
    }

    const purchasable = !isFree && cheapestUSD !== null && cheapestUSD <= maxPriceUSD;

    const key = `${r.label}.${r.tld}`;
    result.set(key, {
      name: r.label,
      tld: r.tld,
      available: isFree,
      purchasable,
      priceUSD: cheapestUSD,
      market: cheapestMarket,
    });
  }

  return result;
}
