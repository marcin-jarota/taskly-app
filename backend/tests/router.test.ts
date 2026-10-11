import express from 'express'
import request from 'supertest'
import { it, expect, vi } from 'vitest'
import { createTodosRouter } from '../src/features/todos/router.ts'
import { todo } from './fixture.ts'

function setup() {
  const repository = {
    list: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }
  const app = express()
  app.use(express.json())
  app.use('/api/todos', createTodosRouter(repository))
  return { app, repository }
}

it('lists tasks from the repository', async () => {
  const { app, repository } = setup()
  repository.list.mockResolvedValue([todo])

  const response = await request(app).get('/api/todos')

  expect(response.status).toBe(200)
  expect(response.body).toEqual([todo])
})

it('creates tasks with trimmed input and defaults', async () => {
  const { app, repository } = setup()
  repository.create.mockResolvedValue(todo)

  const response = await request(app)
    .post('/api/todos')
    .send({ title: '  Plan the sprint  ', priority: 'high' })

  expect(response.status).toBe(201)
  expect(response.body).toEqual(todo)
  expect(repository.create).toHaveBeenCalledWith({
    title: 'Plan the sprint',
    description: '',
    priority: 'high',
    due_date: null,
    completed: false,
  })
})

it.each([
  { title: '  ' },
  { title: 'x'.repeat(121) },
  { title: 'Task', priority: 'urgent' },
  { title: 'Task', due_date: '2026-02-30' },
])(
  'rejects invalid create input without calling the repository: %j',
  async (payload) => {
    const { app, repository } = setup()

    const response = await request(app).post('/api/todos').send(payload)

    expect(response.status).toBe(422)
    expect(repository.create).not.toHaveBeenCalled()
  },
)

it('gets a task by ID', async () => {
  const { app, repository } = setup()
  repository.get.mockResolvedValue(todo)

  const response = await request(app).get('/api/todos/1')

  expect(response.status).toBe(200)
  expect(response.body).toEqual(todo)
  expect(repository.get).toHaveBeenCalledWith(1)
})

it('returns 404 for an unknown ID', async () => {
  const { app, repository } = setup()
  repository.get.mockResolvedValue(null)

  const response = await request(app).get('/api/todos/99')

  expect(response.status).toBe(404)
  expect(response.body).toEqual({ detail: 'Task not found.' })
})

it.each(['0', '-1', '1.5', 'abc'])(
  'rejects the malformed ID %s without calling the repository',
  async (id) => {
    const { app, repository } = setup()

    const response = await request(app).get(`/api/todos/${id}`)

    expect(response.status).toBe(422)
    expect(repository.get).not.toHaveBeenCalled()
  },
)

it('updates a task with trimmed input', async () => {
  const { app, repository } = setup()
  repository.update.mockResolvedValue({ ...todo, title: 'Renamed' })

  const response = await request(app)
    .patch('/api/todos/1')
    .send({ title: '  Renamed  ', completed: true })

  expect(response.status).toBe(200)
  expect(response.body).toEqual({ ...todo, title: 'Renamed' })
  expect(repository.update).toHaveBeenCalledWith(1, {
    title: 'Renamed',
    completed: true,
  })
})

it('returns 404 when updating an unknown ID', async () => {
  const { app, repository } = setup()
  repository.update.mockResolvedValue(null)

  const response = await request(app)
    .patch('/api/todos/99')
    .send({ completed: true })

  expect(response.status).toBe(404)
  expect(response.body).toEqual({ detail: 'Task not found.' })
})

it.each([{}, { title: '' }, { id: 2 }, { completed: 'yes' }])(
  'rejects invalid update input without calling the repository: %j',
  async (payload) => {
    const { app, repository } = setup()

    const response = await request(app).patch('/api/todos/1').send(payload)

    expect(response.status).toBe(422)
    expect(repository.update).not.toHaveBeenCalled()
  },
)

it('deletes a task', async () => {
  const { app, repository } = setup()
  repository.delete.mockResolvedValue(true)

  const response = await request(app).delete('/api/todos/1')

  expect(response.status).toBe(204)
  expect(response.text).toBe('')
  expect(repository.delete).toHaveBeenCalledWith(1)
})

it('returns 404 when deleting an unknown ID', async () => {
  const { app, repository } = setup()
  repository.delete.mockResolvedValue(false)

  const response = await request(app).delete('/api/todos/99')

  expect(response.status).toBe(404)
  expect(response.body).toEqual({ detail: 'Task not found.' })
})
