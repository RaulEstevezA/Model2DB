import { useCallback, useMemo } from 'react'
import type { StorageTarget } from '../core/design/types.ts'
import { findOutput, type Output, type OutputSettings } from '../core/generate/outputs.ts'
import type { ProjectOutput } from '../core/interop/project.ts'
import type { Dialect, NamingOptions } from '../core/physical/types.ts'
import { useStoredState } from './useStoredState.ts'

// Documents keep the field names of the model; tables follow the SQL convention
const DEFAULT_NAMING: Record<StorageTarget, NamingOptions> = {
  relational: { tables: 'plural', columns: 'snake' },
  document: { tables: 'plural', columns: 'field' },
}

/** The chosen output and its settings, remembered in this browser as preferences (never the model). */
export function useOutputSettings(): {
  output: Output
  settings: OutputSettings
  setOutput: (id: string) => void
  setSettings: (settings: OutputSettings) => void
  /** Every setting, for both kinds of database, as a project saves them */
  project: ProjectOutput
  applyProject: (project: ProjectOutput) => void
} {
  const [outputId, setOutput] = useStoredState('model2db.output', () => 'postgresql')
  const [namings, setNamings] = useStoredState<Record<StorageTarget, NamingOptions>>('model2db.naming', () => DEFAULT_NAMING)
  const [strings, setStrings] = useStoredState<OutputSettings['strings']>('model2db.strings', () => 'auto')
  const [engine, setEngine] = useStoredState<Dialect>('model2db.engine', () => 'postgresql')
  const [migrations, setMigrations] = useStoredState('model2db.migrations', () => true)
  const output = findOutput(outputId)
  const target = output.target
  const settings = useMemo(
    () => ({ naming: namings[target] ?? DEFAULT_NAMING[target], strings, engine, migrations }),
    [namings, target, strings, engine, migrations],
  )
  const setSettings = useCallback(
    (next: OutputSettings) => {
      setNamings((current) => ({ ...current, [target]: next.naming }))
      setStrings(next.strings)
      setEngine(next.engine)
      setMigrations(next.migrations)
    },
    [target, setNamings, setStrings, setEngine, setMigrations],
  )
  const project = useMemo(
    () => ({ output: output.id, naming: { ...DEFAULT_NAMING, ...namings }, strings, engine, migrations }),
    [output.id, namings, strings, engine, migrations],
  )
  const applyProject = useCallback(
    (next: ProjectOutput) => {
      setOutput(findOutput(next.output).id)
      setNamings(next.naming)
      setStrings(next.strings)
      setEngine(next.engine)
      setMigrations(next.migrations)
    },
    [setOutput, setNamings, setStrings, setEngine, setMigrations],
  )
  return { output, settings, setOutput, setSettings, project, applyProject }
}
