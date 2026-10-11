import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { expect, it, vi } from 'vitest'
import { useNotice } from '../../hooks/useNotice'
import { todoFixture } from '../../test/todoFixture'
import type { DeleteTodoDialog } from './components/DeleteTodoDialog'
import type { TodoEditor } from './components/TodoEditor'
import type { TodoList } from './components/TodoList'
import type { TodosHeader } from './components/TodosHeader'
import { useDeleteCompletedMutation } from './hooks/useDeleteCompletedMutation'
import { useTodoFilters } from './hooks/useTodoFilters'
import { useTodosBusy } from './hooks/useTodosBusy'
import { useTodosQuery } from './hooks/useTodosQuery'
import { useUpdateTodoMutation } from './hooks/useUpdateTodoMutation'
import { TodosPage } from './TodosPage'
import type { Todo } from './types'

vi.mock('../../hooks/useNotice', () => ({ useNotice: vi.fn() }))
vi.mock('./hooks/useDeleteCompletedMutation', () => ({
  useDeleteCompletedMutation: vi.fn(),
}))
vi.mock('./hooks/useTodoFilters', () => ({ useTodoFilters: vi.fn() }))
vi.mock('./hooks/useTodosBusy', () => ({ useTodosBusy: vi.fn() }))
vi.mock('./hooks/useTodosQuery', () => ({ useTodosQuery: vi.fn() }))
vi.mock('./hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./components/TodosHeader', () => ({
  TodosHeader: ({
    disabled,
    completedCount,
    onCreate,
    onClearCompleted,
  }: ComponentProps<typeof TodosHeader>) => (
    <>
      <button disabled={disabled} onClick={onCreate}>
        New task
      </button>
      <button onClick={onClearCompleted}>Clear completed</button>
      <output aria-label="completed count">{completedCount}</output>
    </>
  ),
}))
vi.mock('./components/TodoFilters', () => ({ TodoFilters: () => null }))
vi.mock('./components/TodoList', () => ({
  TodoList: ({
    todos,
    onToggle,
    onEdit,
    onDelete,
  }: ComponentProps<typeof TodoList>) => (
    <>
      {todos.map((todo) => (
        <div key={todo.id}>
          <button onClick={() => onToggle(todo)}>Toggle {todo.title}</button>
          <button onClick={() => onEdit(todo)}>Edit {todo.title}</button>
          <button onClick={() => onDelete(todo)}>Delete {todo.title}</button>
        </div>
      ))}
    </>
  ),
}))
vi.mock('./components/TodoEditor', () => ({
  TodoEditor: ({
    todo,
    onClose,
    onSaved,
  }: ComponentProps<typeof TodoEditor>) => (
    <div
      role="dialog"
      aria-label={todo === 'new' ? 'New task' : `Edit ${todo.title}`}
    >
      <button onClick={onClose}>Close editor</button>
      <button onClick={() => onSaved('Task saved.')}>Save</button>
    </div>
  ),
}))
vi.mock('./components/DeleteTodoDialog', () => ({
  DeleteTodoDialog: ({
    todo,
    onClose,
    onDeleted,
  }: ComponentProps<typeof DeleteTodoDialog>) => (
    <div role="dialog" aria-label={`Delete ${todo.title}`}>
      <button onClick={onClose}>Cancel delete</button>
      <button onClick={onDeleted}>Confirm delete</button>
    </div>
  ),
}))
vi.mock('../../components/SuccessNotice', () => ({ SuccessNotice: () => null }))

type Query = ReturnType<typeof useTodosQuery>
type Mutation = ReturnType<typeof useUpdateTodoMutation>
type ClearMutation = ReturnType<typeof useDeleteCompletedMutation>

function setup({
  query = {},
  mutation = {},
  clearMutation = {},
  busy = false,
  todo = todoFixture,
}: {
  query?: Partial<Query>
  mutation?: Partial<Mutation>
  clearMutation?: Partial<ClearMutation>
  busy?: boolean
  todo?: Todo
} = {}) {
  const user = userEvent.setup()
  const refetch = vi.fn().mockResolvedValue(undefined)
  const reset = vi.fn()
  const mutateAsync = vi.fn()
  const clearReset = vi.fn()
  const clearAsync = vi.fn()
  const notify = vi.fn()
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [todo],
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch,
    ...query,
  } as unknown as Query)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: null,
    reset,
    mutateAsync,
    ...mutation,
  } as unknown as Mutation)
  vi.mocked(useDeleteCompletedMutation).mockReturnValue({
    error: null,
    reset: clearReset,
    mutateAsync: clearAsync,
    ...clearMutation,
  } as unknown as ClearMutation)
  vi.mocked(useTodosBusy).mockReturnValue(busy)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: [todo],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  render(<TodosPage />)
  return {
    user,
    refetch,
    reset,
    mutateAsync,
    clearReset,
    clearAsync,
    notify,
  }
}

const queryFailure = {
  isError: true,
  error: new Error('The server is unavailable.'),
} as Partial<Query>

it('displays a query failure and resets mutation errors before retrying', async () => {
  const { user, refetch, reset } = setup({ query: queryFailure })

  expect(screen.getByTestId('alert')).toHaveTextContent(
    'The server is unavailable.',
  )
  await user.click(screen.getByRole('button', { name: 'Try again' }))

  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1))
  expect(reset).toHaveBeenCalledTimes(1)
  expect(reset.mock.invocationCallOrder[0]).toBeLessThan(
    refetch.mock.invocationCallOrder[0],
  )
})

it('shows the toggle error instead of the query error', () => {
  setup({
    query: queryFailure,
    mutation: { error: new Error('Could not save.') } as Partial<Mutation>,
  })

  expect(screen.getByTestId('alert')).toHaveTextContent('Could not save.')
  expect(screen.getByTestId('alert')).not.toHaveTextContent(
    'The server is unavailable.',
  )
})

it('resets the clear-completed error before retrying', async () => {
  const { user, clearReset } = setup({ query: queryFailure })

  await user.click(screen.getByRole('button', { name: 'Try again' }))

  await waitFor(() => expect(clearReset).toHaveBeenCalledTimes(1))
})

it('shows the clear-completed error instead of the query error', () => {
  setup({
    query: queryFailure,
    clearMutation: {
      error: new Error('Could not clear.'),
    } as Partial<ClearMutation>,
  })

  expect(screen.getByTestId('alert')).toHaveTextContent('Could not clear.')
  expect(screen.getByTestId('alert')).not.toHaveTextContent(
    'The server is unavailable.',
  )
})

it.each([
  { completed: true, count: '1' },
  { completed: false, count: '0' },
])('passes $count completed tasks to the header', ({ completed, count }) => {
  setup({ todo: { ...todoFixture, completed } })

  expect(screen.getByLabelText('completed count')).toHaveTextContent(count)
})

it.each([
  { deleted: 1, notice: '1 completed task deleted.' },
  { deleted: 3, notice: '3 completed tasks deleted.' },
])(
  'clears completed tasks and announces "$notice"',
  async ({ deleted, notice }) => {
    const { user, clearAsync, notify } = setup()
    clearAsync.mockResolvedValue({ deleted })

    await user.click(screen.getByRole('button', { name: 'Clear completed' }))

    expect(notify).toHaveBeenCalledWith(notice)
  },
)

it('ignores clearing completed tasks while another change is saving', async () => {
  const { user, clearAsync } = setup({ busy: true })

  await user.click(screen.getByRole('button', { name: 'Clear completed' }))

  expect(clearAsync).not.toHaveBeenCalled()
})

it('does not announce a clear that failed', async () => {
  const { user, clearAsync, notify } = setup()
  clearAsync.mockRejectedValue(new Error('Could not clear.'))

  await user.click(screen.getByRole('button', { name: 'Clear completed' }))

  expect(clearAsync).toHaveBeenCalledOnce()
  expect(notify).not.toHaveBeenCalled()
})

it.each([
  {
    state: 'fetching',
    query: { ...queryFailure, isFetching: true },
    busy: false,
  },
  { state: 'busy', query: queryFailure, busy: true },
])('disables retrying while $state', ({ query, busy }) => {
  setup({ query, busy })

  expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
})

it.each([
  { state: 'loading', query: { isPending: true }, busy: false },
  { state: 'busy', query: {}, busy: true },
])('disables creating a task while $state', ({ query, busy }) => {
  setup({ query, busy })

  expect(screen.getByRole('button', { name: 'New task' })).toBeDisabled()
})

it.each([
  {
    completed: false,
    notice: 'Another task complete. Well done!',
  },
  { completed: true, notice: 'Task marked as active.' },
])(
  'toggles a task with completed $completed and announces the saved state',
  async ({ completed, notice }) => {
    const todo = { ...todoFixture, completed }
    const { user, mutateAsync, notify } = setup({ todo })
    mutateAsync.mockResolvedValue({ ...todo, completed: !completed })

    await user.click(
      screen.getByRole('button', { name: `Toggle ${todo.title}` }),
    )

    expect(mutateAsync).toHaveBeenCalledWith({
      id: todo.id,
      input: { completed: !completed },
    })
    expect(notify).toHaveBeenCalledWith(notice)
  },
)

it('ignores toggling while another change is saving', async () => {
  const { user, mutateAsync } = setup({ busy: true })

  await user.click(
    screen.getByRole('button', { name: `Toggle ${todoFixture.title}` }),
  )

  expect(mutateAsync).not.toHaveBeenCalled()
})

it('does not announce a toggle that failed', async () => {
  const { user, mutateAsync, notify } = setup()
  mutateAsync.mockRejectedValue(new Error('Could not save.'))

  await user.click(
    screen.getByRole('button', { name: `Toggle ${todoFixture.title}` }),
  )

  expect(mutateAsync).toHaveBeenCalledOnce()
  expect(notify).not.toHaveBeenCalled()
})

it.each([
  { trigger: 'New task', editor: 'New task' },
  {
    trigger: `Edit ${todoFixture.title}`,
    editor: `Edit ${todoFixture.title}`,
  },
])('opens the editor from "$trigger"', async ({ trigger, editor }) => {
  const { user } = setup()

  await user.click(screen.getByRole('button', { name: trigger }))

  expect(screen.getByRole('dialog', { name: editor })).toBeVisible()
})

it('closes the editor and announces the saved task', async () => {
  const { user, notify } = setup()
  await user.click(screen.getByRole('button', { name: 'New task' }))

  await user.click(screen.getByRole('button', { name: 'Save' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(notify).toHaveBeenCalledWith('Task saved.')
})

it('closes the editor without a notice', async () => {
  const { user, notify } = setup()
  await user.click(screen.getByRole('button', { name: 'New task' }))

  await user.click(screen.getByRole('button', { name: 'Close editor' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
})

it('asks to confirm deleting the clicked task', async () => {
  const { user } = setup()

  await user.click(
    screen.getByRole('button', { name: `Delete ${todoFixture.title}` }),
  )

  expect(
    screen.getByRole('dialog', { name: `Delete ${todoFixture.title}` }),
  ).toBeVisible()
})

it('closes the delete dialog and announces the deletion', async () => {
  const { user, notify } = setup()
  await user.click(
    screen.getByRole('button', { name: `Delete ${todoFixture.title}` }),
  )

  await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(notify).toHaveBeenCalledWith('Task deleted.')
})

it('closes the delete dialog without deleting on cancel', async () => {
  const { user, notify } = setup()
  await user.click(
    screen.getByRole('button', { name: `Delete ${todoFixture.title}` }),
  )

  await user.click(screen.getByRole('button', { name: 'Cancel delete' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
})
