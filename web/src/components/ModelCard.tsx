import { useState, type KeyboardEvent } from 'react'
import { decisionElementId } from '../app/workspace.ts'
import {
  decide,
  setFieldIndex,
  setFieldInclude,
  setFieldOverride,
  setModelInclude,
  setTableName,
  type DecisionRef,
} from '../core/design/edit.ts'
import type { Design, FieldDesign, ModelDesign } from '../core/design/types.ts'
import { describeType, type FieldDef, type TypeRef } from '../core/model/schema.ts'
import type { PhysicalSchema, Table } from '../core/physical/types.ts'
import { useI18n } from '../i18n/useI18n.ts'
import type { RelationShape } from '../i18n/messages.ts'
import { DecisionControl } from './DecisionControl.tsx'

interface ModelCardProps {
  design: Design
  model: ModelDesign
  fields: FieldDef[]
  /** The model may be left out (no other model uses it) */
  canExclude: boolean
  physical: PhysicalSchema | null
  onChange: (design: Design) => void
}

function shapeOf(type: TypeRef): RelationShape {
  if (type.kind === 'model') return 'model'
  if (type.kind === 'map') return 'map'
  if (type.kind === 'array') return type.items.kind === 'model' ? 'models' : 'values'
  return 'free'
}

/** A text field that applies its value when it loses the focus or on Enter, so typing a name is one step
 * in the history, not one per letter. */
function CommitInput({
  label,
  value,
  placeholder,
  onCommit,
  mono = true,
}: {
  label: string
  value: string
  placeholder: string
  onCommit: (value: string) => void
  mono?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  const shown = editing ? draft : value
  const commit = () => {
    setEditing(false)
    if (draft.trim() !== value) onCommit(draft)
  }
  return (
    <label className="field">
      <span>{label}</span>
      <input
        className={`input${mono ? ' input--mono' : ''}`}
        type="text"
        value={shown}
        placeholder={placeholder}
        spellCheck={false}
        onFocus={() => {
          setDraft(value)
          setEditing(true)
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
        }}
      />
    </label>
  )
}

/** The table (or collection) of a stored model: its key, and how each field is kept. */
export function ModelCard({ design, model, fields, canExclude, physical, onChange }: ModelCardProps) {
  const { t } = useI18n()
  const [editing, setEditing] = useState<string | null>(null)
  const relational = design.target === 'relational'
  const table =
    physical?.kind === 'relational' ? physical.tables.find((item) => item.kind === 'entity' && item.model === model.model) : undefined
  const collection = physical?.kind === 'document' ? physical.collections.find((item) => item.model === model.model) : undefined
  const tableName = table?.name ?? collection?.name ?? ''
  const titleId = `model-${model.model}`
  const choose = (ref: DecisionRef) => (value?: unknown) => onChange(decide(design, ref, value))
  const keyField = model.key?.status === 'active' && model.key.value.kind === 'field' ? model.key.value.field : null

  return (
    <section className="model-card" aria-labelledby={titleId}>
      <header className="model-card__header">
        <h3 className="model-card__title" id={titleId}>
          <span className="mono">{model.model}</span>
          {tableName && (
            <>
              <span className="model-card__arrow" aria-hidden="true">
                →
              </span>
              <span className="mono model-card__table">{tableName}</span>
            </>
          )}
        </h3>
        <div className="model-card__actions">
          {canExclude && (
            <label className="check">
              <input
                type="checkbox"
                checked={model.include}
                onChange={(event) => onChange(setModelInclude(design, model.model, event.target.checked))}
              />
              {t.includeModel(model.model)}
            </label>
          )}
          <button
            type="button"
            className="button button--small"
            aria-expanded={editing === ''}
            aria-label={t.editTitle(model.model)}
            onClick={() => setEditing(editing === '' ? null : '')}
          >
            {t.edit}
          </button>
        </div>
      </header>
      {editing === '' && (
        <div className="model-card__editor">
          <CommitInput
            label={relational ? t.tableName : t.collectionName}
            value={model.table ?? ''}
            placeholder={tableName}
            onCommit={(value) => onChange(setTableName(design, model.model, value))}
          />
        </div>
      )}
      {model.key && (
        <div className="model-card__key">
          <span className="model-card__label">{relational ? t.key : t.documentKey}</span>
          <DecisionControl
            id={decisionElementId({ kind: 'key', model: model.model })}
            subject={t.subjects.key(model.model)}
            decision={model.key}
            optionLabel={t.keyOption}
            onChoose={choose({ kind: 'key', model: model.model })}
            onAccept={choose({ kind: 'key', model: model.model })}
          />
        </div>
      )}
      <ul className="field-list">
        {fields.map((field) => {
          const decided = model.fields.find((item) => item.field === field.name)
          if (!decided) return null
          return (
            <FieldRow
              key={field.name}
              design={design}
              model={model.model}
              field={field}
              decided={decided}
              isKey={field.name === keyField}
              table={table}
              editing={editing === field.name}
              onEdit={() => setEditing(editing === field.name ? null : field.name)}
              onChange={onChange}
              choose={choose}
            />
          )
        })}
      </ul>
    </section>
  )
}

interface FieldRowProps {
  design: Design
  model: string
  field: FieldDef
  decided: FieldDesign
  isKey: boolean
  table: Table | undefined
  editing: boolean
  onEdit: () => void
  onChange: (design: Design) => void
  choose: (ref: DecisionRef) => (value?: unknown) => void
}

function FieldRow({ design, model, field, decided, isKey, table, editing, onEdit, onChange, choose }: FieldRowProps) {
  const { t } = useI18n()
  const relational = design.target === 'relational'
  const shape = shapeOf(field.type)
  const columns = table?.columns.filter((column) => column.source === `${model}.${field.name}`) ?? []
  const derivedColumn = columns[0]?.name ?? ''
  const relationLabel = (value: unknown) =>
    !relational && value === 'reference' ? t.documentReference(shape === 'models') : t.relationOption(value as never, shape)

  return (
    <li className={`field-row${decided.include ? '' : ' field-row--excluded'}`}>
      <div className="field-row__head">
        <span className="field-row__name mono">{field.name}</span>
        <span className="field-row__type mono">{field.originalType ?? describeType(field.type)}</span>
        {!decided.include ? (
          <span className="badge">{t.notStored}</span>
        ) : (
          <>
            {derivedColumn && !decided.relation && (
              <span className="field-row__column mono">
                <span aria-hidden="true">→ </span>
                {derivedColumn}
              </span>
            )}
            {isKey && <span className="badge">{t.primaryKey}</span>}
          </>
        )}
        <button
          type="button"
          className="button button--small field-row__edit"
          aria-expanded={editing}
          aria-label={t.editTitle(`${model}.${field.name}`)}
          onClick={onEdit}
        >
          {t.edit}
        </button>
      </div>
      {decided.include && decided.relation && (
        <DecisionControl
          id={decisionElementId({ kind: 'relation', model, field: field.name })}
          subject={t.subjects.field(model, field.name)}
          decision={decided.relation}
          optionLabel={relationLabel}
          onChoose={choose({ kind: 'relation', model, field: field.name })}
          onAccept={choose({ kind: 'relation', model, field: field.name })}
        />
      )}
      {decided.include && decided.foreignKey && (
        <DecisionControl
          id={decisionElementId({ kind: 'foreignKey', model, field: field.name })}
          subject={t.subjects.field(model, field.name)}
          decision={decided.foreignKey}
          optionLabel={t.foreignKeyOption}
          onChoose={choose({ kind: 'foreignKey', model, field: field.name })}
          onAccept={choose({ kind: 'foreignKey', model, field: field.name })}
        />
      )}
      {decided.include && decided.unique && (
        <DecisionControl
          id={decisionElementId({ kind: 'unique', model, field: field.name })}
          subject={t.subjects.unique(model, field.name)}
          decision={decided.unique}
          optionLabel={t.uniqueOption}
          onChoose={choose({ kind: 'unique', model, field: field.name })}
          onAccept={choose({ kind: 'unique', model, field: field.name })}
        />
      )}
      {editing && (
        <div className="field-row__editor">
          <label className="check">
            <input
              type="checkbox"
              checked={decided.include}
              onChange={(event) => onChange(setFieldInclude(design, model, field.name, event.target.checked))}
            />
            {t.includeField}
          </label>
          {decided.include && (
            <div className="field-row__inputs">
              <CommitInput
                label={relational ? t.columnName : t.propertyName}
                value={decided.column ?? ''}
                placeholder={derivedColumn || field.name}
                onCommit={(value) => onChange(setFieldOverride(design, model, field.name, 'column', value))}
              />
              {relational && !decided.relation && (
                <CommitInput
                  label={t.columnType}
                  value={decided.type ?? ''}
                  placeholder={t.derived}
                  onCommit={(value) => onChange(setFieldOverride(design, model, field.name, 'type', value))}
                />
              )}
            </div>
          )}
          {decided.include && relational && !decided.relation && <p className="field__hint">{t.columnTypeHelp}</p>}
          {decided.include && !isKey && !decided.relation && (
            <label className="check">
              <input
                type="checkbox"
                checked={decided.index === true}
                onChange={(event) => onChange(setFieldIndex(design, model, field.name, event.target.checked))}
              />
              {t.addIndex}
            </label>
          )}
        </div>
      )}
    </li>
  )
}
