import type { LanguageSupport } from '@codemirror/language'
import { useEffect, useState } from 'react'
import { OUTPUTS, type Generated, type Output, type OutputGroup, type OutputSettings } from '../core/generate/outputs.ts'
import type { ColumnNaming, TableNaming } from '../core/physical/types.ts'
import { useI18n } from '../i18n/useI18n.ts'
import { downloadBlob } from '../utils/download.ts'
import { editorLanguage } from '../utils/editorLanguages.ts'
import { CodeEditor } from './CodeEditor.tsx'
import { Pane } from './Pane.tsx'
import './ResultPane.css'

const TABLE_NAMINGS: TableNaming[] = ['plural', 'singular', 'model']
const COLUMN_NAMINGS: ColumnNaming[] = ['snake', 'field']
const STRINGS: OutputSettings['strings'][] = ['auto', 'varchar', 'text']
const OUTPUT_GROUPS: OutputGroup[] = ['relational', 'document']

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
  const [copied, setCopied] = useState(false)
  const [language, setLanguage] = useState<LanguageSupport | null>(null)
  const relational = output.target === 'relational'
  const physical = generated?.physical
  const todos = physical
    ? physical.kind === 'relational'
      ? physical.tables.reduce((total, table) => total + table.todos.length, 0)
      : physical.collections.reduce((total, collection) => total + collection.todos.length, 0)
    : 0
  const notes = physical?.notes ?? []

  useEffect(() => {
    let active = true
    void editorLanguage(output.editorLanguage).then((loaded) => {
      if (active) setLanguage(loaded)
    })
    return () => {
      active = false
    }
  }, [output.editorLanguage])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    if (!generated) return
    try {
      await navigator.clipboard.writeText(generated.content)
      setCopied(true)
    } catch {
      // Clipboard blocked (permissions, insecure context): the code can still be selected by hand
    }
  }

  function download() {
    if (generated) downloadBlob(new Blob([generated.content], { type: 'text/plain;charset=utf-8' }), generated.fileName)
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
            {generated && <span className="mono">{generated.fileName}</span>}
            {todos > 0 && <span className="result-pane__todos">{t.pendingInResult(todos)}</span>}
          </p>
          <div className="actions">
            <button type="button" className="button" onClick={() => void copy()} disabled={!generated}>
              {copied ? t.copied : t.copy}
            </button>
            <button type="button" className="button button--primary" onClick={download} disabled={!generated}>
              {t.download}
            </button>
          </div>
        </div>
      }
    >
      <div className="result-pane__body">
        <div className="result-pane__options">
          <label className="field">
            <span>{relational ? t.tablesNaming : t.collectionsNaming}</span>
            <select
              className="select"
              value={settings.naming.tables}
              onChange={(event) =>
                onSettingsChange({ ...settings, naming: { ...settings.naming, tables: event.target.value as TableNaming } })
              }
            >
              {TABLE_NAMINGS.map((item) => (
                <option key={item} value={item}>
                  {(relational ? t.tablesNamingOption : t.collectionsNamingOption)[item]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{relational ? t.columnsNaming : t.propertiesNaming}</span>
            <select
              className="select"
              value={settings.naming.columns}
              onChange={(event) =>
                onSettingsChange({ ...settings, naming: { ...settings.naming, columns: event.target.value as ColumnNaming } })
              }
            >
              {COLUMN_NAMINGS.map((item) => (
                <option key={item} value={item}>
                  {t.columnsNamingOption[item]}
                </option>
              ))}
            </select>
          </label>
          {relational && (
            <label className="field">
              <span>{t.stringsLabel}</span>
              <select
                className="select"
                value={settings.strings}
                onChange={(event) => onSettingsChange({ ...settings, strings: event.target.value as OutputSettings['strings'] })}
              >
                {STRINGS.map((item) => (
                  <option key={item} value={item}>
                    {t.stringsOption[item]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
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
        <div className="result-pane__editor">
          <CodeEditor
            value={generated?.content ?? ''}
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
