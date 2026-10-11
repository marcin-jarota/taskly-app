# Frontend traps (React 19, Vitest jsdom, Testing Library)

The patterns are in the golden files listed in SKILL.md. This file holds only what the code does not show.

- **Design system is mocked globally** in `src/test/setup.ts`. Do not add `vi.mock('.../design-system', ...)` to a test. The mocks render plain HTML:
  - `Alert` → `<div data-testid="alert">`, the only place `getByTestId` is fine.
  - `Input` / `Select` → `<label>{label}<input/></label>`, query with `getByLabelText`.
  - `Drawer` → `role="dialog"` with `aria-label={title}` and a "Close" button, rendered only when `isOpen`.
  - To assert props passed to a design-system component, import it from `design-system` and use `vi.mocked(Alert)`.
- **`vi.mock` is hoisted** above imports. Factories cannot use variables from the test file; build mocks with `vi.fn()` inside the factory and configure them with `vi.mocked(...)` in `setup()`.
- **Query priority:** `getByRole` with `name` → `getByLabelText` → `getByText`. Use `queryBy*` with `not.toBeInTheDocument()` for absence, `toBeVisible()` for presence.
- **Hook return values are cast through `unknown`** (`as unknown as ReturnType<typeof useX>`) because only the fields the component reads are provided.
- **React Query hooks:** mock `api/todos` (methods `list`, `create`, `update`, `remove`), never `fetch`. Every test gets its own client from `createQueryWrapper()`, so cache never leaks.
- **`lib/http.ts` is the only code that calls `fetch`.** Its test stubs `fetch` with `vi.stubGlobal` and restores it with `afterEach(() => vi.unstubAllGlobals())`; fetch helpers stay local to that file.
- **Local vs UTC dates** (`isOverdue` and similar): the result depends on the machine's time zone, and CI may run in UTC where both are the same. Do not write a test that claims to check this; say in the report that it is not covered.
- **`new Response(null, { status: 204 })`** is valid in jsdom; a body with status 204 throws.
- **Style:** Prettier (no semicolons, single quotes, trailing commas, 80 columns). Check with `npm --prefix frontend run format:check`.
