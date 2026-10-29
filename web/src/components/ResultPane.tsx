import type { LanguageSupport } from '@codemirror/language'
import { useEffect, useState } from 'react'
import { OUTPUT_GROUPS, OUTPUTS, type Generated, type Output, type OutputSettings } from '../core/generate/outputs.ts'
import { useI18n } from '../i18n/useI18n.ts'
import { downloadBlob } from '../utils/download.ts'
import { editorLanguage } from '../utils/editorLanguages.ts'
import { createZip } from '../utils/zip.ts'
import { useCopy } from '../hooks/useCopy.ts'
import { CodeEditor } from './CodeEditor.tsx'
import { ResultOptions } from './ResultOptions.tsx'
import { Pane } from './Pane.tsx'
import { onTabListKeyDown } from '../utils/tabs.ts'
import './ResultPane.css'

interface ResultPaneProps {
  output: Output
  settings: OutputSettings
  generated: Generated | null
  onOutputChange: (id: string) => void
  onSettingsChange: (settings: OutputSettings) => void
}

/** The schema for the chosen database, always up to date with the design. */
export function ResultPane({ output, settings, generated, onOutputChange, onSettingsChange }: ResultPaneProps) {
  const { t } = useI18n()
  const { copied, copy } = useCopy()
  const [language, setLanguage] = useState<LanguageSupport | null>(null)
  const [selected, setSelected] = useState(0)
  const files = generated?.files ?? []
  const file = files[Math.min(selected, files.length - 1)] ?? null
  const fileLanguage = file?.editorLanguage ?? 'text'
  const physical = generated?.physical
  const todos = physical
    ? physical.kind === 'relational'
      ? physical.tables.reduce((total, table) => total + table.todos.length, 0)
      : physical.collections.reduce((total, collection) => total + collection.todos.length, 0)
    : 0
  const notes = physical?.notes ?? []

  useEffect(() => {
    let active = true
    void editorLanguage(fileLanguage).then((loaded) => {
      if (active) setLanguage(loaded)
    })
    return () => {
      active = false
    }
  }, [fileLanguage])

  function download() {
    if (!generated) return
    if (files.length === 1) downloadBlob(new Blob([files[0].content], { type: 'text/plain;charset=utf-8' }), files[0].name)
    else if (files.length > 1)
      downloadBlob(
        new Blob([createZip(files.map(({ name, content }) => ({ name, content })))], { type: 'application/zip' }),
        generated.archiveName,
      )
  }

  return (
    <Pane
      title={t.resultTitle}
      actions={
        <label className="result-pane__database">
          <span className="visually-hidden">{t.databaseLabel}</span>
          <select className="select" value={output.id} onChange={(event) => onOutputChange(event.target.value)}>
            {OUTPUT_GROUPS.map((group) => (
              <optgroup key={group} label={t.outputGroups[group]}>
                {OUTPUTS.filter((item) => item.group === group).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      }
      footer={
        <div className="result-pane__footer">
          <p className="result-pane__file">
            {file && <span className="mono">{file.name}</span>}
            {todos > 0 && <span className="result-pane__todos">{t.pendingInResult(todos)}</span>}
          </p>
          <div className="actions">
            <button type="button" className="button" onClick={() => file && void copy(file.content)} disabled={!file}>
              {copied ? t.copied : t.copy}
            </button>
            <button type="button" className="button button--primary" onClick={download} disabled={!file}>
              {files.length > 1 ? t.downloadZip(files.length) : t.download}
            </button>
          </div>
        </div>
      }
    >
      <div className="result-pane__body">
        <ResultOptions output={output} settings={settings} onChange={onSettingsChange} />
        {notes.length > 0 && (
          <details className="result-pane__notes">
            <summary>{t.notesCount(notes.length)}</summary>
            <ul>
              {notes.map((note, i) => (
                <li key={i}>{t.note(note)}</li>
              ))}
            </ul>
          </details>
        )}
        {files.length > 1 && (
          <div
            className="result-pane__files"
            role="tablist"
            aria-label={t.filesLabel}
            onKeyDown={(event) => onTabListKeyDown(event, setSelected)}
          >
            {files.map((item, index) => (
              <button
                key={item.name}
                type="button"
                role="tab"
                aria-selected={item === file}
                tabIndex={item === file ? 0 : -1}
                className="result-pane__file-tab"
                onClick={() => setSelected(index)}
              >
                {item.name}
              </button>
            ))}
          </div>
        )}
        <div className="result-pane__editor">
          <CodeEditor
            value={file?.content ?? ''}
            language={language}
            readOnly
            label={t.resultLabel(output.label)}
            placeholder={t.resultEmpty}
          />
        </div>
      </div>
    </Pane>
  )
}
