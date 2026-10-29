import { useState } from 'react'
import { designsForInput, inputOfProject, loadSaved } from '../app/project.ts'
import { EMPTY_INPUT, type InputState } from '../app/workspace.ts'
import { NO_DESIGNS, type Designs } from './useDesigns.ts'
import { takeAtStart } from './useIncomingModel.ts'

export interface Startup {
  input: InputState
  designs: Designs
  /** Another tool sent the model, or the work kept in this browser was restored: the design is next */
  ready: boolean
  restored: boolean
}

/** What the page opens with: a model sent by another tool, the work kept in this browser (when the user
 * asked for it), or nothing. */
function startup(): Startup {
  const incoming = takeAtStart()
  if (incoming) return { input: incoming, designs: NO_DESIGNS, ready: true, restored: false }
  const saved = typeof localStorage === 'undefined' ? null : loadSaved(localStorage)
  if (!saved) return { input: EMPTY_INPUT, designs: NO_DESIGNS, ready: false, restored: false }
  const input = inputOfProject(saved)
  return { input, designs: designsForInput(saved.designs, input), ready: true, restored: true }
}

export function useStartup(): Startup {
  const [initial] = useState(startup)
  return initial
}
