import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./mutate.mjs', import.meta.url))
// The outer `node --test` sets NODE_TEST_CONTEXT, which makes the fixture's own `node --test` report to it instead of exiting red.
const { NODE_TEST_CONTEXT, ...env } = process.env
const SOURCE = 'export const isAdult = (age) => age >= 18\nexport const label = (age) => (isAdult(age) ? "adult" : "child")\n'

function setup() {
  const repo = mkdtempSync(join(tmpdir(), 'mutate-'))
  const write = (path, content) => {
    mkdirSync(join(repo, dirname(path)), { recursive: true })
    writeFileSync(join(repo, path), content)
  }
  write('backend/package.json', JSON.stringify({ type: 'module', scripts: { test: 'node --test' } }))
  write('backend/src/age.mjs', SOURCE)
  write('backend/tests/age.test.mjs', [
    "import { test } from 'node:test'",
    "import assert from 'node:assert/strict'",
    "import { isAdult } from '../src/age.mjs'",
    "test('adult', () => assert.equal(isAdult(30), true))",
    "test('child', () => assert.equal(isAdult(5), false))",
  ].join('\n'))
  write('backend/tests/slow.test.mjs', "import { isAdult } from '../src/age.mjs'\nif (!isAdult(50)) await new Promise((done) => setTimeout(done, 10000))\n")
  const source = () => readFileSync(join(repo, 'backend/src/age.mjs'), 'utf8')
  const run = (mutants) => {
    try {
      return { status: 0, output: JSON.parse(execFileSync('node', [script], { cwd: repo, env, input: JSON.stringify(mutants), encoding: 'utf8', stdio: 'pipe' })) }
    } catch (error) {
      return { status: error.status, output: error.stderr }
    }
  }
  return { repo, run, source }
}

const mutant = (find, replace, test = 'backend/tests/age.test.mjs') => ({ file: 'backend/src/age.mjs', find, replace, test })

test('a mutant the tests catch is killed and the source is restored after the red run', () => {
  const { run, source } = setup()

  const { output } = run([mutant('age >= 18', 'age < 18')])

  assert.deepEqual(output, [{ file: 'backend/src/age.mjs', line: 1, find: 'age >= 18', replace: 'age < 18', test: 'backend/tests/age.test.mjs', result: 'killed' }])
  assert.equal(source(), SOURCE)
})

test('a mutant on an untested boundary survives', () => {
  const { run } = setup()

  const { output } = run([mutant('age >= 18', 'age > 18')])

  assert.equal(output[0].result, 'survived')
})

test('a mutant that crashes the module on import is killed and the source is restored', () => {
  const { run, source } = setup()

  const { output } = run([mutant('export const isAdult', 'throw new Error("boom"); export const isAdult')])

  assert.equal(output[0].result, 'killed')
  assert.equal(source(), SOURCE)
})

test('the source is restored when the run is terminated mid-test', async () => {
  const { repo, source } = setup()
  const child = spawn('node', [script], { cwd: repo, env, stdio: ['pipe', 'ignore', 'ignore'] })
  child.stdin.end(JSON.stringify([mutant('age >= 18', 'age > 99', 'backend/tests/slow.test.mjs')]))
  const exited = new Promise((done) => child.on('exit', done))
  while (!source().includes('age > 99')) await sleep(50)

  child.kill('SIGTERM')
  await exited

  assert.equal(source(), SOURCE)
})

test('a red test file before mutation gives no verdict', () => {
  const { repo, run } = setup()
  writeFileSync(join(repo, 'backend/tests/age.test.mjs'), "import { test } from 'node:test'\ntest('red', () => { throw new Error('red') })\n")

  const { output } = run([mutant('age >= 18', 'age > 18')])

  assert.equal(output[0].result, 'test-red-before-mutation')
})

test('rejects a test-file target and a find that does not occur exactly once, without touching files', () => {
  const { run, source } = setup()

  const { status, output } = run([
    { file: 'backend/tests/age.test.mjs', find: 'adult', replace: 'x', test: 'backend/tests/age.test.mjs' },
    mutant('age', 'x'),
    mutant('missing', 'x'),
  ])

  assert.equal(status, 2)
  assert.match(output, /mutant 0: .* is a test file/)
  assert.match(output, /mutant 1: find occurs 4 times/)
  assert.match(output, /mutant 2: find occurs 0 times/)
  assert.equal(source(), SOURCE)
})
