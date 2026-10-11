import request from 'supertest'
import { afterEach, it, expect, vi } from 'vitest'
import { createApp } from '../src/factory.ts'
import { record, testDatabase, todo } from './fixture.ts'

afterEach(() => vi.restoreAllMocks())

function setup() {
  const database = testDatabase()
  return { app: createApp(database), database }
}

it('serves the todos API backed by the database', async () => {
  const { app, database } = setup()
  vi.spyOn(database.todo, 'findMany').mockResolvedValue([record])

  const response = await request(app).get('/api/todos')

  expect(response.status).toBe(200)
  expect(response.body).toEqual([todo])
})

it('serves the health check', async () => {
  const { app, database } = setup()
  vi.spyOn(database.todo, 'findFirst').mockResolvedValue(null)

  const response = await request(app).get('/api/health')

  expect(response.status).toBe(200)
  expect(response.body).toEqual({ status: 'ok' })
})

it('serves the OpenAPI specification', async () => {
  const { app } = setup()

  const response = await request(app).get('/openapi.json')

  expect(response.status).toBe(200)
  expect(response.body.openapi).toBe('3.0.3')
  expect(Object.keys(response.body.paths)).toEqual([
    '/api/health',
    '/api/todos',
    '/api/todos/completed',
    '/api/todos/{id}',
  ])
})

it('serves the Swagger UI', async () => {
  const { app } = setup()

  const response = await request(app).get('/docs/')

  expect(response.status).toBe(200)
  expect(response.type).toBe('text/html')
  expect(response.text).toContain('swagger-ui')
})

it('does not advertise Express', async () => {
  const { app } = setup()

  const response = await request(app).get('/openapi.json')

  expect(response.headers['x-powered-by']).toBeUndefined()
})

it('returns a JSON 404 for an unknown route', async () => {
  const { app } = setup()

  const response = await request(app).get('/api/unknown')

  expect(response.status).toBe(404)
  expect(response.body).toEqual({ detail: 'Not Found' })
})

it('rejects malformed JSON with 422', async () => {
  const { app } = setup()

  const response = await request(app)
    .post('/api/todos')
    .set('Content-Type', 'application/json')
    .send('{"title":')

  expect(response.status).toBe(422)
  expect(response.body).toEqual({ detail: 'Invalid JSON.' })
})

it('rejects a body over 100kb with 413', async () => {
  const { app } = setup()

  const response = await request(app)
    .post('/api/todos')
    .send({ title: 'x'.repeat(101 * 1024) })

  expect(response.status).toBe(413)
  expect(response.body).toEqual({ detail: 'Request body too large.' })
})

it('turns a thrown error into a JSON 500 and logs it', async () => {
  const { app, database } = setup()
  vi.spyOn(database.todo, 'findFirst').mockRejectedValue(
    new Error('Database unavailable'),
  )
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})

  const response = await request(app).get('/api/health')

  expect(response.status).toBe(500)
  expect(response.body).toEqual({ detail: 'Internal Server Error' })
  expect(error).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'Database unavailable' }),
  )
})
