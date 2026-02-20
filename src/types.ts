// --- domain results ---

export type DomainResult = {
  readonly name: string;
  readonly tld: string;
  readonly domain: string;
  readonly available: boolean;
  readonly priceUSD: number | null;
  readonly market: string | null;
};

export type DomainStatus = "FREE" | "BUY" | "TAKEN" | "ERROR";

export type ClassifiedDomain = DomainResult & {
  readonly status: DomainStatus;
};

export const classify = (result: DomainResult, maxPriceUSD: number): ClassifiedDomain => ({
  ...result,
  status: result.available
    ? "FREE"
    : result.priceUSD !== null && result.priceUSD <= maxPriceUSD
      ? "BUY"
      : "TAKEN",
});

export const classifyError = (name: string, tld: string): ClassifiedDomain => ({
  name,
  tld,
  domain: `${name}.${tld}`,
  available: false,
  priceUSD: null,
  market: null,
  status: "ERROR",
});

// --- CLI option types ---

export type OutputFormat = "text" | "json" | "csv";

export type GenerateOpts = {
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly seedWords: readonly string[];
  readonly out: string | null;
  readonly format: OutputFormat;
};

export type CheckOpts = {
  readonly names: readonly string[];
  readonly tlds: readonly string[];
  readonly maxPriceUSD: number;
  readonly out: string | null;
  readonly format: OutputFormat;
};

export type HuntOpts = {
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly seedWords: readonly string[];
  readonly tlds: readonly string[];
  readonly maxPriceUSD: number;
  readonly out: string | null;
  readonly format: OutputFormat;
};
