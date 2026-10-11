import { afterEach, it, expect, vi } from 'vitest'
import { resolveDatabaseUrl } from '../src/core/config.ts'

afterEach(() => vi.unstubAllEnvs())

const parts = {
  DATABASE_URL: '',
  POSTGRES_USER: 'taskly',
  POSTGRES_PASSWORD: 'p@ss word',
  POSTGRES_HOST: 'db.internal',
  DB_PORT: '5433',
  POSTGRES_DB: 'taskly dev',
}

function setup(overrides: Partial<typeof parts> = {}) {
  for (const [name, value] of Object.entries({ ...parts, ...overrides }))
    vi.stubEnv(name, value)
}

it('prefers the override over DATABASE_URL', () => {
  setup({ DATABASE_URL: 'postgresql://env@localhost/env' })

  const url = resolveDatabaseUrl('postgresql://arg@localhost/arg')

  expect(url).toBe('postgresql://arg@localhost/arg')
})

it('prefers DATABASE_URL over the POSTGRES_* parts', () => {
  setup({ DATABASE_URL: 'postgresql://env@localhost/env' })

  const url = resolveDatabaseUrl()

  expect(url).toBe('postgresql://env@localhost/env')
})

it.each([
  ['postgresql+psycopg://u:p@h:5432/d', 'postgresql://u:p@h:5432/d'],
  ['postgresql://u:p@h:5432/d', 'postgresql://u:p@h:5432/d'],
])('rewrites the SQLAlchemy scheme only: %s', (input, expected) => {
  expect(resolveDatabaseUrl(input)).toBe(expected)
})

it('builds the URL from POSTGRES_* parts with escaped credentials', () => {
  setup()

  const url = resolveDatabaseUrl()

  expect(url).toBe(
    'postgresql://taskly:p%40ss%20word@db.internal:5433/taskly%20dev',
  )
})

it.each([
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_HOST',
  'DB_PORT',
  'POSTGRES_DB',
])('names the missing variable %s', (name) => {
  setup({ [name]: '' })

  expect(() => resolveDatabaseUrl()).toThrow(
    `Missing environment variable: ${name}`,
  )
})
