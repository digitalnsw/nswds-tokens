# shellcheck shell=bash
# shellcheck disable=SC2034  # SENSITIVE_REGEX is consumed by the sourcing scripts
# Shared secret detection + redaction for diffs sent to the OpenAI API.
# Source this file to get a single, consistent implementation across every
# script in this repo (same pattern as openai-config.sh). Keeping one copy
# means a fix here can't silently drift from a second hand-maintained copy.

# Pattern used to *detect* (not redact) potentially sensitive content, so the
# user can be warned before any diff leaves the machine. Deliberately broad.
SENSITIVE_REGEX='(-----BEGIN (RSA|OPENSSH|EC|DSA)? ?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|xox[baprs]-[0-9A-Za-z-]{10,}|gh[pousr]_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{20,}|password[[:space:]]*[:=]|api[_-]?key[[:space:]]*[:=]|secret[[:space:]]*[:=]|token[[:space:]]*[:=]|authorization[[:space:]]*[:=])'

# Best-effort redaction of common secret patterns before sending a diff to the
# API. Takes the diff as $1 and prints the redacted version on stdout.
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

  # Common "key/value" secrets (env/yaml/ini/json) (best-effort broad).
  printf '%s' "$redacted" | sed -E \
    -e 's/("password"[[:space:]]*:[[:space:]]*")[^"]*"/\1[REDACTED]"/g' \
    -e 's/("api[_-]?key"[[:space:]]*:[[:space:]]*")[^"]*"/\1[REDACTED]"/g' \
    -e 's/("secret"[[:space:]]*:[[:space:]]*")[^"]*"/\1[REDACTED]"/g' \
    -e 's/("token"[[:space:]]*:[[:space:]]*")[^"]*"/\1[REDACTED]"/g' \
    -e 's/([Pp]assword[[:space:]]*[:=][[:space:]]*)[^[:space:]"'\''#]+/\1[REDACTED]/g' \
    -e 's/(api[_-]?[Kk]ey[[:space:]]*[:=][[:space:]]*)[^[:space:]"'\''#]+/\1[REDACTED]/g' \
    -e 's/([Ss]ecret[[:space:]]*[:=][[:space:]]*)[^[:space:]"'\''#]+/\1[REDACTED]/g' \
    -e 's/([Tt]oken[[:space:]]*[:=][[:space:]]*)[^[:space:]"'\''#]+/\1[REDACTED]/g' \
    -e 's/([Aa]uthorization[[:space:]]*[:=][[:space:]]*Bearer[[:space:]]+)[^[:space:]"'\''#]+/\1[REDACTED]/g'
}
