import { pick, isVowel } from "./util";
import { isQuality } from "./quality";

const C_ONSETS = ["b", "c", "d", "f", "g", "k", "l", "m", "n", "p", "r", "s", "t", "v", "z"] as const;
const CC_ONSETS = ["br", "cr", "dr", "fl", "fr", "gl", "gr", "pr", "tr", "sc", "sp", "st", "cl"] as const;
const V = ["a", "e", "i", "o", "u"] as const;
const C_BRIDGES = [
  "l",
  "r",
  "n",
  "m",
  "s",
  "t",
  "c",
  "v",
  "p",
  "ll",
  "rr",
  "tt",
  "ss",
  "nt",
  "nc",
  "nd",
  "nv",
  "lt",
  "lc",
  "lv",
  "rt",
  "rc",
  "rv",
  "rs",
  "rm",
  "rn",
  "st",
  "sc",
  "sp",
] as const;
const ENDINGS = [
  "a",
  "e",
  "i",
  "o",
  "io",
  "ia",
  "eo",
  "ea",
  "al",
  "el",
  "il",
  "ol",
  "an",
  "en",
  "on",
  "in",
  "ar",
  "er",
  "or",
  "is",
  "os",
  "us",
  "ix",
  "ex",
  "um",
] as const;

export function generateCandidates(params: {
  count: number;
  min: number;
  max: number;
  seedWords: string[];
  seen?: Set<string>;
}): { candidates: string[]; seen: Set<string> } {
  const { count, min, max, seedWords } = params;
  const seen = params.seen ?? new Set<string>();

  const seeds = seedWords
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const generators = [
    () => generateCVCV(max),
    () => generateCVCV(max),
    () => generateBridged(max),
    () => generateBridged(max),
    () => generateWithEnding(min, max),
    () => generateVowelLed(max),
    () => generateMutant(seeds, min, max),
  ];

  const out: string[] = [];
  const maxAttempts = count * 50;
  let attempts = 0;

  while (out.length < count && attempts < maxAttempts) {
    attempts++;
    const word = pick(generators)().toLowerCase();
    if (!isQuality(word, min, max)) continue;
    if (seen.has(word)) continue;
    if (seeds.includes(word)) continue;
    seen.add(word);
    out.push(word);
  }

  return { candidates: out, seen };
}

function generateCVCV(max: number): string {
  const syllables = Math.random() < 0.6 ? 2 : 3;
  let word = "";
  for (let i = 0; i < syllables; i++) {
    word += i === 0 && Math.random() < 0.3 ? pick(CC_ONSETS) : pick(C_ONSETS);
    word += pick(V);
  }
  if (Math.random() < 0.3) word += pick(["l", "r", "n", "s", "x"]);
  return word.slice(0, max);
}

function generateBridged(max: number): string {
  let word = "";
  word += Math.random() < 0.25 ? pick(CC_ONSETS) : pick(C_ONSETS);
  word += pick(V);
  word += pick(C_BRIDGES);
  word += pick(V);

  const r = Math.random();
  if (r < 0.3 && word.length < max - 1) {
    word += pick(C_ONSETS);
    word += pick(V);
  } else if (r < 0.5) {
    word += pick(["l", "r", "n", "s"]);
  }

  return word.slice(0, max);
}

function generateWithEnding(min: number, max: number): string {
  const ending = pick(ENDINGS);
  const targetLen = min + Math.floor(Math.random() * Math.max(1, max - min + 1));
  const stemLen = Math.max(2, targetLen - ending.length);

  let stem = "";
  stem += Math.random() < 0.3 ? pick(CC_ONSETS) : pick(C_ONSETS);
  stem += pick(V);

  if (stem.length < stemLen) {
    stem += pick(C_BRIDGES.filter((b) => b.length === 1));
    if (stem.length < stemLen) stem += pick(V);
  }

  return (stem.slice(0, stemLen) + ending).slice(0, max);
}

function generateVowelLed(max: number): string {
  let word = pick(V);
  const syllables = Math.random() < 0.5 ? 1 : 2;
  for (let i = 0; i < syllables; i++) {
    word += pick(C_ONSETS);
    word += pick(V);
  }
  const r = Math.random();
  if (r < 0.3 && word.length < max - 2) {
    word += pick(C_BRIDGES.filter((b) => b.length === 1));
    word += pick(V);
  } else if (r < 0.5) {
    word += pick(["l", "r", "n", "s", "x"]);
  }
  return word.slice(0, max);
}

function generateMutant(seeds: string[], min: number, max: number): string {
  const seed = pick(seeds.length ? seeds : ["signal", "search", "name"]).toLowerCase();
  const sliceLen = 3 + Math.floor(Math.random() * 2);
  const start = Math.floor(Math.random() * Math.max(1, seed.length - sliceLen + 1));
  let stem = seed.slice(start, start + sliceLen);

  const pos = Math.floor(Math.random() * Math.max(1, stem.length));
  const ch = stem[pos] ?? "";
  if (ch && isVowel(ch)) {
    stem = stem.slice(0, pos) + pick(V.filter((v) => v !== ch)) + stem.slice(pos + 1);
  } else if (ch) {
    const similar: Record<string, string[]> = {
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
    const opts = similar[ch] ?? [...C_ONSETS];
    stem = stem.slice(0, pos) + pick(opts) + stem.slice(pos + 1);
  }

  const ending = pick(ENDINGS);
  let word = `${stem}${ending}`;
  if (word.length < min) word = `${stem}${pick(V)}${pick(C_ONSETS)}${ending}`;
  return word.slice(0, max);
}
