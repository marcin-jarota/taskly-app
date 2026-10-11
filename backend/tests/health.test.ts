import express from 'express'
import request from 'supertest'
import { afterEach, it, expect, vi } from 'vitest'
import { createHealthRouter } from '../src/api/health.ts'
import { testDatabase } from './fixture.ts'

afterEach(() => vi.restoreAllMocks())

function setup() {
  const database = testDatabase()
  const app = express()
  app.use('/api', createHealthRouter(database))
  return { app, database }
}

it('reports ok after a database round trip', async () => {
  const { app, database } = setup()
  const findFirst = vi.spyOn(database.todo, 'findFirst').mockResolvedValue(null)

  const response = await request(app).get('/api/health')

  expect(response.status).toBe(200)
  expect(response.body).toEqual({ status: 'ok' })
  expect(findFirst).toHaveBeenCalledWith({ select: { id: true } })
})

it('fails when the database is unreachable', async () => {
  const { app, database } = setup()
  vi.spyOn(database.todo, 'findFirst').mockRejectedValue(
    new Error('Database unavailable'),
  )

  const response = await request(app).get('/api/health')

  expect(response.status).toBe(500)
})
