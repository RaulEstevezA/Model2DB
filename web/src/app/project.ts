import { reconcile } from '../core/design/edit.ts'
import { readProject, type Model2DBProject, type ProjectDesigns } from '../core/interop/project.ts'
import { readInput, type InputState } from './workspace.ts'

// The work kept in this browser when the user asks for it (opt-in): never sent anywhere
export const WORKSPACE_KEY = 'model2db.workspace'
export const REMEMBER_KEY = 'model2db.remember'

/** The project kept in this browser, only while "Remember in this browser" is on. */
export function loadSaved(storage: Pick<Storage, 'getItem'>): Model2DBProject | null {
  try {
    if (JSON.parse(storage.getItem(REMEMBER_KEY) ?? 'false') !== true) return null
    const raw = storage.getItem(WORKSPACE_KEY)
    if (!raw) return null
    const read = readProject(raw)
    return read.ok ? read.project : null
  } catch {
    // Unavailable or damaged storage: start empty
    return null
  }
}

export function inputOfProject(project: Model2DBProject): InputState {
  const { format, text, fileName } = project.input
  return { text, format, ...(fileName ? { fileName } : {}) }
}

/** The saved designs fitted to the model the input reads now: what no longer applies is proposed again,
 * as when the input is edited. */
export function designsForInput(designs: ProjectDesigns, input: InputState): ProjectDesigns {
  const read = readInput(input)
  if (!read.outcome?.ok) return { relational: null, document: null }
  const schema = read.outcome.schema
  return { relational: reconcile(designs.relational, schema, 'relational'), document: reconcile(designs.document, schema, 'document') }
}
