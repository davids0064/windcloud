import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('saluda en español', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Hola WindCloud' })).toBeInTheDocument()
  })

  it('muestra los tres tipos de dato (P3)', () => {
    render(<App />)
    for (const label of ['Observado', 'Pronóstico', 'Estimado']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })
})
