#!/usr/bin/env bash
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

# Shared OpenAI request helper (model defaults + openai_responses_text()).
# Override the model via the OPENAI_MODEL env var.
OPENAI_REQUEST_SCRIPT="${SCRIPT_DIR}/openai-request.sh"
if [[ ! -f "$OPENAI_REQUEST_SCRIPT" ]]; then
  echo "❌ OpenAI request helper not found: ${OPENAI_REQUEST_SCRIPT}"
  exit 1
fi
# shellcheck source=./openai-request.sh
source "$OPENAI_REQUEST_SCRIPT"

# A PR title is short, but reasoning models spend output tokens on hidden
# reasoning before emitting it, so they need a far larger budget.
if [[ "$OPENAI_MODEL_FAMILY" == "reasoning" ]]; then
  OPENAI_MAX_OUTPUT_TOKENS="${OPENAI_MAX_OUTPUT_TOKENS:-2000}"
else
  OPENAI_MAX_OUTPUT_TOKENS="${OPENAI_MAX_OUTPUT_TOKENS:-80}"
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

# Build the prompt and hand off to the shared helper, which shapes the payload,
# makes the request, and runs all the transport/non-JSON/.error guards.
user_prompt="Here are the commit messages:

${commits}

Write a concise PR title that summarizes the changes and follows the Conventional Commits format. Allowed types: ${CONVENTIONAL_COMMIT_TYPES_CSV}. Include a scope in parentheses if applicable. Return only the title and nothing else."

set +e
title=$(openai_responses_text \
  "You are an assistant that writes pull request titles in the Conventional Commits format (https://www.conventionalcommits.org/en/v1.0.0/)." \
  "$user_prompt" \
  "$OPENAI_MAX_OUTPUT_TOKENS")
request_status=$?
set -e

if [[ $request_status -ne 0 ]]; then
  exit 1
fi

# Keep only the first line; bail if empty rather than creating a PR titled "null".
title=$(printf '%s' "$title" | head -n 1)
if [[ -z "$title" ]]; then
  echo "❌ OpenAI API did not return a title."
  exit 1
fi

# Normalize the model output the same way ai-pr-title.yml does: strip a leading
# "Title:", wrapping quotes/backticks/code fences, collapse whitespace, and trim.
title="$(printf '%s' "$title" | sed -E 's/^Title:[[:space:]]*//I')"
title="$(printf '%s' "$title" | sed -E 's/^["'\''`]+|["'\''`]+$//g')"
# shellcheck disable=SC2016  # backticks are literal (markdown fence stripping)
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
read -r -p "📝 Use this title to create the PR? [y/N]: " confirm
if [[ $confirm =~ ^[Yy]$ ]]; then
  gh pr create --title "$title" --body "" --head "$branch"
else
  echo "🛑 PR not created. You can still copy and use the title manually."
fi
