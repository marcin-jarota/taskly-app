import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isTestPath } from './test-paths.mjs'

test('isTestPath matches the test patterns from the SDD', () => {
  const cases = {
    'backend/tests/router.test.ts': true,
    'backend/tests/fixture.ts': true,
    'frontend/src/lib/http.test.ts': true,
    'frontend/src/features/todos/components/TodoList.test.tsx': true,
    'frontend/src/test/setup.ts': true,
    'backend/src/features/todos/router.ts': false,
    'frontend/src/lib/http.ts': false,
    'frontend/src/lib/http.test.ts.bak': false,
    'frontend/tests/http.test.ts': false,
    'x/backend/tests/a.ts': false,
  }

  const actual = Object.fromEntries(Object.keys(cases).map((path) => [path, isTestPath(path)]))

  assert.deepEqual(actual, cases)
})

test('the CLI prints only test paths from stdin', () => {
  const input = 'backend/src/factory.ts\nbackend/tests/health.test.ts\nfrontend/src/test/setup.ts\n'

  const output = execFileSync('node', [fileURLToPath(new URL('./test-paths.mjs', import.meta.url))], { input, encoding: 'utf8' })

  assert.equal(output, 'backend/tests/health.test.ts\nfrontend/src/test/setup.ts\n')
})
