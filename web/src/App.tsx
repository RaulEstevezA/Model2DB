import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { canExclude, EMPTY_INPUT, pendingDecisions, readInput, type InputState } from './app/workspace.ts'
import { reconcile } from './core/design/edit.ts'
import { proposeDesign } from './core/design/propose.ts'
import type { Design, StorageTarget } from './core/design/types.ts'
import { findOutput, generate, type OutputSettings } from './core/generate/outputs.ts'
import { defaultRoot } from './core/model/schema.ts'
import { modelRoles } from './core/physical/roles.ts'
import type { NamingOptions } from './core/physical/types.ts'
import { isTrustedOrigin, readHandoff, takeIncoming, type Handoff } from './core/project/handoff.ts'
import { findParser } from './core/parsers/registry.ts'
import type { InputFormatId } from './core/parsers/types.ts'
import { findExample, type ExampleId } from './examples/index.ts'
import { AppFooter } from './components/AppFooter.tsx'
import { AppHeader } from './components/AppHeader.tsx'
import { DesignPane } from './components/DesignPane.tsx'
import { InputPane } from './components/InputPane.tsx'
import { IntroPanel } from './components/IntroPanel.tsx'
import { LinksPanel } from './components/LinksPanel.tsx'
import { ResultPane } from './components/ResultPane.tsx'
import { useHistory } from './hooks/useHistory.ts'
import { useStoredState } from './hooks/useStoredState.ts'
import { useI18n } from './i18n/useI18n.ts'
import './App.css'

type WorkspaceTab = 'input' | 'design' | 'result'
const TABS: WorkspaceTab[] = ['input', 'design', 'result']
const TOOL_NAMES: Record<string, string> = { api2class: 'Api2Class', mapper: 'Mapper', model2db: 'Model2DB', datacleanr: 'DataCleanr' }

/** One design per kind of database, so going from PostgreSQL to MongoDB and back keeps the decisions. */
type Designs = Record<StorageTarget, Design | null>
const NO_DESIGNS: Designs = { relational: null, document: null }

// Documents keep the field names of the model; tables follow the SQL convention
const DEFAULT_NAMING: Record<StorageTarget, NamingOptions> = {
  relational: { tables: 'plural', columns: 'snake' },
  document: { tables: 'plural', columns: 'field' },
}

/** A model sent by another tool (Mapper's "Open in Model2DB"), as the input. */
function inputFromHandoff(handoff: Handoff): InputState {
  const receivedFrom = TOOL_NAMES[handoff.from]
  if (handoff.text) {
    const format = findParser(handoff.text.format as InputFormatId)?.id ?? null
    return { text: handoff.text.content, format, receivedFrom }
  }
  return { text: JSON.stringify(handoff.schema, null, 2), format: 'modelschema', receivedFrom }
}

let startup: { input: InputState; tab: WorkspaceTab } | null = null

/** What the page opens with: a model sent by another tool, or nothing. Computed once: the handoff can
 * only be read once. */
function getStartup() {
  if (startup) return startup
  const incoming = typeof sessionStorage === 'undefined' ? null : takeIncoming(sessionStorage, 'model2db')
  startup = incoming ? { input: inputFromHandoff(incoming), tab: 'design' } : { input: EMPTY_INPUT, tab: 'input' }
  return startup
}

function App() {
  const { t } = useI18n()
  const initial = getStartup()
  const [input, setInput] = useState<InputState>(initial.input)
  const [tab, setTab] = useState<WorkspaceTab>(initial.tab)
  const history = useHistory<Designs>(NO_DESIGNS)

  // Preferences (remembered); the model and the decisions are not
  const [outputId, setOutputId] = useStoredState('model2db.output', () => 'postgresql')
  const [namings, setNamings] = useStoredState<Record<StorageTarget, NamingOptions>>('model2db.naming', () => DEFAULT_NAMING)
  const [strings, setStrings] = useStoredState<OutputSettings['strings']>('model2db.strings', () => 'auto')
  const output = findOutput(outputId)
  const target = output.target
  const settings: OutputSettings = useMemo(
    () => ({ naming: namings[target] ?? DEFAULT_NAMING[target], strings }),
    [namings, target, strings],
  )

  // Large inputs are parsed after the keystroke is painted, so typing stays smooth
  const deferredInput = useDeferredValue(input)
  const read = useMemo(() => readInput(deferredInput), [deferredInput])
  const schema = read.outcome?.ok ? read.outcome.schema : null

  // A new proposal whenever the model changes, keeping what the user decided where it still applies
  const lastSchema = useRef<string>('')
  const presentRef = useRef(history.present)
  useEffect(() => {
    presentRef.current = history.present
  }, [history.present])
  useEffect(() => {
    const key = schema ? JSON.stringify(schema) : ''
    if (key === lastSchema.current) return
    lastSchema.current = key
    const previous = presentRef.current
    history.reset(
      schema
        ? { relational: reconcile(previous.relational, schema, 'relational'), document: reconcile(previous.document, schema, 'document') }
        : NO_DESIGNS,
    )
  }, [schema, history])

  const design = schema ? history.present[target] : null
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

  const changeDesign = useCallback((next: Design) => history.push({ ...history.present, [next.target]: next }), [history])

  function resetDesign() {
    if (schema) history.push({ ...history.present, [target]: proposeDesign(schema, target) })
  }

  // A tool in another tab can also send a model with postMessage; only trusted origins are heard
  useEffect(() => {
    function listen(event: MessageEvent) {
      if (!isTrustedOrigin(event.origin, window.location.origin)) return
      const handoff = readHandoff(event.data)
      if (!handoff) return
      setInput(inputFromHandoff(handoff))
      setTab('design')
    }
    window.addEventListener('message', listen)
    return () => window.removeEventListener('message', listen)
  }, [])

  // Undo and redo with the keyboard, except while typing in a field (it has its own undo)
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return
      const element = event.target as HTMLElement | null
      if (element && element.closest('input, textarea, select, [contenteditable="true"], .cm-editor') !== null) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey && history.canUndo) {
        event.preventDefault()
        history.undo()
      } else if (((key === 'z' && event.shiftKey) || key === 'y') && history.canRedo) {
        event.preventDefault()
        history.redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [history])

  function loadExample(id: ExampleId) {
    const example = findExample(id)
    if (!example) return
    if (input.text.trim() !== '' && !window.confirm(t.confirmReplace)) return
    // A different model: the decisions made on the previous one do not apply
    presentRef.current = NO_DESIGNS
    setInput({ text: example.text, format: example.format })
    setOutputId(example.output)
    setTab('design')
  }

  function changeInput(next: InputState) {
    // Clearing the input starts over: the decisions made on the previous model are discarded too
    if (next.text.trim() === '') presentRef.current = NO_DESIGNS
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
              onChange={changeDesign}
              canUndo={history.canUndo}
              canRedo={history.canRedo}
              onUndo={history.undo}
              onRedo={history.redo}
              onReset={resetDesign}
            />
          </div>
          <div className="workspace__result">
            <ResultPane
              output={output}
              settings={settings}
              generated={generated}
              onOutputChange={setOutputId}
              onSettingsChange={(next) => {
                setNamings((current) => ({ ...current, [target]: next.naming }))
                setStrings(next.strings)
              }}
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
