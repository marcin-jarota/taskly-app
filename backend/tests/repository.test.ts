import { afterEach, it, expect, vi } from 'vitest'
import { TodoRepository } from '../src/features/todos/repository.ts'
import { record, testDatabase, todo } from './fixture.ts'

afterEach(() => vi.restoreAllMocks())

function setup() {
  const database = testDatabase()
  return { database, repository: new TodoRepository(database) }
}

const calendarDate = (due_date: string | null) =>
  due_date ? new Date(`${due_date}T00:00:00.000Z`) : null

it('lists tasks in newest-first order and maps database rows', async () => {
  const { database, repository } = setup()
  const findMany = vi
    .spyOn(database.todo, 'findMany')
    .mockResolvedValue([record])

  const todos = await repository.list()

  expect(todos).toEqual([todo])
  expect(findMany).toHaveBeenCalledWith({
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
  })
})

it('gets a task by ID', async () => {
  const { database, repository } = setup()
  const findUnique = vi
    .spyOn(database.todo, 'findUnique')
    .mockResolvedValue(record)

  const found = await repository.get(1)

  expect(found).toEqual(todo)
  expect(findUnique).toHaveBeenCalledWith({ where: { id: 1 } })
})

it('returns null for a missing task', async () => {
  const { database, repository } = setup()
  vi.spyOn(database.todo, 'findUnique').mockResolvedValue(null)

  const found = await repository.get(2)

  expect(found).toBeNull()
})

it.each(['2026-10-15', null])(
  'creates tasks with calendar dates and timestamps (%s)',
  async (due_date) => {
    const { database, repository } = setup()
    const create = vi
      .spyOn(database.todo, 'create')
      .mockResolvedValue({ ...record, due_date: calendarDate(due_date) })

    const created = await repository.create({
      title: 'Task',
      description: '',
      priority: 'medium',
      completed: false,
      due_date,
    })

    expect(created).toEqual({ ...todo, due_date })
    const data = create.mock.calls[0][0].data
    expect(data).toMatchObject({
      title: 'Task',
      due_date: calendarDate(due_date),
    })
    expect(data.created_at).toBeInstanceOf(Date)
    expect(data.updated_at).toEqual(data.created_at)
  },
)

it('updates fields without clearing an omitted due date', async () => {
  const { database, repository } = setup()
  const update = vi
    .spyOn(database.todo, 'updateManyAndReturn')
    .mockResolvedValue([{ ...record, completed: true }])

  const updated = await repository.update(1, { completed: true })

  expect(updated).toEqual({ ...todo, completed: true })
  expect(update).toHaveBeenCalledWith({
    where: { id: 1 },
    data: {
      completed: true,
      due_date: undefined,
      updated_at: expect.any(Date),
    },
  })
})

it.each(['2026-10-15', null])(
  'updates or clears a due date (%s)',
  async (due_date) => {
    const { database, repository } = setup()
    const update = vi
      .spyOn(database.todo, 'updateManyAndReturn')
      .mockResolvedValue([{ ...record, due_date: calendarDate(due_date) }])

    const updated = await repository.update(1, { due_date })

    expect(updated?.due_date).toEqual(due_date)
    expect(update.mock.calls[0][0].data.due_date).toEqual(
      calendarDate(due_date),
    )
  },
)

it('returns null when updating a missing task', async () => {
  const { database, repository } = setup()
  vi.spyOn(database.todo, 'updateManyAndReturn').mockResolvedValue([])

  const updated = await repository.update(99, { title: 'Missing' })

  expect(updated).toBeNull()
})

it.each([{}, JSON.parse('{"id":2}')])(
  'rejects empty or unknown update fields: %j',
  async (fields) => {
    const { database, repository } = setup()
    const update = vi.spyOn(database.todo, 'updateManyAndReturn')

    const updating = repository.update(1, fields)

    await expect(updating).rejects.toThrow('Invalid update fields.')
    expect(update).not.toHaveBeenCalled()
  },
)

it('counts all, completed and active tasks', async () => {
  const { database, repository } = setup()
  const count = vi
    .spyOn(database.todo, 'count')
    .mockResolvedValueOnce(5)
    .mockResolvedValueOnce(2)

  const stats = await repository.stats()

  expect(stats).toEqual({ total: 5, active: 3, completed: 2 })
  expect(count).toHaveBeenNthCalledWith(2, { where: { completed: true } })
})

it.each([
  { count: 1, deleted: true },
  { count: 0, deleted: false },
])('deletes a task (rows affected: $count)', async ({ count, deleted }) => {
  const { database, repository } = setup()
  const remove = vi
    .spyOn(database.todo, 'deleteMany')
    .mockResolvedValue({ count })

  const result = await repository.delete(1)

  expect(result).toBe(deleted)
  expect(remove).toHaveBeenCalledWith({ where: { id: 1 } })
})

it('propagates database errors', async () => {
  const { database, repository } = setup()
  vi.spyOn(database.todo, 'findMany').mockRejectedValue(
    new Error('Database unavailable'),
  )

  const listing = repository.list()

  await expect(listing).rejects.toThrow('Database unavailable')
})
