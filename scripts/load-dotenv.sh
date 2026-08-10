# shellcheck shell=bash
# Loads simple KEY=value pairs from a .env file (repo root by default) into the
# environment, so per-repo settings like AI_MODEL / AI_PROVIDER don't have to be
# exported in every shell.
#
# The file is PARSED, never sourced: `source .env` would execute whatever shell
# code the file contains, and .env is exactly the kind of file that gets pasted
# into from a chat window. Lines that are not well-formed `KEY=value`
# assignments (blanks, comments, anything else) are skipped.
#
# Value handling:
#   KEY=value            → value
#   KEY="value # here"   → value # here      (quoted: taken verbatim)
#   KEY=value # comment  → value             (unquoted: whitespace-preceded
#                                             `#` starts an inline comment)
#
# Real environment variables always win over the file (standard dotenv
# behaviour), so a one-off `AI_MODEL=… ./scripts/git-commit.sh` still overrides.
#
# .env is gitignored fleet-wide — it is a local override, not a shared default.
# Fleet defaults live in openai-config.sh.

load_dotenv() {
  local file="${1:-.env}"
  [[ -f "$file" ]] || return 0

  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    # Trim leading/trailing whitespace, skip blanks and comments.
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "$line" || "$line" == '#'* ]] && continue
    # Tolerate `export KEY=value`.
    [[ "$line" == 'export '* ]] && line="${line#export }"

    [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    key="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"

    if [[ ${#value} -ge 2 && "$value" == '"'*'"' ]] || [[ ${#value} -ge 2 && "$value" == "'"*"'" ]]; then
      # Quoted: strip one layer of quotes and take the contents verbatim, so a
      # `#` inside the value stays part of it.
      value="${value:1:${#value}-2}"
    else
      # Unquoted: a whitespace-preceded `#` starts an inline comment. Without
      # this, `AI_PROVIDER=azure # pin` would send the whole string as a
      # provider name and fail the request.
      if [[ "$value" =~ ^(.*[^[:space:]])?[[:space:]]+#.*$ ]]; then
        value="${BASH_REMATCH[1]}"
      fi
      value="${value%"${value##*[![:space:]]}"}"
    fi

    # Already set in the real environment → leave it alone.
    [[ -n "${!key+x}" ]] && continue
    export "${key}=${value}"
  done < "$file"
}
