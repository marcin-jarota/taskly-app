import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { useDeleteTodoMutation } from '../hooks/useDeleteTodoMutation'
import { DeleteTodoDialog } from './DeleteTodoDialog'

vi.mock('../hooks/useDeleteTodoMutation', () => ({
  useDeleteTodoMutation: vi.fn(),
}))

type Mutation = ReturnType<typeof useDeleteTodoMutation>

function setup(mutation: Partial<Mutation> = {}) {
  const user = userEvent.setup()
  const mutateAsync = vi.fn().mockResolvedValue(undefined)
  vi.mocked(useDeleteTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync,
    ...mutation,
  } as unknown as Mutation)
  const onClose = vi.fn()
  const onDeleted = vi.fn()
  render(
    <DeleteTodoDialog
      todo={todoFixture}
      busy={false}
      onClose={onClose}
      onDeleted={onDeleted}
    />,
  )
  return { user, mutateAsync, onClose, onDeleted }
}

it('asks to confirm deleting the named task', () => {
  setup()

  expect(screen.getByRole('dialog', { name: 'Delete task?' })).toBeVisible()
  expect(
    screen.getByText(
      `The task “${todoFixture.title}” will be permanently deleted.`,
    ),
  ).toBeVisible()
})

it('shows the deletion error from the server', () => {
  setup({ error: new Error('Could not delete.') })

  expect(screen.getByTestId('alert')).toHaveTextContent('Could not delete.')
})

it('deletes the task and reports success', async () => {
  const { user, mutateAsync, onDeleted } = setup()

  await user.click(screen.getByRole('button', { name: 'Delete task' }))

  expect(mutateAsync).toHaveBeenCalledWith(todoFixture.id)
  expect(onDeleted).toHaveBeenCalledOnce()
})

it('cancels without deleting', async () => {
  const { user, mutateAsync, onClose, onDeleted } = setup()

  await user.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(onClose).toHaveBeenCalledOnce()
  expect(mutateAsync).not.toHaveBeenCalled()
  expect(onDeleted).not.toHaveBeenCalled()
})
