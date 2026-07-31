#!/usr/bin/env bash
# Publish the markdown mapped in .github/confluence-sync.yml to Confluence —
# one page per file, using mark. Runs from CI (reusable-confluence-sync.yml
# in digitalnsw/nswds-devops, called by each repo's confluence-sync.yml
# stub); needs `mark`, `yq` (v4) and `jq` on PATH plus MARK_BASE_URL /
# MARK_USERNAME / MARK_PASSWORD in the environment.
#
# The manifest (override the path via CONFLUENCE_SYNC_MANIFEST):
#
#   space: GDS                          # optional — defaults to GDS
#   parent: Tech Enablement and Design  # optional — the anchor PAGE above
#                                       # the folder chains (default shown)
#   pages:
#     - source: docs/best-practices/    # directory → every *.md directly in it
#       folders: [Application Support, Development Best Practice]
#     - source: ONBOARDING.md           # or a single file
#       folders: [Application Support, Fleet Operations]
#
# The synced markdown stays plain GitHub markdown: everything
# Confluence-specific (metadata headers, the "synced from GitHub" banner,
# link rewriting) is applied to temp copies here, never to the source files.
#
# Every page named by the manifest is republished on every run — Confluence
# is a read-only mirror, so a run always overwrites any manual page edits.
# The cost is a new page version per publish even when nothing changed
# (mark's --changes-only would avoid that, but it also skips folder moves
# when the file content is unchanged — correctness wins).
set -euo pipefail

MANIFEST="${CONFLUENCE_SYNC_MANIFEST:-.github/confluence-sync.yml}"
DEFAULT_SPACE="GDS"
# mark matches everything by TITLE, not ID — renaming the anchor page or any
# folder in Confluence breaks the sync (see MAINTENANCE.md). The anchor is
# the GDS space home page: mark requires a Parent *page* above a folder
# chain and scopes folder lookup to it — without it, folders that sit under
# the home page are treated as not found.
DEFAULT_PARENT="Tech Enablement and Design"

fail() {
  echo "::error file=${MANIFEST}::$1"
  exit 1
}

for var in MARK_BASE_URL MARK_USERNAME MARK_PASSWORD; do
  if [ -z "${!var:-}" ]; then
    echo "::error::${var} is not set — the Confluence credentials/URL must be in the environment"
    exit 1
  fi
done
command -v mark >/dev/null || { echo "::error::mark is not on PATH"; exit 1; }
command -v yq >/dev/null || { echo "::error::yq is not on PATH (preinstalled on GitHub ubuntu runners)"; exit 1; }
command -v jq >/dev/null || { echo "::error::jq is not on PATH"; exit 1; }

[ -f "$MANIFEST" ] || fail "manifest not found — nothing maps this repo's markdown to Confluence"

# In CI GITHUB_REPOSITORY is authoritative; locally, fall back to origin.
repo_slug="${GITHUB_REPOSITORY:-$(git remote get-url origin | sed -E 's#^(git@github\.com:|ssh://git@github\.com/|https://github\.com/)##; s#\.git$##')}"
printf '%s' "$repo_slug" | grep -Eq '^[^/[:space:]]+/[^/[:space:]]+$' ||
  { echo "::error::cannot derive owner/repo from the origin remote (got '${repo_slug}') — set GITHUB_REPOSITORY"; exit 1; }
repo_name="${repo_slug#*/}"
REPO_BLOB_URL="https://github.com/${repo_slug}/blob/main"
REPO_RAW_URL="https://raw.githubusercontent.com/${repo_slug}/main"

# yq does exactly one job — YAML → JSON — so every parsing and validation
# decision lives in jq, which behaves identically everywhere.
manifest_json="$(yq -o=json '.' "$MANIFEST")" ||
  fail "manifest is not valid YAML"

jq -e '
  type == "object" and (keys - ["space", "parent", "pages"] == []) and
  ((.space // "GDS") | type == "string" and length > 0) and
  ((.parent // "anchor") | type == "string" and length > 0) and
  (.pages | type == "array" and length > 0) and
  ([.pages[] |
    type == "object" and (keys - ["source", "folders"] == []) and
    (.source | type == "string" and length > 0 and
      ((startswith("/") or contains("//") or
        (split("/") | any(. == "." or . == ".."))) | not)) and
    (.folders | type == "array" and length > 0 and
      all(.[]; type == "string" and length > 0))
  ] | all)
' <<<"$manifest_json" >/dev/null ||
  fail "manifest must be: optional space/parent strings plus a non-empty pages: list, each entry exactly {source: <file-or-dir>, folders: [<name>, …]}; source must be repo-relative as spelled (no leading / or ./, no //, no . or .. segments — link rewriting matches paths literally)"

SPACE_KEY="$(jq -r ".space // \"${DEFAULT_SPACE}\"" <<<"$manifest_json")"
PARENT_ANCHOR="$(jq -r ".parent // \"${DEFAULT_PARENT}\"" <<<"$manifest_json")"
entry_count="$(jq '.pages | length' <<<"$manifest_json")"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
mkdir -p "$WORKDIR/pages"

# Page title = the file's H1, so retitling a file creates a fresh Confluence
# page and orphans the old one (delete it by hand). Trimmed because mark and
# Confluence both trim titles — an untrimmed copy would slip past the
# duplicate check and emit ac: links that miss the real page title.
title_for() {
  sed -n 's/^#[[:space:]]\{1,\}//p' "$1" | head -n 1 | sed 's/[[:space:]]*$//'
}

# ── Pass 1: expand every entry to files, collect titles, validate ─────────
# files.tsv: <entry index>TAB<path>   titles.tsv: <path>TAB<title>
i=0
while [ "$i" -lt "$entry_count" ]; do
  src="$(jq -r ".pages[$i].source" <<<"$manifest_json")"
  src="${src%/}"
  if [ -d "$src" ]; then
    found=0
    for f in "$src"/*.md; do
      [ -e "$f" ] || continue
      found=1
      printf '%s\t%s\n' "$i" "$f" >>"$WORKDIR/files.tsv"
    done
    [ "$found" -eq 1 ] || fail "pages[$i]: directory '${src}/' contains no *.md files"
  elif [ -f "$src" ]; then
    case "$src" in
      *.md) printf '%s\t%s\n' "$i" "$src" >>"$WORKDIR/files.tsv" ;;
      *) fail "pages[$i]: '${src}' is not a markdown file" ;;
    esac
  else
    fail "pages[$i]: source '${src}' does not exist in this repo"
  fi
  i=$((i + 1))
done

# A file reached by two pages: entries would publish twice with whichever
# folders come last — reject it with the real cause instead of letting the
# duplicate-title check misreport it as two files sharing an H1.
dup_paths="$(cut -f2 "$WORKDIR/files.tsv" | sort | uniq -d)"
if [ -n "$dup_paths" ]; then
  echo "$dup_paths" | while IFS= read -r p; do
    echo "::error file=${MANIFEST}::'${p}' is matched by more than one pages: entry ($(awk -F'\t' -v p="$p" '$2 == p { print "pages[" $1 "]" }' "$WORKDIR/files.tsv" | tr '\n' ' ' | sed 's/ $//'))"
  done
  exit 1
fi

while IFS=$'\t' read -r _ f; do
  title="$(title_for "$f")"
  if [ -z "$title" ]; then
    echo "::error file=${f}::no H1 heading — cannot derive a Confluence page title"
    exit 1
  fi
  printf '%s\t%s\n' "$f" "$title" >>"$WORKDIR/titles.tsv"
done <"$WORKDIR/files.tsv"

# Confluence page titles are unique per space; two files sharing an H1 would
# silently fight over one page. Fail loudly instead.
dupes="$(cut -f2 "$WORKDIR/titles.tsv" | sort | uniq -d)"
if [ -n "$dupes" ]; then
  echo "$dupes" | while IFS= read -r t; do
    echo "::error::duplicate page title '${t}' — files: $(awk -F'\t' -v t="$t" '$2 == t { print $1 }' "$WORKDIR/titles.tsv" | tr '\n' ' ')"
  done
  exit 1
fi

# ── Pass 2: build the Confluence copy of each file and publish it ─────────
# Link rewriting, applied to the body only:
#   - a relative link to another synced file becomes a Confluence page link
#     (mark's ac: syntax; angle brackets because titles contain spaces) —
#     unless it carries a #fragment: Confluence headings don't share
#     markdown's anchor ids, so those links point at the file on GitHub
#   - any other relative link has no Confluence counterpart — point it at
#     the file on GitHub instead (raw URL for images so they still render)
#   - absolute URLs, mailto:, #anchors and root-relative links pass through
# Known limit: a nested badge link `[![alt](img)](url)` rewrites its inner
# image as a plain link (none exist in the fleet's docs today).
rewrite_links() {
  awk -v MAP="$WORKDIR/titles.tsv" -v SRCDIR="$1" \
      -v BLOB="$REPO_BLOB_URL" -v RAW="$REPO_RAW_URL" '
    BEGIN {
      while ((getline line < MAP) > 0) {
        tab = index(line, "\t")
        if (tab > 0) title[substr(line, 1, tab - 1)] = substr(line, tab + 1)
      }
      close(MAP)
    }
    function normalize(path,   n, i, parts, stack, sp, out) {
      n = split(path, parts, "/")
      sp = 0
      for (i = 1; i <= n; i++) {
        if (parts[i] == "" || parts[i] == ".") continue
        if (parts[i] == "..") { if (sp > 0) sp--; continue }
        stack[++sp] = parts[i]
      }
      out = ""
      for (i = 1; i <= sp; i++) out = out (i > 1 ? "/" : "") stack[i]
      return out
    }
    function rewrite(target, is_image,   frag, hashpos, resolved) {
      if (target ~ /^[A-Za-z][A-Za-z0-9+.-]*:/) return target
      if (target ~ /^[#\/]/) return target
      if (target ~ /^<?ac:/) return target
      frag = ""
      hashpos = index(target, "#")
      if (hashpos > 0) {
        frag = substr(target, hashpos)
        target = substr(target, 1, hashpos - 1)
      }
      resolved = normalize(SRCDIR == "" ? target : SRCDIR "/" target)
      if (frag == "" && !is_image && (resolved in title))
        return "<ac:" title[resolved] ">"
      if (is_image) return RAW "/" resolved
      return BLOB "/" resolved frag
    }
    {
      line = $0
      out = ""
      while (match(line, /!?\[[^]]*\]\([^)]+\)/)) {
        m = substr(line, RSTART, RLENGTH)
        out = out substr(line, 1, RSTART - 1)
        line = substr(line, RSTART + RLENGTH)
        tpos = index(m, "](")
        target = substr(m, tpos + 2, length(m) - tpos - 2)
        out = out substr(m, 1, tpos + 1) rewrite(target, substr(m, 1, 1) == "!") ")"
      }
      print out line
    }
  '
}

i=0
while [ "$i" -lt "$entry_count" ]; do
  folders_json="$(jq -c ".pages[$i].folders" <<<"$manifest_json")"
  awk -F'\t' -v k="$i" '$1 == k { print $2 }' "$WORKDIR/files.tsv" | while IFS= read -r src; do
    title="$(awk -F'\t' -v f="$src" '$1 == f { print $2; exit }' "$WORKDIR/titles.tsv")"
    out_file="$WORKDIR/pages/${src//\//__}"
    srcdir="$(dirname "$src")"
    [ "$srcdir" = "." ] && srcdir=""

    {
      printf -- '<!-- Space: %s -->\n' "$SPACE_KEY"
      printf -- '<!-- Parent: %s -->\n' "$PARENT_ANCHOR"
      jq -r '.[]' <<<"$folders_json" | while IFS= read -r folder; do
        printf -- '<!-- Folder: %s -->\n' "$folder"
      done
      printf -- '<!-- Title: %s -->\n' "$title"
      # This blank line is load-bearing: mark's metadata parser consumes the
      # first line that isn't a single-line <!-- Key: value --> header, so a
      # multi-line Include placed directly after the headers loses its opening
      # line and the banner renders as a code block. The blank line is the
      # sacrifice that keeps the Include intact (verified against mark 16.5.1).
      printf -- '\n'
      printf -- '<!-- Include: ac:box\n'
      printf -- '     Icon: true\n'
      printf -- '     Name: info\n'
      printf -- '     Title: Synced from GitHub\n'
      printf -- '     Body: "This page is published automatically from the %s repository on GitHub. Edits made here in Confluence will be overwritten by the next sync — propose changes with a pull request instead." -->\n' \
        "$repo_name"
      printf -- '\n*Source: [%s](%s/%s)*\n\n' "$src" "$REPO_BLOB_URL" "$src"
      rewrite_links "$srcdir" <"$src"
    } >"$out_file"

    echo "Publishing '${title}' from ${src}"
    # --drop-h1: the H1 duplicates the page title. --minor-edit: don't send a
    # watcher notification on every merge (incompatible with Label headers).
    mark --drop-h1 --minor-edit -f "$out_file"
  done
  i=$((i + 1))
done
