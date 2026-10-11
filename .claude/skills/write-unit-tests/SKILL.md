---
name: write-unit-tests
description: Write or update Vitest unit tests in the taskly repo (backend - Express + Prisma with supertest; frontend - React with Testing Library), following the repo's golden test files and the Arrange-Act-Assert layout, then run them and typecheck until green. Use this whenever the user asks to add, write, extend, fix or update tests, cover a file or hook with tests, raise coverage for specific code, or when a test went red after a change - even if they never say "unit test". Also use it when another agent or skill needs tests written in this repo.
---

# Write unit tests (taskly)

The pattern for every kind of test lives in code, not in this skill: one **golden file** per kind of module. Copy its shape - imports, mocks, `setup()`, AAA layout - and change only what the module under test needs. When a golden file and a neighbouring test disagree, the golden file wins; older tests are migrated to the golden shape as they get touched.

## Golden files

| Module kind | Golden file |
|---|---|
| backend router (HTTP) | `backend/tests/router.test.ts` |
| backend repository (Prisma) | `backend/tests/repository.test.ts` |
| backend pure module (validation, mapping) | `backend/tests/validators.test.ts` |
| frontend component | `frontend/src/features/todos/components/TodoForm.test.tsx` |
| frontend component that uses hooks | `frontend/src/features/todos/components/DeleteTodoDialog.test.tsx` |
| frontend React Query hook | `frontend/src/features/todos/hooks/useCreateTodoMutation.test.tsx` |
| frontend api module / pure util | `frontend/src/features/todos/api/todos.test.ts` |

Shared helpers - use them, never re-create them inline:

- `backend/tests/fixture.ts`: `record` (DB row), `todo` (JSON shape), `testDatabase()` (real Prisma client, mock IO with `vi.spyOn`).
- `frontend/src/test/todoFixture.ts`: `todoFixture`.
- `frontend/src/test/queryClient.tsx`: `createQueryWrapper()` for React Query hooks.
- `frontend/src/test/setup.ts` mocks the design system globally, so component tests never mock it themselves.

Package-specific traps the code does not show: [references/backend.md](references/backend.md), [references/frontend.md](references/frontend.md). Read the one for the package you are in.

## Workflow

1. **Read the source** and list its observable behaviors: return values, HTTP responses, rendered text, calls at the boundary, thrown errors. Each branch and error path is a behavior.
2. **Find the test file.** Backend: `backend/tests/<name>.test.ts`. Frontend: next to the source, `.test.tsx` for components and anything with JSX, `.test.ts` otherwise. If it exists, extend it.
3. **Open the golden file** for this kind of module, the shared helpers above, and the quality rules in [../gate-unit-tests/checklist.md](../gate-unit-tests/checklist.md). The gate skill owns "what counts as a good test" so the writer and the PR review judge by the same rules.
4. **Write one `it` per behavior**, named as the behavior ("rejects a whitespace-only title without submitting"). Put repeated arrange code in a local `setup()`. If a helper you need already exists inline in another test file, or every test of this kind would need it, move it to `frontend/src/test/` or `backend/tests/` and import it from both - copies drift, and one CI run writes many test files at once.
5. **Run that file, then typecheck the package:**
   ```bash
   env -u ANTHROPIC_API_KEY -u GITHUB_TOKEN npm --prefix backend run test -- tests/health.test.ts
   npm --prefix backend run typecheck
   env -u ANTHROPIC_API_KEY -u GITHUB_TOKEN npm --prefix frontend run test -- src/lib/http.test.ts
   npm --prefix frontend run typecheck
   ```
   Paths after `--` are relative to the package. `npm --prefix` avoids `cd`, which matters because the repo has no root `package.json` and CI runs under a command allowlist that accepts test runs only in this exact form; `env -u` keeps the CI secrets out of test code the PR author controls. A type error counts as red.
6. **If red, fix the test, up to 3 attempts.** If the failure shows the source is wrong (not your assumption), stop and report a bug.
7. **Check each new test against the checklist** before you report, above all "name one wrong version of the code". Fixing a weak test now is cheaper than a review finding and a second iteration.
8. **Report briefly, in English** even when the user wrote in another language - the report ends up in PR comments and the repo, which are English: file, number of cases, behaviors covered, shared helpers added or moved, what you skipped and why.

## Arrange-Act-Assert

Every test has three blocks separated by one blank line, with no `// Arrange` comments:

```tsx
it('submits trimmed values and the selected priority', async () => {
  const { user, onSubmit } = setup()

  await user.type(screen.getByLabelText(/Task title/), '  Prepare a demo  ')
  await user.click(screen.getByRole('button', { name: 'Save task' }))

  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Prepare a demo' }))
})
```

- **One Act per test.** One call, one request, or one user flow (type then click). If you want to assert, act again, and assert again, that is two tests.
- **A boundary is two cases, not two calls in one test.** "120 passes, 121 fails" becomes two rows of `it.each` (or two tests), so a failure names the side that broke. The same goes for one test that checks two unrelated inputs ("accepts a leap day and an empty date").
- **No assertions in Arrange or Act.** Store the result (`const response = await request(app)...`) and assert on it below.
- **Rendering is the Act** when the behavior is "what is shown": `setup()` that renders, then a blank line, then the assertions.
- **Act folds into Assert** only when the assertion needs the call itself: `expect(() => parse({})).toThrow(...)`, `await expect(promise).rejects...`, or a one-line `it.each` check like `expect(schema.safeParse(input).success).toBe(false)`.
- `waitFor(...)` belongs to Assert.

## Boundaries

- **Change only test files:** `backend/tests/**`, `frontend/src/**/*.test.ts(x)`, `frontend/src/test/**`. If a test seems to need a production change, that is a finding. In CI a guard reverts any other file anyway, and a silent "fix" hides the bug from the reviewer.
- **Never weaken or delete an existing assertion to get green.**
- **Bug found:** report `expected` vs `actual` with the failing test as a snippet. Do not leave your own red test in the tree.
- **Which files need tests** is decided by [gate-unit-tests](../gate-unit-tests/SKILL.md), not here.
