import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { expect, it, vi } from 'vitest'
import { TodosHeader } from './TodosHeader'

function setup(props: Partial<ComponentProps<typeof TodosHeader>> = {}) {
  const user = userEvent.setup()
  const onCreate = vi.fn()
  const onClearCompleted = vi.fn()
  render(
    <TodosHeader
      disabled={false}
      completedCount={1}
      onCreate={onCreate}
      onClearCompleted={onClearCompleted}
      {...props}
    />,
  )
  return { user, onCreate, onClearCompleted }
}

it('shows the page title and description', () => {
  setup()

  expect(screen.getByRole('heading', { name: 'Tasks' })).toBeVisible()
  expect(
    screen.getByText('Create, organize, and complete tasks.'),
  ).toBeVisible()
})

it('invokes creation when enabled', async () => {
  const { user, onCreate } = setup()

  await user.click(screen.getByRole('button', { name: 'New task' }))

  expect(onCreate).toHaveBeenCalledTimes(1)
})

it('blocks creation when disabled', async () => {
  const { user, onCreate } = setup({ disabled: true })
  const button = screen.getByRole('button', { name: 'New task' })

  await user.click(button)

  expect(button).toBeDisabled()
  expect(onCreate).not.toHaveBeenCalled()
})

it('clears completed tasks when some are completed', async () => {
  const { user, onClearCompleted } = setup({ completedCount: 2 })

  await user.click(screen.getByRole('button', { name: 'Clear completed (2)' }))

  expect(onClearCompleted).toHaveBeenCalledTimes(1)
})

it('hides the clear completed button when no task is completed', () => {
  setup({ completedCount: 0 })

  expect(
    screen.queryByRole('button', { name: /Clear completed/ }),
  ).not.toBeInTheDocument()
})

it('disables clearing completed tasks when the page is disabled', async () => {
  const { user, onClearCompleted } = setup({
    completedCount: 1,
    disabled: true,
  })
  const button = screen.getByRole('button', { name: 'Clear completed (1)' })

  await user.click(button)

  expect(button).toBeDisabled()
  expect(onClearCompleted).not.toHaveBeenCalled()
})
