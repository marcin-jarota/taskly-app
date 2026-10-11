import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createQueryWrapper } from '../../../test/queryClient'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Todo } from '../types'
import { useDeleteCompletedMutation } from './useDeleteCompletedMutation'

vi.mock('../api/todos', () => ({
  todosApi: {
    list: vi.fn(),
    removeCompleted: vi.fn(),
  },
}))
beforeEach(() => vi.clearAllMocks())

const active: Todo = { ...todoFixture, id: 9, completed: false }
const done: Todo = { ...todoFixture, id: 10, completed: true }

function setup(cached?: Todo[]) {
  const { queryClient, wrapper } = createQueryWrapper()
  if (cached) queryClient.setQueryData(todoKeys.list, cached)
  const { result } = renderHook(() => useDeleteCompletedMutation(), {
    wrapper,
  })
  return { queryClient, result }
}

it('returns the API result', async () => {
  vi.mocked(todosApi.removeCompleted).mockResolvedValue({ deleted: 1 })
  const { result } = setup()

  const outcome = await act(() => result.current.mutateAsync())

  expect(outcome).toEqual({ deleted: 1 })
})

it.each([
  { case: 'an empty cache', cached: undefined, expected: undefined },
  { case: 'a cached list', cached: [active, done], expected: [active] },
])('removes only completed tasks from $case', async ({ cached, expected }) => {
  vi.mocked(todosApi.removeCompleted).mockResolvedValue({ deleted: 1 })
  const { queryClient, result } = setup(cached)

  await act(() => result.current.mutateAsync())

  expect(queryClient.getQueryData(todoKeys.list)).toEqual(expected)
})

it('does not let an older list refetch bring completed tasks back', async () => {
  let resolveList: (todos: Todo[]) => void = () => {}
  vi.mocked(todosApi.list).mockReturnValue(
    new Promise((resolve) => (resolveList = resolve)),
  )
  vi.mocked(todosApi.removeCompleted).mockResolvedValue({ deleted: 1 })
  const { queryClient, result } = setup([active, done])
  void queryClient
    .fetchQuery({ queryKey: todoKeys.list, queryFn: () => todosApi.list() })
    .catch(() => {})

  await act(() => result.current.mutateAsync())
  resolveList([active, done])

  await waitFor(() =>
    expect(queryClient.getQueryState(todoKeys.list)?.fetchStatus).toBe('idle'),
  )
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([active])
})

it('keeps the cache and exposes the error when the API fails', async () => {
  const error = new Error('Server down')
  vi.mocked(todosApi.removeCompleted).mockRejectedValue(error)
  const { queryClient, result } = setup([active, done])

  await act(() => result.current.mutateAsync().catch(() => {}))

  await waitFor(() => expect(result.current.error).toBe(error))
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([active, done])
})
