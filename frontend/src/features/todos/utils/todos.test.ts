import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { countOverdue, isOverdue, selectTodos, validateTodo } from './todos'
import type { Todo, TodoInput } from '../types'

const base: Todo = {
  id: 1,
  title: 'Sprint plan',
  description: '',
  priority: 'medium',
  completed: false,
  due_date: null,
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-01T12:00:00Z',
}

const validInput: TodoInput = {
  title: 'Prepare a demo',
  description: '',
  priority: 'medium',
  due_date: null,
  completed: false,
}

const ids = (todos: Todo[]) => todos.map((todo) => todo.id)

describe('selectTodos', () => {
  it('combines status with a case-insensitive search in the description', () => {
    const matching = { ...base, description: 'Discuss the API' }
    const todos = [
      matching,
      { ...matching, id: 2, completed: true },
      { ...base, id: 3 },
    ]
    expect(selectTodos(todos, 'active', ' api ', 'newest')).toEqual([matching])
  })

  it('sorts by priority without changing the source array', () => {
    const high: Todo = { ...base, id: 2, priority: 'high' }
    const todos = [base, high]
    expect(selectTodos(todos, 'all', '', 'priority')).toEqual([high, base])
    expect(todos).toEqual([base, high])
  })

  it('orders priorities high, medium, low and puts the higher id first on a tie', () => {
    const todos: Todo[] = [
      { ...base, id: 1, priority: 'low' },
      { ...base, id: 2, priority: 'medium' },
      { ...base, id: 3, priority: 'high' },
      { ...base, id: 4, priority: 'high' },
    ]

    const result = selectTodos(todos, 'all', '', 'priority')

    expect(ids(result)).toEqual([4, 3, 2, 1])
  })

  it('sorts by due date with undated tasks last', () => {
    const todos: Todo[] = [
      { ...base, id: 1, due_date: null },
      { ...base, id: 2, due_date: '2026-12-01' },
      { ...base, id: 3, due_date: '2026-11-01' },
    ]

    const result = selectTodos(todos, 'all', '', 'due')

    expect(ids(result)).toEqual([3, 2, 1])
  })

  it('puts the higher id first when due dates are equal', () => {
    const todos: Todo[] = [
      { ...base, id: 1, due_date: '2026-11-01' },
      { ...base, id: 2, due_date: '2026-11-01' },
    ]

    const result = selectTodos(todos, 'all', '', 'due')

    expect(ids(result)).toEqual([2, 1])
  })

  it('sorts by newest creation date first', () => {
    const todos: Todo[] = [
      { ...base, id: 1, created_at: '2026-10-01T12:00:00Z' },
      { ...base, id: 2, created_at: '2026-10-03T12:00:00Z' },
      { ...base, id: 3, created_at: '2026-10-02T12:00:00Z' },
    ]

    const result = selectTodos(todos, 'all', '', 'newest')

    expect(ids(result)).toEqual([2, 3, 1])
  })
})

describe('validateTodo', () => {
  it('returns no errors for a valid task', () => {
    expect(validateTodo(validInput)).toEqual({})
  })

  it.each(['', '   '])('rejects the empty title %j', (title) => {
    expect(validateTodo({ ...validInput, title })).toEqual({
      title: 'Enter a task title.',
    })
  })

  it('accepts a title of 120 characters', () => {
    expect(validateTodo({ ...validInput, title: 'a'.repeat(120) })).toEqual({})
  })

  it('rejects a title of 121 characters', () => {
    expect(validateTodo({ ...validInput, title: 'a'.repeat(121) })).toEqual({
      title: 'The title must be at most 120 characters.',
    })
  })

  it('does not count surrounding spaces in the title length', () => {
    const title = `  ${'a'.repeat(120)}  `

    expect(validateTodo({ ...validInput, title })).toEqual({})
  })

  it('accepts a description of 2000 characters', () => {
    expect(
      validateTodo({ ...validInput, description: 'a'.repeat(2000) }),
    ).toEqual({})
  })

  it('rejects a description of 2001 characters', () => {
    expect(
      validateTodo({ ...validInput, description: 'a'.repeat(2001) }),
    ).toEqual({
      description: 'The description must be at most 2000 characters.',
    })
  })

  it.each(['2028-02-29', '2026-12-31'])('accepts the date %s', (due_date) => {
    expect(validateTodo({ ...validInput, due_date })).toEqual({})
  })

  it.each([
    ['a day that rolls over', '2026-02-30'],
    ['a non-leap-year leap day', '2027-02-29'],
    ['month 13', '2026-13-01'],
    ['a missing zero padding', '2026-1-5'],
    ['text', 'tomorrow'],
  ])('rejects %s', (_name, due_date) => {
    expect(validateTodo({ ...validInput, due_date })).toEqual({
      due_date: 'Enter a valid date.',
    })
  })

  it('reports errors for several fields at once', () => {
    const result = validateTodo({
      ...validInput,
      title: '',
      due_date: 'nope',
    })

    expect(Object.keys(result).sort()).toEqual(['due_date', 'title'])
  })
})

describe('isOverdue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('is true for an open task due yesterday', () => {
    expect(isOverdue({ ...base, due_date: '2026-10-14' })).toBe(true)
  })

  it('is false for an open task due today', () => {
    expect(isOverdue({ ...base, due_date: '2026-10-15' })).toBe(false)
  })

  it('is false for an open task due tomorrow', () => {
    expect(isOverdue({ ...base, due_date: '2026-10-16' })).toBe(false)
  })

  it('is false for a completed task past its due date', () => {
    expect(
      isOverdue({ ...base, due_date: '2026-10-14', completed: true }),
    ).toBe(false)
  })

  it('is false for a task without a due date', () => {
    expect(isOverdue({ ...base, due_date: null })).toBe(false)
  })
})

describe('countOverdue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('counts only open tasks past their due date', () => {
    const todos: Todo[] = [
      { ...base, id: 1, due_date: '2026-10-14' },
      { ...base, id: 2, due_date: '2026-10-01' },
      { ...base, id: 3, due_date: '2026-10-14', completed: true },
      { ...base, id: 4, due_date: '2026-10-15' },
      { ...base, id: 5, due_date: null },
    ]

    expect(countOverdue(todos)).toBe(2)
  })

  it('is 0 for an empty list', () => {
    expect(countOverdue([])).toBe(0)
  })
})
