import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'

export const TEST_PATTERNS = [
  /^backend\/tests\//,
  /^frontend\/src\/.*\.test\.tsx?$/,
  /^frontend\/src\/test\//,
]

export const isTestPath = (path) => TEST_PATTERNS.some((pattern) => pattern.test(path))

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const paths = readFileSync(0, 'utf8').split('\n').filter(Boolean)
  for (const path of paths.filter(isTestPath)) console.log(path)
}
