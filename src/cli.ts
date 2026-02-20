#!/usr/bin/env bun

import { Command } from "commander";
import chalk from "chalk";
import { readFile, writeFile } from "node:fs/promises";
import pkg from "../package.json";
import { createGenerator, DEFAULT_SEEDS } from "./generator";
import { checkNames, sortClassified } from "./check";
import { hunt } from "./hunt";
import { printResults, persistResults } from "./display";
import { normalizeName } from "./util";
import { parseCsvFirstColumn, toCsv } from "./csv";
import type { GenerateOpts, CheckOpts, HuntOpts, OutputFormat } from "./types";

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

const parseFormat = (raw: string | undefined): OutputFormat => {
  const valid: readonly OutputFormat[] = ["text", "json", "csv"];
  const f = (raw ?? "text") as OutputFormat;
  return valid.includes(f) ? f : "text";
};

const parseGenerateOpts = (opts: Record<string, string>): GenerateOpts => ({
  count: parseInt(opts.count!),
  min: parseInt(opts.min!),
  max: parseInt(opts.max!),
  seedWords: parseSeedWords(opts.seed),
  out: opts.out ?? null,
  format: parseFormat(opts.format),
});

const parseCheckOpts = (
  names: readonly string[],
  opts: Record<string, string>,
): CheckOpts & { readonly file?: string } => ({
  names,
  tlds: opts.tlds ? parseTlds(opts.tlds) : [...DEFAULT_TLDS],
  maxPriceUSD: parseInt(opts.maxPrice ?? "0"),
  out: opts.out ?? null,
  format: parseFormat(opts.format),
  file: opts.file,
});

const parseHuntOpts = (opts: Record<string, string>): HuntOpts => ({
  count: parseInt(opts.count!),
  min: parseInt(opts.min!),
  max: parseInt(opts.max!),
  seedWords: parseSeedWords(opts.seed),
  tlds: opts.tlds ? parseTlds(opts.tlds) : [...DEFAULT_TLDS],
  maxPriceUSD: parseInt(opts.maxPrice ?? "0"),
  out: opts.out ?? null,
  format: parseFormat(opts.format),
});

// --- stdin helper ---

const readStdin = (): Promise<string> =>
  new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
    process.stdin.resume();
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
  .option("--out <file>", "Write CSV to file (default: stdout only)")
  .option("--format <fmt>", "Output format: text, json, csv", "text")
  .action(async (raw: Record<string, string>) => {
    const opts = parseGenerateOpts(raw);
    const generator = createGenerator({ min: opts.min, max: opts.max, seedWords: opts.seedWords });
    const candidates = generator.next(opts.count);
    const words = [...new Set(candidates)].sort();

    switch (opts.format) {
      case "json":
        process.stdout.write(JSON.stringify(words, null, 2) + "\n");
        break;
      case "csv":
        process.stdout.write(toCsv([["name"], ...words.map((w) => [w])]));
        break;
      case "text":
        process.stdout.write(words.join("\n") + "\n");
        break;
    }

    if (opts.out) {
      const csv = toCsv([["name"], ...words.map((w) => [w])]);
      await writeFile(opts.out, csv, "utf8");
      process.stderr.write(chalk.dim(`Saved ${words.length} to ${opts.out}\n`));
    }
  });

program
  .command("check")
  .description("Check domain availability for names or a CSV file")
  .argument("[names...]", "Names to check")
  .option("--file <csv>", "Read names from CSV (first column)")
  .option("--tlds <tlds>", "TLDs to check (comma or space-separated, e.g. 'com,io,dev')")
  .option("--max-price <usd>", "Include purchasable domains up to this USD budget", "0")
  .option("--out <file>", "Write CSV to file")
  .option("--format <fmt>", "Output format: text, json, csv", "text")
  .action(async (names: string[], raw: Record<string, string>) => {
    const opts = parseCheckOpts(names, raw);
    const fromArgs = opts.names.map(normalizeName).filter(Boolean);
    const fromFile = opts.file
      ? parseCsvFirstColumn(await readFile(opts.file, "utf8")).map(normalizeName).filter(Boolean)
      : [];
    const fromStdin = !process.stdin.isTTY
      ? parseCsvFirstColumn(await readStdin()).map(normalizeName).filter(Boolean)
      : [];

    const unique = [...new Set([...fromStdin, ...fromFile, ...fromArgs])];
    if (unique.length === 0) {
      throw new Error("No names provided. Use positional names, --file <csv>, or pipe via stdin.");
    }

    const rows = await checkNames({ names: unique, tlds: opts.tlds, maxPriceUSD: opts.maxPriceUSD });
    if (opts.out) await persistResults(rows, opts.out);
    printResults(rows, { maxPriceUSD: opts.maxPriceUSD, format: opts.format });
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
  .option("--out <file>", "Write CSV to file")
  .option("--format <fmt>", "Output format: text, json, csv", "text")
  .action(async (raw: Record<string, string>) => {
    const opts = parseHuntOpts(raw);

    // collect streamed results
    const results = [];
    for await (const row of hunt(opts)) {
      results.push(row);
      // stream individual hits to stderr in text mode for live feedback
      if (opts.format === "text") {
        const symbol = row.status === "FREE" ? chalk.green("+") : chalk.yellow("$");
        const price = row.status === "BUY" ? ` - USD ${row.priceUSD ?? "?"} (${row.market ?? "?"})` : "";
        process.stderr.write(`  ${symbol} ${row.domain}${price}\n`);
      }
    }

    const sorted = sortClassified(results);
    if (opts.out) await persistResults(sorted, opts.out);
    printResults(sorted, { maxPriceUSD: opts.maxPriceUSD, format: opts.format });
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(chalk.red(`Error: ${message}\n`));
  process.exitCode = 1;
});
