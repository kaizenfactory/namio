import { checkDomains } from "./domain/ids";
import {
  classify,
  classifyError,
  type ClassifiedDomain,
  type DomainStatus,
} from "./types";

const sortByName = (a: ClassifiedDomain, b: ClassifiedDomain): number =>
  a.name.localeCompare(b.name);

const sortByPrice = (a: ClassifiedDomain, b: ClassifiedDomain): number =>
  (a.priceUSD ?? Number.MAX_SAFE_INTEGER) - (b.priceUSD ?? Number.MAX_SAFE_INTEGER);

const sorted = <T>(arr: readonly T[], cmp: (a: T, b: T) => number): readonly T[] =>
  [...arr].sort(cmp);

export const sortClassified = (rows: readonly ClassifiedDomain[]): readonly ClassifiedDomain[] => {
  const byStatus = (status: DomainStatus) => rows.filter((r) => r.status === status);
  return [
    ...sorted(byStatus("FREE"), sortByName),
    ...sorted(byStatus("BUY"), sortByPrice),
    ...sorted(byStatus("TAKEN"), sortByName),
    ...sorted(byStatus("ERROR"), sortByName),
  ];
};

export const checkNames = async (params: {
  readonly names: readonly string[];
  readonly tlds: readonly string[];
  readonly maxPriceUSD: number;
}): Promise<readonly ClassifiedDomain[]> => {
  const { names, tlds, maxPriceUSD } = params;

  const seen = new Set<string>();
  const results: ClassifiedDomain[] = [];

  for await (const result of checkDomains(names, tlds)) {
    seen.add(result.domain);
    results.push(classify(result, maxPriceUSD));
  }

  // fill in errors for names that got no response
  for (const name of names) {
    for (const tld of tlds) {
      if (!seen.has(`${name}.${tld}`)) {
        results.push(classifyError(name, tld));
      }
    }
  }

  return sortClassified(results);
};
