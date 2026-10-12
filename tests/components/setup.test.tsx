import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'

it('supports React rendering and DOM matchers in the test environment', () => {
  render(<output>Test environment ready</output>)
  expect(screen.getByRole('status')).toHaveTextContent('Test environment ready')
})
