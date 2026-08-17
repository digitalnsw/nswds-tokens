#!/usr/bin/env bash
# Temporarily disable a repo's branch rulesets, push, and re-enable them.
#
# This is the sanctioned two-step from MAINTENANCE.md ("Ruleset bypass
# policy") for the case where the default branch must take a push while CI
# is broken. It is deliberately NOT a standing exemption: protection is off
# only for the duration of the push, every original ruleset definition is
# backed up first, and an EXIT trap restores them even on error or Ctrl-C.
#
# Usage:
#   ./push-to-protected-branch.sh                 # prompts for the repo
#   ./push-to-protected-branch.sh digitalnsw/agile
set -euo pipefail

BACKUP_DIR="${TMPDIR:-/tmp}/ruleset-backup-$$"
RESTORED=0
IDS=()        # rulesets we intend to disable
DISABLED=()   # rulesets actually disabled — only these get restored
REPO=""

# The PUT body is a deliberate projection of the six fields GitHub documents
# as writable on a ruleset. The other eight keys a GET returns (_links, id,
# node_id, source, source_type, created_at, updated_at,
# current_user_can_bypass) are read-only and are rejected or ignored on
# write. KNOWN_KEYS is all fourteen: if GitHub ever adds a key we don't know
# about, check_schema() says so out loud rather than letting the projection
# strip a setting silently on restore.
WRITABLE='{name, target, enforcement, conditions, rules, bypass_actors}'
KNOWN_KEYS='["_links","bypass_actors","conditions","created_at",
             "current_user_can_bypass","enforcement","id","name","node_id",
             "rules","source","source_type","target","updated_at"]'

check_schema() {
  local file="$1" id="$2" unknown
  # Bind the key to $k first: inside `$known | index(.)` the `.` would rebind
  # to $known, so the membership test would never match.
  unknown=$(jq -r --argjson known "$KNOWN_KEYS" \
    '[keys[] | . as $k | select(($known | index($k)) == null)] | join(", ")' "$file")
  if [ -n "$unknown" ]; then
    echo "  !! ruleset $id has unrecognised field(s): $unknown" >&2
    echo "     This script only writes back $WRITABLE." >&2
    echo "     If any of the above are writable they will be LOST on restore." >&2
  fi
}

restore() {
  if [ "$RESTORED" = 1 ]; then return; fi
  RESTORED=1
  if [ "${#DISABLED[@]}" -gt 0 ]; then
    echo
    echo "Restoring rulesets…"
    local failed=0
    for id in "${DISABLED[@]}"; do
      if jq "$WRITABLE" "$BACKUP_DIR/$id.json" \
           | gh api -X PUT "repos/$REPO/rulesets/$id" --input - >/dev/null 2>&1; then
        echo "  restored ruleset $id ($(jq -r .name "$BACKUP_DIR/$id.json"))"
      else
        echo "  !! FAILED to restore ruleset $id" >&2
        failed=1
      fi
    done
    if [ "$failed" = 1 ]; then
      echo
      echo "!! One or more rulesets are still DISABLED. Restore by hand from:" >&2
      echo "   $BACKUP_DIR" >&2
      exit 1
    fi
    echo "All rulesets restored to their original enforcement."
  fi
  rm -rf "$BACKUP_DIR"
}
# A trap handler RETURNS to where it interrupted — it does not exit. Wiring
# INT and TERM to bare `restore` therefore restored the rulesets and then
# dropped straight back to whatever read prompt was blocking, leaving the
# process looking unkillable (and immune to a second signal, since RESTORED
# is already 1 by then). INT and TERM must restore *and then* exit; EXIT
# stays bare, and its RESTORED guard makes the second pass a no-op.
trap restore EXIT
trap 'restore; exit 130' INT
trap 'restore; exit 143' TERM

# --- pick the repo ---------------------------------------------------------
REPO="${1:-}"
if [ -z "$REPO" ]; then
  suggested=$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)
  if [ -n "$suggested" ]; then
    read -r -p "Repo [$suggested]: " REPO
    REPO="${REPO:-$suggested}"
  else
    read -r -p "Repo (e.g. digitalnsw/agile): " REPO
  fi
fi
[[ "$REPO" == */* ]] || { echo "Expected owner/repo, got '$REPO'" >&2; exit 1; }

BRANCH=$(gh api "repos/$REPO" --jq .default_branch) || {
  echo "Can't read $REPO — wrong name, or no access." >&2; exit 1; }
echo "Repo:   $REPO"
echo "Branch: $BRANCH"

# --- find the rulesets that actually apply to that branch ------------------
# A failed API call must never look like "no rulesets apply": gh writes the
# error body to stdout, so an unchecked read would treat {"message":...} as a
# ruleset id. Capture the response and the exit status separately.
# stdout only: gh puts the error body on stdout and its own message on stderr,
# so merging them (2>&1) would let a stderr warning corrupt the JSON we parse.
rules_json=$(gh api "repos/$REPO/rules/branches/$BRANCH") || {
  echo "Failed to read branch rules for $REPO:$BRANCH — aborting without" >&2
  echo "touching anything. The API said:" >&2
  printf '  %s\n' "$rules_json" | head -3 >&2
  exit 1
}
ids_out=$(printf '%s' "$rules_json" | jq -r '[.[].ruleset_id] | unique | .[]')

# (while-read rather than mapfile: macOS ships bash 3.2)
candidates=()
while IFS= read -r line; do
  if [ -n "$line" ]; then candidates+=("$line"); fi
done <<< "$ids_out"

if [ "${#candidates[@]}" -eq 0 ]; then
  echo "No rulesets apply to $BRANCH — just push normally."; exit 0
fi

mkdir -p "$BACKUP_DIR"
echo
echo "Rulesets applying to $BRANCH:"
for id in "${candidates[@]}"; do
  if gh api "repos/$REPO/rulesets/$id" > "$BACKUP_DIR/$id.json" 2>/dev/null; then
    name=$(jq -r .name "$BACKUP_DIR/$id.json")
    enf=$(jq -r .enforcement "$BACKUP_DIR/$id.json")
    src=$(jq -r '.source_type // "Repository"' "$BACKUP_DIR/$id.json")
    # The repo endpoint RETURNS inherited org rulesets but cannot PUT them —
    # detect by source_type, not by a failed GET.
    if [ "$src" != "Repository" ]; then
      rm -f "$BACKUP_DIR/$id.json"
      echo "  [$id] $name ($src-level) — cannot disable from repo scope, skipping"
      echo "        (org rulesets are changed at orgs/<org>/rulesets and affect EVERY repo)"
      continue
    fi
    if [ "$enf" = "active" ]; then
      check_schema "$BACKUP_DIR/$id.json" "$id"
      IDS+=("$id"); echo "  [$id] $name ($enf) — will disable"
    else
      rm -f "$BACKUP_DIR/$id.json"; echo "  [$id] $name ($enf) — already inactive, leaving alone"
    fi
  else
    rm -f "$BACKUP_DIR/$id.json"
    echo "  [$id] cannot read this ruleset (no admin access?) — it may still block" >&2
  fi
done

if [ "${#IDS[@]}" -eq 0 ]; then
  echo; echo "Nothing to disable."; exit 0
fi

echo
echo "Backups: $BACKUP_DIR"
echo
# This prompt is the one place the script waits on a human. Earlier the last
# line before it was the "Backups:" path, which reads like a completion
# message — easy to walk away from and then push by hand, which fails because
# nothing has been disabled yet. Scope the claim to rulesets: the backup
# directory has just been written and its path printed directly above, so an
# unqualified "nothing has changed" contradicts the line above it.
echo ">>> No rulesets have been changed yet — waiting for your answer. <<<"
read -r -p "Disable ${#IDS[@]} ruleset(s) on $REPO:$BRANCH and push $BRANCH? [y/N] " ok
[[ "$ok" =~ ^[Yy]$ ]] || { echo "Aborted — no rulesets were changed."; exit 0; }

# --- disable ---------------------------------------------------------------
for id in "${IDS[@]}"; do
  jq "$WRITABLE"' | .enforcement = "disabled"' \
    "$BACKUP_DIR/$id.json" \
    | gh api -X PUT "repos/$REPO/rulesets/$id" --input - >/dev/null || {
      echo "Failed to disable ruleset $id — aborting." >&2; exit 1; }
  DISABLED+=("$id")
  echo "  disabled $id"
done

# --- push ------------------------------------------------------------------
echo
here=$(git rev-parse --show-toplevel 2>/dev/null || true)
here_repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)
if [ -n "$here" ] && [ "$here_repo" = "$REPO" ]; then
  echo "Pushing $BRANCH from $here …"
  git push origin "$BRANCH" || echo "!! push failed — restoring anyway" >&2
else
  echo "Protection is OFF. Push now from your clone, then press Enter."
  echo "(auto-restoring in 5 minutes if you don't)"
  read -r -t 300 _ || echo "  timed out"
fi

# restore runs via the EXIT trap
