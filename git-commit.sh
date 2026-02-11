#!/bin/bash
set -euo pipefail

# Dependencies
REQUIRED_CMDS=(git jq curl sed grep wc tr head awk cat paste)
for cmd in "${REQUIRED_CMDS[@]}"; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    printf "❌ Missing dependency: %s\n" "$cmd"
    exit 1
  fi
done

# Conventional Commits: type(scope)!: description
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONVENTIONAL_CONFIG_SCRIPT="${SCRIPT_DIR}/conventional-commit-config.sh"
if [[ ! -x "$CONVENTIONAL_CONFIG_SCRIPT" ]]; then
  printf "❌ Missing helper script: %s\n" "$CONVENTIONAL_CONFIG_SCRIPT"
  exit 1
fi
CONVENTIONAL_COMMIT_REGEX="$("$CONVENTIONAL_CONFIG_SCRIPT" regex)"
CONVENTIONAL_COMMIT_TYPES_CSV="$("$CONVENTIONAL_CONFIG_SCRIPT" csv)"
DEFAULT_CONVENTIONAL_COMMIT_TYPE="$("$CONVENTIONAL_CONFIG_SCRIPT" safe-default)"

# OpenAI credentials (Fix #2)
if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  printf "❌ OPENAI_API_KEY is not set. Export it in your shell before running this script.\n"
  exit 1
fi

# OpenAI model + output token limit (tunable)
OPENAI_MODEL="${OPENAI_MODEL:-gpt-4o-mini}"
OPENAI_MAX_OUTPUT_TOKENS="${OPENAI_MAX_OUTPUT_TOKENS:-250}"

if ! [[ "$OPENAI_MAX_OUTPUT_TOKENS" =~ ^[1-9][0-9]*$ ]]; then
  printf "❌ OPENAI_MAX_OUTPUT_TOKENS must be a positive integer (>= 1) (got: %s)\n" "$OPENAI_MAX_OUTPUT_TOKENS"
  exit 1
fi
# Use --fail-with-body if available; fall back to --fail for BSD/macOS curl.
CURL_FAIL_FLAG="--fail-with-body"
if ! curl --help all 2>/dev/null | grep -q -- '--fail-with-body'; then
  CURL_FAIL_FLAG="--fail"
fi

# Check current branch
printf "🔍 Current branch:\n"
BRANCH="$(git branch --show-current)"
printf "%s\n\n" "$BRANCH"

# Show staged files
printf "📦 Staged changes:\n"
STAGED="$(git diff --name-only --cached || true)"

if [[ -z "$STAGED" ]]; then
  printf "No staged changes.\n\n"
  printf "🧩 Stage changes now?\n"
  printf "  1) Stage all (git add -A)\n"
  printf "  2) Stage tracked only (git add -u)\n"
  printf "  3) Cancel\n"
  printf "Choose (1/2/3): "
  read -r STAGE_CHOICE

  case "$STAGE_CHOICE" in
    1) git add -A ;;
    2) git add -u ;;
    *) printf "❌ No files staged. Exiting.\n"; exit 0 ;;
  esac

  STAGED="$(git diff --name-only --cached || true)"
  if [[ -z "$STAGED" ]]; then
    printf "❌ Still no files staged. Exiting.\n"
    exit 0
  fi

  printf "✅ Staged files:\n%s\n" "$STAGED"
else
  printf "%s\n" "$STAGED"
fi
printf "\n"

# Get staged diff (cap by lines). Avoid materializing the full diff in memory.
TOTAL_LINES="$(git diff --cached | wc -l | tr -d ' ')"
DIFF="$(git diff --cached | sed -n '1,1500p')"
TRUNCATED="false"
if [[ "$TOTAL_LINES" -gt 1500 ]]; then
  TRUNCATED="true"
fi

if [[ -z "$DIFF" ]]; then
  printf "No staged diff.\n"
  exit 0
fi

# Basic sensitive-pattern detection to prevent accidental data/code leakage.
SENSITIVE_REGEX='(-----BEGIN (RSA|OPENSSH|EC|DSA)? ?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|xox[baprs]-[0-9A-Za-z-]{10,}|gh[pousr]_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{20,}|password[[:space:]]*[:=]|api[_-]?key[[:space:]]*[:=]|secret[[:space:]]*[:=]|token[[:space:]]*[:=]|authorization[[:space:]]*[:=])'
if git diff --cached | sed -n '1,5000p' | grep -Eqi "$SENSITIVE_REGEX"; then
  printf "⚠️ Potential secrets detected in the staged diff.\n"
  printf "This script will send code to the OpenAI API.\n"
  read -r -p "Proceed anyway? (y/N) " _ans
  if [[ ! "${_ans:-}" =~ ^[Yy]$ ]]; then
    printf "Aborting.\n"
    exit 1
  fi
fi

# Redact common secret patterns before sending to the API (best-effort).
DIFF_REDACTED="$DIFF"

# High-signal tokens/keys
DIFF_REDACTED="$(printf '%s' "$DIFF_REDACTED" | sed -E \
  -e 's/AKIA[0-9A-Z]{16}/[REDACTED_AWS_KEY]/g' \
  -e 's/ASIA[0-9A-Z]{16}/[REDACTED_AWS_KEY]/g' \
  -e 's/xox[baprs]-[0-9A-Za-z-]{10,}/[REDACTED_SLACK_TOKEN]/g' \
  -e 's/gh[pousr]_[0-9A-Za-z]{20,}/[REDACTED_GITHUB_TOKEN]/g' \
  -e 's/github_pat_[0-9A-Za-z_]{20,}/[REDACTED_GITHUB_TOKEN]/g' \
)"

# Private key blocks (redact the entire block)
DIFF_REDACTED="$(printf '%s' "$DIFF_REDACTED" | awk '
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

# Common "key/value" secrets (env/yaml/ini/json) (best-effort broad)
DIFF_REDACTED="$(printf '%s' "$DIFF_REDACTED" | sed -E \
  -e 's/("password"[[:space:]]*:[[:space:]]*")[^"]*"/\1[REDACTED]"/g' \
  -e 's/("api[_-]?key"[[:space:]]*:[[:space:]]*")[^"]*"/\1[REDACTED]"/g' \
  -e 's/("secret"[[:space:]]*:[[:space:]]*")[^"]*"/\1[REDACTED]"/g' \
  -e 's/("token"[[:space:]]*:[[:space:]]*")[^"]*"/\1[REDACTED]"/g' \
  -e 's/([Pp]assword[[:space:]]*[:=][[:space:]]*)[^[:space:]"'\''#]+/\1[REDACTED]/g' \
  -e 's/(api[_-]?[Kk]ey[[:space:]]*[:=][[:space:]]*)[^[:space:]"'\''#]+/\1[REDACTED]/g' \
  -e 's/([Ss]ecret[[:space:]]*[:=][[:space:]]*)[^[:space:]"'\''#]+/\1[REDACTED]/g' \
  -e 's/([Tt]oken[[:space:]]*[:=][[:space:]]*)[^[:space:]"'\''#]+/\1[REDACTED]/g' \
  -e 's/([Aa]uthorization[[:space:]]*[:=][[:space:]]*Bearer[[:space:]]+)[^[:space:]"'\''#]+/\1[REDACTED]/g' \
)"

# Preview should show redacted diff (Fix #3)
printf "🧾 Staged diff preview (first 300 lines, redacted):\n"
head -n 300 <<<"$DIFF_REDACTED"
if [[ "$TRUNCATED" == "true" ]]; then
  printf "… (diff truncated to first 1500 lines for the prompt)\n\n"
else
  printf "…\n\n"
fi

printf "📜 Recent commit history:\n"
git --no-pager log --oneline -n 10
printf "\n"

generate_prompt() {
  cat <<EOF
You're an expert developer writing Conventional Commits.

Task:
- Suggest ONE git commit message for the staged changes.
- Format the first line as: type(scope): description  (or type: description)
- Allowed types: ${CONVENTIONAL_COMMIT_TYPES_CSV}
- Keep the subject line under ~72 chars if possible.
- If helpful, include a short body after a blank line (bullets ok).
- Do NOT use code fences. Do NOT wrap in quotes. Do NOT prefix with "Title:" or similar.

Branch name: ${BRANCH}

Staged file list:
${STAGED}

Staged diff:
${DIFF_REDACTED}

Note:
- The diff may be truncated. Use the file list + visible diff to infer intent.
EOF
}

attempt=1
max_attempts=2
COMMIT_MSG=""

while [[ $attempt -le $max_attempts ]]; do
  PROMPT_TEXT="$(generate_prompt)"

  JSON_PAYLOAD="$(jq -n --arg prompt "$PROMPT_TEXT" --arg model "$OPENAI_MODEL" --argjson max_output_tokens "${OPENAI_MAX_OUTPUT_TOKENS}" '{
    model: $model,
    input: [
      {
        role: "system",
        content: [
          { type: "input_text", text: "You write high-quality Conventional Commit messages. Output only the commit message (subject + optional body)." }
        ]
      },
      { role: "user", content: [ { type: "input_text", text: $prompt } ] }
    ],
    temperature: 0.4,
    max_output_tokens: $max_output_tokens
  }')"

  set +e
  RESPONSE="$(curl -sS "$CURL_FAIL_FLAG" https://api.openai.com/v1/responses \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD" 2>&1)"
curl_status=$?
set -e

  if [[ $curl_status -ne 0 ]]; then
    printf "❌ OpenAI API request failed (curl exit code: %s).\n" "$curl_status"
    echo "$RESPONSE" | head -c 400
    echo
    exit 1
  fi

  # Non-JSON guard (Fix #4)
  if ! echo "$RESPONSE" | jq -e . >/dev/null 2>&1; then
    printf "❌ OpenAI API returned a non-JSON response.\n"
    echo "$RESPONSE" | head -c 400
    echo
    exit 1
  fi

  if echo "$RESPONSE" | jq -e '.error' >/dev/null 2>&1; then
    errType="$(echo "$RESPONSE" | jq -r '.error.type // "unknown"')"
    errMsg="$(echo "$RESPONSE" | jq -r '.error.message // ""' | head -c 200)"
    printf "❌ OpenAI API error (%s): %s\n" "$errType" "$errMsg"
    exit 1
  fi

  COMMIT_MSG="$(echo "$RESPONSE" | jq -r '
    [(.output[]? | select(.type=="message") | .content[]? | select(.type=="output_text") | .text)] | join("")
  ')"

  COMMIT_MSG="$(printf "%s" "$COMMIT_MSG" | sed -e 's/\r//g')"
  COMMIT_MSG="$(printf "%s" "$COMMIT_MSG" | sed -e 's/^Title:[[:space:]]*//I')"
  COMMIT_MSG="$(printf "%s" "$COMMIT_MSG" | sed -E 's/^['\''\"`]+//; s/['\''\"`]+$//')"
  COMMIT_MSG="$(printf "%s" "$COMMIT_MSG" | sed -e 's/^```[a-zA-Z0-9_-]*//; s/```$//')"
  COMMIT_MSG="$(printf "%s" "$COMMIT_MSG" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"

  if [[ -z "$COMMIT_MSG" || "$COMMIT_MSG" == "null" ]]; then
    printf "❌ Failed to generate commit message.\n"
    exit 1
  fi

  SUBJECT_LINE="$(printf "%s\n" "$COMMIT_MSG" | sed -n '1p')"

  if [[ "$SUBJECT_LINE" =~ $CONVENTIONAL_COMMIT_REGEX ]]; then
    break
  fi

  attempt=$((attempt + 1))
  if [[ $attempt -le $max_attempts ]]; then
    printf "⚠️ Model output didn't match Conventional Commits. Retrying (%d/%d)...\n" "$attempt" "$max_attempts"
  fi
done

SUBJECT_LINE="$(printf "%s\n" "$COMMIT_MSG" | sed -n '1p')"
if [[ ! "$SUBJECT_LINE" =~ $CONVENTIONAL_COMMIT_REGEX ]]; then
  printf "⚠️ Still invalid after retries. Using a safe fallback.\n"
  COMMIT_MSG="${DEFAULT_CONVENTIONAL_COMMIT_TYPE}: update"
fi

printf "\n📝 Suggested commit message:\n"
printf "%s\n\n" "$COMMIT_MSG"

printf "💬 Do you want to use this message to commit? (y/n): "
read -r CONFIRM
if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
  printf "%s" "$COMMIT_MSG" | git commit -F -
  printf "✅ Committed with AI-generated message.\n"
else
  printf "❌ Commit cancelled.\n"
fi
