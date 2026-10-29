import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { canExclude, EMPTY_INPUT, pendingDecisions, readInput, type InputState } from './app/workspace.ts'
import { generate } from './core/generate/outputs.ts'
import { defaultRoot } from './core/model/schema.ts'
import { modelRoles } from './core/physical/roles.ts'
import { findExample, type ExampleId } from './examples/index.ts'
import { AppFooter } from './components/AppFooter.tsx'
import { AppHeader } from './components/AppHeader.tsx'
import { DesignPane } from './components/DesignPane.tsx'
import { InputPane } from './components/InputPane.tsx'
import { IntroPanel } from './components/IntroPanel.tsx'
import { LinksPanel } from './components/LinksPanel.tsx'
import { ResultPane } from './components/ResultPane.tsx'
import { useDesigns } from './hooks/useDesigns.ts'
import { useIncomingMessages, useInitialIncoming } from './hooks/useIncomingModel.ts'
import { useOutputSettings } from './hooks/useOutputSettings.ts'
import { useUndoShortcuts } from './hooks/useUndoShortcuts.ts'
import { useI18n } from './i18n/useI18n.ts'
import './App.css'

type WorkspaceTab = 'input' | 'design' | 'result'
const TABS: WorkspaceTab[] = ['input', 'design', 'result']

function App() {
  const { t } = useI18n()
  const initial = useInitialIncoming()
  const [tab, setTab] = useState<WorkspaceTab>(initial ? 'design' : 'input')
  const [input, setInput] = useState<InputState>(initial ?? EMPTY_INPUT)
  const receive = useCallback((received: InputState) => {
    setInput(received)
    setTab('design')
  }, [])
  useIncomingMessages(receive)
  const { output, settings, setOutput, setSettings } = useOutputSettings()

  // Large inputs are parsed after the keystroke is painted, so typing stays smooth
  const deferredInput = useDeferredValue(input)
  const read = useMemo(() => readInput(deferredInput), [deferredInput])
  const schema = read.outcome?.ok ? read.outcome.schema : null

  const designs = useDesigns(schema, output.target)
  const { design } = designs
  useUndoShortcuts(designs.history)
  const roles = useMemo(() => (schema && design ? modelRoles(schema, design) : new Map()), [schema, design])
  const pending = useMemo(() => (design ? pendingDecisions(design, roles) : []), [design, roles])
  const excludable = useMemo(
    () => new Set(schema ? schema.models.filter((model) => canExclude(schema, model.name)).map((model) => model.name) : []),
    [schema],
  )
  const title = schema ? (schema.root ?? defaultRoot(schema)) : undefined
  const generated = useMemo(
    () => (schema && design ? generate(schema, design, output, settings, title) : null),
    [schema, design, output, settings, title],
  )

  function loadExample(id: ExampleId) {
    const example = findExample(id)
    if (!example) return
    if (input.text.trim() !== '' && !window.confirm(t.confirmReplace)) return
    // A different model: the decisions made on the previous one do not apply
    designs.startOver()
    setInput({ text: example.text, format: example.format })
    setOutput(example.output)
    setTab('design')
  }

  function changeInput(next: InputState) {
    // Clearing the input starts over: the decisions made on the previous model are discarded too
    if (next.text.trim() === '') designs.startOver()
    setInput(next)
  }

  const inputError = input.text.trim() !== '' && (!read.format || (read.outcome !== null && !read.outcome.ok))

  return (
    <div className="app">
      <AppHeader />
      <main className="app__main">
        <IntroPanel onExample={loadExample} />
        <div className="workspace__tabs" role="tablist" aria-label={t.workspaceTabs}>
          {TABS.map((id) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className="workspace__tab" onClick={() => setTab(id)}>
              {t.tabs[id]}
              {id === 'design' && pending.length > 0 && <span className="workspace__tab-badge">{pending.length}</span>}
              {id === 'input' && inputError && (
                <span className="workspace__tab-badge workspace__tab-badge--error" aria-hidden="true">
                  !
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="workspace" data-tab={tab}>
          <div className="workspace__top">
            <InputPane input={input} read={read} onChange={changeInput} />
            <DesignPane
              schema={schema}
              design={design}
              roles={roles}
              physical={generated?.physical ?? null}
              pending={pending}
              database={output.label}
              excludable={excludable}
              onChange={designs.change}
              history={designs.history}
              onReset={designs.reset}
            />
          </div>
          <div className="workspace__result">
            <ResultPane
              output={output}
              settings={settings}
              generated={generated}
              onOutputChange={setOutput}
              onSettingsChange={setSettings}
            />
          </div>
        </div>
        <LinksPanel />
      </main>
      <AppFooter />
    </div>
  )
}

export default App
