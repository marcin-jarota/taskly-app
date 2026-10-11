---
name: gate-unit-tests
description: Decide which changed files in the taskly repo need unit tests and judge whether the tests are good - per-file decision (tested / updated / skipped / bug), a review of test files against the shared checklist, a deterministic weak-test check that breaks the source with single-line mutants and watches the tests fail, and the markdown report the PR comment is built from. Use this whenever someone asks what in a branch, diff or PR needs tests, whether tests are good enough, to review or audit tests, to find weak or tautological tests, to check that tests would catch a bug, to run a mutation check, or to produce the test-keeper report - even if they only say "check my tests" or "is this PR covered". Writing the tests themselves belongs to write-unit-tests; use both when a run must decide and then write.
---

# Gate unit tests (taskly)

This skill answers two questions: **which changed files need tests**, and **are the tests good**. How to write a test lives in `write-unit-tests`; what counts as a good test lives in [checklist.md](checklist.md), the one rulebook both skills use.

All commands run from the repo root.

## 1. Collect the facts

```bash
git merge-base origin/main HEAD    # <base>
git diff --name-only <base>        # changed files (whole repo: git ls-files 'backend/src' 'frontend/src')
git diff <base> -- <path>          # the change itself, read it before deciding
```

Untracked files are not in the diff; add them from `git status --porcelain --untracked-files=all`. In CI `$TEST_KEEPER_OUT/changed.txt` already holds the list.

Sort each changed file:

- **source**: `.ts`/`.tsx` under `backend/src` or `frontend/src`, except the design system, `*.stories.*`, `*.styles.ts` and `backend/src/generated/`. Needs an action in the report.
- **test**: matches the patterns in `scripts/test-paths.mjs` (`backend/tests/**`, `frontend/src/**/*.test.ts(x)`, `frontend/src/test/**`). Goes to the review in step 3.
- everything else (docs, configs, `openapi.json`): no row of its own, but a test that reads such a file (`factory.test.ts` checks the OpenAPI paths) can go red because of it; the full-suite run in step 2 catches that.

The test file for a source file sits at `backend/tests/<name>.test.ts` or next to the source as `<name>.test.ts(x)`. Check with Glob; `null` means a new file.

Coverage is a hint, never the verdict. If you want it: `env -u ANTHROPIC_API_KEY -u GITHUB_TOKEN npm --prefix <package> run test:coverage`, then read `<package>/coverage/lcov.info` for that file (`DA:<line>,0` = never executed). Executed is not asserted, so a covered line with a weak test still needs attention, and an uncovered line in process wiring needs none.

## 2. Decide per source file

Read the diff of each file, not only the file name. Then give it exactly one action.

| Action | When |
|---|---|
| `tested` | Behavior changed and there was no test file. Write a new one with `write-unit-tests`. |
| `updated` | A test file exists but no case covers the changed behavior. Extend it with `write-unit-tests`. |
| `skipped` + reason | No behavior a unit test can observe, or existing cases already cover it. One line, specific: "type-only change", "barrel re-export", "process wiring, covered by the smoke run", "rename only, `router.test.ts` 'returns 404 for unknown id' covers it". |
| `bug` | A test shows the source is wrong, not your assumption. Record it under Possible bugs. |

Not worth unit tests, so normally `skipped`: `types.ts` and `*.types.ts`, `index.ts` barrels, `main.ts(x)`, `core/lifespan.ts`. A file like `types.ts` still gets a row so the reviewer sees it was looked at.

"Existing cases cover it" needs evidence: name the case.

A red test you did not write: if a file in the diff explains the failure (a changed signature, a new route, a changed data file), that source file gets `updated` and the test is fixed with `write-unit-tests`. Otherwise it is `bug` (pre-existing red test): the test stays untouched. It may be the most useful thing the run finds.

Once at the end, run the whole suite of every package you touched (`env -u ANTHROPIC_API_KEY -u GITHUB_TOKEN npm --prefix <package> run test`), so a test you did not open but the diff broke still shows up.

## 3. Review the tests (optional, last)

Only after the report from step 4 is on disk. If the budget runs out here, the tests are already in.

Scope: every **test** file from step 1 (added or changed by the PR author) plus the test files you wrote this run. Read [checklist.md](checklist.md) and check each new or changed case against it.

Then run the weak-test check the checklist describes. Write the mutants to a JSON file in the out dir and pass its path:

```json
[
  {
    "file": "frontend/src/features/todos/utils/todos.ts",
    "find": "const search = query.trim().toLocaleLowerCase('en')",
    "replace": "const search = query.trim()",
    "test": "frontend/src/features/todos/utils/todos.test.ts"
  }
]
```

```bash
node .claude/skills/gate-unit-tests/scripts/mutate.mjs <out>/mutants.json
```

The script runs the test file once unmutated, then applies each mutant, runs the test file again, and restores the source even when the run crashes or is killed. It prints the mutants with their `line` and a `result`:

- `killed`: the tests catch this bug. Good.
- `survived`: no test fails when the code is wrong. That is a `weak-test` finding.
- `test-red-before-mutation`: the test file is red as it is, so there is no verdict. Treat it as a red test (step 2), not as a finding.

Exit code 2 means the input was rejected and nothing was touched: a test file as `file`, a `test` outside the test patterns or in the other package, or a `find` that does not occur exactly once. Make `find` unique by taking more of the line. Apply mutants only through this script. A source edit with `Edit` is outside the agent's allowlist, and the CI guard reverts it anyway.

A weak spot in a test **you wrote this run**: fix the test and rerun that mutant, then report only what is left. A weak spot in a test someone else wrote: report it. The checklist says an existing weak test stays as it is.

Report at most 5 findings, most damaging first: `weak-test` and `tautology` before `missing-case`, `implementation-not-behavior` and `duplicate-helper`. Each is one line a reviewer can act on: what is wrong, and the input or case that would fix it.

## 4. Write the report

Write `<out>/report.md` right after the main job (decisions and tests), and rewrite it after the review. It is the body of the PR comment; CI adds the heading with status, cost and commit, and a list of files it had to revert. Do not write those.

```markdown
### Files

| File | Action | Detail |
| --- | --- | --- |
| `backend/src/features/todos/router.ts` | updated | `backend/tests/router.test.ts`, 3 cases |
| `frontend/src/features/todos/types.ts` | skipped | type-only change |

### Test review

- **weak-test** `frontend/src/features/todos/utils/todos.test.ts:34`: search case is never tested with an upper-case query. Survived mutant: `todos.ts:32` `query.trim().toLocaleLowerCase('en')` -> `query.trim()`

### Possible bugs

- `backend/src/features/todos/router.ts`: expected 404 for an unknown id, got 500
  <details><summary>Failing test</summary>

  ```ts
  it('returns 404 for an unknown id', ...)
  ```
  </details>
```

Sections with nothing in them are left out. A pre-existing red test gets "(pre-existing red test)" after the file name. A test of your own that is still red after 3 attempts: leave the file as it is, CI reverts it and lists it; put the failing case under Possible bugs if it points at a bug.

When a person asked for the review directly (no CI run), show them that markdown instead of only writing the file.

## Maintaining the scripts

Each script has a `node --test` file next to it. Run them all with a glob (a directory does not work):

```bash
node --test '.claude/skills/gate-unit-tests/scripts/*.test.mjs'
```
