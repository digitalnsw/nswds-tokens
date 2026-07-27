// Release-plugin regression guard (C2).
//
// Runs the repo's ACTUAL @semantic-release/changelog and @semantic-release/git
// configuration (imported from release.config.mjs) against a throwaway repo and
// bare remote, and asserts what the plugins actually do: the changelog gets the
// notes, the release commit carries the rendered message and exactly the
// configured assets, and it reaches the remote. Hermetic — a temp dir, no
// network, no npm auth, no tokens — so it is cheap enough to run on every PR.
//
// Why it exists: nothing else in CI executes semantic-release. `--dry-run`
// stops at plugin loading on a PR branch, and on `main` it aborts at
// @semantic-release/npm's registry auth check, so the git and changelog hooks
// are never reached. That left the plugins that write CHANGELOG.md and push the
// version-bump commit to `main` covered by nothing until a release ran — the
// silent-failure mode release.yml already documents. #138 (the ESM-only
// @semantic-release/git v11 / changelog v7 majors) is exactly the class of
// change this catches: an ESM conversion that drops a named hook export, or a
// commit-message change that eats `[skip ci]`, passes every other gate.
//
// Companion to assert-release-rules.mjs, which guards the version-bump decision.
//
// Run it with `npm run check:release-plugins`. The `Release plugins` CI job
// that invokes it on every PR lands with #145.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import releaseConfig from '../release.config.mjs'

const CHANGELOG_PLUGIN = '@semantic-release/changelog'
const GIT_PLUGIN = '@semantic-release/git'

// Stand-in release. The notes are deliberately hostile: markdown headings and
// issue refs start with `#`, which git strips under the wrong --cleanup mode.
const NEXT_VERSION = '9.9.9'
const NOTES = [
  '## <small>9.9.9 (2026-01-01)</small>',
  '',
  '* fix(build): a change ([abc1234](https://example.invalid/commit/abc1234)), closes [#1](https://example.invalid/issues/1)',
  '# a bare comment-looking line',
  '* chore(deps): bump `style-dictionary`',
].join('\n')

// "Hermetic" has to mean the caller's git config too. A developer with
// `commit.gpgsign = true` (common) or a `core.hooksPath` pointing at husky
// otherwise gets a crash that reads like a release-plugin regression — the
// worst failure mode for a guard whose whole value is trustworthy signal.
// This env is passed to BOTH our own git calls and, via contextFor(), to
// @semantic-release/git: the plugin runs the actual release commit itself,
// so hardening only this helper would leave the operation under test exposed.
// (GIT_CONFIG_GLOBAL needs git >= 2.32; makeRepo() also sets the two settings
// per-repo so older git is still covered.)
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
}

// stderr is piped, not inherited: `git push` chatters on stderr even when it
// succeeds, and that noise buries the ✓/✗ lines. Failures still surface via the
// thrown error, which carries stderr.
const git = (args, cwd) =>
  execFileSync('git', args, {
    cwd,
    env: GIT_ENV,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
const quiet = { log: () => {}, error: () => {}, warn: () => {}, info: () => {}, debug: () => {} }

/** Pull a plugin's config out of release.config.mjs, whether bare or `[name, config]`. */
function pluginConfigFor(name) {
  const entry = releaseConfig.plugins.find((p) => (Array.isArray(p) ? p[0] : p) === name)
  if (!entry) {
    console.error(`✗ ${name} is not configured in release.config.mjs`)
    process.exit(1)
  }
  return Array.isArray(entry) ? (entry[1] ?? {}) : {}
}

const changelogConfig = pluginConfigFor(CHANGELOG_PLUGIN)
const gitConfig = pluginConfigFor(GIT_PLUGIN)

const changelogFile = changelogConfig.changelogFile ?? 'CHANGELOG.md'
const assets = gitConfig.assets ?? []

let failed = 0
function check(ok, label, detail) {
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`)
}

function reportAndExit() {
  // reportAndExit() can be reached via process.exit(), which does not run the
  // finally block below — so sweep here too. Idempotent: rmSync is force:true
  // and the list is emptied.
  removeTempDirs()
  if (failed > 0) {
    console.error(
      `\n✗ Release-plugin assertion FAILED (${failed} check(s)). ` +
        `${CHANGELOG_PLUGIN} and ${GIT_PLUGIN} drive ${changelogFile} and the version-bump ` +
        `commit pushed to main — a failure here means the next release breaks. Check the ` +
        `plugin majors and their config in release.config.mjs.`,
    )
    process.exit(1)
  }
  console.log(
    `\n✅ Release plugins behave: notes reach ${changelogFile}, and the release commit carries ` +
      `the rendered message and configured assets to the remote.`,
  )
}

// Every temp dir created, registered the moment it exists. Deliberately not
// populated by the caller after makeRepo() returns: a throw partway through
// makeRepo() would then leak both dirs, since the finally block would never
// see them.
const cleanup = []

function removeTempDirs() {
  while (cleanup.length > 0) {
    fs.rmSync(cleanup.pop(), { recursive: true, force: true })
  }
}

/** A temp repo wired to a bare remote, seeded with every configured asset. */
function makeRepo() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'nswds-release-'))
  cleanup.push(cwd)
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'nswds-release-remote-'))
  cleanup.push(remote)
  git(['init', '--bare', '-b', 'main', remote])
  git(['init', '-b', 'main'], cwd)
  git(['config', 'user.email', 'ci@example.invalid'], cwd)
  git(['config', 'user.name', 'Release Guard'], cwd)
  // Belt and braces alongside GIT_ENV, for git older than 2.32.
  git(['config', 'commit.gpgsign', 'false'], cwd)
  git(['config', 'core.hooksPath', '/dev/null'], cwd)
  git(['remote', 'add', 'origin', remote], cwd)
  for (const asset of assets) {
    fs.writeFileSync(path.join(cwd, asset), asset === changelogFile ? '# Changelog\n' : 'seed\n')
  }
  git(['add', '.'], cwd)
  git(['commit', '-m', 'chore: seed'], cwd)
  git(['push', 'origin', 'main'], cwd)
  return { cwd, remote }
}

function contextFor({ cwd, remote }) {
  return {
    cwd,
    env: GIT_ENV,
    branch: { name: 'main' },
    options: { repositoryUrl: remote, branch: 'main' },
    lastRelease: { version: '9.9.8', gitTag: 'v9.9.8' },
    nextRelease: { version: NEXT_VERSION, gitTag: `v${NEXT_VERSION}`, notes: NOTES },
    logger: quiet,
  }
}

try {
  const changelogPlugin = await import(CHANGELOG_PLUGIN)
  const gitPlugin = await import(GIT_PLUGIN)

  // 1. Named hook exports. An ESM conversion that renames or drops a hook fails
  //    here rather than mid-release.
  for (const [name, plugin] of [
    [CHANGELOG_PLUGIN, changelogPlugin],
    [GIT_PLUGIN, gitPlugin],
  ]) {
    for (const hook of ['verifyConditions', 'prepare']) {
      check(
        typeof plugin[hook] === 'function',
        `${name} exports ${hook}()`,
        `got ${typeof plugin[hook]}; semantic-release resolves hooks by name`,
      )
    }
  }
  // Bail before the git work: with a hook missing there is nothing left to exercise.
  if (failed > 0) reportAndExit()

  // 2. The happy path: changelog writes, git commits and pushes.
  const repo = makeRepo()
  const context = contextFor(repo)

  await changelogPlugin.verifyConditions(changelogConfig, context)
  await changelogPlugin.prepare(changelogConfig, context)
  const changelog = fs.readFileSync(path.join(repo.cwd, changelogFile), 'utf8')
  check(
    changelog.includes(NOTES),
    `${CHANGELOG_PLUGIN} writes the notes to ${changelogFile}`,
    'notes missing',
  )
  check(
    changelog.includes('# Changelog'),
    `${CHANGELOG_PLUGIN} preserves existing ${changelogFile} content`,
    'previous content lost',
  )

  // Touch one more asset so the commit has to pick up more than the changelog.
  const touched = assets.find((a) => a !== changelogFile)
  if (touched) fs.writeFileSync(path.join(repo.cwd, touched), 'changed\n')

  await gitPlugin.verifyConditions(gitConfig, context)
  await gitPlugin.prepare(gitConfig, context)

  // Not the git() helper: the raw body must not be trimmed. Still GIT_ENV —
  // a global `log.showSignature` would otherwise contaminate the output.
  const message = execFileSync('git', ['log', '-1', '--pretty=%B'], {
    cwd: repo.cwd,
    env: GIT_ENV,
    encoding: 'utf8',
  })
  check(
    message.includes(NEXT_VERSION),
    `${GIT_PLUGIN} renders the version into the commit message`,
    `got ${JSON.stringify(message.split('\n')[0])}`,
  )
  check(
    message.includes(NOTES),
    `${GIT_PLUGIN} renders the full notes into the commit body`,
    'notes missing or mangled (check git --cleanup handling of `#` lines)',
  )

  // `[skip ci]` stops the release commit re-triggering CI. Only asserted when
  // the configured template asks for it, so intentionally dropping it is not a
  // failure — the plugin silently eating it is.
  if ((gitConfig.message ?? '').includes('[skip ci]')) {
    check(
      message.includes('[skip ci]'),
      `${GIT_PLUGIN} preserves [skip ci] in the commit message`,
      'the release commit would re-trigger CI',
    )
  }

  const committed = git(['show', '--pretty=', '--name-only', 'HEAD'], repo.cwd).split('\n').sort()
  const expected = [changelogFile, touched].filter(Boolean).sort()
  check(
    JSON.stringify(committed) === JSON.stringify(expected),
    `${GIT_PLUGIN} commits exactly the changed configured assets`,
    `committed ${JSON.stringify(committed)}, expected ${JSON.stringify(expected)}`,
  )

  const localHead = git(['rev-parse', 'HEAD'], repo.cwd)
  const remoteHead = git(['rev-parse', 'main'], repo.remote)
  check(
    localHead === remoteHead,
    `${GIT_PLUGIN} pushes the release commit to the remote`,
    'remote is behind; the release would tag a commit that never landed',
  )

  // 3. Nothing to commit must be a no-op, not a crash or an empty commit.
  const clean = makeRepo()
  const before = git(['rev-parse', 'HEAD'], clean.cwd)
  await gitPlugin.prepare(gitConfig, contextFor(clean))
  check(
    before === git(['rev-parse', 'HEAD'], clean.cwd),
    `${GIT_PLUGIN} makes no commit when no asset changed`,
    'an empty release commit was created',
  )
} catch (error) {
  // An unexpected throw — a git invocation dying, a plugin API change — must
  // still report as a legible ✗ rather than a raw Node stack trace, and must
  // still reach the cleanup below.
  failed++
  const detail = String(error?.stderr || error?.message || error)
    .trim()
    .split('\n')
    .filter(Boolean)
    .slice(-1)[0]
  console.log(`✗ the guard did not finish — ${detail ?? 'unknown error'}`)
} finally {
  removeTempDirs()
}

reportAndExit()
