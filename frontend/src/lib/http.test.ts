import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../test/todoFixture'
import { request } from './http'

beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => vi.unstubAllGlobals())

function respond(status: number, body?: unknown) {
  vi.mocked(fetch).mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  )
}

it('calls the API under /api with JSON and caller headers and returns the parsed body', async () => {
  respond(200, todoFixture)

  const todo = await request('/todos/1', {
    method: 'PATCH',
    headers: { 'X-Request-Id': 'abc' },
  })

  expect(todo).toEqual(todoFixture)
  expect(fetch).toHaveBeenCalledWith('/api/todos/1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'abc' },
  })
})

it('returns undefined for 204 No Content', async () => {
  respond(204)

  const result = await request('/todos/1', { method: 'DELETE' })

  expect(result).toBeUndefined()
})

it('explains the field limits on 422 instead of the server detail', async () => {
  respond(422, { detail: [{ msg: 'title too long' }] })

  await expect(request('/todos')).rejects.toThrow(
    'Check the task details: title up to 120 characters, description up to 2000 characters, and a valid due date.',
  )
})

it('shows the server detail for other errors', async () => {
  respond(409, { detail: 'Task was changed by someone else.' })

  await expect(request('/todos/1')).rejects.toThrow(
    'Task was changed by someone else.',
  )
})

it.each([
  ['a non-string detail', { detail: { code: 'x' } }],
  ['no body', undefined],
])('falls back to a generic message for %s', async (_, body) => {
  respond(500, body)

  await expect(request('/todos')).rejects.toThrow(
    'The operation failed. Please try again.',
  )
})

it('reports a connection problem when fetch fails on a live request', async () => {
  const signal = new AbortController().signal
  vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))

  await expect(request('/todos', { signal })).rejects.toThrow(
    'Cannot connect to the server. Please try again.',
  )
})

it('rethrows the abort error when the caller cancelled the request', async () => {
  const controller = new AbortController()
  controller.abort()
  const abortError = new DOMException('Aborted', 'AbortError')
  vi.mocked(fetch).mockRejectedValue(abortError)

  await expect(request('/todos', { signal: controller.signal })).rejects.toBe(
    abortError,
  )
})
