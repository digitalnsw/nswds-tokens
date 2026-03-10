#!/usr/bin/env bash

set -euo pipefail

# Allowed types
ALLOWED_TYPES="feature|bugfix|hotfix|release|docs|build|test|refactor|chore"

usage() {
  echo "Usage: ./create-branch.sh {branch-name} [--no-push]"
}

# Check if a branch name was provided
if [[ $# -lt 1 ]]; then
  echo "❌ Please provide a branch name."
  usage
  exit 1
fi

branch_name="$1"
shift
push_to_remote="true"
if [[ $# -gt 0 ]]; then
  case "$1" in
    --no-push)
      push_to_remote="false"
      shift
      ;;
    *)
      echo "❌ Unknown option: $1"
      usage
      exit 1
      ;;
  esac
fi
if [[ $# -gt 0 ]]; then
  echo "❌ Too many arguments."
  usage
  exit 1
fi

# Regex pattern
pattern="^(${ALLOWED_TYPES})(/(issue|ticket)/[A-Za-z0-9_-]+)?/[a-z0-9-]+$"

# Check against pattern
if [[ $branch_name =~ $pattern ]]; then
  git checkout -b "$branch_name"
  echo "✅ Branch '$branch_name' created."
  if [[ "$push_to_remote" == "true" ]]; then
    git push -u origin "$branch_name"
    echo "✅ Branch '$branch_name' pushed to remote."
  else
    echo "ℹ️ Branch '$branch_name' created locally only (not pushed)."
    echo "   Push later with: git push -u origin \"$branch_name\""
  fi
else
  echo "❌ Branch name '$branch_name' does not follow naming convention."
  echo "✅ Format: {type}[/issue/{number} | /ticket/{id}]/{short-description}"
  echo "📌 Allowed types: $ALLOWED_TYPES"
  exit 1
fi
