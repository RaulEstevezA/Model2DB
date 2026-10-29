import type { Confidence } from '../core/design/types.ts'
import { useI18n } from '../i18n/useI18n.ts'

const VARIANT: Record<Confidence | 'manual', string> = {
  exact: 'badge--success',
  high: 'badge--success',
  probable: 'badge--accent',
  review: 'badge--warning',
  conflict: 'badge--warning',
  none: '',
  manual: 'badge--accent',
}

/** State of a decision as text with a color (patterns/confidence-states.md): never color alone. */
export function ConfidenceBadge({ confidence, title }: { confidence: Confidence | 'manual'; title?: string }) {
  const { t } = useI18n()
  return (
    <span className={`badge ${VARIANT[confidence]}`} title={title}>
      {t.status[confidence]}
    </span>
  )
}
