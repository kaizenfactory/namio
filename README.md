# namio

Brandable name generator + `.com` availability checker, inspired by Attio's naming process: https://attio.com/blog/how-we-chose-the-name-attio

## Install / Run

This is a Bun-first CLI.

```bash
# one-off
pnpm dlx namio --help

# or
npx namio --help
```

## Commands

```bash
# Generate pronounceable candidates
namio generate --count 500 --min 4 --max 6 --out generated-words.csv

# Check .com availability for a list
namio check --file generated-words.csv --out domain-check-results.csv

# Include "buy now" / auction listings up to a budget
namio check --file generated-words.csv --max-price 2500 --out domain-check-results.csv

# Generate + check until you find N available domains
namio hunt --count 50 --min 4 --max 6 --out domain-check-results.csv

# Same, but allow purchasable domains up to a budget
namio hunt --count 50 --min 4 --max 6 --max-price 2500 --out domain-check-results.csv
```

## Notes

- Domain checks use InstantDomainSearch's public API endpoint.
- Results are best-effort and may break if the upstream service changes.
