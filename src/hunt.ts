import chalk from "chalk";
import { createGenerator } from "./generator";
import { checkDomains } from "./domain/ids";
import { classify, type ClassifiedDomain, type HuntOpts } from "./types";

const GEN_BATCH = 120;
const MAX_ROUNDS = 100;
const MAX_GEN_PER_ROUND = 500;
const INTER_ROUND_DELAY_MS = 200;

export async function* hunt(opts: HuntOpts): AsyncGenerator<ClassifiedDomain> {
  const generator = createGenerator({
    min: opts.min,
    max: opts.max,
    seedWords: opts.seedWords,
  });

  const tldLabel = opts.tlds.map((t) => `.${t}`).join(", ");
  const budgetLabel = opts.maxPriceUSD > 0 ? ` (budget <= USD ${opts.maxPriceUSD})` : "";
  process.stderr.write(
    chalk.dim(`Finding ${opts.count} domains (${opts.min}-${opts.max} chars) [${tldLabel}]${budgetLabel}...\n`),
  );

  let totalFound = 0;

  for (let round = 1; round <= MAX_ROUNDS && totalFound < opts.count; round++) {
    const batchCount = Math.min(GEN_BATCH * Math.ceil(round / 3), MAX_GEN_PER_ROUND);
    const candidates = generator.next(batchCount);
    if (candidates.length === 0) break;

    let roundFound = 0;

    for await (const result of checkDomains(candidates, opts.tlds, { batchDelayMs: 150 })) {
      if (totalFound >= opts.count) break;

      const classified = classify(result, opts.maxPriceUSD);
      if (classified.status === "FREE" || classified.status === "BUY") {
        yield classified;
        totalFound++;
        roundFound++;
      }
    }

    process.stderr.write(
      chalk.dim(
        `Round ${String(round).padStart(2)}: generated ${String(candidates.length).padStart(3)} -> ${String(roundFound).padStart(2)} found (total ${totalFound}/${opts.count})\n`,
      ),
    );

    if (totalFound < opts.count && round < MAX_ROUNDS) {
      await new Promise((r) => setTimeout(r, INTER_ROUND_DELAY_MS));
    }
  }
}
