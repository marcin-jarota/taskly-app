import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

vi.mock('../design-system', () => import('../design-system/mocks'))

afterEach(cleanup)
