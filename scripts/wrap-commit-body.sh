#!/usr/bin/env bash
set -euo pipefail

# Reflow a commit message body to <width> columns (default 100) so prose from AI
# commit tools (OpenCommit etc.) satisfies commitlint's body-max-line-length.
#
# Wraps prose at word boundaries and NEVER splits a word — an over-long token
# (e.g. a URL) is left whole on its own line (it may exceed the width, which is
# only a warning). Each line is wrapped independently, so nothing is merged.
# Left untouched (printed verbatim):
#   - the subject (line 1) — governed by header-max-length, not this rule
#   - blank lines (paragraph breaks)
#   - comment lines (# …) that git appends to the message
#   - footer/trailer lines (Co-authored-by:, BREAKING CHANGE:, Closes #12, …),
#     which must not be wrapped or `git interpret-trailers` breaks
#   - indented lines and list items (-, *, +, 1., 2)) — left as-is so their
#     indentation/markers are preserved rather than flattened on wrap
#
# Usage (prepare-commit-msg hook):  wrap-commit-body.sh "$1" [width]

MSG_FILE="${1:-}"
WIDTH="${2:-100}"

[[ -n "$MSG_FILE" && -f "$MSG_FILE" ]] || exit 0
command -v awk >/dev/null 2>&1 || exit 0   # nothing to wrap with; leave as-is

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

awk -v width="$WIDTH" '
  function is_trailer(l) {
    if (l ~ /^[A-Za-z][A-Za-z0-9-]*:[ \t].+/)   return 1   # Token: value
    if (l ~ /^BREAKING[ -]CHANGE:[ \t]/)        return 1
    if (l ~ /^[A-Za-z][A-Za-z0-9-]* #[0-9]+/)   return 1   # Closes #12
    return 0
  }
  function wrap(s,   n, words, i, w, line, out) {
    n = split(s, words, /[ \t]+/)
    out = ""; line = ""
    for (i = 1; i <= n; i++) {
      w = words[i]
      if (w == "") continue
      if (line == "")                                line = w
      else if (length(line) + 1 + length(w) <= W)    line = line " " w
      else { out = out line "\n"; line = w }
    }
    return out line
  }
  BEGIN { W = width + 0; if (W <= 0) W = 100 }
  NR == 1 { print; next }                                   # subject verbatim
  {
    # Print verbatim: blanks, comments, trailers, spaceless tokens (URLs),
    # indented lines, and list items — so indentation/list structure survives.
    if ($0 == "" || $0 ~ /^#/ || is_trailer($0) || $0 !~ /[ \t]/ \
        || $0 ~ /^[ \t]/ || $0 ~ /^[ \t]*([-*+]|[0-9]+[.)])[ \t]+/) { print; next }
    print wrap($0)
  }
' "$MSG_FILE" > "$tmp"

mv "$tmp" "$MSG_FILE"
trap - EXIT
