import chalk from "chalk";
import { writeFile } from "node:fs/promises";
import { toCsv } from "./csv";
import type { DomainRow, DomainStatus } from "./types";

const formatRow = (r: DomainRow): string => {
  switch (r.status) {
    case "FREE":
      return `  ${chalk.green("+")} ${r.domain}`;
    case "BUY":
      return `  ${chalk.yellow("$")} ${r.domain} - USD ${r.priceUSD ?? "?"} (${r.market ?? "?"})`;
    case "TAKEN":
      return `  ${chalk.gray("-")} ${r.domain}`;
    case "ERROR":
      return `  ${chalk.red("!")} ${r.domain}`;
  }
};

const sectionHeader = (status: DomainStatus, count: number, maxPriceUSD?: number): string => {
  switch (status) {
    case "FREE":
      return `FREE (${count}):`;
    case "BUY":
      return `BUY (<= USD ${maxPriceUSD ?? 0}) (${count}):`;
    case "TAKEN":
      return `TAKEN (${count}):`;
    case "ERROR":
      return `ERROR (${count}):`;
  }
};

const printSection = (rows: readonly DomainRow[], status: DomainStatus, maxPriceUSD?: number): string => {
  const filtered = rows.filter((r) => r.status === status);
  if (filtered.length === 0) return "";
  const header = sectionHeader(status, filtered.length, maxPriceUSD);
  const lines = filtered.map(formatRow);
  return [`\n${header}\n`, ...lines].join("\n");
};

export const printDomainRows = (rows: readonly DomainRow[], params: { readonly maxPriceUSD: number }): void => {
  const sections = (["FREE", "BUY", "TAKEN", "ERROR"] as const)
    .map((status) => printSection(rows, status, params.maxPriceUSD))
    .filter(Boolean)
    .join("\n");

  const tlds = [...new Set(rows.map((r) => r.tld))];
  const tldLabel = tlds.map((t) => `.${t}`).join(", ");
  const counts = {
    free: rows.filter((r) => r.status === "FREE").length,
    buy: rows.filter((r) => r.status === "BUY").length,
    taken: rows.filter((r) => r.status === "TAKEN").length,
    error: rows.filter((r) => r.status === "ERROR").length,
  };

  process.stdout.write(sections);
  process.stdout.write(
    `\n\nSummary [${tldLabel}]: ${counts.free} free / ${counts.buy} buy / ${counts.taken} taken / ${counts.error} error (total ${rows.length})\n\n`
  );
};

export const persistDomainRows = async (rows: readonly DomainRow[], outFile: string): Promise<void> => {
  const csv = toCsv([
    ["name", "tld", "domain", "status", "price_usd", "market"],
    ...rows.map((r) => [r.name, r.tld, r.domain, r.status, r.priceUSD?.toString() ?? "", r.market ?? ""]),
  ]);
  await writeFile(outFile, csv, "utf8");
  process.stderr.write(chalk.dim(`Saved results to ${outFile}\n`));
};
