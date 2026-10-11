import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createQueryWrapper } from '../../../test/queryClient'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Todo } from '../types'
import { useDeleteTodoMutation } from './useDeleteTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))
beforeEach(() => vi.clearAllMocks())

const other: Todo = { ...todoFixture, id: 9, title: 'Call Anna' }

function setup(cached?: Todo[]) {
  const { queryClient, wrapper } = createQueryWrapper()
  if (cached) queryClient.setQueryData(todoKeys.list, cached)
  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })
  return { queryClient, result }
}

it('sends the task id to the API', async () => {
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { result } = setup()

  await act(() => result.current.mutateAsync(todoFixture.id))

  expect(todosApi.remove).toHaveBeenCalledWith(todoFixture.id)
})

it.each([
  { case: 'an empty cache', cached: undefined, expected: undefined },
  {
    case: 'a cached list',
    cached: [other, todoFixture],
    expected: [other],
  },
])('removes only the deleted task from $case', async ({ cached, expected }) => {
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { queryClient, result } = setup(cached)

  await act(() => result.current.mutateAsync(todoFixture.id))

  expect(queryClient.getQueryData(todoKeys.list)).toEqual(expected)
})

it('does not let an older list refetch bring the deleted task back', async () => {
  let resolveList: (todos: Todo[]) => void = () => {}
  vi.mocked(todosApi.list).mockReturnValue(
    new Promise((resolve) => (resolveList = resolve)),
  )
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { queryClient, result } = setup([other, todoFixture])
  void queryClient
    .fetchQuery({ queryKey: todoKeys.list, queryFn: () => todosApi.list() })
    .catch(() => {})

  await act(() => result.current.mutateAsync(todoFixture.id))
  resolveList([other, todoFixture])

  await waitFor(() =>
    expect(queryClient.getQueryState(todoKeys.list)?.fetchStatus).toBe('idle'),
  )
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([other])
})

it('keeps the cache and exposes the error when the API fails', async () => {
  const error = new Error('Server down')
  vi.mocked(todosApi.remove).mockRejectedValue(error)
  const { queryClient, result } = setup([todoFixture])

  await act(() => result.current.mutateAsync(todoFixture.id).catch(() => {}))

  await waitFor(() => expect(result.current.error).toBe(error))
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([todoFixture])
})
