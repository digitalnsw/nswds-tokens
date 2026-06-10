## What

<!-- What does this PR change, and why? Link issues if any. -->

## Checklist

- [ ] Branch name follows `<type>[/(issue|ticket)/<id>]/<kebab-case-description>` (see CONTRIBUTING.md)
- [ ] Commits follow Conventional Commits; **breaking token-shape changes use `!` or a `BREAKING CHANGE:` footer**
- [ ] If `tokens/` or `src/` changed: `npm run build` was run and the regenerated `src/`/`dist/` are committed (`npm run check:dist` passes)
- [ ] `npm run validate:tokens` passes (schema, aliases, duplicates, DTCG conformance)
- [ ] `npm run test:tokens`, `npm run lint`, and `npm run typecheck` pass
- [ ] Snapshot changes (if any) are intentional and explained below

## Token impact

<!-- Delete the rows that don't apply. -->

- Resolved values changed: yes/no
- Raw token JSON shape changed (breaking for DTCG consumers): yes/no
- New tokens/layers/themes added: yes/no
