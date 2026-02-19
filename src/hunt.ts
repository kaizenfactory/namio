import chalk from "chalk";
import { generateCandidates } from "./generator";
import { checkDomainsViaIDS } from "./domain/ids";
import { toDomainRow, sortDomainRows, IDS_BATCH_SIZE } from "./check";
import { delay, chunk } from "./util";
import type { DomainRow, HuntOpts } from "./types";

const GEN_BATCH = 120;
const MAX_ROUNDS = 100;
const MAX_GEN_PER_ROUND = 500;
const INTER_BATCH_DELAY_MS = 150;
const INTER_ROUND_DELAY_MS = 200;
const ERROR_RETRY_DELAY_MS = 1000;

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

const runRound = async (params: {
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
  return runRound({ round: round + 1, opts, seen, found: updatedFound });
};

export const hunt = async (opts: HuntOpts): Promise<readonly DomainRow[]> => {
  const tldLabel = opts.tlds.map((t) => `.${t}`).join(", ");
  const budgetLabel = opts.maxPriceUSD > 0 ? ` (budget <= USD ${opts.maxPriceUSD})` : "";
  process.stderr.write(
    chalk.dim(`Finding ${opts.count} domains (${opts.min}-${opts.max} chars) [${tldLabel}]${budgetLabel}...\n`)
  );

  const found = await runRound({ round: 1, opts, seen: new Set(), found: [] });
  return sortDomainRows(found);
};
