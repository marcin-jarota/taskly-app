import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createQueryWrapper } from '../../../test/queryClient'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Todo, TodoInput } from '../types'
import { useCreateTodoMutation } from './useCreateTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))
beforeEach(() => vi.clearAllMocks())

const input: TodoInput = {
  title: 'Write tests',
  description: '',
  priority: 'high',
  due_date: null,
  completed: false,
}
const saved: Todo = { ...todoFixture, ...input, id: 8 }

function setup(cached?: Todo[]) {
  const { queryClient, wrapper } = createQueryWrapper()
  if (cached) queryClient.setQueryData(todoKeys.list, cached)
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  return { queryClient, result }
}

it('sends the input to the API and resolves with the saved task', async () => {
  vi.mocked(todosApi.create).mockResolvedValue(saved)
  const { result } = setup()

  const returned = await act(() => result.current.mutateAsync(input))

  expect(returned).toEqual(saved)
  expect(todosApi.create).toHaveBeenCalledWith(input)
})

it.each([
  { case: 'an empty cache', cached: undefined, expected: [saved] },
  {
    case: 'a cached list',
    cached: [todoFixture],
    expected: [saved, todoFixture],
  },
  {
    case: 'a stale copy of the same task',
    cached: [todoFixture, { ...saved, title: 'Old title' }],
    expected: [saved, todoFixture],
  },
])('puts the saved task first in $case', async ({ cached, expected }) => {
  vi.mocked(todosApi.create).mockResolvedValue(saved)
  const { queryClient, result } = setup(cached)

  await act(() => result.current.mutateAsync(input))

  expect(queryClient.getQueryData(todoKeys.list)).toEqual(expected)
})

it('does not let an older list refetch overwrite the saved task', async () => {
  let resolveList: (todos: Todo[]) => void = () => {}
  vi.mocked(todosApi.list).mockReturnValue(
    new Promise((resolve) => (resolveList = resolve)),
  )
  vi.mocked(todosApi.create).mockResolvedValue(saved)
  const { queryClient, result } = setup([todoFixture])
  void queryClient
    .fetchQuery({ queryKey: todoKeys.list, queryFn: () => todosApi.list() })
    .catch(() => {})

  await act(() => result.current.mutateAsync(input))
  resolveList([todoFixture])

  await waitFor(() =>
    expect(queryClient.getQueryState(todoKeys.list)?.fetchStatus).toBe('idle'),
  )
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([saved, todoFixture])
})

it('keeps the cache and exposes the error when the API fails', async () => {
  const error = new Error('Server down')
  vi.mocked(todosApi.create).mockRejectedValue(error)
  const { queryClient, result } = setup([todoFixture])

  await act(() => result.current.mutateAsync(input).catch(() => {}))

  await waitFor(() => expect(result.current.error).toBe(error))
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([todoFixture])
})
