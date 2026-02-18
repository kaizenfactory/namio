import { isVowel } from "./util";

export function isQuality(word: string, min: number, max: number): boolean {
  if (word.length < min || word.length > max) return false;
  if (![...word].some(isVowel)) return false;

  for (let i = 2; i < word.length; i++) {
    if (word[i] === word[i - 1] && word[i] === word[i - 2]) return false;
  }

  let cRun = 0;
  for (const ch of word) {
    cRun = isVowel(ch) ? 0 : cRun + 1;
    if (cRun > 2) return false;
  }

  let vRun = 0;
  for (const ch of word) {
    vRun = isVowel(ch) ? vRun + 1 : 0;
    if (vRun > 2) return false;
  }

  const badStarts = ["ng", "mk", "zz", "xx", "hh", "sz", "zr", "pn", "gn", "bn", "dm", "pm", "tm"];
  if (badStarts.some((b) => word.startsWith(b))) return false;

  let transitions = 0;
  for (let i = 1; i < word.length; i++) {
    if (isVowel(word[i] ?? "") !== isVowel(word[i - 1] ?? "")) transitions++;
  }
  if (word.length > 1 && transitions / (word.length - 1) < 0.4) return false;

  return true;
}
