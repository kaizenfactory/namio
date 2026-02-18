#!/usr/bin/env bun

import { Command } from "commander";
import chalk from "chalk";
import { readFile, writeFile } from "node:fs/promises";
import { generateCandidates } from "./generator";
import { normalizeName } from "./util";
import { parseCsvFirstColumn, toCsv } from "./csv";
import { checkDomainsViaIDS } from "./domain/ids";

type DomainRow = {
  name: string;
  domain: string;
  status: "FREE" | "BUY" | "TAKEN" | "ERROR";
  priceUSD: number | null;
  market: string | null;
};

const DEFAULT_SEEDS = [
  "search",
  "find",
  "discover",
  "combine",
  "win",
  "goal",
  "reach",
  "scope",
  "spot",
  "signal",
  "surface",
  "emerge",
];

const program = new Command();
program.name("namio").description("Brandable name generator + .com checker").version("0.0.1");

const IDS_BATCH_SIZE = 25;

program
  .command("generate")
  .description("Generate pronounceable candidate names")
  .option("--count <n>", "Number of candidates", "200")
  .option("--min <n>", "Minimum length", "4")
  .option("--max <n>", "Maximum length", "7")
  .option("--seed <words>", "Seed words (space or comma-separated)")
  .option("--out <file>", "Output CSV file", "generated-words.csv")
  .action(async (opts) => {
    const count = parseInt(String(opts.count));
    const min = parseInt(String(opts.min));
    const max = parseInt(String(opts.max));
    const seedWords = String(opts.seed ?? "")
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const { candidates } = generateCandidates({
      count,
      min,
      max,
      seedWords: seedWords.length ? seedWords : DEFAULT_SEEDS,
    });

    const words = [...new Set(candidates)].sort();
    for (const w of words) process.stdout.write(`${w}\n`);

    const csv = toCsv([["name"], ...words.map((w) => [w])]);
    await writeFile(String(opts.out), csv, "utf8");
    process.stderr.write(chalk.dim(`\nSaved ${words.length} to ${opts.out}\n`));
  });

program
  .command("check")
  .description("Check .com availability for names or a CSV file")
  .argument("[names...]", "Names to check")
  .option("--file <csv>", "Read names from CSV (first column)")
  .option("--max-price <usd>", "Include purchasable domains up to this USD budget", "0")
  .option("--out <file>", "Output CSV file", "domain-check-results.csv")
  .action(async (names: string[], opts) => {
    const maxPriceUSD = parseInt(String(opts.maxPrice ?? 0));
    const fromArgs = names.map(normalizeName).filter(Boolean);
    const fromFile = opts.file
      ? parseCsvFirstColumn(await readFile(String(opts.file), "utf8")).map(normalizeName).filter(Boolean)
      : [];

    const unique = [...new Set([...fromFile, ...fromArgs])];
    if (unique.length === 0) {
      throw new Error("No names provided. Use positional names or --file <csv>.");
    }

    const rows = await checkNames(unique, { maxPriceUSD });
    await persistDomainRows(rows, String(opts.out));
    printDomainRows(rows, { maxPriceUSD });
  });

program
  .command("hunt")
  .description("Generate + check until you find N available domains")
  .option("--count <n>", "Number of domains to find", "50")
  .option("--min <n>", "Minimum length", "4")
  .option("--max <n>", "Maximum length", "7")
  .option("--seed <words>", "Seed words (space or comma-separated)")
  .option("--max-price <usd>", "Include purchasable domains up to this USD budget", "0")
  .option("--out <file>", "Output CSV file", "domain-check-results.csv")
  .action(async (opts) => {
    const count = parseInt(String(opts.count));
    const min = parseInt(String(opts.min));
    const max = parseInt(String(opts.max));
    const maxPriceUSD = parseInt(String(opts.maxPrice ?? 0));
    const seedWords = String(opts.seed ?? "")
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const seen = new Set<string>();
    const found: DomainRow[] = [];

    const GEN_BATCH = 120;
    const API_BATCH = IDS_BATCH_SIZE;
    const MAX_ROUNDS = 100;

    const budgetLabel = maxPriceUSD > 0 ? ` (budget <= USD ${maxPriceUSD})` : "";
    process.stderr.write(chalk.dim(`Finding ${count} domains (${min}-${max} chars)${budgetLabel}...\n`));

    for (let round = 1; round <= MAX_ROUNDS && found.length < count; round++) {
      const batchCount = Math.min(GEN_BATCH * Math.ceil(round / 3), 500);
      const { candidates } = generateCandidates({
        count: batchCount,
        min,
        max,
        seedWords: seedWords.length ? seedWords : DEFAULT_SEEDS,
        seen,
      });

      if (candidates.length === 0) break;

      const roundRows: DomainRow[] = [];
      for (let i = 0; i < candidates.length && found.length < count; i += API_BATCH) {
        const slice = candidates.slice(i, i + API_BATCH);
        try {
          const map = await checkDomainsViaIDS({ names: slice, maxPriceUSD });
          for (const name of slice) {
            const info = map.get(name);
            if (!info) continue;
            if (info.available) {
              const row = toDomainRow(name, info);
              roundRows.push(row);
              found.push(row);
            } else if (info.purchasable) {
              const row = toDomainRow(name, info);
              roundRows.push(row);
              found.push(row);
            }
            if (found.length >= count) break;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          process.stderr.write(chalk.yellow(`IDS API error (round ${round}): ${msg}\n`));
          await delay(1000);
        }
        if (i + API_BATCH < candidates.length) await delay(150);
      }

      process.stderr.write(
        chalk.dim(
          `Round ${String(round).padStart(2)}: generated ${String(candidates.length).padStart(3)} -> ${String(roundRows.length).padStart(2)} found (total ${found.length}/${count})\n`
        )
      );
      await delay(200);
    }

    const rows = sortDomainRows(found);
    await persistDomainRows(rows, String(opts.out));
    printDomainRows(rows, { maxPriceUSD });
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(chalk.red(`Error: ${message}\n`));
  process.exitCode = 1;
});

async function checkNames(names: string[], params: { maxPriceUSD: number }): Promise<DomainRow[]> {
  const chunks = chunk(names, IDS_BATCH_SIZE);
  const rows = await chunks.reduce<Promise<DomainRow[]>>(async (accP, batch, index) => {
    const acc = await accP;
    const map = await checkDomainsViaIDS({ names: batch, maxPriceUSD: params.maxPriceUSD });
    const batchRows = batch.map((name) => toDomainRow(name, map.get(name)));
    if (index < chunks.length - 1) await delay(250);
    return [...acc, ...batchRows];
  }, Promise.resolve([]));

  return sortDomainRows(rows);
}

function sortDomainRows(rows: DomainRow[]): DomainRow[] {
  const free = rows.filter((r) => r.status === "FREE").sort((a, b) => a.name.localeCompare(b.name));
  const buy = rows
    .filter((r) => r.status === "BUY")
    .sort((a, b) => (a.priceUSD ?? Number.MAX_SAFE_INTEGER) - (b.priceUSD ?? Number.MAX_SAFE_INTEGER));
  const taken = rows.filter((r) => r.status === "TAKEN").sort((a, b) => a.name.localeCompare(b.name));
  const error = rows.filter((r) => r.status === "ERROR").sort((a, b) => a.name.localeCompare(b.name));
  return [...free, ...buy, ...taken, ...error];
}

function printDomainRows(rows: DomainRow[], params: { maxPriceUSD: number }) {
  const free = rows.filter((r) => r.status === "FREE");
  const buy = rows.filter((r) => r.status === "BUY");
  const taken = rows.filter((r) => r.status === "TAKEN");
  const error = rows.filter((r) => r.status === "ERROR");

  if (free.length) {
    process.stdout.write(`\nFREE .com (${free.length}):\n\n`);
    for (const r of free) process.stdout.write(`  ${chalk.green("+")} ${r.domain}\n`);
  }
  if (buy.length) {
    process.stdout.write(`\nBUY (<= USD ${params.maxPriceUSD}) (${buy.length}):\n\n`);
    for (const r of buy) process.stdout.write(`  ${chalk.yellow("$")} ${r.domain} - USD ${r.priceUSD ?? "?"} (${r.market ?? "?"})\n`);
  }
  if (taken.length) {
    process.stdout.write(`\nTAKEN (${taken.length}):\n\n`);
    for (const r of taken) process.stdout.write(`  ${chalk.gray("-")} ${r.domain}\n`);
  }
  if (error.length) {
    process.stdout.write(`\nERROR (${error.length}):\n\n`);
    for (const r of error) process.stdout.write(`  ${chalk.red("!")} ${r.domain}\n`);
  }

  process.stdout.write(
    `\nSummary: ${free.length} free / ${buy.length} buy / ${taken.length} taken / ${error.length} error (total ${rows.length})\n\n`
  );
}

async function persistDomainRows(rows: DomainRow[], outFile: string) {
  const csv = toCsv([
    ["name", "domain", "status", "price_usd", "market"],
    ...rows.map((r) => [r.name, r.domain, r.status, r.priceUSD?.toString() ?? "", r.market ?? ""]),
  ]);
  await writeFile(outFile, csv, "utf8");
  process.stderr.write(chalk.dim(`Saved results to ${outFile}\n`));
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function toDomainRow(name: string, info: { available: boolean; purchasable: boolean; priceUSD: number | null; market: string | null } | undefined): DomainRow {
  if (!info) return { name, domain: `${name}.com`, status: "ERROR", priceUSD: null, market: null };
  if (info.available) return { name, domain: `${name}.com`, status: "FREE", priceUSD: null, market: null };
  if (info.purchasable) return { name, domain: `${name}.com`, status: "BUY", priceUSD: info.priceUSD, market: info.market };
  return { name, domain: `${name}.com`, status: "TAKEN", priceUSD: info.priceUSD, market: info.market };
}
