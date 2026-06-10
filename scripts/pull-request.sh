#!/bin/bash
set -euo pipefail

# Dependencies used by this script and conventional-commit-config.sh
REQUIRED_CMDS=(git jq curl gh awk sed grep paste head)
for cmd in "${REQUIRED_CMDS[@]}"; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "❌ Missing dependency: $cmd"
    exit 1
  fi
done

# Ensure API key is set
if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "❌ Please set your OPENAI_API_KEY environment variable."
  exit 1
fi

# Load Conventional Commit config
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONVENTIONAL_CONFIG_SCRIPT="${SCRIPT_DIR}/conventional-commit-config.sh"
if [[ ! -x "$CONVENTIONAL_CONFIG_SCRIPT" ]]; then
  echo "❌ Missing helper script: ${CONVENTIONAL_CONFIG_SCRIPT}"
  exit 1
fi
CONVENTIONAL_COMMIT_REGEX="$("$CONVENTIONAL_CONFIG_SCRIPT" regex)"
CONVENTIONAL_COMMIT_TYPES_CSV="$("$CONVENTIONAL_CONFIG_SCRIPT" csv)"

# Set model and endpoint. Override the model via the OPENAI_MODEL env var.
MODEL="${OPENAI_MODEL:-gpt-4o}"
ENDPOINT="https://api.openai.com/v1/chat/completions"

# Use --fail-with-body if available; fall back to --fail for BSD/macOS curl.
CURL_FAIL_FLAG="--fail-with-body"
if ! curl --help all 2>/dev/null | grep -q -- '--fail-with-body'; then
  CURL_FAIL_FLAG="--fail"
fi

# Get current branch and base branch.
# Read the locally-tracked origin HEAD instead of `git remote show origin`:
# no network call, and it won't abort under set -e if origin is missing or its
# output format differs. Fall back to main when the ref isn't set.
branch=$(git rev-parse --abbrev-ref HEAD)
default_branch="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true)"
default_branch="${default_branch:-main}"

# Extract commits from current branch
commits=$(git log "$default_branch"..HEAD --pretty=format:"%s" | grep -E "$CONVENTIONAL_COMMIT_REGEX" || true)

if [ -z "$commits" ]; then
  echo "❌ No Conventional Commits found on this branch."
  exit 1
fi

# Prepare JSON payload with Conventional Commit title prompt
messages=$(jq -n \
  --arg commits "$commits" \
  --arg allowedTypes "$CONVENTIONAL_COMMIT_TYPES_CSV" \
  '[
    {
      "role": "system",
      "content": "You are an assistant that writes pull request titles in the Conventional Commits format (https://www.conventionalcommits.org/en/v1.0.0/)."
    },
    {
      "role": "user",
      "content": "Here are the commit messages:\n\n\($commits)\n\nWrite a concise PR title that summarizes the changes and follows the Conventional Commits format. Allowed types: \($allowedTypes). Include a scope in parentheses if applicable. Return only the title and nothing else."
    }
  ]'
)

# Call OpenAI API
set +e
response=$(curl -sS "$CURL_FAIL_FLAG" "$ENDPOINT" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"model\": \"$MODEL\", \"messages\": $messages, \"temperature\": 0.4}"
)
curl_status=$?
set -e

if [[ $curl_status -ne 0 ]]; then
  echo "❌ OpenAI API request failed (curl exit code: $curl_status)."
  echo "$response" | head -c 400
  echo
  exit 1
fi

# Fail clearly if the response isn't valid JSON (auth/proxy errors can be HTML).
if ! echo "$response" | jq -e . >/dev/null 2>&1; then
  echo "❌ OpenAI API returned a non-JSON response."
  echo "$response" | head -c 400
  echo
  exit 1
fi

# Surface API-level errors instead of proceeding with a null title.
if echo "$response" | jq -e '.error' >/dev/null; then
  err_type=$(echo "$response" | jq -r '.error.type // "unknown"')
  err_msg=$(echo "$response" | jq -r '.error.message // ""' | head -c 200)
  echo "❌ OpenAI API error ($err_type): $err_msg"
  exit 1
fi

# Extract title; bail if content is missing/null rather than creating a PR titled "null".
title=$(echo "$response" | jq -r '.choices[0].message.content // empty' | head -n 1)
if [[ -z "$title" ]]; then
  echo "❌ OpenAI API did not return a title."
  exit 1
fi

# Normalize the model output the same way ai-pr-title.yml does: strip a leading
# "Title:", wrapping quotes/backticks/code fences, collapse whitespace, and trim.
title="$(printf '%s' "$title" | sed -E 's/^Title:[[:space:]]*//I')"
title="$(printf '%s' "$title" | sed -E 's/^["'\''`]+|["'\''`]+$//g')"
title="$(printf '%s' "$title" | sed -E 's/^```[a-zA-Z0-9_-]*//; s/```$//')"
title="$(printf '%s' "$title" | sed -E 's/[[:space:]]+/ /g')"
title="$(printf '%s' "$title" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"

# Validate against the repo's Conventional Commit pattern. If the model drifted
# off-format, fall back to the first conventional commit subject on the branch
# (guaranteed to exist, since we exit earlier when there are none).
if [[ ! "$title" =~ $CONVENTIONAL_COMMIT_REGEX ]]; then
  echo "⚠️ Suggested title is not in Conventional Commits format: \"$title\""
  fallback="$(printf '%s\n' "$commits" | head -n 1)"
  if [[ -n "$fallback" && "$fallback" =~ $CONVENTIONAL_COMMIT_REGEX ]]; then
    title="$fallback"
    echo "↪️ Falling back to first conventional commit subject."
  else
    echo "❌ No Conventional-Commit-conforming title available."
    exit 1
  fi
fi

echo ""
echo "✅ Suggested PR title:"
echo "$title"
echo ""

# Optionally prompt to confirm and create PR
read -p "📝 Use this title to create the PR? [y/N]: " confirm
if [[ $confirm =~ ^[Yy]$ ]]; then
  gh pr create --title "$title" --body "" --head "$branch"
else
  echo "🛑 PR not created. You can still copy and use the title manually."
fi
