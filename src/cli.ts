#!/usr/bin/env bun

import { Command } from "commander";
import chalk from "chalk";
import { readFile, writeFile } from "node:fs/promises";
import pkg from "../package.json";
import { generateCandidates, DEFAULT_SEEDS } from "./generator";
import { checkNames } from "./check";
import { hunt } from "./hunt";
import { printDomainRows, persistDomainRows } from "./display";
import { normalizeName } from "./util";
import { parseCsvFirstColumn, toCsv } from "./csv";
import type { GenerateOpts, CheckOpts, HuntOpts } from "./types";

// --- option parsing ---

const DEFAULT_TLDS = ["com"] as const;

const parseTlds = (value: string): readonly string[] =>
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

const parseCheckOpts = (
  names: readonly string[],
  opts: Record<string, string>,
): CheckOpts & { readonly file?: string } => ({
  names,
  tlds: opts.tlds ? parseTlds(opts.tlds) : [...DEFAULT_TLDS],
  maxPriceUSD: parseInt(opts.maxPrice ?? "0"),
  out: opts.out!,
  file: opts.file,
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
    const fromArgs = opts.names.map(normalizeName).filter(Boolean);
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
    const rows = await hunt(opts);
    await persistDomainRows(rows, opts.out);
    printDomainRows(rows, { maxPriceUSD: opts.maxPriceUSD });
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(chalk.red(`Error: ${message}\n`));
  process.exitCode = 1;
});
