// @vitest-environment jsdom
/** The cases in shared/test-cases/, which the desktop version's tests read too (shared/README.md):
 * calls/<module>.<function>.json hold the arguments of a core function and the result it must give.
 *
 * `UPDATE_SHARED=1 npx vitest run src/core/shared.test.ts` writes the results again from what the web
 * version does now; the desktop version then has to match them. */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decide, reconcile } from './design/edit.ts'
import { proposeDesign } from './design/propose.ts'
import { readHandoff } from './interop/handoff.ts'
import { readProject } from './interop/project.ts'
import { singularize, splitWords, toCamelCase, toPascalCase, toSnakeCase } from './model/naming.ts'
import { detectFormats, parseInput } from './parsers/registry.ts'
import { modelRoles } from './physical/roles.ts'

// Tests run from web/
const SHARED = resolve(process.cwd(), '../shared/test-cases')
const UPDATE = process.env.UPDATE_SHARED === '1'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction = (...args: any[]) => unknown

const FUNCTIONS: Record<string, AnyFunction> = {
  'naming.splitWords': splitWords,
  'naming.toPascalCase': toPascalCase,
  'naming.toCamelCase': toCamelCase,
  'naming.toSnakeCase': toSnakeCase,
  'naming.singularize': singularize,
  'registry.detectFormats': detectFormats,
  'registry.parseInput': parseInput,
  'handoff.readHandoff': readHandoff,
  'project.readProject': readProject,
  'propose.proposeDesign': proposeDesign,
  'edit.decide': decide,
  'edit.reconcile': reconcile,
  // A Map does not survive JSON: the roles are written as an object
  'roles.modelRoles': (schema, design) => Object.fromEntries(modelRoles(schema, design)),
}

/** What JSON keeps of a value: the files hold JSON, so `undefined` keys disappear as they do there. */
const asJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value === undefined ? null : value))

const writeJson = (path: string, value: unknown) => writeFileSync(path, `${JSON.stringify(value, null, 1)}\n`)

describe('shared calls', () => {
  const folder = join(SHARED, 'calls')
  for (const file of readdirSync(folder).filter((name) => name.endsWith('.json'))) {
    const name = file.slice(0, -'.json'.length)
    it(name, () => {
      const fn = FUNCTIONS[name]
      expect(fn, `no function for ${file}`).toBeDefined()
      const url = join(folder, file)
      const cases: { args: unknown[]; result: unknown }[] = JSON.parse(readFileSync(url, 'utf8'))
      const results = cases.map((item) => asJson(fn(...item.args)))
      if (UPDATE)
        return writeJson(
          url,
          cases.map((item, index) => ({ args: item.args, result: results[index] })),
        )
      cases.forEach((item, index) => expect(results[index], `${name} #${index}`).toEqual(item.result))
    })
  }
})
