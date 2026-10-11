import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '../../../lib/http'
import { todoFixture } from '../../../test/todoFixture'
import { todosApi } from './todos'

vi.mock('../../../lib/http', () => ({ request: vi.fn() }))
beforeEach(() => vi.clearAllMocks())

it('passes the abort signal when fetching tasks', async () => {
  const signal = new AbortController().signal
  vi.mocked(request).mockResolvedValue([todoFixture])

  const todos = await todosApi.list(signal)

  expect(todos).toEqual([todoFixture])
  expect(request).toHaveBeenCalledWith('/todos', { signal })
})

it('sends only writable task fields on creation', async () => {
  vi.mocked(request).mockResolvedValue(todoFixture)

  const created = await todosApi.create(todoFixture)

  expect(created).toEqual(todoFixture)
  expect(request).toHaveBeenCalledWith('/todos', {
    method: 'POST',
    body: JSON.stringify({
      title: todoFixture.title,
      description: '',
      priority: 'medium',
      due_date: null,
      completed: false,
    }),
  })
})

it.each([
  {
    case: 'only the changed fields',
    changes: { completed: true },
    body: { completed: true },
  },
  {
    case: 'only writable fields of a full task',
    changes: todoFixture,
    body: {
      title: todoFixture.title,
      description: '',
      priority: 'medium',
      due_date: null,
      completed: false,
    },
  },
])('sends $case when updating a task', async ({ changes, body }) => {
  vi.mocked(request).mockResolvedValue(todoFixture)

  const updated = await todosApi.update(7, changes)

  expect(updated).toEqual(todoFixture)
  expect(request).toHaveBeenCalledWith('/todos/7', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
})

it('deletes completed tasks and returns the count', async () => {
  vi.mocked(request).mockResolvedValue({ deleted: 2 })

  const result = await todosApi.removeCompleted()

  expect(result).toEqual({ deleted: 2 })
  expect(request).toHaveBeenCalledWith('/todos/completed', {
    method: 'DELETE',
  })
})

it('deletes a task by id', async () => {
  vi.mocked(request).mockResolvedValue(undefined)

  await todosApi.remove(7)

  expect(request).toHaveBeenCalledWith('/todos/7', { method: 'DELETE' })
})
