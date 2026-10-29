import { useState } from 'react'
import { decisionElementId } from '../app/workspace.ts'
import { decide, setModelInclude, setTableName, type DecisionRef } from '../core/design/edit.ts'
import type { Design, ModelDesign } from '../core/design/types.ts'
import type { FieldDef } from '../core/model/schema.ts'
import type { PhysicalSchema } from '../core/physical/types.ts'
import { useI18n } from '../i18n/useI18n.ts'
import { CommitInput } from './CommitInput.tsx'
import { DecisionControl } from './DecisionControl.tsx'
import { FieldRow } from './FieldRow.tsx'

interface ModelCardProps {
  design: Design
  model: ModelDesign
  fields: FieldDef[]
  /** The model may be left out (no other model uses it) */
  canExclude: boolean
  physical: PhysicalSchema | null
  onChange: (design: Design) => void
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
