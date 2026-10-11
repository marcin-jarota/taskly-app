import { useMutation } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { createQueryWrapper } from '../../../test/queryClient'
import { todoKeys } from '../api/queryKeys'
import { useTodosBusy } from './useTodosBusy'

function setup(mutationKey: readonly unknown[] = todoKeys.update) {
  let finish = () => {}
  const { wrapper } = createQueryWrapper()
  const { result } = renderHook(
    () => ({
      busy: useTodosBusy(),
      mutation: useMutation({
        mutationKey,
        mutationFn: () => new Promise<void>((resolve) => (finish = resolve)),
      }),
    }),
    { wrapper },
  )
  return { result, finish: () => finish() }
}

it('is not busy when no mutation runs', () => {
  const { result } = setup()

  expect(result.current.busy).toBe(false)
})

it.each([
  { name: 'create', key: todoKeys.create },
  { name: 'update', key: todoKeys.update },
  { name: 'delete', key: todoKeys.delete },
])('is busy while a $name mutation is pending', async ({ key }) => {
  const { result } = setup(key)

  act(() => result.current.mutation.mutate())

  await waitFor(() => expect(result.current.busy).toBe(true))
})

it('ignores mutations outside the todos feature', async () => {
  const { result } = setup(['notes', 'create'])

  act(() => result.current.mutation.mutate())

  await waitFor(() => expect(result.current.mutation.isPending).toBe(true))
  expect(result.current.busy).toBe(false)
})

it('is no longer busy once the mutation settles', async () => {
  const { result, finish } = setup()
  act(() => result.current.mutation.mutate())
  await waitFor(() => expect(result.current.busy).toBe(true))

  act(finish)

  await waitFor(() => expect(result.current.busy).toBe(false))
})
