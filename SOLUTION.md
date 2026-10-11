# Solution: unit test keeper

A Claude Code agent that keeps unit tests current for every pull request. It decides per changed source file whether tests are needed, writes or updates them, proves them green, and reports in the PR. CI verifies the work independently, commits only test files to the PR branch, and posts the report as a sticky comment.

## Task requirements and where they live

| Requirement | Where |
| --- | --- |
| Custom agent | `.claude/agents/unit-test-keeper.md`: protocol, hard rules, denied calls. Same definition locally and in CI |
| Reusable skills | `.claude/skills/gate-unit-tests/` (which files need tests, what a good test is, weak-test check, report format) and `.claude/skills/write-unit-tests/` (how a test is written here: golden files, shared helpers, Arrange-Act-Assert, run commands) |
| Runs for PRs on GitHub | `.github/workflows/pr-tests.yml`, job `test-keeper`, via `anthropics/claude-code-action@v1` |
| Creates or updates unit tests for changed code | Agent protocol step 3; `tested` / `updated` / `skipped` / `bug` decision table in `gate-unit-tests/SKILL.md` |
| Runs them | Agent runs each touched test file and the package typecheck, then the full suite of each touched package. CI reruns every touched test file and typechecks again (`.github/scripts/test-keeper-publish.sh`) |
| Reports in the PR | Agent writes `report.md`; CI prepends status, cost, tokens, turns, commit and running totals, appends reverted files, posts a sticky comment |
| Coverage of the existing code | Same agent run locally over `backend/src` and `frontend/src`, reviewed and committed by hand. Totals thresholds in `backend/vitest.config.ts` and `frontend/vite.config.ts` |

## Architecture

```text
PR event ──> checks (prettier, eslint, tsc)      every push, red = PR red
         ──> baseline (vitest + coverage)        every push, red = PR red
         ──> test-keeper                         opened | ready_for_review | label, same-repo PRs only
               1. git diff base...head -> .test-keeper/changed.txt; stop if nothing under backend/src or frontend/src
               2. claude-code-action: --agent unit-test-keeper, dontAsk, allowlist, budget cap
                  agent: load skills -> decide per file -> write/update tests -> run file + typecheck -> full suite -> report.md
               3. publish script: guard (only test paths changed) -> verify (vitest per touched file, typecheck)
                  -> prettier -> commit "test(agent): ..."
               4. push with a fine-grained PAT (this step only) -> sticky comment -> remove label
```

Two layers keep the agent inside test files. In the session, the `--allowedTools` list only permits `Edit` under the test paths and the out dir, read-only git, and the exact `npm --prefix <pkg> run test|test:coverage|typecheck` forms with the API key stripped from the environment. After the session, the publish script compares `git status` with `test-paths.mjs` and reverts everything on a mismatch (`blocked`). A red test the agent touched goes back to the PR author's version (a new file is deleted) and is listed in the comment; a typecheck failure is `verification_failed` and reverts the tree. No `report.md` means `incomplete`.

Knowledge is split so it is reusable: `gate-unit-tests` can judge any branch or PR for a human ("is this covered", "find weak tests"), `write-unit-tests` can write tests for any session, and the agent is only the process around them. Test patterns live in code as golden files (one per module kind) and shared helpers, not as snippets in a skill, so they are compiled, run and reviewed like any test. The weak-test check (`scripts/mutate.mjs`) applies single-line mutants to the source, runs the test file, and restores the source in `finally`: a survived mutant is a `weak-test` finding with the exact mutant.

## Running it locally

The same agent, the same allowlist. Prompt on stdin because `--allowedTools` is variadic and would swallow a trailing argument.

```bash
printf '%s' "Run for the current branch." | claude -p --agent unit-test-keeper \
  --permission-mode dontAsk --effort medium --max-budget-usd 3 \
  --allowedTools "Read(backend/**)" "Read(frontend/**)" "Read(.claude/**)" "Read(.test-keeper/**)" "Read(CLAUDE.md)" "Glob" "Grep" "Skill" \
    "Edit(backend/tests/**)" "Edit(frontend/src/**/*.test.ts)" "Edit(frontend/src/**/*.test.tsx)" "Edit(frontend/src/test/**)" "Edit(.test-keeper/**)" \
    "Bash(env -u ANTHROPIC_API_KEY -u GITHUB_TOKEN npm --prefix backend run test *)" "Bash(env -u ANTHROPIC_API_KEY -u GITHUB_TOKEN npm --prefix backend run test:coverage)" \
    "Bash(env -u ANTHROPIC_API_KEY -u GITHUB_TOKEN npm --prefix frontend run test *)" "Bash(env -u ANTHROPIC_API_KEY -u GITHUB_TOKEN npm --prefix frontend run test:coverage)" \
    "Bash(npm --prefix backend run typecheck)" "Bash(npm --prefix frontend run typecheck)" \
    "Bash(node .claude/skills/gate-unit-tests/scripts/mutate.mjs *)" \
    "Bash(git diff *)" "Bash(git merge-base *)" "Bash(git log *)" "Bash(git show *)" "Bash(git status *)" "Bash(git ls-files *)"
```

Interactive use: `claude --agent unit-test-keeper`, then "write tests for my changes" or "raise coverage over backend/src". Skill scripts have their own tests: `node --test '.claude/skills/gate-unit-tests/scripts/*.test.mjs'`.

## Trigger policy

The agent runs when a PR is opened (not draft), marked ready for review, or gets the `test-keeper` label. It does not run on every push: an agent committing while a human is still pushing causes churn and spend without a decision. The label is the explicit "run again" and the comment says so; CI removes the label after the run. The agent's own push triggers `checks` and `baseline` only, so its commit has checks and there is no loop. Docs-only PRs stop before the agent and cost nothing. Only same-repo PRs run it.

Agent output is informational. A PR is red only on `checks` or `baseline`; a wrong judgment by the agent never blocks a merge.

## Coverage

Existing code pass: the agent ran locally over all source files, the output was reviewed and committed by hand in small commits. Thresholds were set after the pass and rounded down.

| Package | Before (lines / statements / branches / functions) | After | Threshold |
| --- | --- | --- | --- |
| backend | 33.0 / 30.2 / 33.3 / 40.6 | 98.9 / 98.0 / 97.8 / 96.0 | 95 / 95 / 95 / 90 |
| frontend | 47.7 / 46.4 / 43.8 / 40.3 | 91.4 / 89.3 / 74.5 / 83.1 | 85 / 85 / 70 / 80 |

Still uncovered on purpose: `backend/src/main.ts` and `core/lifespan.ts` (process wiring, excluded), `database.ts` `initialize` (DDL, only observable against a real PostgreSQL), `factory.ts` `headersSent` re-throw. `validators.ts` and `mappers.ts` keep a 100% rule.

## Evidence

| PR | What it shows | Agent cost |
| --- | --- | --- |
| #1 | CI-only change: `test-keeper` stops before the agent, no spend | $0 |
| #2 | New pure helper, no tests in the PR: agent adds 2 cases, CI verifies, commits, comments. Bot push runs `checks` + `baseline` only | $0.11, 1 run |
| #5 | Feature across both packages (`DELETE /api/todos/completed`): 20 tests red on push 1 because of changed signatures. Run 1 updates 5 test files and adds a hook test (37 turns). Push 2 changes behavior and gets the label: run 2 updates 2 files, reports a conflict between the earlier tests and the new source under Possible bugs. Left open with its history | $0.23 + $0.15, 2 runs |

Run 1 on #5 also found two gaps that were fixed on `main` before run 2: a red test outside the agent's file list (`openapi.json` is outside `src/`, so the agent never ran `factory.test.ts`; it now runs the full suite of each touched package once and updates a red test when the diff explains it), and unformatted test files (the PostToolUse prettier hook is off in CI for security, so the publish script formats what it commits). Both runs on #5 happened before the format fix landed on the branch, hence the one manual `style:` commit there.

## Trust boundary and security

Collaborators only. On `pull_request` the workflow file, the publish script, `package.json` scripts, lint and vitest configs and the tests themselves all come from the PR head, so anyone who can open a PR from a branch of this repo can run code in the job. Forks never reach the agent job. The repository has interaction limits set to collaborators.

What the design protects against is agent drift and prompt injection, not a malicious collaborator:

- `.claude/`, `CLAUDE.md`, `.mcp.json` are restored from the base branch by the action before the CLI reads them, so a PR cannot change the agent's prompt, skills or hooks for its own run.
- `--permission-mode dontAsk` with an allowlist; `Read` scoped to the repo; no `cat`-style escape for `.env`; mutants only through `mutate.mjs`.
- The API key is stripped from every test process (`env -u`); the PostToolUse hook that would run PR-controlled eslint and prettier with the key in its environment exits early under `GITHUB_ACTIONS`.
- The PAT lives only in the push step's environment, the checkout does not persist credentials, the job token is `contents: read`. Branch names reach shell steps through `env:`, never by interpolation.
- The comment step refuses to post anything that looks like an API key or a GitHub token.
- `main` is protected: PRs only, required `checks` and `baseline`, no force push.

The `test-keeper` GitHub environment holds the two secrets. It was created with a required reviewer (one approval click per agent run), which worked, and the reviewer was then removed for the demo: with a single collaborator the click only slowed things down. Without it, anyone with triage rights could add the label and spend up to the `--max-budget-usd` cap per run; the spend limit on the API key is the backstop. Put the reviewer back when more than one person can label PRs.

Third-party actions are pinned by tag, not by SHA. That is the one review finding left open on purpose for a demo repo; see below.

## Cost

Per run: `--max-budget-usd 3` and `maxTurns: 200` in the agent frontmatter. Measured: $0.11 for a one-file PR, $0.23 for a six-file PR with 20 red tests. The comment shows cost, tokens and turns per run and a running total per PR.

## What would differ in real maintenance

- Pin `claude-code-action`, `sticky-pull-request-comment`, `checkout` and `setup-node` to commit SHAs and let Dependabot bump them.
- Put the environment reviewer back, or split the job so the agent runs with the API key only and a separate job verifies and pushes.
- Run on `synchronize` too, skipping pushes whose head commit starts with `test(agent):`, with `cancel-in-progress`, once a team accepts the spend.
- A stale check before pushing (head moved during the run) and a rebase instead of a failed push.
- Verify by a before/after comparison of the whole suite, not only the touched files, once a touched helper can break tests the agent did not touch.
- Full mutation testing on changed files (Stryker) instead of the bounded weak-test check.
- Let the agent write its project memory from CI, committed with the tests, once memory diffs are reviewed like code.
- A coverage ratchet instead of hand-set thresholds, and a run history to decide when to change model or prompt.
