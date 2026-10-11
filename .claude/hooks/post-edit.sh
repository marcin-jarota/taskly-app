#!/usr/bin/env bash
# PostToolUse hook: format the edited file, then lint + typecheck its package.
# Exit 2 feeds stderr back to the agent as a correction.
set -u

# In CI the lint and prettier configs come from the PR head and the hook inherits the API key.
[ -n "${GITHUB_ACTIONS:-}" ] && exit 0

file=$(node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(JSON.parse(d).tool_input?.file_path||"")}catch{}})')
root=$(cd "$(dirname "$0")/../.." && pwd)
rel=${file#"$root"/}

case "$rel" in
  backend/*) pkg=backend ;;
  frontend/*) pkg=frontend ;;
  *) exit 0 ;;
esac
case "$rel" in
  *.ts|*.tsx|*.js|*.json|*.html) ;;
  *) exit 0 ;;
esac

cd "$root/$pkg" || exit 0
out=""
npx prettier --write --log-level warn "$file" >/dev/null 2>&1
case "$rel" in
  *.ts|*.tsx|*.js) out+=$(npx eslint "$file" 2>&1) ;;
esac
out+=$'\n'$(npx tsc --noEmit --pretty false 2>&1)
out=${out#$'\n'}

if [ -n "$out" ]; then
  echo "$out" >&2
  exit 2
fi
