#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRANCH_CONFIG_SCRIPT="${SCRIPT_DIR}/branch-name-config.sh"

if [[ ! -f "$BRANCH_CONFIG_SCRIPT" ]]; then
  echo "❌ Branch config not found: $BRANCH_CONFIG_SCRIPT"
  exit 1
fi

# shellcheck source=./branch-name-config.sh
source "$BRANCH_CONFIG_SCRIPT"

usage() {
  echo "Usage: scripts/create-branch.sh [{branch-name}] [--no-push]"
  echo "  Run with no branch name to be prompted interactively."
}

# Create (and optionally push) a branch after validating it against the shared
# naming rules in branch-name-config.sh.
create_branch() {
  local branch_name="$1"
  local push_to_remote="$2"

  if [[ $branch_name =~ $BRANCH_REGEX || $branch_name =~ $SNYK_REGEX ]]; then
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
    echo "📌 Allowed types: $BRANCH_TYPES_CSV"
    exit 1
  fi
}

# Build a branch name by prompting the user, deriving the type menu directly
# from the shared branch-name-config.sh so it always stays in sync.
prompt_for_branch() {
  # `BRANCH_TYPES_REGEX` is a pipe-delimited list, e.g. "feat|fix|...".
  local -a types=()
  IFS='|' read -r -a types <<< "$BRANCH_TYPES_REGEX"

  # 1) Choose a branch type from the supplied options.
  echo "Select a branch type:" >&2
  local i
  for i in "${!types[@]}"; do
    printf "  %2d) %s\n" "$((i + 1))" "${types[$i]}" >&2
  done

  local choice branch_type=""
  while true; do
    if ! read -r -p "Enter a number (1-${#types[@]}): " choice; then
      echo "❌ No selection made." >&2
      exit 1
    fi
    if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#types[@]} )); then
      branch_type="${types[$((choice - 1))]}"
      break
    fi
    echo "Please enter a number between 1 and ${#types[@]}." >&2
  done

  # 2) Optionally reference an issue/ticket id (matches the {type}/issue/{id}/...
  #    and {type}/ticket/{id}/... forms allowed by BRANCH_REGEX).
  local ref_segment="" ref_kind ref_id
  if ! read -r -p "Reference an issue or ticket? (issue/ticket, blank to skip): " ref_kind; then
    ref_kind=""
  fi
  ref_kind="$(printf '%s' "$ref_kind" | tr '[:upper:]' '[:lower:]')"
  if [[ "$ref_kind" == "issue" || "$ref_kind" == "ticket" ]]; then
    while true; do
      if ! read -r -p "Enter the ${ref_kind} id: " ref_id; then
        ref_id=""
      fi
      if [[ "$ref_id" =~ ^[A-Za-z0-9_-]+$ ]]; then
        ref_segment="/${ref_kind}/${ref_id}"
        break
      fi
      echo "Id may only contain letters, numbers, _ and - (e.g. ABC-123)." >&2
    done
  elif [[ -n "$ref_kind" ]]; then
    echo "ℹ️ Unrecognised value '${ref_kind}'; skipping issue/ticket reference." >&2
  fi

  # 3) Prompt for the short description (the part after the final "/").
  local description=""
  while true; do
    if ! read -r -p "Enter the branch description (lowercase, e.g. add-login-form or v1.2.0): " description; then
      description=""
    fi
    if [[ "$description" =~ ^[a-z0-9]+([.-][a-z0-9]+)*$ ]]; then
      break
    fi
    echo "Description may only contain lowercase letters, numbers, hyphens and dots, with no leading, trailing, or consecutive separators." >&2
  done

  # Emit the assembled branch name on stdout for the caller to capture.
  printf '%s%s/%s' "$branch_type" "$ref_segment" "$description"
}

push_to_remote="true"
no_push_flag="false"
branch_name=""
branch_name_set="false"

# Parse args order-independently so the branch name is optional and --no-push
# works on its own (e.g. `scripts/create-branch.sh --no-push` enters interactive
# mode and creates the branch locally only).
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-push)
      push_to_remote="false"
      no_push_flag="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*)
      echo "❌ Unknown option: $1"
      usage
      exit 1
      ;;
    *)
      if [[ "$branch_name_set" == "true" ]]; then
        echo "❌ Too many arguments."
        usage
        exit 1
      fi
      branch_name="$1"
      branch_name_set="true"
      shift
      ;;
  esac
done

# Interactive mode: no branch name supplied.
if [[ "$branch_name_set" == "false" ]]; then
  branch_name="$(prompt_for_branch)"
  echo "📋 Proposed branch name: $branch_name"

  # Only ask about pushing when the caller hasn't already decided via --no-push.
  if [[ "$no_push_flag" == "false" ]]; then
    push_answer=""
    while true; do
      if ! read -r -p "Push the branch to remote after creating? (y/n): " push_answer; then
        push_answer="n"
      fi
      case "${push_answer:-}" in
        [Yy]) push_to_remote="true"; break ;;
        [Nn]) push_to_remote="false"; break ;;
        *) echo "Please answer y or n." ;;
      esac
    done
  fi
fi

create_branch "$branch_name" "$push_to_remote"
