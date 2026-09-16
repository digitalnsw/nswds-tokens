# shellcheck shell=bash
# shellcheck disable=SC2034  # SENSITIVE_REGEX is consumed by the sourcing scripts
# Shared secret detection + redaction for text sent to the AI Gateway.
# Source this file to get a single, consistent implementation across every
# script in this repo (same pattern as openai-config.sh). Keeping one copy
# means a fix here can't silently drift from a second hand-maintained copy.
#
# redact_sensitive_diff operates on ARBITRARY text, not only unified diffs:
# callers also pass it change metadata (branch names, commit subjects, file
# lists) before those reach a prompt.

# Pattern used to *detect* (not redact) potentially sensitive content, so the
# user can be warned before any text leaves the machine. Deliberately broad.
#
# The key/value words match a COMPOUND key that contains the word, not only the
# bare word, so AWS_SECRET_ACCESS_KEY, CLIENT_SECRET and GITHUB_TOKEN trip the
# warning as well as `secret=`. A letter PREFIX is allowed (clientSecret,
# AWS_SECRET_…) but the word may only be followed by `_`/`-`-delimited segments,
# never bare letters — so code identifiers like `tokenizer` or `secretSauce`
# don't trip it. Every caller greps this with `-i`, so the lowercase spellings
# match any case; keep it that way (git-commit.sh, suggest-branch-name.sh).
SENSITIVE_REGEX='(-----BEGIN (RSA|OPENSSH|EC|DSA)? ?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|xox[baprs]-[0-9A-Za-z-]{10,}|gh[pousr]_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{20,}|[a-z0-9_-]*(password|secret|token|api[_-]?key|authorization)([_-][a-z0-9]+)*[[:space:]]*[:=])'

# Best-effort redaction of common secret patterns before sending text to the
# API. Takes the text as $1 and prints the redacted version on stdout.
redact_sensitive_diff() {
  local input="$1"
  local redacted="$input"

  # High-signal tokens/keys.
  redacted="$(printf '%s' "$redacted" | sed -E \
    -e 's/AKIA[0-9A-Z]{16}/[REDACTED_AWS_KEY]/g' \
    -e 's/ASIA[0-9A-Z]{16}/[REDACTED_AWS_KEY]/g' \
    -e 's/xox[baprs]-[0-9A-Za-z-]{10,}/[REDACTED_SLACK_TOKEN]/g' \
    -e 's/gh[pousr]_[0-9A-Za-z]{20,}/[REDACTED_GITHUB_TOKEN]/g' \
    -e 's/github_pat_[0-9A-Za-z_]{20,}/[REDACTED_GITHUB_TOKEN]/g' \
  )"

  # Private key blocks: redact the entire block. The trailing sed catches any
  # orphan BEGIN/END markers that weren't part of a complete block.
  redacted="$(printf '%s' "$redacted" | awk '
    /-----BEGIN (RSA|OPENSSH|EC|DSA)? ?PRIVATE KEY-----/ {
      in_private_key = 1;
      print "[REDACTED_PRIVATE_KEY_BLOCK]";
      next;
    }
    in_private_key && /-----END (RSA|OPENSSH|EC|DSA)? ?PRIVATE KEY-----/ {
      in_private_key = 0;
      next;
    }
    in_private_key { next; }
    { print; }
  ' | sed -E \
    -e 's/-----BEGIN (RSA|OPENSSH|EC|DSA)? ?PRIVATE KEY-----/[REDACTED_PRIVATE_KEY]/g' \
    -e 's/-----END (RSA|OPENSSH|EC|DSA)? ?PRIVATE KEY-----/[REDACTED_PRIVATE_KEY_END]/g' \
  )"

  # Common "key/value" secrets (env/ini/yaml/json), best-effort broad.
  #
  # The key is matched as a run of [A-Za-z0-9_-] that CONTAINS one of the
  # sensitive words, so compound names (AWS_SECRET_ACCESS_KEY, CLIENT_SECRET,
  # GITHUB_TOKEN, X_API_KEY, clientSecret) are redacted, not only the bare word.
  # A letter PREFIX is allowed, but the word may be followed only by
  # `_`/`-`-delimited segments (`suf`), never bare letters — so code identifiers
  # like `tokenizer = …` or `secretSauce = …` are left intact rather than having
  # their right-hand side redacted across a whole diff. Case is handled with
  # explicit classes because BSD/macOS sed has no /I flag. A double-quoted value
  # (JSON or YAML) is masked in place as "[REDACTED]" for clean output; its class
  # consumes escaped characters as units (`\\.`), so a `\"` inside the value does
  # not end the match early and leak the rest. Any other value — unquoted,
  # single-quoted, backtick, multi-word, or containing '#' — is
  # masked to end of line, so a passphrase or a single-quoted secret can't
  # survive by hiding behind a space or a '#'. Over-redacting an innocuous
  # "*_token"/"*_secret" key (or a matched key's multi-token RHS in code) is
  # deliberate: it errs toward hiding a value rather than leaking one.
  local word='([Pp][Aa][Ss][Ss][Ww][Oo][Rr][Dd]|[Ss][Ee][Cc][Rr][Ee][Tt]|[Tt][Oo][Kk][Ee][Nn]|[Aa][Pp][Ii][_-]?[Kk][Ee][Yy])'
  local suf='([_-][A-Za-z0-9]+)*'
  # Authorization is handled separately from `word`: its value is a scheme plus
  # a credential (Bearer/Basic/…), or occasionally no scheme, so the whole value
  # is redacted rather than the first token — otherwise a plain key/value rule
  # would mask "Bearer" and leave the credential. Covers bare, all-caps and
  # compound keys (HTTP_AUTHORIZATION), quoted or not; the ${suf} rule still
  # excludes camelCase identifiers like `authorizationHeader = …`.
  local auth='[Aa][Uu][Tt][Hh][Oo][Rr][Ii][Zz][Aa][Tt][Ii][Oo][Nn]'
  printf '%s' "$redacted" | sed -E \
    -e "s/(\"[A-Za-z0-9_-]*${word}${suf}\"[[:space:]]*:[[:space:]]*\")(\\\\.|[^\"\\\\])*\"/\1[REDACTED]\"/g" \
    -e "s/([A-Za-z0-9_-]*${word}${suf}[[:space:]]*[:=][[:space:]]*\")(\\\\.|[^\"\\\\])*\"/\1[REDACTED]\"/g" \
    -e "s/([A-Za-z0-9_-]*${word}${suf}[[:space:]]*[:=][[:space:]]*)[^[:space:]\"].*/\1[REDACTED]/g" \
    -e "s/(\"?[A-Za-z0-9_-]*${auth}${suf}\"?[[:space:]]*[:=][[:space:]]*\")(\\\\.|[^\"\\\\])*\"/\1[REDACTED]\"/g" \
    -e "s/([A-Za-z0-9_-]*${auth}${suf}[[:space:]]*[:=][[:space:]]*)[^[:space:]\"].*/\1[REDACTED]/g"
}
