export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

export function isVowel(ch: string): boolean {
  return ch.length === 1 && "aeiou".includes(ch);
}

export function normalizeName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\.com$/i, "")
    .replace(/[^a-z]/g, "");
}
