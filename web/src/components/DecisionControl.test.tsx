// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Decision } from '../core/design/types.ts'
import { I18nProvider } from '../i18n/I18nProvider.tsx'
import { DecisionControl } from './DecisionControl.tsx'

afterEach(cleanup)

const pending: Decision<boolean> = {
  value: true,
  status: 'pending',
  confidence: 'review',
  reasons: [{ code: 'uniqueNamed', params: { field: 'email' } }],
  options: [true, false],
}

function renderControl(decision: Decision<boolean>, onChoose = vi.fn(), onAccept = vi.fn()) {
  render(
    <I18nProvider>
      <DecisionControl
        id="decision"
        subject="Customer.email"
        decision={decision}
        optionLabel={(value) => (value ? 'Unique' : 'Not unique')}
        onChoose={onChoose}
        onAccept={onAccept}
      />
    </I18nProvider>,
  )
  return { onChoose, onAccept }
}

describe('a decision', () => {
  it('says its state in text and why it was proposed', () => {
    renderControl(pending)
    expect(screen.getByText('Review')).toBeTruthy()
    expect(screen.getByText(/is usually unique/)).toBeTruthy()
  })

  it('accepts the suggestion without passing anything else', () => {
    const { onAccept } = renderControl(pending)
    fireEvent.click(screen.getByRole('button', { name: /Accept the suggestion/ }))
    expect(onAccept).toHaveBeenCalledWith()
  })

  it('chooses another option', () => {
    const { onChoose } = renderControl(pending)
    fireEvent.change(screen.getByRole('combobox', { name: 'Customer.email' }), { target: { value: '1' } })
    expect(onChoose).toHaveBeenCalledWith(false)
  })

  it('offers no accept button once decided', () => {
    renderControl({ ...pending, status: 'active', manual: true })
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Chosen')).toBeTruthy()
  })
})
