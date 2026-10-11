# Taskly

Todo app in two npm packages: `backend/` (Express 5 + Prisma + PostgreSQL) and `frontend/` (React + Vite + React Query). There is no root `package.json`, so run scripts from the repo root as `npm --prefix <package> run <script>`. Both packages have `test`, `test:coverage`, `typecheck`, `lint`, `format`.

A PostToolUse hook (`.claude/hooks/post-edit.sh`) formats every file you edit and reports lint and type errors back to you.

Tests: skill `write-unit-tests` (how to write one here), skill `gate-unit-tests` (which files need tests, what counts as a good test).
