import { decisionElementId } from '../app/workspace.ts'
import { setFieldIndex, setFieldInclude, setFieldOverride, type DecisionRef } from '../core/design/edit.ts'
import type { Design, FieldDesign } from '../core/design/types.ts'
import { describeType, type FieldDef, type TypeRef } from '../core/model/schema.ts'
import type { Table } from '../core/physical/types.ts'
import { useI18n } from '../i18n/useI18n.ts'
import type { RelationShape } from '../i18n/messages.ts'
import { CommitInput } from './CommitInput.tsx'
import { DecisionControl } from './DecisionControl.tsx'

function shapeOf(type: TypeRef): RelationShape {
  if (type.kind === 'model') return 'model'
  if (type.kind === 'map') return 'map'
  if (type.kind === 'array') return type.items.kind === 'model' ? 'models' : 'values'
  return 'free'
}

export interface FieldRowProps {
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

export function FieldRow({ design, model, field, decided, isKey, table, editing, onEdit, onChange, choose }: FieldRowProps) {
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
