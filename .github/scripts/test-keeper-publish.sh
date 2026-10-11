#!/usr/bin/env bash
# Runs after the unit-test-keeper agent: guard, verify, commit.
# Writes $TEST_KEEPER_OUT/{status,sha,reverted.txt}. Never pushes.
set -uo pipefail

OUT=${TEST_KEEPER_OUT:?}
BASE=origin/${BASE_REF:?}
TEST_PATHS=.claude/skills/gate-unit-tests/scripts/test-paths.mjs
# The action restores these from base; put the PR head back so the guard sees only agent writes.
CONFIG_PATHS=(.claude .mcp.json .claude.json .gitmodules .ripgreprc CLAUDE.md CLAUDE.local.md .husky)

status=done
: > "$OUT/reverted.txt"
: > "$OUT/sha"

changed_paths() {
  git status --porcelain --untracked-files=all | cut -c4- | grep -v "^$OUT/" | grep -v '^.claude-pr/'
}

revert_all() {
  git checkout -- . 2>/dev/null
  git clean -fdq -e "$OUT" -e .claude-pr
}

restore_from_base() {
  git checkout "$BASE" -- "$1" 2>/dev/null || rm -f "$1"
  echo "$1" >> "$OUT/reverted.txt"
}

for p in "${CONFIG_PATHS[@]}"; do
  git checkout -- "$p" 2>/dev/null
  git clean -fdq -- "$p" 2>/dev/null
done

if [ ! -s "$OUT/report.md" ]; then
  status=incomplete
  revert_all
fi

if [ "$status" = done ]; then
  all=$(changed_paths)
  ok=$(printf '%s\n' "$all" | node "$TEST_PATHS")
  bad=$(comm -23 <(printf '%s\n' "$all" | sort) <(printf '%s\n' "$ok" | sort) | grep . || true)
  if [ -n "$bad" ]; then
    status=blocked
    printf '%s\n' "$bad" >> "$OUT/reverted.txt"
    revert_all
  fi
fi

if [ "$status" = done ]; then
  for f in $(changed_paths | grep -E '\.test\.tsx?$'); do
    pkg=${f%%/*}
    if ! npm --prefix "$pkg" run test -- "${f#"$pkg"/}"; then restore_from_base "$f"; fi
  done
  for pkg in backend frontend; do
    if changed_paths | grep -q "^$pkg/"; then
      if ! npm --prefix "$pkg" run test; then
        for f in $(changed_paths | grep "^$pkg/" | grep -vE '\.test\.tsx?$'); do restore_from_base "$f"; done
      fi
      if ! npm --prefix "$pkg" run typecheck; then status=verification_failed; fi
    fi
  done
  [ "$status" = done ] || revert_all
fi

if [ "$status" = done ]; then
  files=$(changed_paths)
  if [ -n "$files" ]; then
    printf '%s\n' "$files" | xargs git add --
    git -c user.name='test-keeper' -c user.email='test-keeper@users.noreply.github.com' \
      commit -q -m 'test(agent): update unit tests for changed source'
    git rev-parse --short HEAD > "$OUT/sha"
  fi
fi

echo "$status" > "$OUT/status"
echo "status=$status" >> "${GITHUB_OUTPUT:-/dev/null}"
echo "sha=$(cat "$OUT/sha")" >> "${GITHUB_OUTPUT:-/dev/null}"
