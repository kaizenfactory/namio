import { checkDomainsViaIDS, type DomainInfo } from "./domain/ids";
import type { DomainRow, DomainStatus } from "./types";
import { chunk, delay } from "./util";

const IDS_BATCH_SIZE = 25;

const toDomainRow = (info: DomainInfo): DomainRow => {
  const { name, tld } = info;
  const domain = `${name}.${tld}`;
  const status: DomainStatus = info.available
    ? "FREE"
    : info.purchasable
      ? "BUY"
      : "TAKEN";

  return { name, tld, domain, status, priceUSD: info.priceUSD, market: info.market };
};

const toErrorRow = (name: string, tld: string): DomainRow => ({
  name,
  tld,
  domain: `${name}.${tld}`,
  status: "ERROR",
  priceUSD: null,
  market: null,
});

const sortByName = (a: DomainRow, b: DomainRow): number =>
  a.name.localeCompare(b.name);

const sortByPrice = (a: DomainRow, b: DomainRow): number =>
  (a.priceUSD ?? Number.MAX_SAFE_INTEGER) - (b.priceUSD ?? Number.MAX_SAFE_INTEGER);

const sorted = <T>(arr: readonly T[], cmp: (a: T, b: T) => number): readonly T[] =>
  [...arr].sort(cmp);

export const sortDomainRows = (rows: readonly DomainRow[]): readonly DomainRow[] => {
  const byStatus = (status: DomainStatus) => rows.filter((r) => r.status === status);
  return [
    ...sorted(byStatus("FREE"), sortByName),
    ...sorted(byStatus("BUY"), sortByPrice),
    ...sorted(byStatus("TAKEN"), sortByName),
    ...sorted(byStatus("ERROR"), sortByName),
  ];
};

const checkBatch = async (
  batch: readonly string[],
  tlds: readonly string[],
  maxPriceUSD: number,
): Promise<readonly DomainRow[]> => {
  const map = await checkDomainsViaIDS({ names: batch, tlds, maxPriceUSD });
  return batch.flatMap((name) =>
    tlds.map((tld) => {
      const info = map.get(`${name}.${tld}`);
      return info ? toDomainRow(info) : toErrorRow(name, tld);
    })
  );
};

const processBatches = async (
  batches: readonly (readonly string[])[],
  tlds: readonly string[],
  maxPriceUSD: number,
  index: number = 0,
  acc: readonly DomainRow[] = [],
): Promise<readonly DomainRow[]> => {
  if (index >= batches.length) return acc;
  const rows = await checkBatch(batches[index]!, tlds, maxPriceUSD);
  if (index < batches.length - 1) await delay(250);
  return processBatches(batches, tlds, maxPriceUSD, index + 1, [...acc, ...rows]);
};

export const checkNames = async (params: {
  readonly names: readonly string[];
  readonly tlds: readonly string[];
  readonly maxPriceUSD: number;
}): Promise<readonly DomainRow[]> => {
  const { names, tlds, maxPriceUSD } = params;
  const batches = chunk(names, IDS_BATCH_SIZE);
  const rows = await processBatches(batches, tlds, maxPriceUSD);
  return sortDomainRows(rows);
};

export { toDomainRow, IDS_BATCH_SIZE };
