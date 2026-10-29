import type { KeyboardEvent } from 'react'

/** Arrow keys, Home and End on a tablist: move to the tab and select it (WAI-ARIA tabs pattern). Only the
 * selected tab is in the Tab order, so the keyboard reaches the content after it in one step. */
export function onTabListKeyDown(event: KeyboardEvent<HTMLElement>, select: (index: number) => void) {
  const tabs = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')]
  const current = tabs.indexOf(document.activeElement as HTMLElement)
  if (current < 0) return
  const next =
    event.key === 'ArrowRight'
      ? (current + 1) % tabs.length
      : event.key === 'ArrowLeft'
        ? (current - 1 + tabs.length) % tabs.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? tabs.length - 1
            : null
  if (next === null) return
  event.preventDefault()
  select(next)
  tabs[next].focus()
}
