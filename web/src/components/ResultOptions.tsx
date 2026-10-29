import { DIALECT_NAMES } from '../core/generate/sql/sql.ts'
import type { Output, OutputSettings } from '../core/generate/outputs.ts'
import type { ColumnNaming, Dialect, TableNaming } from '../core/physical/types.ts'
import { useI18n } from '../i18n/useI18n.ts'

const TABLE_NAMINGS: TableNaming[] = ['plural', 'singular', 'model']
const COLUMN_NAMINGS: ColumnNaming[] = ['snake', 'field']
const STRINGS: OutputSettings['strings'][] = ['auto', 'varchar', 'text']

/** Settings of the result: the engine of an ORM, names, text type and migrations, as the output offers them. */
export function ResultOptions({
  output,
  settings,
  onChange,
}: {
  output: Output
  settings: OutputSettings
  onChange: (settings: OutputSettings) => void
}) {
  const { t } = useI18n()
  const relational = output.target === 'relational'
  return (
    <div className="result-pane__options">
      {output.target === 'relational' && output.engines && (
        <label className="field">
          <span>{t.engineLabel}</span>
          <select
            className="select"
            value={output.engines.includes(settings.engine) ? settings.engine : output.engines[0]}
            onChange={(event) => onChange({ ...settings, engine: event.target.value as Dialect })}
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
          onChange={(event) => onChange({ ...settings, naming: { ...settings.naming, tables: event.target.value as TableNaming } })}
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
          onChange={(event) => onChange({ ...settings, naming: { ...settings.naming, columns: event.target.value as ColumnNaming } })}
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
            onChange={(event) => onChange({ ...settings, strings: event.target.value as OutputSettings['strings'] })}
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
            onChange={(event) => onChange({ ...settings, migrations: event.target.checked })}
          />
          {t.includeMigration}
        </label>
      )}
    </div>
  )
}
