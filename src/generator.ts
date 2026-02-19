import { pick, isVowel } from "./util";
import { isQuality } from "./quality";

const C_ONSETS = ["b", "c", "d", "f", "g", "k", "l", "m", "n", "p", "r", "s", "t", "v", "z"] as const;
const CC_ONSETS = ["br", "cr", "dr", "fl", "fr", "gl", "gr", "pr", "tr", "sc", "sp", "st", "cl"] as const;
const V = ["a", "e", "i", "o", "u"] as const;
const C_BRIDGES = [
  "l", "r", "n", "m", "s", "t", "c", "v", "p",
  "ll", "rr", "tt", "ss",
  "nt", "nc", "nd", "nv",
  "lt", "lc", "lv",
  "rt", "rc", "rv", "rs", "rm", "rn",
  "st", "sc", "sp",
] as const;
const SINGLE_BRIDGES = C_BRIDGES.filter((b) => b.length === 1);
const ENDINGS = [
  "a", "e", "i", "o",
  "io", "ia", "eo", "ea",
  "al", "el", "il", "ol",
  "an", "en", "on", "in",
  "ar", "er", "or",
  "is", "os", "us",
  "ix", "ex", "um",
] as const;
const CODAS = ["l", "r", "n", "s", "x"] as const;
const SOFT_CODAS = ["l", "r", "n", "s"] as const;

const SIMILAR_CONSONANTS: Readonly<Record<string, readonly string[]>> = {
  b: ["p", "v", "d"],
  c: ["k", "s", "g"],
  d: ["t", "b", "g"],
  f: ["v", "p", "s"],
  g: ["k", "c", "d"],
  k: ["c", "g", "t"],
  l: ["r", "n", "m"],
  m: ["n", "l", "r"],
  n: ["m", "l", "r"],
  p: ["b", "t", "f"],
  r: ["l", "n", "m"],
  s: ["z", "c", "t"],
  t: ["d", "p", "c"],
  v: ["f", "b", "z"],
  z: ["s", "v", "c"],
};

export const DEFAULT_SEEDS = [
  "search", "find", "discover", "combine", "win", "goal",
  "reach", "scope", "spot", "signal", "surface", "emerge",
] as const;

type GeneratorEntry = {
  readonly weight: number;
  readonly fn: (min: number, max: number) => string;
};

const GENERATORS: readonly GeneratorEntry[] = [
  { weight: 2, fn: (_min, max) => generateCVCV(max) },
  { weight: 2, fn: (_min, max) => generateBridged(max) },
  { weight: 1, fn: (min, max) => generateWithEnding(min, max) },
  { weight: 1, fn: (_min, max) => generateVowelLed(max) },
];

const TOTAL_WEIGHT = GENERATORS.reduce((sum, g) => sum + g.weight, 0);

const pickWeighted = (min: number, max: number): string => {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const g of GENERATORS) {
    roll -= g.weight;
    if (roll <= 0) return g.fn(min, max);
  }
  return GENERATORS[GENERATORS.length - 1]!.fn(min, max);
};

export const generateCandidates = (params: {
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly seedWords: readonly string[];
  readonly seen?: Set<string>;
}): { readonly candidates: readonly string[]; readonly seen: Set<string> } => {
  const { count, min, max, seedWords } = params;
  const seen = params.seen ?? new Set<string>();
  const seeds = seedWords.map((s) => s.trim().toLowerCase()).filter(Boolean);

  const generators = [
    ...GENERATORS.flatMap((g) =>
      Array.from({ length: g.weight }, () => g.fn)
    ),
    (mn: number, mx: number) => generateMutant(seeds, mn, mx),
  ];

  const candidates: string[] = [];
  const maxAttempts = count * 50;

  for (let attempts = 0; attempts < maxAttempts && candidates.length < count; attempts++) {
    const word = pick(generators)(min, max).toLowerCase();
    if (!isQuality(word, min, max)) continue;
    if (seen.has(word)) continue;
    if (seeds.includes(word)) continue;
    seen.add(word);
    candidates.push(word);
  }

  return { candidates, seen };
};

const onset = (): string =>
  Math.random() < 0.3 ? pick(CC_ONSETS) : pick(C_ONSETS);

const generateCVCV = (max: number): string => {
  const syllables = Math.random() < 0.6 ? 2 : 3;
  const core = Array.from({ length: syllables }, (_, i) =>
    [i === 0 ? onset() : pick(C_ONSETS), pick(V)].join("")
  ).join("");
  const coda = Math.random() < 0.3 ? pick(CODAS) : "";
  return (core + coda).slice(0, max);
};

const generateBridged = (max: number): string => {
  const head = [onset(), pick(V), pick(C_BRIDGES), pick(V)].join("");
  const r = Math.random();
  const tail =
    r < 0.3 && head.length < max - 1
      ? [pick(C_ONSETS), pick(V)].join("")
      : r < 0.5
        ? pick(SOFT_CODAS)
        : "";
  return (head + tail).slice(0, max);
};

const generateWithEnding = (min: number, max: number): string => {
  const ending = pick(ENDINGS);
  const targetLen = min + Math.floor(Math.random() * Math.max(1, max - min + 1));
  const stemLen = Math.max(2, targetLen - ending.length);

  const base = [onset(), pick(V)].join("");
  const bridge =
    base.length < stemLen
      ? [pick(SINGLE_BRIDGES), base.length + 1 < stemLen ? pick(V) : ""].join("")
      : "";
  const stem = (base + bridge).slice(0, stemLen);

  return (stem + ending).slice(0, max);
};

const generateVowelLed = (max: number): string => {
  const syllables = Math.random() < 0.5 ? 1 : 2;
  const core = [
    pick(V),
    ...Array.from({ length: syllables }, () =>
      [pick(C_ONSETS), pick(V)].join("")
    ),
  ].join("");

  const r = Math.random();
  const tail =
    r < 0.3 && core.length < max - 2
      ? [pick(SINGLE_BRIDGES), pick(V)].join("")
      : r < 0.5
        ? pick(CODAS)
        : "";

  return (core + tail).slice(0, max);
};

const generateMutant = (seeds: readonly string[], min: number, max: number): string => {
  const seed = pick(seeds.length > 0 ? seeds : ["signal", "search", "name"]).toLowerCase();
  const sliceLen = 3 + Math.floor(Math.random() * 2);
  const start = Math.floor(Math.random() * Math.max(1, seed.length - sliceLen + 1));
  const stem = seed.slice(start, start + sliceLen);

  const pos = Math.floor(Math.random() * Math.max(1, stem.length));
  const ch = stem[pos] ?? "";

  const mutated = ch
    ? isVowel(ch)
      ? stem.slice(0, pos) + pick(V.filter((v) => v !== ch)) + stem.slice(pos + 1)
      : stem.slice(0, pos) + pick(SIMILAR_CONSONANTS[ch] ?? [...C_ONSETS]) + stem.slice(pos + 1)
    : stem;

  const ending = pick(ENDINGS);
  const word = mutated + ending;

  return (word.length < min
    ? [mutated, pick(V), pick(C_ONSETS), ending].join("")
    : word
  ).slice(0, max);
};
