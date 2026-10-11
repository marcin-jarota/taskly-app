import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createQueryWrapper } from '../../../test/queryClient'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Todo } from '../types'
import { useUpdateTodoMutation } from './useUpdateTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))
beforeEach(() => vi.clearAllMocks())

const changes = { completed: true }
const saved: Todo = { ...todoFixture, completed: true }
const other: Todo = { ...todoFixture, id: 9, title: 'Call Anna' }

function setup(cached?: Todo[]) {
  const { queryClient, wrapper } = createQueryWrapper()
  if (cached) queryClient.setQueryData(todoKeys.list, cached)
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  return { queryClient, result }
}

it('sends the id and changes to the API and resolves with the saved task', async () => {
  vi.mocked(todosApi.update).mockResolvedValue(saved)
  const { result } = setup()

  const returned = await act(() =>
    result.current.mutateAsync({ id: saved.id, input: changes }),
  )

  expect(returned).toEqual(saved)
  expect(todosApi.update).toHaveBeenCalledWith(saved.id, changes)
})

it.each([
  { case: 'an empty cache', cached: undefined, expected: undefined },
  {
    case: 'a cached list',
    cached: [other, todoFixture],
    expected: [other, saved],
  },
  { case: 'a list without the task', cached: [other], expected: [other] },
])('replaces only the saved task in $case', async ({ cached, expected }) => {
  vi.mocked(todosApi.update).mockResolvedValue(saved)
  const { queryClient, result } = setup(cached)

  await act(() => result.current.mutateAsync({ id: saved.id, input: changes }))

  expect(queryClient.getQueryData(todoKeys.list)).toEqual(expected)
})

it('does not let an older list refetch overwrite the saved task', async () => {
  let resolveList: (todos: Todo[]) => void = () => {}
  vi.mocked(todosApi.list).mockReturnValue(
    new Promise((resolve) => (resolveList = resolve)),
  )
  vi.mocked(todosApi.update).mockResolvedValue(saved)
  const { queryClient, result } = setup([todoFixture])
  void queryClient
    .fetchQuery({ queryKey: todoKeys.list, queryFn: () => todosApi.list() })
    .catch(() => {})

  await act(() => result.current.mutateAsync({ id: saved.id, input: changes }))
  resolveList([todoFixture])

  await waitFor(() =>
    expect(queryClient.getQueryState(todoKeys.list)?.fetchStatus).toBe('idle'),
  )
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([saved])
})

it('keeps the cache and exposes the error when the API fails', async () => {
  const error = new Error('Server down')
  vi.mocked(todosApi.update).mockRejectedValue(error)
  const { queryClient, result } = setup([todoFixture])

  await act(() =>
    result.current
      .mutateAsync({ id: saved.id, input: changes })
      .catch(() => {}),
  )

  await waitFor(() => expect(result.current.error).toBe(error))
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([todoFixture])
})
