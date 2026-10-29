import { useState, type KeyboardEvent } from 'react'

/** A text field that applies its value when it loses the focus or on Enter, so typing a name is one step
 * in the history, not one per letter. */
export function CommitInput({
  label,
  value,
  placeholder,
  onCommit,
  mono = true,
}: {
  label: string
  value: string
  placeholder: string
  onCommit: (value: string) => void
  mono?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  const shown = editing ? draft : value
  const commit = () => {
    setEditing(false)
    if (draft.trim() !== value) onCommit(draft)
  }
  return (
    <label className="field">
      <span>{label}</span>
      <input
        className={`input${mono ? ' input--mono' : ''}`}
        type="text"
        value={shown}
        placeholder={placeholder}
        spellCheck={false}
        onFocus={() => {
          setDraft(value)
          setEditing(true)
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
        }}
      />
    </label>
  )
}
