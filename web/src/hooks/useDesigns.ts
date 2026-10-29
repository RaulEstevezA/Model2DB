import { useCallback, useEffect, useRef } from 'react'
import { reconcile } from '../core/design/edit.ts'
import { proposeDesign } from '../core/design/propose.ts'
import type { Design, StorageTarget } from '../core/design/types.ts'
import type { ModelSchema } from '../core/model/schema.ts'
import { useHistory, type History } from './useHistory.ts'

/** One design per kind of database, so going from PostgreSQL to MongoDB and back keeps the decisions. */
type Designs = Record<StorageTarget, Design | null>
const NO_DESIGNS: Designs = { relational: null, document: null }

export interface DesignsState {
  /** The design for the chosen kind of database, or null while there is no model */
  design: Design | null
  change: (design: Design) => void
  /** Back to the proposal, as a step that can be undone */
  reset: () => void
  /** The next model is a different one: what was decided on this one does not carry over */
  startOver: () => void
  history: Pick<History<unknown>, 'canUndo' | 'canRedo' | 'undo' | 'redo'>
}

/** The designs of the current model, with undo and redo. A new proposal follows every change of the
 * model, keeping what the user decided wherever it still applies. */
export function useDesigns(schema: ModelSchema | null, target: StorageTarget): DesignsState {
  const history = useHistory<Designs>(NO_DESIGNS)
  const lastSchema = useRef('')
  const presentRef = useRef(history.present)
  useEffect(() => {
    presentRef.current = history.present
  }, [history.present])
  useEffect(() => {
    const key = schema ? JSON.stringify(schema) : ''
    if (key === lastSchema.current) return
    lastSchema.current = key
    const previous = presentRef.current
    history.reset(
      schema
        ? { relational: reconcile(previous.relational, schema, 'relational'), document: reconcile(previous.document, schema, 'document') }
        : NO_DESIGNS,
    )
  }, [schema, history])

  const change = useCallback((next: Design) => history.push({ ...history.present, [next.target]: next }), [history])
  const reset = useCallback(() => {
    if (schema) history.push({ ...history.present, [target]: proposeDesign(schema, target) })
  }, [history, schema, target])
  const startOver = useCallback(() => {
    presentRef.current = NO_DESIGNS
  }, [])

  return { design: schema ? history.present[target] : null, change, reset, startOver, history }
}
