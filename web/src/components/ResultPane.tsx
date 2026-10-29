import type { LanguageSupport } from '@codemirror/language'
import { useEffect, useState } from 'react'
import { OUTPUT_GROUPS, OUTPUTS, type Generated, type Output, type OutputSettings } from '../core/generate/outputs.ts'
import { DIALECT_NAMES } from '../core/generate/sql.ts'
import type { ColumnNaming, Dialect, TableNaming } from '../core/physical/types.ts'
import { useI18n } from '../i18n/useI18n.ts'
import { downloadBlob } from '../utils/download.ts'
import { editorLanguage } from '../utils/editorLanguages.ts'
import { createZip } from '../utils/zip.ts'
import { CodeEditor } from './CodeEditor.tsx'
import { Pane } from './Pane.tsx'
import './ResultPane.css'

const TABLE_NAMINGS: TableNaming[] = ['plural', 'singular', 'model']
const COLUMN_NAMINGS: ColumnNaming[] = ['snake', 'field']
const STRINGS: OutputSettings['strings'][] = ['auto', 'varchar', 'text']

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
  const [selected, setSelected] = useState(0)
  const files = generated?.files ?? []
  const file = files[Math.min(selected, files.length - 1)] ?? null
  const fileLanguage = file?.editorLanguage ?? 'text'
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
    void editorLanguage(fileLanguage).then((loaded) => {
      if (active) setLanguage(loaded)
    })
    return () => {
      active = false
    }
  }, [fileLanguage])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    if (!file) return
    try {
      await navigator.clipboard.writeText(file.content)
      setCopied(true)
    } catch {
      // Clipboard blocked (permissions, insecure context): the code can still be selected by hand
    }
  }

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
            <button type="button" className="button" onClick={() => void copy()} disabled={!file}>
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
        <div className="result-pane__options">
          {output.target === 'relational' && output.engines && (
            <label className="field">
              <span>{t.engineLabel}</span>
              <select
                className="select"
                value={output.engines.includes(settings.engine) ? settings.engine : output.engines[0]}
                onChange={(event) => onSettingsChange({ ...settings, engine: event.target.value as Dialect })}
              >
                {output.engines.map((item) => (
                  <option key={item} value={item}>
                    {DIALECT_NAMES[item]}
                  </option>
                ))}
              </select>
            </label>
          )}
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
          {output.migrations && (
            <label className="check result-pane__check">
              <input
                type="checkbox"
                checked={settings.migrations}
                onChange={(event) => onSettingsChange({ ...settings, migrations: event.target.checked })}
              />
              {t.includeMigration}
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
        {files.length > 1 && (
          <div className="result-pane__files" role="tablist" aria-label={t.filesLabel}>
            {files.map((item, index) => (
              <button
                key={item.name}
                type="button"
                role="tab"
                aria-selected={item === file}
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
