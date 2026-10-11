# What a good test is (taskly)

One rulebook, used twice: by `write-unit-tests` while writing and before its report, and by the PR test review after writing. The word in brackets is the `findings.type` the review reports when a test breaks the rule.

## Rules

- **It fails when behavior breaks** (`tautology`, `weak-test`). Name one plausible wrong version of the code (lowercasing dropped, `<` turned into `<=`, UTC date instead of local) and check that the input gives a different result for it. If right and wrong code return the same thing for the input, the test passes either way and its name lies: query `' api '` cannot show the query is lowercased (use `' API '`), and 23:30 in UTC+2 is the same day in UTC. Tests that only render, check a mock was called with anything, or assert the value a mock was told to return fail this too. An existing test with a weak input stays as it is; add the case that does tell right from wrong next to it.
- **Public interface only** (`implementation-not-behavior`). Call the export, hit the route, click what the user sees. No private state, no internal helper calls, so refactors don't break tests.
- **Every behavior the change adds has a case** (`missing-case`). Each branch and error path once, plus the boundaries that matter.
- **Mock at the boundary:** the Prisma delegate, `fetch`, the repository given to a router, child components and hooks of a page. Never the module under test.
- **Deterministic:** no real network or PostgreSQL, no leftover timers, fake time if the code reads it.
- **No snapshots.** They pass on any change once updated and say nothing about intent.
- **Lean.** `it.each` tables instead of near-duplicate tests.
- **Shared helpers are not copied** (`duplicate-helper`). A helper that already exists in `backend/tests/` or `frontend/src/test/`, or inline in another test file, is imported, not re-created. Copies drift, and one CI run writes many test files at once.

## Weak-test check

A rule read by a model is not proof: in evals the writer kept `' api '` twice while this rule was in its skill. The review therefore breaks the code and watches the test fail.

For each test file the PR adds or changes:

1. Pick at most 3 lines in the source under test that the new cases claim to cover. Prefer conditions, comparisons, normalisation (`trim`, `toLowerCase`) and values passed on to a boundary.
2. For each line write one mutant: a single plausible bug, e.g. `<` to `<=`, drop `.toLocaleLowerCase('en')`, `todo.id !== id` to `todo.id === id`.
3. Run them with `scripts/mutate.mjs`. It applies each mutant, runs that test file, and restores the source in `finally`. Never apply a mutant with `Edit`: source files are outside the agent's allowlist and the CI guard reverts them.
4. A mutant the tests survive is a `weak-test` finding. Put the mutant in `mutant` and say which case should have caught it.

Skip lines whose mutant cannot change behavior (a check another line already enforces). Max 10 mutants per run, so the check cannot eat the budget.
