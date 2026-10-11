# Backend traps (Express 5 + Prisma 7, Vitest node env)

The patterns are in the golden files listed in SKILL.md. This file holds only what the code does not show.

- **Imports use the `.ts` extension** (`../src/features/todos/router.ts`) and `it, expect, vi` come from `vitest` explicitly - there are no globals.
- **100% threshold** on `src/features/todos/validators.ts` and `mappers.ts` (`vitest.config.ts`). A change there needs every branch covered, or `test:coverage` fails.
- **Anything that takes a `Database`** (health router, `createApp`): use `testDatabase()` from `fixture.ts` and `vi.spyOn(database.todo, 'findFirst')`. Restore with `afterEach(() => vi.restoreAllMocks())`.
- **`createApp(database)`** is tested through supertest. Unknown route → 404 `{ detail: 'Not Found' }`, malformed JSON → 422, body over 100kb → 413, thrown error → 500. The 500 path calls `console.error`: silence it with `vi.spyOn(console, 'error').mockImplementation(() => {})`.
- **Express 5 forwards rejected promises** from async handlers to the error handler, so a failing DB call on `/api/health` becomes the JSON 500 from `createApp`'s handler. Mounted alone, the router falls back to Express's default HTML 500 - assert the status only.
- **`core/config.ts` runs `dotenv.config()` at import**, reading the repo-root `.env`, so a developer's local `DATABASE_URL` leaks into tests. Control env with `vi.stubEnv` and `afterEach(() => vi.unstubAllEnvs())`. `vi.stubEnv('DATABASE_URL', '')` is falsy, so the code falls through to the `POSTGRES_*` path. Prefer the `override` argument when it covers the behavior.
- **Prisma call arguments are part of the contract** (ordering, `where`, `data`): assert them, as the repository golden does.
