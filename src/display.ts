import chalk from "chalk";
import { writeFile } from "node:fs/promises";
import { toCsv } from "./csv";
import type { ClassifiedDomain, DomainStatus, OutputFormat } from "./types";

// --- terminal (text) output ---

const formatRow = (r: ClassifiedDomain): string => {
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
    case "FREE": return `FREE (${count}):`;
    case "BUY": return `BUY (<= USD ${maxPriceUSD ?? 0}) (${count}):`;
    case "TAKEN": return `TAKEN (${count}):`;
    case "ERROR": return `ERROR (${count}):`;
  }
};

const printSection = (rows: readonly ClassifiedDomain[], status: DomainStatus, maxPriceUSD?: number): string => {
  const filtered = rows.filter((r) => r.status === status);
  if (filtered.length === 0) return "";
  const header = sectionHeader(status, filtered.length, maxPriceUSD);
  const lines = filtered.map(formatRow);
  return [`\n${header}\n`, ...lines].join("\n");
};

const printText = (rows: readonly ClassifiedDomain[], maxPriceUSD: number): void => {
  const sections = (["FREE", "BUY", "TAKEN", "ERROR"] as const)
    .map((status) => printSection(rows, status, maxPriceUSD))
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
    `\n\nSummary [${tldLabel}]: ${counts.free} free / ${counts.buy} buy / ${counts.taken} taken / ${counts.error} error (total ${rows.length})\n\n`,
  );
};

// --- JSON output ---

const printJson = (rows: readonly ClassifiedDomain[]): void => {
  const out = rows.map((r) => ({
    name: r.name,
    tld: r.tld,
    domain: r.domain,
    status: r.status,
    priceUSD: r.priceUSD,
    market: r.market,
  }));
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
};

// --- CSV output (to stdout) ---

const printCsv = (rows: readonly ClassifiedDomain[]): void => {
  const csv = toCsv([
    ["name", "tld", "domain", "status", "price_usd", "market"],
    ...rows.map((r) => [r.name, r.tld, r.domain, r.status, r.priceUSD?.toString() ?? "", r.market ?? ""]),
  ]);
  process.stdout.write(csv);
};

// --- public API ---

export const printResults = (
  rows: readonly ClassifiedDomain[],
  params: { readonly maxPriceUSD: number; readonly format: OutputFormat },
): void => {
  switch (params.format) {
    case "text": return printText(rows, params.maxPriceUSD);
    case "json": return printJson(rows);
    case "csv": return printCsv(rows);
  }
};

export const persistResults = async (rows: readonly ClassifiedDomain[], outFile: string): Promise<void> => {
  const csv = toCsv([
    ["name", "tld", "domain", "status", "price_usd", "market"],
    ...rows.map((r) => [r.name, r.tld, r.domain, r.status, r.priceUSD?.toString() ?? "", r.market ?? ""]),
  ]);
  await writeFile(outFile, csv, "utf8");
  process.stderr.write(chalk.dim(`Saved results to ${outFile}\n`));
};
