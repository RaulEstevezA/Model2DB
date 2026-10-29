import { useCallback, useEffect, useRef } from 'react'
import { reconcile } from '../core/design/edit.ts'
import { proposeDesign } from '../core/design/propose.ts'
import type { Design, StorageTarget } from '../core/design/types.ts'
import type { ModelSchema } from '../core/model/schema.ts'
import { useHistory, type History } from './useHistory.ts'

/** One design per kind of database, so going from PostgreSQL to MongoDB and back keeps the decisions. */
export type Designs = Record<StorageTarget, Design | null>
export const NO_DESIGNS: Designs = { relational: null, document: null }

export interface DesignsState {
  /** The design for the chosen kind of database, or null while there is no model */
  design: Design | null
  change: (design: Design) => void
  /** Back to the proposal, as a step that can be undone */
  reset: () => void
  /** Both designs, to save them in a project */
  all: Designs
  /** The next model is a different one: what was decided on this one does not carry over */
  startOver: () => void
  /** Designs saved in a project: they apply to the next model, kept wherever they still fit it */
  load: (designs: Designs) => void
  history: Pick<History<unknown>, 'canUndo' | 'canRedo' | 'undo' | 'redo'>
}

/** The designs of the current model, with undo and redo. A new proposal follows every change of the
 * model, keeping what the user decided wherever it still applies. */
export function useDesigns(schema: ModelSchema | null, target: StorageTarget, initial: Designs = NO_DESIGNS): DesignsState {
  // The first model starts from the saved designs, if any
  const history = useHistory<Designs>(initial)
  const lastSchema = useRef('')
  const presentRef = useRef(history.present)
  useEffect(() => {
    presentRef.current = history.present
  }, [history.present])
  useEffect(() => {
    const key = schema ? JSON.stringify(schema) : ''
    if (key === lastSchema.current) return
    lastSchema.current = key
    // While the model cannot be read (a typo being fixed) the designs stay, so the next model keeps the decisions
    if (!schema) return
    const previous = presentRef.current
    history.reset({
      relational: reconcile(previous.relational, schema, 'relational'),
      document: reconcile(previous.document, schema, 'document'),
    })
  }, [schema, history])

  const change = useCallback((next: Design) => history.push({ ...history.present, [next.target]: next }), [history])
  const reset = useCallback(() => {
    if (schema) history.push({ ...history.present, [target]: proposeDesign(schema, target) })
  }, [history, schema, target])
  const startOver = useCallback(() => {
    presentRef.current = NO_DESIGNS
  }, [])
  const load = useCallback((designs: Designs) => {
    presentRef.current = designs
    // Reconciled again even if the model is the same one
    lastSchema.current = ''
  }, [])

  return { design: schema ? history.present[target] : null, all: history.present, change, reset, startOver, load, history }
}
