import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { useTodoFilters } from './useTodoFilters'

const milk: Todo = {
  ...todoFixture,
  id: 1,
  title: 'Buy milk',
  priority: 'low',
  created_at: '2026-10-01T12:00:00Z',
}
const demo: Todo = {
  ...todoFixture,
  id: 2,
  title: 'Prepare a demo',
  priority: 'high',
  completed: true,
  created_at: '2026-10-02T12:00:00Z',
}
const call: Todo = {
  ...todoFixture,
  id: 3,
  title: 'Call Anna',
  priority: 'medium',
  created_at: '2026-10-03T12:00:00Z',
}
const todos = [milk, demo, call]

function setup() {
  const { result } = renderHook(() => useTodoFilters(todos))
  return { result }
}

it('shows all tasks newest first by default', () => {
  const { result } = setup()

  expect(result.current.visible).toEqual([call, demo, milk])
})

it.each([
  {
    change: 'filter',
    apply: (r: ReturnType<typeof useTodoFilters>) => r.setFilter('completed'),
    expected: [demo],
  },
  {
    change: 'search',
    apply: (r: ReturnType<typeof useTodoFilters>) => r.setSearch('MILK'),
    expected: [milk],
  },
  {
    change: 'sort',
    apply: (r: ReturnType<typeof useTodoFilters>) => r.setSort('priority'),
    expected: [demo, call, milk],
  },
])(
  'updates the visible tasks when the $change changes',
  ({ apply, expected }) => {
    const { result } = setup()

    act(() => apply(result.current))

    expect(result.current.visible).toEqual(expected)
  },
)
