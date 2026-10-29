import { decisionElementId, type PendingItem } from '../app/workspace.ts'
import { decide, setModelInclude, type DecisionRef } from '../core/design/edit.ts'
import type { Design } from '../core/design/types.ts'
import { allFields, type ModelSchema } from '../core/model/schema.ts'
import type { ModelRole } from '../core/physical/roles.ts'
import type { PhysicalSchema } from '../core/physical/types.ts'
import type { History } from '../hooks/useHistory.ts'
import { useI18n } from '../i18n/useI18n.ts'
import { DecisionControl } from './DecisionControl.tsx'
import { ModelCard } from './ModelCard.tsx'
import { Pane } from './Pane.tsx'
import './DesignPane.css'

interface DesignPaneProps {
  schema: ModelSchema | null
  design: Design | null
  roles: Map<string, ModelRole>
  physical: PhysicalSchema | null
  pending: PendingItem[]
  database: string
  excludable: Set<string>
  onChange: (design: Design) => void
  history: Pick<History<unknown>, 'canUndo' | 'canRedo' | 'undo' | 'redo'>
  onReset: () => void
}

/** The interpretation of the model as a database: every proposal, why it was made and how sure it is.
 * Nothing pending reaches the result until the user decides. */
export function DesignPane({
  schema,
  design,
  roles,
  physical,
  pending,
  database,
  excludable,
  onChange,
  history,
  onReset,
}: DesignPaneProps) {
  const { t } = useI18n()

  const subject = (ref: DecisionRef) => {
    switch (ref.kind) {
      case 'key':
        return t.subjects.key(ref.model)
      case 'unique':
        return t.subjects.unique(ref.model, ref.field)
      case 'enum':
        return t.subjects.enum(ref.enum)
      default:
        return t.subjects.field(ref.model, ref.field)
    }
  }

  const focusDecision = (ref: DecisionRef) => {
    const element = document.getElementById(decisionElementId(ref))
    if (!element) return
    element.scrollIntoView({ block: 'center' })
    // The control itself, so its name and state are read; the decision when it has a single option
    const control = element.querySelector<HTMLElement>('select, button') ?? element
    control.focus({ preventScroll: true })
  }

  const kind = design?.target ?? 'relational'
  const stored = schema && design ? schema.models.filter((model) => roles.get(model.name) === 'stored') : []
  const others = schema && design ? schema.models.filter((model) => roles.get(model.name) !== 'stored') : []
  const roleText = kind === 'relational' ? t.role : t.documentRole

  const footer = design ? (
    <p className={pending.length > 0 ? 'design__status design__status--pending' : 'design__status'} role="status">
      {t.designSummary(stored.length, kind)} · {pending.length > 0 ? t.pendingCount(pending.length) : t.allDecided}
    </p>
  ) : null

  return (
    <Pane
      title={t.designTitle}
      actions={
        <>
          <button type="button" className="button" onClick={history.undo} disabled={!history.canUndo} title={t.undoTitle}>
            {t.undo}
          </button>
          <button type="button" className="button" onClick={history.redo} disabled={!history.canRedo} title={t.redoTitle}>
            {t.redo}
          </button>
          <button
            type="button"
            className="button"
            disabled={!design}
            title={t.resetTitle}
            onClick={() => {
              if (window.confirm(t.confirmReset)) onReset()
            }}
          >
            {t.reset}
          </button>
        </>
      }
      footer={footer}
    >
      {!schema || !design ? (
        <p className="pane-empty">{t.designWaiting}</p>
      ) : (
        <div className="design">
          <p className="design__for">{t.designFor(database, kind)}</p>
          {pending.length > 0 && (
            <details className="design__review" open>
              <summary>{t.reviewSummary(pending.length)}</summary>
              <p>{t.reviewHelp}</p>
              <ul>
                {pending.map((item) => (
                  <li key={decisionElementId(item.ref)}>
                    <button type="button" className="design__review-link" onClick={() => focusDecision(item.ref)}>
                      {subject(item.ref)}
                    </button>
                    {' · '}
                    {item.decision.reasons.map((reason) => t.reason(reason)).join(' ')}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {stored.map((model) => {
            const item = design.models.find((other) => other.model === model.name)
            if (!item) return null
            return (
              <ModelCard
                key={model.name}
                design={design}
                model={item}
                fields={allFields(schema, model)}
                canExclude={excludable.has(model.name)}
                physical={physical}
                onChange={onChange}
              />
            )
          })}
          {design.enums.length > 0 && (
            <section className="design__section" aria-labelledby="design-enums">
              <h3 className="design__section-title" id="design-enums">
                {t.enumsTitle}
              </h3>
              <ul className="design__list">
                {design.enums.map((item) => (
                  <li key={item.enum} className="design__enum">
                    <span className="mono">{item.enum}</span>
                    <DecisionControl
                      id={decisionElementId({ kind: 'enum', enum: item.enum })}
                      subject={t.subjects.enum(item.enum)}
                      decision={item.storage}
                      optionLabel={(value) => t.enumOption[value]}
                      onChoose={(value) => onChange(decide(design, { kind: 'enum', enum: item.enum }, value))}
                      onAccept={() => onChange(decide(design, { kind: 'enum', enum: item.enum }))}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {others.length > 0 && (
            <section className="design__section" aria-labelledby="design-others">
              <h3 className="design__section-title" id="design-others">
                {kind === 'relational' ? t.otherModelsTitle : t.otherDocumentsTitle}
              </h3>
              <ul className="design__list">
                {others.map((model) => {
                  const role = roles.get(model.name) ?? 'unused'
                  const item = design.models.find((other) => other.model === model.name)
                  return (
                    <li key={model.name} className="design__other">
                      <span className="mono">{model.name}</span>
                      <span className="design__role">{roleText[role]}</span>
                      {item && excludable.has(model.name) && (role === 'excluded' || role === 'parent') && (
                        <label className="check">
                          <input type="checkbox" checked={false} onChange={() => onChange(setModelInclude(design, model.name, true))} />
                          {t.includeModel(model.name)}
                        </label>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </Pane>
  )
}
