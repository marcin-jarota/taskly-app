import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { TodoForm } from './TodoForm'

function setup() {
  const user = userEvent.setup()
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(
    <TodoForm
      onSubmit={onSubmit}
      onCancel={vi.fn()}
      busy={false}
      error={null}
    />,
  )
  return { user, onSubmit }
}

it('rejects a whitespace-only title without submitting', async () => {
  const { user, onSubmit } = setup()

  await user.type(screen.getByLabelText(/Task title/), '   ')
  await user.click(screen.getByRole('button', { name: 'Save task' }))

  expect(screen.getByText('Enter a task title.')).toBeVisible()
  expect(onSubmit).not.toHaveBeenCalled()
})

it('submits trimmed values and the selected priority', async () => {
  const { user, onSubmit } = setup()

  await user.type(screen.getByLabelText(/Task title/), '  Prepare a demo  ')
  await user.selectOptions(screen.getByLabelText('Priority'), 'high')
  await user.click(screen.getByRole('button', { name: 'Save task' }))

  expect(onSubmit).toHaveBeenCalledWith({
    title: 'Prepare a demo',
    description: '',
    priority: 'high',
    due_date: null,
    completed: false,
  })
})
