// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/** In-memory Web Storage: Node 25 has its own experimental localStorage that hides jsdom's. */
function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  }
}

// CodeMirror measures text; jsdom has no layout
beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage(), configurable: true })
  Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(), configurable: true })
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect()
  document.elementFromPoint = () => null
  Element.prototype.scrollIntoView = () => {}
})

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem('model2db.language', 'en')
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.resetModules()
})

async function renderApp() {
  // A fresh module: the startup state (handoff, saved work) is read once per page
  const { default: App } = await import('./App.tsx')
  const { I18nProvider } = await import('./i18n/I18nProvider.tsx')
  render(
    <I18nProvider>
      <App />
    </I18nProvider>,
  )
}

const designPane = () => screen.getByRole('region', { name: 'Design' })
const status = () => within(designPane()).getByRole('status').textContent ?? ''

async function loadShop() {
  fireEvent.click(screen.getByRole('button', { name: 'Online shop' }))
  await waitFor(() => expect(status()).toMatch(/to review/))
}

describe('Model2DB', () => {
  it('waits for a model before proposing a design', async () => {
    await renderApp()
    expect(screen.getByText('The proposed design will appear here when the model can be read.')).toBeTruthy()
    expect(screen.getByText('Nothing is saved unless you turn on “Remember in this browser”.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Save project' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('takes the keyboard from the review list to the decision, and keeps it there after accepting', async () => {
    await renderApp()
    await loadShop()
    const pendingBefore = Number(status().match(/(\d+) decisions? to review/)?.[1])
    const first = within(designPane()).getAllByRole('listitem')[0]
    fireEvent.click(within(first).getByRole('button'))
    const focused = document.activeElement as HTMLElement
    expect(focused.tagName).toBe('SELECT')
    const decision = focused.closest('[role="group"]') as HTMLElement
    expect(decision.getAttribute('aria-label')).toBe(focused.getAttribute('aria-label'))

    fireEvent.click(within(decision).getByRole('button', { name: /^Accept the suggestion/ }))
    expect(document.activeElement).toBe(focused)
    await waitFor(() => expect(status()).not.toContain(`${pendingBefore} decision`))
  })

  it('moves between the workspace tabs with the arrow keys', async () => {
    await renderApp()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1])
    tabs[0].focus()
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
    expect(document.activeElement).toBe(tabs[1])
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(tabs[1], { key: 'End' })
    expect(tabs[2].getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(tabs[2], { key: 'ArrowRight' })
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
  })

  it('keeps typing in a name after Enter and Escape', async () => {
    await renderApp()
    await loadShop()
    fireEvent.click(within(designPane()).getAllByRole('button', { name: /^Edit how “[A-Za-z]+” is stored/ })[0])
    const input = within(designPane()).getByRole('textbox', { name: 'Table name' }) as HTMLInputElement
    input.focus()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'shop_' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: 'shop_customers' } })
    expect(input.value).toBe('shop_customers')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.value).toBe('shop_')
  })

  it('remembers the work in this browser only when asked, and restores it', async () => {
    await renderApp()
    await loadShop()
    const pending = status()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Remember in this browser' }))
    await act(() => vi.advanceTimersByTimeAsync(700))
    vi.useRealTimers()
    expect(JSON.parse(localStorage.getItem('model2db.workspace') ?? '{}').format).toBe('model2db-project')
    cleanup()
    vi.resetModules()

    await renderApp()
    expect(screen.getByText('Your previous work was restored from this browser.')).toBeTruthy()
    await waitFor(() => expect(status()).toBe(pending))

    fireEvent.click(screen.getByRole('button', { name: 'Delete saved work' }))
    expect(localStorage.getItem('model2db.workspace')).toBeNull()
    expect(localStorage.getItem('model2db.remember')).toBe('false')
  })

  it('opens a project file and rejects one that is damaged', async () => {
    await renderApp()
    await loadShop()
    const relational = { target: 'relational', models: [], enums: [] }
    const project = {
      format: 'model2db-project',
      version: 1,
      savedAt: '2026-10-29T12:00:00.000Z',
      input: { format: 'typescript', text: 'interface Invoice { id: number; total: number }' },
      designs: { relational, document: null },
      output: {
        output: 'sqlite',
        naming: { relational: { tables: 'plural', columns: 'snake' }, document: { tables: 'plural', columns: 'field' } },
        strings: 'auto',
        engine: 'sqlite',
        migrations: true,
      },
    }
    const fileInput = document.querySelector('.project-bar input[type=file]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [new File([JSON.stringify(project)], 'invoice.model2db.json')] } })
    await waitFor(() => expect(screen.getByText('Project “invoice.model2db.json” opened.')).toBeTruthy())
    await waitFor(() => expect(within(designPane()).getByRole('heading', { name: /Invoice/ })).toBeTruthy())
    expect(within(designPane()).getByText(/SQLite/)).toBeTruthy()

    const damaged = { ...project, output: { ...project.output, engine: 'db2' } }
    fireEvent.change(fileInput, { target: { files: [new File([JSON.stringify(damaged)], 'bad.model2db.json')] } })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('The project is damaged ($.output.engine).'))
  })

  it('names the file tabs by file, with the path in the title', async () => {
    await renderApp()
    await loadShop()
    fireEvent.change(screen.getByRole('combobox', { name: 'Database' }), { target: { value: 'jpa' } })
    const files = within(screen.getByRole('tablist', { name: 'Files' })).getAllByRole('tab')
    expect(files.map((tab) => tab.textContent)).toContain('Order.java')
    const order = files.find((tab) => tab.textContent === 'Order.java')!
    expect(order.title).toBe('src/main/java/com/example/model/Order.java')
  })

  it('opens a model sent by another tool, once', async () => {
    sessionStorage.setItem(
      'model2db.incoming',
      JSON.stringify({
        format: 'model-handoff',
        version: 1,
        from: 'mapper',
        role: 'target',
        schema: {
          format: 'model-schema',
          version: 1,
          models: [
            {
              name: 'Invoice',
              kind: 'class',
              fields: [{ name: 'id', type: { kind: 'primitive', name: 'integer' }, nullable: false, optional: false }],
            },
          ],
          enums: [],
        },
      }),
    )
    await renderApp()
    expect(screen.getByText('Model received from Mapper.')).toBeTruthy()
    expect(sessionStorage.getItem('model2db.incoming')).toBeNull()
    expect(screen.getByRole('tab', { name: 'Design' }).getAttribute('aria-selected')).toBe('true')
  })
})
