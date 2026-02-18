# Agents

## Release / Tagging

This repo uses **Conventional Commits** and **automatic tagging** via `standard-version`.

- The GitHub Actions publish workflow triggers on tags matching `v*` (`.github/workflows/publish.yml`).
- Create releases by running the release CLI (it will bump `package.json`, generate/update `CHANGELOG.md`, create a release commit, and create a `vX.Y.Z` tag).

Commands:

```bash
# preview what would happen
pnpm run release:dry

# create a release commit + tag (local)
pnpm run release

# push commit + tags (this triggers npm publish)
git push origin main --follow-tags
```

Notes:

- Keep commit messages Conventional Commit compliant.
- Do not manually create version tags; use `pnpm run release` so changelog + version stay consistent.
