export type DomainStatus = "FREE" | "BUY" | "TAKEN" | "ERROR";

export type DomainRow = {
  readonly name: string;
  readonly tld: string;
  readonly domain: string;
  readonly status: DomainStatus;
  readonly priceUSD: number | null;
  readonly market: string | null;
};

export type GenerateOpts = {
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly seedWords: readonly string[];
  readonly out: string;
};

export type CheckOpts = {
  readonly names: readonly string[];
  readonly tlds: readonly string[];
  readonly maxPriceUSD: number;
  readonly out: string;
};

export type HuntOpts = {
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly seedWords: readonly string[];
  readonly tlds: readonly string[];
  readonly maxPriceUSD: number;
  readonly out: string;
};
