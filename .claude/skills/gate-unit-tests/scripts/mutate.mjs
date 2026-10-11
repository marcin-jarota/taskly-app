import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isTestPath } from './test-paths.mjs'

const PACKAGES = ['backend', 'frontend']
const MAX_MUTANTS = 10

let applied = null
let running = null
const restore = () => {
  if (applied) writeFileSync(applied.path, applied.source)
  applied = null
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    if (running) process.kill(-running.pid, 'SIGKILL')
    restore()
    process.exit(1)
  })
}

const repoPath = (path) => relative(process.cwd(), resolve(path)).split('\\').join('/')
const packageOf = (path) => PACKAGES.find((pkg) => path.startsWith(`${pkg}/`))

export function validate(mutants) {
  if (!Array.isArray(mutants) || mutants.length === 0) return ['expected a non-empty JSON array of {file, find, replace, test}']
  if (mutants.length > MAX_MUTANTS) return [`at most ${MAX_MUTANTS} mutants per run, got ${mutants.length}`]
  return mutants.flatMap(({ file, find, replace, test }, i) => {
    const at = `mutant ${i}`
    if (![file, find, replace, test].every((value) => typeof value === 'string')) return [`${at}: file, find, replace and test must be strings`]
    const path = repoPath(file)
    const testPath = repoPath(test)
    const errors = []
    if (path.startsWith('..') || isAbsolute(path) || !packageOf(path)) errors.push(`${at}: ${file} is not inside backend/ or frontend/`)
    if (isTestPath(path)) errors.push(`${at}: ${file} is a test file, mutate source only`)
    if (!isTestPath(testPath) || packageOf(testPath) !== packageOf(path)) errors.push(`${at}: ${test} is not a test file in the same package`)
    if (find.includes('\n')) errors.push(`${at}: find must be a single line`)
    if (errors.length) return errors
    let source
    try {
      source = readFileSync(path, 'utf8')
    } catch {
      return [`${at}: cannot read ${file}`]
    }
    const count = source.split(find).length - 1
    if (count !== 1) errors.push(`${at}: find occurs ${count} times in ${file}, it must occur exactly once`)
    return errors
  })
}

function runTest(test) {
  const pkg = packageOf(test)
  const env = { ...process.env }
  delete env.ANTHROPIC_API_KEY
  delete env.GITHUB_TOKEN
  return new Promise((done) => {
    running = spawn('npm', ['--prefix', pkg, 'run', 'test', '--', test.slice(pkg.length + 1)], { env, stdio: 'ignore', detached: true })
    running.on('error', () => done(false))
    running.on('close', (code) => done(code === 0))
  })
}

export async function mutate(mutants) {
  const results = []
  const green = new Map()
  for (const mutant of mutants) {
    const path = repoPath(mutant.file)
    const test = repoPath(mutant.test)
    if (!green.has(test)) green.set(test, await runTest(test))
    const source = readFileSync(path, 'utf8')
    const line = source.slice(0, source.indexOf(mutant.find)).split('\n').length
    const result = { file: path, line, find: mutant.find, replace: mutant.replace, test }
    if (!green.get(test)) {
      results.push({ ...result, result: 'test-red-before-mutation' })
      continue
    }
    applied = { path, source }
    try {
      writeFileSync(path, source.replace(mutant.find, () => mutant.replace))
      results.push({ ...result, result: (await runTest(test)) ? 'survived' : 'killed' })
    } finally {
      restore()
    }
  }
  return results
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input] = process.argv.slice(2)
  let mutants
  try {
    mutants = JSON.parse(readFileSync(input ?? 0, 'utf8'))
  } catch (error) {
    console.error(`usage: mutate.mjs <mutants.json>  (${error.message})`)
    process.exit(2)
  }
  const errors = validate(mutants)
  if (errors.length) {
    console.error(errors.join('\n'))
    process.exit(2)
  }
  console.log(JSON.stringify(await mutate(mutants), null, 2))
}
