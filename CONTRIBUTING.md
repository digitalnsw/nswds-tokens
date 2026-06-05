# Contributing to `@nswds/tokens`

Thanks for helping improve the NSW Design System tokens. This guide covers local setup,
the branch/commit conventions the CI enforces, and the rules that keep the published
package consistent.

> For how tokens flow from Figma through to the published outputs, see
> [`docs/architecture.md`](./docs/architecture.md).

---

## Local setup

```bash
git clone https://github.com/digitalnsw/nswds-tokens.git
cd nswds-tokens
nvm use            # Node ^20.19.0 or >=22.12.0
npm install
```

Common scripts:

| Script | Purpose |
| --- | --- |
| `npm run build` | Bundle `src/index.ts` (tsup) and copy/rehydrate outputs into `dist/`. |
| `npm run test:tokens` | Run the Vitest suite (`vitest run --globals`). |
| `npm run lint` | ESLint + Prettier check. |
| `npm run format` | Apply Prettier formatting. |
| `npm run check:dist` | Verify `dist/` matches a fresh build (fails if stale). |
| `npm run smoke:package-surface` | Pack the tarball, install it, and verify every public export resolves. |
| `npm run check:version-sync` | Verify `package.json` / `package-lock.json` / git tag agree. |

---

## ⚠️ Built artifacts are committed

`dist/` is committed to the repo and verified in CI (`check-dist-artifacts.yml`). If a
change touches anything under `src/` or `tokens/`, you **must** rebuild and commit the
regenerated `dist/`:

```bash
npm run build
git add dist
```

A PR whose `dist/` does not match a fresh build will fail CI.

---

## Branch naming

Branch names are validated (`validate-branch-name.yml`). Use:

```
<type>[/(issue|ticket)/<id>]/<kebab-case-description>
```

- **type**: one of `feature`, `bugfix`, `hotfix`, `release`, `docs`, `build`, `test`,
  `refactor`, `style`, `chore`
- Automation branches are also allowed: `copilot/<description>`, `dependabot/<...>`,
  and `alert-autofix-...` (optionally prefixed with `fix/`).
- Examples: `feature/add-spacing-tokens`, `docs/issue/42/tailwind-usage`,
  `bugfix/ticket/ABC-1/grey-500-value`

---

## Commit messages

This repo uses [Conventional Commits](https://www.conventionalcommits.org/); commit
messages drive automated releases (`semantic-release`). Allowed types
(`git-conventional-commits.yaml`):

`feat`, `fix`, `refactor`, `perf`, `style`, `test`, `build`, `ops`, `docs`, `chore`,
`merge`, `revert`.

Release impact:

| Commit | Version bump |
| --- | --- |
| `fix:`, `style:`, `perf:` | patch |
| `feat:` | minor |
| `feat!:` / `BREAKING CHANGE:` footer | major |

> **Token shape changes** to the raw `tokens/**` or `figma/**` JSON are a breaking change
> for DTCG-JSON consumers — use a `!` / `BREAKING CHANGE:` footer and note the migration
> in the PR description.

---

## Pull request checklist

1. Branch name follows the convention above.
2. `npm run lint` passes.
3. `npm run test:tokens` passes.
4. If you changed `src/` or `tokens/`: `npm run build` was run and `dist/` is committed.
5. `npm run smoke:package-surface` passes (for export-surface changes).
6. Commits follow Conventional Commits; breaking token changes are flagged.

---

## Releases

Releases are automated by `semantic-release` on pushes to `main` (npm publish with
provenance, GitHub release, `CHANGELOG.md` update). Do not bump the version or edit
`CHANGELOG.md` manually.
