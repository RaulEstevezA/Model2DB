import { sameValue, type Decision } from '../core/design/types.ts'
import { useI18n } from '../i18n/useI18n.ts'
import { ConfidenceBadge } from './ConfidenceBadge.tsx'

interface DecisionControlProps<T> {
  /** Element id, so the review list can take the focus here */
  id: string
  /** What the decision is about, for the select's name and the accept button: “Order.customer” */
  subject: string
  decision: Decision<T>
  optionLabel: (value: T) => string
  onChoose: (value: T) => void
  onAccept: () => void
}

/** One decision: the chosen or suggested option, its state in text and color, and why it was proposed.
 * A pending decision offers to accept the suggestion as it is, or to choose another option. */
export function DecisionControl<T>({ id, subject, decision, optionLabel, onChoose, onAccept }: DecisionControlProps<T>) {
  const { t } = useI18n()
  const pending = decision.status === 'pending'
  const index = Math.max(
    0,
    decision.options.findIndex((option) => sameValue(option, decision.value)),
  )
  const why = decision.manual ? t.reason({ code: 'manual' }) : decision.reasons.map((reason) => t.reason(reason)).join(' ')

  return (
    <div className={`decision${pending ? ' decision--pending' : ''}`} id={id} tabIndex={-1}>
      <div className="decision__row">
        {decision.options.length > 1 ? (
          <select
            className="select decision__select"
            aria-label={subject}
            aria-describedby={`${id}-why`}
            value={index}
            onChange={(event) => onChoose(decision.options[Number(event.target.value)])}
          >
            {decision.options.map((option, i) => (
              <option key={i} value={i}>
                {optionLabel(option)}
              </option>
            ))}
          </select>
        ) : (
          <span className="decision__value">{optionLabel(decision.value)}</span>
        )}
        <ConfidenceBadge confidence={decision.manual ? 'manual' : decision.confidence} />
        {pending && (
          <button
            type="button"
            className="button button--small"
            title={t.acceptTitle(subject)}
            aria-label={t.acceptTitle(subject)}
            onClick={() => onAccept()}
          >
            {t.accept}
          </button>
        )}
      </div>
      <p className="decision__why" id={`${id}-why`}>
        {why}
      </p>
    </div>
  )
}
