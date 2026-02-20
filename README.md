# namio

Brandable name generator + domain availability checker.

Generates pronounceable, phonotactically valid candidate names and checks `.com` (or any TLD) availability via InstantDomainSearch. Inspired by [how Attio chose their name](https://attio.com/blog/how-we-chose-the-name-attio).

## Install

```bash
npx namio --help
```

## Commands

### `generate` — create candidate names

Outputs to stdout. Pipe it, redirect it, or add `--out` to also save a CSV.

```bash
# 200 names, 4-7 chars (defaults)
namio generate

# tighter constraints + custom seeds
namio generate --count 500 --min 4 --max 5 --seed "vector vertex verity velvet"

# pipe into check
namio generate --format csv | namio check

# save to file
namio generate --out candidates.csv
```

| Flag | Default | Description |
|------|---------|-------------|
| `--count <n>` | `200` | Number of candidates to generate |
| `--min <n>` | `4` | Minimum name length |
| `--max <n>` | `7` | Maximum name length |
| `--seed <words>` | built-in | Space/comma-separated seed words for mutation strategy |
| `--out <file>` | — | Also write CSV to file (stdout is always written) |
| `--format <fmt>` | `text` | Output format: `text`, `json`, `csv` |

### `check` — look up domain availability

Accepts names as arguments, from a CSV file, or piped via stdin. All three can be combined.

```bash
# positional args
namio check feva adutu piso

# from file
namio check --file candidates.csv

# piped from generate
namio generate --format csv | namio check

# include purchasable domains up to a budget
namio check feva adutu --max-price 250

# check multiple TLDs
namio check feva adutu --tlds com,io,dev
```

| Flag | Default | Description |
|------|---------|-------------|
| `--file <csv>` | — | Read names from CSV (first column) |
| `--tlds <tlds>` | `com` | TLDs to check (comma/space-separated) |
| `--max-price <usd>` | `0` | Include purchasable domains up to this USD budget |
| `--out <file>` | — | Write results CSV to file |
| `--format <fmt>` | `text` | Output format: `text`, `json`, `csv` |

### `hunt` — generate + check in a loop

Generates names and checks availability in rounds until the target count of available domains is found. Streams hits to stderr in real time.

```bash
# find 50 available .com domains
namio hunt --count 50 --min 4 --max 6

# with budget for purchasable domains
namio hunt --count 50 --min 4 --max 6 --max-price 250

# custom seeds, multiple TLDs
namio hunt --count 20 --seed "vector vertex verity" --tlds com,io
```

| Flag | Default | Description |
|------|---------|-------------|
| `--count <n>` | `50` | Number of available domains to find |
| `--min <n>` | `4` | Minimum name length |
| `--max <n>` | `7` | Maximum name length |
| `--seed <words>` | built-in | Seed words for mutation strategy |
| `--tlds <tlds>` | `com` | TLDs to check |
| `--max-price <usd>` | `0` | Include purchasable domains up to this USD budget |
| `--out <file>` | — | Write results CSV to file |
| `--format <fmt>` | `text` | Output format: `text`, `json`, `csv` |

## How it works

### Name generation

Names are built from syllables, not truncated strings. Five weighted strategies run in parallel:

- **CVCV** — chain 2-3 open syllables, optional coda (`palo`, `trisel`)
- **Bridged** — onset + vowel + consonant bridge + vowel + optional tail (`calvo`, `norte`)
- **Ending** — syllable core + fancy ending from a curated set (`velio`, `tural`)
- **Vowel-led** — start with a vowel, append syllables (`ariko`, `elva`)
- **Mutant** — slice a seed word, mutate one phoneme, add an ending (`vercio`, `signel`)

Every candidate passes a phonotactic quality filter that rejects triple consonants, triple vowels, awkward clusters, and repeated bigrams.

### Domain checking

Uses InstantDomainSearch's public API. Requests are batched and rate-limited internally. Results include availability status and, for taken domains, marketplace price and vendor when available.

## Output formats

All commands support `--format text|json|csv`:

- **text** — human-readable table (default)
- **json** — array of objects, one per domain
- **csv** — header row + data rows, pipe-friendly

`generate` and `check` write to stdout. `hunt` writes the final summary to stdout and streams live hits to stderr.

## Notes

- Domain checks use InstantDomainSearch's public API — results are best-effort and may break if the upstream service changes.
- Prices are in USD.
- `--out` writes a CSV file *in addition to* stdout output.
