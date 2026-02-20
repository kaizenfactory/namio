import { pick, isVowel } from "./util";
import { isQuality } from "./quality";

// --- phoneme inventories ---

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
  b: ["p", "v", "d"], c: ["k", "s", "g"], d: ["t", "b", "g"],
  f: ["v", "p", "s"], g: ["k", "c", "d"], k: ["c", "g", "t"],
  l: ["r", "n", "m"], m: ["n", "l", "r"], n: ["m", "l", "r"],
  p: ["b", "t", "f"], r: ["l", "n", "m"], s: ["z", "c", "t"],
  t: ["d", "p", "c"], v: ["f", "b", "z"], z: ["s", "v", "c"],
};

export const DEFAULT_SEEDS = [
  "search", "find", "discover", "combine", "win", "goal",
  "reach", "scope", "spot", "signal", "surface", "emerge",
] as const;

// --- syllable builders ---

const onset = (): string =>
  Math.random() < 0.3 ? pick(CC_ONSETS) : pick(C_ONSETS);

const syllable = (): string => [pick(C_ONSETS), pick(V)].join("");

const openSyllable = (): string => [onset(), pick(V)].join("");

// --- strategies (syllable-based, no truncation) ---

const generateCVCV = (): string => {
  const count = Math.random() < 0.6 ? 2 : 3;
  const syllables = Array.from({ length: count }, (_, i) =>
    i === 0 ? openSyllable() : syllable(),
  ).join("");
  const coda = Math.random() < 0.3 ? pick(CODAS) : "";
  return syllables + coda;
};

const generateBridged = (): string => {
  const head = [onset(), pick(V), pick(C_BRIDGES), pick(V)].join("");
  const r = Math.random();
  const tail =
    r < 0.3 ? syllable()
    : r < 0.5 ? pick(SOFT_CODAS)
    : "";
  return head + tail;
};

const generateWithEnding = (): string => {
  const ending = pick(ENDINGS);
  const base = openSyllable();
  const bridge = Math.random() < 0.6
    ? [pick(SINGLE_BRIDGES), pick(V)].join("")
    : "";
  return base + bridge + ending;
};

const generateVowelLed = (): string => {
  const count = Math.random() < 0.5 ? 1 : 2;
  const core = [
    pick(V),
    ...Array.from({ length: count }, syllable),
  ].join("");
  const r = Math.random();
  const tail =
    r < 0.3 ? [pick(SINGLE_BRIDGES), pick(V)].join("")
    : r < 0.5 ? pick(CODAS)
    : "";
  return core + tail;
};

const generateMutant = (seeds: readonly string[]): string => {
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
  return mutated + ending;
};

// --- weighted strategy selection ---

type Strategy = { readonly weight: number; readonly fn: () => string };

const buildStrategies = (seeds: readonly string[]): readonly Strategy[] => [
  { weight: 2, fn: generateCVCV },
  { weight: 2, fn: generateBridged },
  { weight: 1, fn: generateWithEnding },
  { weight: 1, fn: generateVowelLed },
  { weight: 1, fn: () => generateMutant(seeds) },
];

const pickWeighted = (strategies: readonly Strategy[]): string => {
  const total = strategies.reduce((sum, s) => sum + s.weight, 0);
  let roll = Math.random() * total;
  for (const s of strategies) {
    roll -= s.weight;
    if (roll <= 0) return s.fn();
  }
  return strategies[strategies.length - 1]!.fn();
};

// --- public: generator factory ---

export type GeneratorParams = {
  readonly min: number;
  readonly max: number;
  readonly seedWords: readonly string[];
};

export type NameGenerator = {
  readonly next: (count: number) => readonly string[];
};

export const createGenerator = (params: GeneratorParams): NameGenerator => {
  const { min, max, seedWords } = params;
  const seeds = seedWords.map((s) => s.trim().toLowerCase()).filter(Boolean);
  const strategies = buildStrategies(seeds);
  const seen = new Set<string>();

  return {
    next: (count: number): readonly string[] => {
      const candidates: string[] = [];
      const maxAttempts = count * 50;

      for (let attempts = 0; attempts < maxAttempts && candidates.length < count; attempts++) {
        const word = pickWeighted(strategies).toLowerCase();
        if (word.length < min || word.length > max) continue;
        if (!isQuality(word)) continue;
        if (seen.has(word)) continue;
        if (seeds.includes(word)) continue;
        seen.add(word);
        candidates.push(word);
      }

      return candidates;
    },
  };
};
