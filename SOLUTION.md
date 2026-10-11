# Solution: unit test keeper

A Claude Code agent keeps unit tests current for pull requests in `backend/` and `frontend/`. It decides per changed source file whether tests are needed, writes or updates them, runs them, and writes a report. The test-keeper job verifies the work, commits only test files to the PR branch, and posts the report as a sticky PR comment.

| Requirement               | Location                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| Custom agent              | `.claude/agents/unit-test-keeper.md`                                                      |
| Reusable skills           | `.claude/skills/gate-unit-tests/`, `.claude/skills/write-unit-tests/`                     |
| PR workflow               | `.github/workflows/pr-tests.yml`, test-keeper job                                         |
| Verify by running tests   | Agent runs; then `.github/scripts/test-keeper-publish.sh` reruns                          |
| Results in the PR         | Sticky comment "Unit test keeper"                                                         |
| Coverage of existing code | Coverage table below; thresholds in `backend/vitest.config.ts`, `frontend/vite.config.ts` |

## 1. Main technical decisions and rationale

- **Agent environment: Claude Code, locally and in CI.** It is close to my stack. CI uses `anthropics/claude-code-action@v1` with the same agent definition as a local run.
- **Knowledge is split by responsibility.**
  - gate-unit-tests decides: one action per changed source file (`tested`, `updated`, `skipped`, `bug`), the good-test checklist (`checklist.md`), the weak-test check, and the report format.
  - write-unit-tests writes: golden files, shared helpers, Arrange-Act-Assert, run commands, 3 fix attempts.
  - The agent holds only the order of steps and the permissions.
- **Weak-test check.** `scripts/mutate.mjs` applies single-line mutants to a source file, runs the test file, and restores the source in `finally`. A surviving mutant is a `weak-test` finding. Limits: 3 lines per file, 10 mutants per run. The agent has no write access to `src`; mutants go only through this script.
- **Golden set.** I added the AAA pattern and refactored a few existing tests into one golden file per module kind. The agent copies their shape. Patterns live in code, so they compile and run like any test.
- **Coverage first, then thresholds.** The agent ran locally over all source files. I reviewed and committed the output in small commits. Thresholds were set after that pass, rounded down, so nobody can lower coverage later.
- **Commit to the author's branch.** The test-keeper job pushes a `test(agent): ...` commit to the PR branch. This keeps the workflow autonomous: no second PR waits for a merge.
- **Trigger policy for cost.** The test-keeper job runs when a PR is opened (not draft) or marked ready for review, once. Every next run is requested with the `test-keeper` label; the job removes the label afterwards. It does not run on every push: an agent committing while a human still pushes causes churn and spend. The agent's own push triggers only `checks` and `baseline`, so there is no loop.
- **Docs-only PR costs $0.** If nothing changed under `backend/src` or `frontend/src`, the job stops before the agent.
- **Agent result is informational.** Only `checks` (prettier, eslint, tsc) and `baseline` (vitest with coverage) can make a PR red. A wrong agent judgment never blocks a merge.
- **Minimal permissions.** `--permission-mode dontAsk` with an `--allowedTools` allowlist: `Edit` only on test paths and `.test-keeper/`, read-only git, the exact `npm --prefix <pkg> run test|test:coverage|typecheck` forms. Budget `--max-budget-usd 3`, `maxTurns: 200`.
- **Second guard layer in CI.** `test-keeper-publish.sh` does not trust the agent:
  - compares `git status` with `scripts/test-paths.mjs`; any other changed path reverts everything (`blocked`);
  - reruns every touched test file, the full suite and typecheck of each touched package;
  - a red test the agent touched goes back to the PR author's version (`git checkout HEAD`), a new agent file is deleted, both are listed under "Reverted by CI";
  - a typecheck failure reverts everything (`verification_failed`); no `report.md` means `incomplete`.
- **Lint and format in agent hooks.** I added eslint and prettier to both packages and wired them into a PostToolUse hook in `.claude/settings.json` (`.claude/hooks/post-edit.sh`). This choice depends on the team's stack. In CI the hook exits early, because it would run PR-controlled configs with the API key in its environment. The publish script runs prettier on the files it commits.
- **Secrets.** `env -u ANTHROPIC_API_KEY -u GITHUB_TOKEN` strips the keys from test processes. This is not a sandbox (see Limitations). The PAT exists only in the push step. Checkout uses `persist-credentials: false`; the job token is `contents: read`. The push runs with `git -c core.hooksPath=/dev/null`, so a git hook written by test code cannot see the PAT. The comment step refuses to post text that matches `sk-ant-`, `gh[pousr]_` or `github_pat_`.
- **Trust boundary: collaborators only.** Workflow, scripts and tests come from the PR head, so a PR author can run code in the job. Forks never reach the test-keeper job. The design protects against agent drift and prompt injection, not against a malicious collaborator. `.claude/` and `CLAUDE.md` are restored from the base branch by the action before the agent reads them.

Coverage before and after the pass:

| Package  | Before (lines / stmts / branches / funcs) | After                     | Threshold         |
| -------- | ----------------------------------------- | ------------------------- | ----------------- |
| backend  | 33.0 / 30.2 / 33.3 / 40.6                 | 98.9 / 98.0 / 97.8 / 96.0 | 95 / 95 / 95 / 90 |
| frontend | 47.7 / 46.4 / 43.8 / 40.3                 | 91.4 / 89.3 / 74.5 / 83.1 | 85 / 85 / 70 / 80 |

Uncovered on purpose: `backend/src/main.ts`, `core/lifespan.ts` (process wiring, excluded), `database.ts` `initialize` (needs real PostgreSQL). `validators.ts` and `mappers.ts` have a 100% threshold.

## 2. How to run the PR workflow and prerequisites

1. Create a GitHub environment named `test-keeper`.
2. Add environment secret `ANTHROPIC_API_KEY`. Set a spend limit on the key.
3. Add environment secret `TEST_KEEPER_PAT`: fine-grained PAT, this repository only, Contents read and write, short expiry. It is used only for `git push`, so the agent's commit triggers `checks` and `baseline`.
4. Optional: repository variable `TEST_KEEPER_MODEL`. Default: `claude-sonnet-5-5`.
5. Optional: a required reviewer on the environment (one approval per run). Use it when more than one person can add labels.
6. Create the label `test-keeper`.
7. Optional: a ruleset on `main` (PRs only, required `checks` and `baseline`, no force push). This repo has one.
8. Open a PR from a branch of this repo (not draft). Node 22 is set by the workflow. Read the result in the "Unit test keeper" comment. Add the `test-keeper` label to run again.

Local run: Node 22, `npm --prefix backend ci`, `npm --prefix frontend ci`, Claude Code CLI. Same agent, same allowlist. The prompt goes on stdin because `--allowedTools` is variadic.

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

Interactive: `claude --agent unit-test-keeper`, then "write tests for my changes" or "raise coverage over backend/src". Locally the output stays uncommitted for a human to review. Skill script tests: `node --test '.claude/skills/gate-unit-tests/scripts/*.test.mjs'` (also run in `baseline`).

## 3. Where the agent and skills are defined and how they are used during execution

| File                                                      | Role                                                      |
| --------------------------------------------------------- | --------------------------------------------------------- |
| `.claude/agents/unit-test-keeper.md`                      | Protocol, scope, denied calls, hard rules                 |
| `.claude/skills/gate-unit-tests/SKILL.md`                 | Facts, decision table, test review, report format         |
| `.claude/skills/gate-unit-tests/checklist.md`             | What a good test is; used by both skills                  |
| `.claude/skills/gate-unit-tests/scripts/mutate.mjs`       | Weak-test check                                           |
| `.claude/skills/gate-unit-tests/scripts/test-paths.mjs`   | Test path patterns; used by `mutate.mjs` and the CI guard |
| `.claude/skills/write-unit-tests/SKILL.md`, `references/` | Golden files, helpers, AAA, package traps                 |
| `.claude/settings.json`, `.claude/hooks/post-edit.sh`     | PostToolUse format, lint, typecheck (local only)          |
| `.github/workflows/pr-tests.yml`                          | `checks`, `baseline`, test-keeper job                     |
| `.github/scripts/test-keeper-publish.sh`                  | Guard, verify, format, commit                             |

Execution of the test-keeper job:

1. `git diff --name-only origin/<base>...HEAD` writes `.test-keeper/changed.txt`. No source change: stop.
2. The action starts `--agent unit-test-keeper`. The agent loads both skills with the Skill tool.
3. Facts and decisions (gate-unit-tests steps 1-2): one row per source file. A red test the author did not write: `updated` if the diff explains it, otherwise `bug` (pre-existing) and the test stays untouched.
4. Write (write-unit-tests): read source and golden file, one `it` per behavior, run the file, typecheck, up to 3 attempts.
5. Full suite of every touched package, once.
6. Report: `.test-keeper/report.md`, written before the optional review so a run cut by budget keeps its result.
7. Optional review (gate-unit-tests step 3): checklist plus `mutate.mjs`, at most 5 findings.
8. `test-keeper-publish.sh`: guard, rerun, prettier, commit. Push with `TEST_KEEPER_PAT`.
9. Comment: status, cost, tokens, turns, commit, running totals per PR, report, reverted files.

## 4. Example run

PR #5 `feat: clear completed tasks` (`DELETE /api/todos/completed`, both packages): https://github.com/marcin-jarota/taskly-app/pull/5

Run 1, on PR opened: https://github.com/marcin-jarota/taskly-app/actions/runs/38139589923

- Input: 9 changed source files. `checks` and `baseline` were red: 18 tests failed, 17 in `TodosPage.test.tsx` because of changed signatures and 1 in `factory.test.ts` because of `openapi.json`.
- Skills used: gate-unit-tests (facts, decision table, report format), write-unit-tests (golden files, AAA, run commands).
- Decisions: updated `backend/tests/repository.test.ts`, `backend/tests/router.test.ts`, `frontend/.../TodosPage.test.tsx`, `frontend/.../api/todos.test.ts`, `frontend/.../TodosHeader.test.tsx`; created `frontend/.../hooks/useDeleteCompletedMutation.test.tsx`. Type-only files: `skipped`.
- Result: commit `0fd9304`, 37 turns, $0.23. The guard passed; CI reran the touched files and typecheck before the push.
- Gaps found and fixed on `main` before run 2: `factory.test.ts` stayed red because `openapi.json` is outside `src/` (fix: full suite per touched package, update a red test the diff explains); agent tests were unformatted (fix: publish script runs prettier). The manual `style:` commit `50a006b` on #5 comes from before the format fix.

Run 2, after a behavior change and the label: https://github.com/marcin-jarota/taskly-app/actions/runs/38139915772

- Updated `factory.test.ts` (new OpenAPI path) and `TodosHeader.test.tsx`; 7 files `skipped`, each with the covering case named. Commit `ca7460d`, 20 turns, $0.15.
- Possible bugs: the author's `TodosHeader` tests expected a button "Clear completed" and a disabled button at 0 completed; the source names it "Clear completed (N)" and hides it. The agent followed the source and reported the conflict. This comment is what #5 shows now.

Other evidence:

| PR                                                                | Shows                                                                                                                                                                                                                                                                                                                                                                | Cost                   |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| [#1](https://github.com/marcin-jarota/taskly-app/pull/1)          | CI-only change: test-keeper job stops before the agent ([run](https://github.com/marcin-jarota/taskly-app/actions/runs/38139103892))                                                                                                                                                                                                                                 | $0                     |
| [#2](https://github.com/marcin-jarota/taskly-app/pull/2)          | One pure helper, no tests: agent adds 2 cases (`01575ea`), push runs only `checks` + `baseline` ([run](https://github.com/marcin-jarota/taskly-app/actions/runs/38139143502))                                                                                                                                                                                        | $0.11                  |
| [#10](https://github.com/marcin-jarota/taskly-app/pull/10)        | Run 1 ([run](https://github.com/marcin-jarota/taskly-app/actions/runs/38140735298)) fixed red typecheck and backend tests in `4447ef2`; its comment was lost to a first-run totals bug fixed in #11. Run 2 and run 3 ([run](https://github.com/marcin-jarota/taskly-app/actions/runs/38163954074)) after the label: 3 files `skipped` with covering cases, no commit | run 3: $0.08, 11 turns |
| [#10](https://github.com/marcin-jarota/taskly-app/pull/10), run 4 | After the final fixes on `main`: a behavior change (`overdue` count in `stats()`) left one test red. The agent updated it, added a case for the overdue filter, and CI pushed `02f1605`; `checks` and `baseline` are green on it ([run](https://github.com/marcin-jarota/taskly-app/actions/runs/38167177760))                                                       | $0.06, 16 turns        |

The CI-fix PRs #3, #4, #6, #7, #8 and #11 each came from a real run, each fix in its own PR.

## 5. Assumptions

- Scope is unit tests only (Vitest). No integration or e2e tests, no real PostgreSQL.
- PRs come from branches of this repo, opened by collaborators.
- The source is the truth. A test that disagrees with the source is reported under Possible bugs; the agent never changes source.
- The agent runs on demand (open, ready for review, label), not on every push.
- Reviewers without an API key cannot rerun the job; they judge from the evidence PRs and run links.

## 6. Limitations

- Needs a paid API key. Measured cost per run here: $0.06-0.23, 11-37 turns.
- Each run is capped at `--max-budget-usd 3` and `maxTurns: 200` (agent frontmatter). The caps are sized for this repo with a wide margin. A large PR can hit a cap: if it hits before the agent writes `report.md`, the run ends `incomplete`, CI reverts the tree, nothing is committed, and the spend is lost. A team with bigger diffs has to tune both numbers.
- The test-keeper job runs `test-keeper-publish.sh` from the PR head, while the workflow file comes from `main`. A branch that is behind `main` after a change to the workflow-script contract fails in the publish step. Seen on #10 ([run](https://github.com/marcin-jarota/taskly-app/actions/runs/38166895835)); merging `main` into the branch fixed it.
- LLM output is not deterministic. Two runs on the same diff can decide differently.
- PRs from forks are not supported.
- Verification covers touched test files plus the full suites of touched packages, not a before/after comparison of the whole repo.
- A type error in the PR's source fails typecheck and discards all agent work for that run.
- No `concurrency` group and no stale-head check: two quick labels start two runs, and the second push fails.
- Test code runs in the job that holds the secrets. `env -u` removes keys from the test process environment, but a process of the same user may still read other processes' environment.
- Third-party actions are pinned by tag, not SHA.
- The skills hardcode `origin/main` and this repo's paths.
- The environment reviewer was removed for the demo; anyone with triage rights can add the label and spend up to $3 per run.

## 7. What I would extend or change for production

- Run `test-keeper-publish.sh` from the base branch, like `.claude/`, so a branch behind `main` cannot run an old script.
- Run the test keeper from a hook, locally or in the cloud, on a subscription or purchased package instead of a CI API key. Now a run takes about 2 minutes; PRs with 2-4k changed lines and frequent delivery would cost more CI time and API spend. Downside: it uses the developer's tokens, not company ones. The choice depends on how the team works and where subscriptions come from.
- Open a PR into the author's PR instead of committing to it, depending on the autonomy level the team wants.
- Split the job: the agent runs with the API key only; a separate job without it verifies and pushes.
- Pin actions to commit SHAs and let Dependabot bump them.
- Put the environment reviewer back once more than one person can label PRs.
- Add `concurrency` with `cancel-in-progress`, a stale-head check, and a rebase instead of a failed push.
- Run on `synchronize` too, skipping heads that start with `test(agent):`, once the team accepts the spend.
- Verify by a before/after run of the whole suite.
- Add the run link and the list of CI-verified files to the PR comment.
- Full mutation testing on changed files (Stryker) instead of the bounded weak-test check.
- A coverage ratchet instead of hand-set thresholds, and a run history to compare models and prompts.
