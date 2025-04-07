#!/bin/bash

# Ensure the OpenAI API key is available
if [ -z "$OPENAI_API_KEY" ]; then
  echo "❌ OPENAI_API_KEY environment variable not set."
  exit 1
fi

# Check current branch
echo "🔍 Current branch:"
BRANCH=$(git branch --show-current)
echo "$BRANCH"
echo

# Show staged files
echo "📦 Staged changes:"
STAGED=$(git diff --name-only --cached)
if [ -z "$STAGED" ]; then
  echo "No staged changes."
  read -p "🧩 Do you want to stage all changes? (y/n): " STAGE_CONFIRM
  if [[ "$STAGE_CONFIRM" =~ ^[Yy]$ ]]; then
    git add .
    STAGED=$(git diff --name-only --cached)
    echo "✅ Staged files:"
    echo "$STAGED"
  else
    echo "❌ No files staged. Exiting."
    exit 0
  fi
else
  echo "$STAGED"
fi
echo

# Show staged diff (truncated preview)
echo "🧾 Staged diff:"
DIFF=$(git diff --cached)
if [ -z "$DIFF" ]; then
  echo "No staged diff."
  exit 0
else
  echo "$DIFF" | head -n 20
  echo "…"
fi
echo

# Show recent commits
echo "📜 Recent commit history:"
git --no-pager log --oneline -n 10
echo

# Generate commit message using OpenAI
echo "🧠 Generating commit message using OpenAI…"

PROMPT=$(cat <<EOF
You're an expert developer writing Conventional Commits.

Given this staged git diff, suggest a commit message using the format:
type(scope): description

Optionally, include a short body if helpful.

Diff:
$DIFF
EOF
)

# Call OpenAI API
COMMIT_MSG=$(curl -s https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "'"${PROMPT//$'\n'/\\n"}"'"}],
    "temperature": 0.4
  }' | jq -r '.choices[0].message.content')

# Display and auto-commit
echo
echo "📝 Suggested commit message:"
echo "$COMMIT_MSG"
echo

read -p "💬 Do you want to use this message to commit? (y/n): " CONFIRM
if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "$COMMIT_MSG" | git commit -F -
  echo "✅ Committed with AI-generated message."
else
  echo "❌ Commit cancelled."
fi
