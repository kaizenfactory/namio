#!/usr/bin/env bun

import { Command } from "commander";
import chalk from "chalk";
import { readFile } from "node:fs/promises";
import pkg from "../package.json";
import { generateCandidates, DEFAULT_SEEDS } from "./generator";
import { checkNames, toDomainRow, sortDomainRows, IDS_BATCH_SIZE } from "./check";
import { printDomainRows, persistDomainRows } from "./display";
import { checkDomainsViaIDS } from "./domain/ids";
import { normalizeName, delay, chunk } from "./util";
import { parseCsvFirstColumn, toCsv } from "./csv";
import type { DomainRow, GenerateOpts, CheckOpts, HuntOpts } from "./types";

const DEFAULT_TLDS = ["com"] as const;

const parseTlds = (value: string): string[] =>
  value
    .split(/[\s,]+/)
    .map((s) => s.trim().replace(/^\./, ""))
    .filter(Boolean);

const parseSeedWords = (raw: string | undefined): readonly string[] => {
  const words = (raw ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return words.length > 0 ? words : DEFAULT_SEEDS;
};

const parseGenerateOpts = (opts: Record<string, string>): GenerateOpts => ({
  count: parseInt(opts.count!),
  min: parseInt(opts.min!),
  max: parseInt(opts.max!),
  seedWords: parseSeedWords(opts.seed),
  out: opts.out!,
});

const parseCheckOpts = (names: readonly string[], opts: Record<string, string>): Omit<CheckOpts, "names"> & { readonly file?: string; readonly rawNames: readonly string[] } => ({
  rawNames: names,
  file: opts.file,
  tlds: opts.tlds ? parseTlds(opts.tlds) : [...DEFAULT_TLDS],
  maxPriceUSD: parseInt(opts.maxPrice ?? "0"),
  out: opts.out!,
});

const parseHuntOpts = (opts: Record<string, string>): HuntOpts => ({
  count: parseInt(opts.count!),
  min: parseInt(opts.min!),
  max: parseInt(opts.max!),
  seedWords: parseSeedWords(opts.seed),
  tlds: opts.tlds ? parseTlds(opts.tlds) : [...DEFAULT_TLDS],
  maxPriceUSD: parseInt(opts.maxPrice ?? "0"),
  out: opts.out!,
});

// --- commands ---

const program = new Command();
program.name("namio").description("Brandable name generator + domain availability checker").version(pkg.version);

program
  .command("generate")
  .description("Generate pronounceable candidate names")
  .option("--count <n>", "Number of candidates", "200")
  .option("--min <n>", "Minimum length", "4")
  .option("--max <n>", "Maximum length", "7")
  .option("--seed <words>", "Seed words (space or comma-separated)")
  .option("--out <file>", "Output CSV file", "generated-words.csv")
  .action(async (raw: Record<string, string>) => {
    const opts = parseGenerateOpts(raw);
    const { candidates } = generateCandidates(opts);
    const words = [...new Set(candidates)].sort();

    process.stdout.write(words.join("\n") + "\n");

    const csv = toCsv([["name"], ...words.map((w) => [w])]);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(opts.out, csv, "utf8");
    process.stderr.write(chalk.dim(`\nSaved ${words.length} to ${opts.out}\n`));
  });

program
  .command("check")
  .description("Check domain availability for names or a CSV file")
  .argument("[names...]", "Names to check")
  .option("--file <csv>", "Read names from CSV (first column)")
  .option("--tlds <tlds>", "TLDs to check (comma or space-separated, e.g. 'com,io,dev')")
  .option("--max-price <usd>", "Include purchasable domains up to this USD budget", "0")
  .option("--out <file>", "Output CSV file", "domain-check-results.csv")
  .action(async (names: string[], raw: Record<string, string>) => {
    const opts = parseCheckOpts(names, raw);
    const fromArgs = opts.rawNames.map(normalizeName).filter(Boolean);
    const fromFile = opts.file
      ? parseCsvFirstColumn(await readFile(opts.file, "utf8")).map(normalizeName).filter(Boolean)
      : [];

    const unique = [...new Set([...fromFile, ...fromArgs])];
    if (unique.length === 0) {
      throw new Error("No names provided. Use positional names or --file <csv>.");
    }

    const rows = await checkNames({ names: unique, tlds: opts.tlds, maxPriceUSD: opts.maxPriceUSD });
    await persistDomainRows(rows, opts.out);
    printDomainRows(rows, { maxPriceUSD: opts.maxPriceUSD });
  });

const GEN_BATCH = 120;
const MAX_ROUNDS = 100;
const MAX_GEN_PER_ROUND = 500;
const INTER_BATCH_DELAY_MS = 150;
const INTER_ROUND_DELAY_MS = 200;
const ERROR_RETRY_DELAY_MS = 1000;

const runHuntRound = async (params: {
  readonly round: number;
  readonly opts: HuntOpts;
  readonly seen: Set<string>;
  readonly found: readonly DomainRow[];
}): Promise<readonly DomainRow[]> => {
  const { round, opts, seen, found } = params;
  if (round > MAX_ROUNDS || found.length >= opts.count) return found;

  const batchCount = Math.min(GEN_BATCH * Math.ceil(round / 3), MAX_GEN_PER_ROUND);
  const { candidates } = generateCandidates({
    count: batchCount,
    min: opts.min,
    max: opts.max,
    seedWords: opts.seedWords,
    seen,
  });

  if (candidates.length === 0) return found;

  const batches = chunk(candidates, IDS_BATCH_SIZE);
  const { newRows, done } = await processHuntBatches({
    batches,
    tlds: opts.tlds,
    maxPriceUSD: opts.maxPriceUSD,
    remaining: opts.count - found.length,
    round,
  });

  const updatedFound = [...found, ...newRows];

  process.stderr.write(
    chalk.dim(
      `Round ${String(round).padStart(2)}: generated ${String(candidates.length).padStart(3)} -> ${String(newRows.length).padStart(2)} found (total ${updatedFound.length}/${opts.count})\n`
    )
  );

  if (done || updatedFound.length >= opts.count) return updatedFound;

  await delay(INTER_ROUND_DELAY_MS);
  return runHuntRound({ round: round + 1, opts, seen, found: updatedFound });
};

const processHuntBatches = async (params: {
  readonly batches: readonly (readonly string[])[];
  readonly tlds: readonly string[];
  readonly maxPriceUSD: number;
  readonly remaining: number;
  readonly round: number;
  readonly index?: number;
  readonly acc?: readonly DomainRow[];
}): Promise<{ readonly newRows: readonly DomainRow[]; readonly done: boolean }> => {
  const { batches, tlds, maxPriceUSD, remaining, round, index = 0, acc = [] } = params;

  if (index >= batches.length || acc.length >= remaining) {
    return { newRows: acc, done: acc.length >= remaining };
  }

  try {
    const map = await checkDomainsViaIDS({ names: batches[index]!, tlds, maxPriceUSD });
    const hits = [...map.values()]
      .filter((info) => info.available || info.purchasable)
      .map(toDomainRow);
    const taken = [...acc, ...hits].slice(0, remaining);

    if (index + 1 < batches.length) await delay(INTER_BATCH_DELAY_MS);

    return processHuntBatches({ ...params, index: index + 1, acc: taken });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(chalk.yellow(`IDS API error (round ${round}): ${msg}\n`));
    await delay(ERROR_RETRY_DELAY_MS);
    return processHuntBatches({ ...params, index: index + 1, acc });
  }
};

program
  .command("hunt")
  .description("Generate + check until you find N available domains")
  .option("--count <n>", "Number of domains to find", "50")
  .option("--min <n>", "Minimum length", "4")
  .option("--max <n>", "Maximum length", "7")
  .option("--seed <words>", "Seed words (space or comma-separated)")
  .option("--tlds <tlds>", "TLDs to check (comma or space-separated, e.g. 'com,io,dev')")
  .option("--max-price <usd>", "Include purchasable domains up to this USD budget", "0")
  .option("--out <file>", "Output CSV file", "domain-check-results.csv")
  .action(async (raw: Record<string, string>) => {
    const opts = parseHuntOpts(raw);
    const tldLabel = opts.tlds.map((t) => `.${t}`).join(", ");
    const budgetLabel = opts.maxPriceUSD > 0 ? ` (budget <= USD ${opts.maxPriceUSD})` : "";
    process.stderr.write(chalk.dim(`Finding ${opts.count} domains (${opts.min}-${opts.max} chars) [${tldLabel}]${budgetLabel}...\n`));

    const found = await runHuntRound({ round: 1, opts, seen: new Set(), found: [] });
    const rows = sortDomainRows(found);
    await persistDomainRows(rows, opts.out);
    printDomainRows(rows, { maxPriceUSD: opts.maxPriceUSD });
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(chalk.red(`Error: ${message}\n`));
  process.exitCode = 1;
});
