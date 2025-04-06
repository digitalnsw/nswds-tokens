#!/bin/bash

echo "🔍 Current branch:"
git branch --show-current
echo

echo "📦 Staged changes:"
git status --short | grep '^[A|M|D|R|C|U]' || echo "No staged changes."
echo

echo "🧾 Staged diff:"
git diff --cached || echo "No staged diff."
echo

echo "📜 Recent commit history:"
git log --oneline -n 10
