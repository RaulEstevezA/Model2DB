import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { inputOfProject, REMEMBER_KEY, WORKSPACE_KEY } from './app/project.ts'
import { canExclude, pendingDecisions, readInput, type InputState } from './app/workspace.ts'
import { generate } from './core/generate/outputs.ts'
import { createProject, projectFileName, readProject, type Model2DBProject } from './core/interop/project.ts'
import { defaultRoot } from './core/model/schema.ts'
import { modelRoles } from './core/physical/roles.ts'
import { findExample, type ExampleId } from './examples/index.ts'
import { AppFooter } from './components/AppFooter.tsx'
import { AppHeader } from './components/AppHeader.tsx'
import { DesignPane } from './components/DesignPane.tsx'
import { InputPane } from './components/InputPane.tsx'
import { IntroPanel } from './components/IntroPanel.tsx'
import { LinksPanel } from './components/LinksPanel.tsx'
import { ProjectBar } from './components/ProjectBar.tsx'
import { ResultPane } from './components/ResultPane.tsx'
import { useDesigns } from './hooks/useDesigns.ts'
import { useIncomingMessages } from './hooks/useIncomingModel.ts'
import { useOutputSettings } from './hooks/useOutputSettings.ts'
import { useStartup } from './hooks/useStartup.ts'
import { useStoredState } from './hooks/useStoredState.ts'
import { useUndoShortcuts } from './hooks/useUndoShortcuts.ts'
import { useI18n } from './i18n/useI18n.ts'
import { downloadBlob } from './utils/download.ts'
import { onTabListKeyDown } from './utils/tabs.ts'
import './App.css'

type WorkspaceTab = 'input' | 'design' | 'result'
const TABS: WorkspaceTab[] = ['input', 'design', 'result']

function App() {
  const { t } = useI18n()
  const initial = useStartup()
  const [tab, setTab] = useState<WorkspaceTab>(initial.ready ? 'design' : 'input')
  const [input, setInput] = useState<InputState>(initial.input)
  const [message, setMessage] = useState<{ text: string; kind: 'ok' | 'error' } | null>(() =>
    initial.restored ? { text: t.restored, kind: 'ok' } : null,
  )
  const receive = useCallback((received: InputState) => {
    setInput(received)
    setTab('design')
  }, [])
  useIncomingMessages(receive)
  const { output, settings, setOutput, setSettings, project: outputProject, applyProject } = useOutputSettings()
  // A preference; the work itself is only kept while it is on
  const [remember, setRemember] = useStoredState(REMEMBER_KEY, () => false)
  const [hasSaved, setHasSaved] = useState(initial.restored)

  // Large inputs are parsed after the keystroke is painted, so typing stays smooth
  const deferredInput = useDeferredValue(input)
  const read = useMemo(() => readInput(deferredInput), [deferredInput])
  const schema = read.outcome?.ok ? read.outcome.schema : null

  const designs = useDesigns(schema, output.target, initial.designs)
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

  const hasWork = input.text.trim() !== ''
  const currentProject = useCallback(
    (): Model2DBProject | null =>
      hasWork ? createProject({ ...input, format: read.format ?? input.format }, designs.all, outputProject) : null,
    [hasWork, input, read.format, designs.all, outputProject],
  )

  // The browser's copy of the work, kept up to date while "remember" is on
  useEffect(() => {
    if (!remember) return
    const timer = setTimeout(() => {
      const project = currentProject()
      if (!project) return
      try {
        localStorage.setItem(WORKSPACE_KEY, JSON.stringify(project))
        setHasSaved(true)
      } catch {
        // Full or blocked storage: the work is simply not kept
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [remember, currentProject])

  function loadExample(id: ExampleId) {
    const example = findExample(id)
    if (!example) return
    if (hasWork && !window.confirm(t.confirmReplace)) return
    // A different model: the decisions made on the previous one do not apply
    designs.startOver()
    setInput({ text: example.text, format: example.format })
    setOutput(example.output)
    setMessage(null)
    setTab('design')
  }

  async function openProject(file: File) {
    try {
      const read = readProject(await file.text())
      if (!read.ok) {
        setMessage({ text: t.projectError(read.error, read.path), kind: 'error' })
        return
      }
      if (hasWork && !window.confirm(t.confirmReplace)) return
      designs.load(read.project.designs)
      setInput(inputOfProject(read.project))
      applyProject(read.project.output)
      setMessage({ text: t.projectLoaded(file.name), kind: 'ok' })
      setTab('design')
    } catch {
      setMessage({ text: t.fileError(file.name), kind: 'error' })
    }
  }

  function saveProject() {
    const project = currentProject()
    if (!project) return
    downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), projectFileName(title))
  }

  function clearSaved() {
    try {
      localStorage.removeItem(WORKSPACE_KEY)
    } catch {
      // Nothing to delete
    }
    setRemember(false)
    setHasSaved(false)
    setMessage({ text: t.savedCleared, kind: 'ok' })
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
        <ProjectBar
          canSave={hasWork}
          remember={remember}
          hasSaved={hasSaved}
          message={message}
          onSave={saveProject}
          onOpen={(file) => void openProject(file)}
          onRememberChange={setRemember}
          onClearSaved={clearSaved}
        />
        <div
          className="workspace__tabs"
          role="tablist"
          aria-label={t.workspaceTabs}
          onKeyDown={(event) => onTabListKeyDown(event, (index) => setTab(TABS[index]))}
        >
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              tabIndex={tab === id ? 0 : -1}
              className="workspace__tab"
              onClick={() => setTab(id)}
            >
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
