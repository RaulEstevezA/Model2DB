import { useEffect, useRef } from 'react'
import { inputFromHandoff } from '../app/handoff.ts'
import type { InputState } from '../app/workspace.ts'
import { isTrustedOrigin, readHandoff, takeIncoming } from '../core/interop/handoff.ts'

let incomingAtStart: InputState | null | undefined

/** The model left in sessionStorage by another tool before the page opened. Read once per page: the
 * handoff is removed as soon as it is read. */
export function takeAtStart(): InputState | null {
  if (incomingAtStart === undefined) {
    const handoff = typeof sessionStorage === 'undefined' ? null : takeIncoming(sessionStorage, 'model2db')
    incomingAtStart = handoff ? inputFromHandoff(handoff) : null
  }
  return incomingAtStart
}

/** Models sent later by another tool with postMessage, from a trusted origin. */
export function useIncomingMessages(onReceive: (input: InputState) => void) {
  const receive = useRef(onReceive)
  useEffect(() => {
    receive.current = onReceive
  }, [onReceive])
  useEffect(() => {
    function listen(event: MessageEvent) {
      if (!isTrustedOrigin(event.origin, window.location.origin)) return
      const handoff = readHandoff(event.data)
      if (handoff) receive.current(inputFromHandoff(handoff))
    }
    window.addEventListener('message', listen)
    return () => window.removeEventListener('message', listen)
  }, [])
}
