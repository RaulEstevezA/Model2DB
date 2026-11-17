import { useId, useState } from 'react'
import { decisionElementId } from '../app/workspace.ts'
import { acceptQuery, addQuery, removeQuery, setQuery } from '../core/design/edit.ts'
import { describeQuery, queryableFields } from '../core/design/queries.ts'
import type { Design, ModelDesign, QueryDesign, QuerySort } from '../core/design/types.ts'
import type { FieldDef } from '../core/model/schema.ts'
import type { Index } from '../core/physical/types.ts'
import { useI18n } from '../i18n/useI18n.ts'
import { ConfidenceBadge } from './ConfidenceBadge.tsx'

interface QueryListProps {
  design: Design
  model: ModelDesign
  fields: FieldDef[]
  /** Indexes of the model's table or collection, to show which one each query turned into */
  indexes: Index[]
  onChange: (design: Design) => void
}

/** How the application reads a model, which decides its indexes. A proposed query waits for the user
 * like any other decision; the user can also write, change and remove them. */
export function QueryList({ design, model, fields, indexes, onChange }: QueryListProps) {
  const { t } = useI18n()
  const titleId = useId()
  // The query being edited, or 'new' for one being written
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const queries = model.queries ?? []
  const queryable = queryableFields(fields, model.fields)
  const indexOf = (query: QueryDesign) => indexes.find((index) => index.query === `${model.model} ${describeQuery(query)}`)

  return (
    <section className="queries" aria-labelledby={titleId}>
      <h4 className="queries__title" id={titleId}>
        {t.queriesTitle}
      </h4>
      <p className="field__hint">{t.queriesHelp}</p>
      {queries.length === 0 && editing !== 'new' && <p className="queries__empty">{t.noQueries}</p>}
      {queries.length > 0 && (
        <ul className="queries__list">
          {queries.map((query, position) => {
            const text = t.queryText(query)
            const subject = t.subjects.query(model.model, text)
            const pending = query.status === 'pending'
            const index = indexOf(query)
            const id = decisionElementId({ kind: 'query', model: model.model, index: position })
            return (
              <li key={position} id={id} tabIndex={-1} className={`decision${pending ? ' decision--pending' : ''}`} aria-label={subject}>
                {editing === position ? (
                  <QueryEditor
                    fields={queryable}
                    initial={query}
                    onSave={(filter, sort) => {
                      onChange(setQuery(design, model.model, position, filter, sort))
                      setEditing(null)
                    }}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <>
                    <div className="decision__row">
                      <span className="decision__value mono">{text}</span>
                      <ConfidenceBadge confidence={pending ? 'review' : 'manual'} />
                      {pending && (
                        <button
                          type="button"
                          className="button button--small"
                          aria-label={t.acceptTitle(subject)}
                          title={t.acceptTitle(subject)}
                          onClick={() => {
                            onChange(acceptQuery(design, model.model, position))
                            document.getElementById(id)?.focus()
                          }}
                        >
                          {t.accept}
                        </button>
                      )}
                      <button
                        type="button"
                        className="button button--small"
                        aria-label={t.editQuery(text)}
                        onClick={() => setEditing(position)}
                      >
                        {t.edit}
                      </button>
                      <button
                        type="button"
                        className="button button--small"
                        aria-label={t.removeQuery(text)}
                        onClick={() => {
                          onChange(removeQuery(design, model.model, position))
                          setEditing(null)
                        }}
                      >
                        {t.remove}
                      </button>
                    </div>
                    {pending && query.reasons.length > 0 && (
                      <p className="decision__why">{query.reasons.map((reason) => t.reason(reason)).join(' ')}</p>
                    )}
                    {!pending && index && (
                      <p className="decision__why">
                        {t.queryIndex}: <span className="mono">{index.name}</span>
                      </p>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {editing === 'new' ? (
        <QueryEditor
          fields={queryable}
          initial={{ filter: [], sort: [] }}
          onSave={(filter, sort) => {
            onChange(addQuery(design, model.model, filter, sort))
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        queryable.length > 0 && (
          <div>
            <button type="button" className="button button--small" onClick={() => setEditing('new')}>
              {t.addQuery}
            </button>
          </div>
        )
      )}
    </section>
  )
}

interface QueryEditorProps {
  fields: string[]
  initial: Pick<QueryDesign, 'filter' | 'sort'>
  onSave: (filter: string[], sort: QuerySort[]) => void
  onCancel: () => void
}

/** The fields a query filters by, then the ones it orders by, each with its direction. */
function QueryEditor({ fields, initial, onSave, onCancel }: QueryEditorProps) {
  const { t } = useI18n()
  const hintId = useId()
  const [filter, setFilter] = useState(initial.filter.filter((field) => fields.includes(field)))
  const [sort, setSort] = useState(initial.sort.filter((item) => fields.includes(item.field)))
  const sortable = fields.filter((field) => !filter.includes(field))
  const free = sortable.filter((field) => !sort.some((item) => item.field === field))
  const empty = filter.length + sort.length === 0
  const changeSort = (position: number, change: Partial<QuerySort>) =>
    setSort(sort.map((item, i) => (i === position ? { ...item, ...change } : item)))

  return (
    <div className="query-editor">
      <fieldset className="query-editor__group">
        <legend className="query-editor__legend">{t.filterBy}</legend>
        <div className="query-editor__checks">
          {fields.map((field) => (
            <label key={field} className="check mono">
              <input
                type="checkbox"
                checked={filter.includes(field)}
                onChange={(event) => {
                  setFilter(event.target.checked ? [...filter, field] : filter.filter((item) => item !== field))
                  if (event.target.checked) setSort(sort.filter((item) => item.field !== field))
                }}
              />
              {field}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="query-editor__group">
        <legend className="query-editor__legend">{t.sortBy}</legend>
        {sort.map((item, position) => (
          <div key={position} className="query-editor__sort">
            <select
              className="select mono"
              aria-label={t.sortField(position + 1)}
              value={item.field}
              onChange={(event) => changeSort(position, { field: event.target.value })}
            >
              {[item.field, ...free].map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </select>
            <select
              className="select"
              aria-label={t.sortDirection(position + 1)}
              value={item.direction}
              onChange={(event) => changeSort(position, { direction: event.target.value as QuerySort['direction'] })}
            >
              <option value="asc">{t.ascending}</option>
              <option value="desc">{t.descending}</option>
            </select>
            <button
              type="button"
              className="button button--small"
              aria-label={t.removeSort(item.field)}
              onClick={() => setSort(sort.filter((_, i) => i !== position))}
            >
              {t.remove}
            </button>
          </div>
        ))}
        {free.length > 0 && (
          <div>
            <button type="button" className="button button--small" onClick={() => setSort([...sort, { field: free[0], direction: 'asc' }])}>
              {t.addSort}
            </button>
          </div>
        )}
      </fieldset>
      {empty && (
        <p className="field__hint" id={hintId}>
          {t.queryEmpty}
        </p>
      )}
      <div className="actions">
        <button
          type="button"
          className="button button--small button--primary"
          disabled={empty}
          aria-describedby={empty ? hintId : undefined}
          onClick={() => onSave(filter, sort)}
        >
          {t.saveQuery}
        </button>
        <button type="button" className="button button--small" onClick={onCancel}>
          {t.cancel}
        </button>
      </div>
    </div>
  )
}
