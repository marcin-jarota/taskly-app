import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createQueryWrapper } from '../../../test/queryClient'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useTodosQuery } from './useTodosQuery'

vi.mock('../api/todos', () => ({
  todosApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))
beforeEach(() => vi.clearAllMocks())

function setup() {
  const { queryClient, wrapper } = createQueryWrapper()
  const { result } = renderHook(() => useTodosQuery(), { wrapper })
  return { queryClient, result }
}

it('loads the tasks into the list cache the mutations update', async () => {
  vi.mocked(todosApi.list).mockResolvedValue([todoFixture])

  const { queryClient, result } = setup()

  await waitFor(() => expect(result.current.data).toEqual([todoFixture]))
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([todoFixture])
})

it('aborts the request when the query is cancelled', async () => {
  let signal: AbortSignal | undefined
  vi.mocked(todosApi.list).mockImplementation((querySignal) => {
    signal = querySignal
    return new Promise(() => {})
  })
  const { queryClient } = setup()
  await waitFor(() => expect(signal).toBeDefined())

  await act(() => queryClient.cancelQueries({ queryKey: todoKeys.list }))

  expect(signal?.aborted).toBe(true)
})

it('exposes the error when loading fails', async () => {
  const error = new Error('Server down')
  vi.mocked(todosApi.list).mockRejectedValue(error)

  const { result } = setup()

  await waitFor(() => expect(result.current.error).toBe(error))
})
