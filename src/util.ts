export const pick = <T>(arr: readonly T[]): T => {
  if (arr.length === 0) throw new Error("pick: empty array");
  return arr[Math.floor(Math.random() * arr.length)]!;
};

export const isVowel = (ch: string): boolean =>
  ch.length === 1 && "aeiou".includes(ch);

export const normalizeName = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    .replace(/\.com$/i, "")
    .replace(/[^a-z]/g, "");

export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const chunk = <T>(xs: readonly T[], n: number): T[][] =>
  n <= 0 || xs.length === 0
    ? xs.length === 0
      ? []
      : [[...xs]]
    : [xs.slice(0, n) as T[], ...chunk(xs.slice(n), n)];
