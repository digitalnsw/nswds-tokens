# Security policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately via
[GitHub private vulnerability reporting](https://github.com/digitalnsw/nswds-tokens/security/advisories/new)
("Report a vulnerability" on the repository's **Security** tab). Do **not** open a public
issue for security reports.

We aim to acknowledge reports within 5 business days.

## Supported versions

Only the latest major version published to npm receives security fixes.

## Secrets and credential handling

This repository integrates with the Figma REST API and npm. The rules:

- **Never commit credentials.** `.env*` files are gitignored; local Figma tokens belong in
  an untracked `.env` only. CI uses **GitHub Actions Secrets** exclusively
  (`sync-figma-to-tokens.yml`, `sync-tokens-to-figma.yml`), and npm publishing uses
  **OIDC trusted publishing** (no long-lived npm token).
- **If a credential is ever committed or printed in logs, rotate it immediately** — removal
  from the working tree is not enough; git history and CI logs persist. Generate a new
  Figma personal access token and update the GitHub Secret.
- Scoped tokens only: Figma tokens should have the minimum scopes required for variable
  read/write on the synced file.

## Package integrity

Releases are published by `semantic-release` from `main` with npm **provenance
attestations**. Verify with `npm audit signatures`.
