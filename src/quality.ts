import { isVowel } from "./util";

const BAD_STARTS = [
  "ng", "mk", "zz", "xx", "hh", "sz", "zr", "pn", "gn", "bn", "dm", "pm", "tm",
] as const;

const MAX_CONSONANT_RUN = 2;
const MAX_VOWEL_RUN = 2;
const MIN_TRANSITION_RATIO = 0.4;

type ScanState = {
  readonly cRun: number;
  readonly vRun: number;
  readonly prevCh: string;
  readonly sameRun: number;
  readonly transitions: number;
  readonly failed: boolean;
};

const INITIAL_STATE: ScanState = {
  cRun: 0,
  vRun: 0,
  prevCh: "",
  sameRun: 1,
  transitions: 0,
  failed: false,
};

const scanChar = (state: ScanState, ch: string): ScanState => {
  if (state.failed) return state;

  const vowel = isVowel(ch);
  const cRun = vowel ? 0 : state.cRun + 1;
  const vRun = vowel ? state.vRun + 1 : 0;
  const sameRun = ch === state.prevCh ? state.sameRun + 1 : 1;
  const transitions =
    state.prevCh !== "" && isVowel(ch) !== isVowel(state.prevCh)
      ? state.transitions + 1
      : state.transitions;

  const failed =
    cRun > MAX_CONSONANT_RUN ||
    vRun > MAX_VOWEL_RUN ||
    sameRun > 2;

  return { cRun, vRun, prevCh: ch, sameRun, transitions, failed };
};

export const isQuality = (word: string, min: number, max: number): boolean => {
  if (word.length < min || word.length > max) return false;
  if (![...word].some(isVowel)) return false;
  if (BAD_STARTS.some((b) => word.startsWith(b))) return false;

  const final = [...word].reduce(scanChar, INITIAL_STATE);

  if (final.failed) return false;
  if (word.length > 1 && final.transitions / (word.length - 1) < MIN_TRANSITION_RATIO) return false;

  return true;
};
