# Contributing

## Commit messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/). semantic-release reads those messages on `main` to decide the next npm version.

| Prefix | Release |
| --- | --- |
| `fix:` | patch (`0.1.34` → `0.1.35`) |
| `feat:` | minor (`0.1.34` → `0.2.0`) |
| `feat!:` / `fix!:` or a `BREAKING CHANGE:` footer | major (`1.0.0`) |
| `docs:`, `chore:`, `refactor:`, `test:`, `ci:`, `style:` | no npm release |

Examples already used in this repo:

```text
feat(pinia-tracker): add Pinia store registry
fix(layout): add consistent layout styling
docs(pinia-tracker): document Pinia tracker feature
```

A Husky `commit-msg` hook runs commitlint locally. Pull requests to `main` are also commitlinted in CI.

## Releasing

Do not bump `package.json` by hand and do not push `v*` tags locally.

1. Merge conventional commits to `main`.
2. The `Release` workflow ([`.github/workflows/release.yml`](.github/workflows/release.yml)) runs tests, builds, then **semantic-release**.
3. When there are releasable commits since the last git tag, semantic-release:
   - bumps the version
   - publishes **`nuxt-devtools-observatory`** to the public npm registry with Trusted Publishing (OIDC + provenance)
   - creates the git tag and GitHub Release
   - commits `CHANGELOG.md`, `package.json`, and `pnpm-lock.yaml` (`chore(release): x.y.z [skip ci]`)

The `docs/` workspace is private and is not published.

npm Trusted Publisher must stay mapped to workflow filename **`release.yml`** on this repository. Do not add an `NPM_TOKEN` secret; OIDC is required.

If `main` has no `feat` / `fix` / breaking commits since the current tag, the workflow succeeds and skips publishing.
