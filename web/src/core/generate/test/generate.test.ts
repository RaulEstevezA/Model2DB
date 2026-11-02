import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EXAMPLES } from '../../../examples/index.ts'
import { decide } from '../../design/edit.ts'
import { proposeDesign } from '../../design/propose.ts'
import { modelRoles } from '../../physical/roles.ts'
import { schemaOf } from '../../test/helpers.ts'
import { OUTPUTS, findOutput, generate, type OutputSettings } from '../outputs.ts'

// Shared with the desktop version, which must write the same files (shared/README.md)
const OUTPUTS_CASES = resolve(process.cwd(), '../shared/test-cases/outputs')

const settings: OutputSettings = { naming: { tables: 'plural', columns: 'snake' }, strings: 'auto', engine: 'postgresql', migrations: true }
const text = (generated: { files: { content: string }[] }) => generated.files.map((file) => file.content).join('\n')

describe('every example in every database', () => {
  for (const example of EXAMPLES) {
    for (const output of OUTPUTS) {
      it(`${example.id} → ${output.id}`, async () => {
        const schema = schemaOf(example.text, example.format, 'Invoice')
        const generated = generate(schema, proposeDesign(schema, output.target), output, settings, schema.root)
        for (const file of generated.files) {
          const extension = file.name.slice(file.name.lastIndexOf('.'))
          const name = generated.files.length === 1 ? `${example.id}${extension}` : `${example.id}/${file.name}`
          await expect(file.content).toMatchFileSnapshot(resolve(OUTPUTS_CASES, output.id, name))
        }
      })
    }
  }
})

describe('pending decisions', () => {
  const schema = schemaOf(
    `interface Product { id: number; name: string }
     interface Cart { id: number; products: Product[] }
     interface Wishlist { id: number; products: Product[] }`,
    'typescript',
  )

  it('are written as a TODO instead of a table', () => {
    const design = proposeDesign(schema, 'relational')
    const content = text(generate(schema, design, findOutput('postgresql'), settings))
    expect(content).toContain('-- TODO: decide how "Cart.products" is stored (pending in the design).')
    expect(content).not.toContain('carts_products')
    expect(modelRoles(schema, design).get('Product')).toBe('pending')
  })

  it('become tables once decided', () => {
    let design = proposeDesign(schema, 'relational')
    design = decide(design, { kind: 'relation', model: 'Cart', field: 'products' })
    design = decide(design, { kind: 'relation', model: 'Wishlist', field: 'products' }, 'join')
    const content = text(generate(schema, design, findOutput('postgresql'), settings))
    expect(content).not.toContain('TODO')
    expect(content).toContain('CREATE TABLE carts_products')
    expect(content).toContain('CREATE TABLE products_wishlists')
  })
})

describe('models that refer to each other', () => {
  it('are both stored', () => {
    const schema = schemaOf('interface Team { id: number; lead: Person }\ninterface Person { id: number; team: Team | null }', 'typescript')
    const content = text(generate(schema, proposeDesign(schema, 'relational'), findOutput('postgresql'), settings))
    expect(content).toContain('CREATE TABLE teams')
    expect(content).toContain('CREATE TABLE persons')
    // The reference that closes the cycle is added once both tables exist
    expect(content).toMatch(/ALTER TABLE \w+ ADD CONSTRAINT fk_/)
  })

  it('do not need ALTER TABLE in SQLite', () => {
    const schema = schemaOf('interface Team { id: number; lead: Person }\ninterface Person { id: number; team: Team | null }', 'typescript')
    expect(text(generate(schema, proposeDesign(schema, 'relational'), findOutput('sqlite'), settings))).not.toContain('ALTER TABLE')
  })
})

describe('texts in keys and indexes', () => {
  it('get a length where the engine cannot index unbounded text', () => {
    const schema = schemaOf('class User { @Id id: string; @Column({ unique: true }) email: string; bio: string }', 'typescript')
    const design = proposeDesign(schema, 'relational')
    const unbounded = { ...settings, strings: 'text' as const }
    const mysql = generate(schema, design, findOutput('mysql'), unbounded)
    expect(text(mysql)).toContain('email VARCHAR(255) NOT NULL')
    expect(text(mysql)).toContain('bio TEXT NOT NULL')
    expect(mysql.physical.notes.map((note) => note.code)).toContain('textKeyLength')
    expect(text(generate(schema, design, findOutput('postgresql'), unbounded))).toContain('email TEXT NOT NULL')
  })
})

describe('names', () => {
  const schema = schemaOf('interface User { id: number; order: number; group: string }', 'typescript')

  it('quotes reserved words in each dialect', () => {
    const design = proposeDesign(schema, 'relational')
    expect(text(generate(schema, design, findOutput('postgresql'), settings))).toContain('"order" DOUBLE PRECISION NOT NULL')
    expect(text(generate(schema, design, findOutput('mysql'), settings))).toContain('`group` VARCHAR(255) NOT NULL')
    expect(text(generate(schema, design, findOutput('sqlserver'), settings))).toContain('[order] FLOAT NOT NULL')
    // Oracle also reserves usual field names
    const oracle = schemaOf('interface Level { id: number; level: number; comment: string }', 'typescript')
    expect(text(generate(oracle, proposeDesign(oracle, 'relational'), findOutput('oracle'), settings))).toContain(
      '"level" NUMBER(10) NOT NULL',
    )
  })

  it('fills a text key with a new UUID when the input says so', () => {
    const jpa = schemaOf(
      '@Entity public class Ticket { @Id @GeneratedValue(strategy = GenerationType.UUID) private String id; private String title; }',
      'java',
    )
    expect(text(generate(jpa, proposeDesign(jpa, 'relational'), findOutput('postgresql'), settings))).toContain(
      'id TEXT DEFAULT gen_random_uuid() NOT NULL',
    )
  })

  it('undoes each Liquibase changeset, foreign keys between tables that refer to each other first', () => {
    const cycle = schemaOf('interface Team { id: number; captain: Player }\ninterface Player { id: number; team: Team }', 'typescript')
    const changelog = (engine: 'postgresql' | 'mysql') => {
      const files = generate(cycle, proposeDesign(cycle, 'relational'), findOutput('liquibase'), { ...settings, engine }).files
      return files.find((file) => file.name.startsWith('db/changelog/changes/'))!.content
    }
    expect(changelog('postgresql')).toContain('--rollback ALTER TABLE players DROP CONSTRAINT fk_players_team_id;')
    expect(changelog('mysql')).toContain('--rollback ALTER TABLE players DROP FOREIGN KEY fk_players_team_id;')
    expect(changelog('postgresql')).toContain('--changeset model2db:create-table-players\n')
  })

  it('indexes every item of a list in Couchbase, and leaves unique values to the application', () => {
    const store = schemaOf(EXAMPLES.find((example) => example.id === 'store')!.text, 'typescript')
    const design = decide(proposeDesign(store, 'document'), { kind: 'relation', model: 'OrderLine', field: 'product' }, 'reference')
    const indexes = generate(store, design, findOutput('couchbase'), settings).files.find((file) => file.name === '2-indexes.sql')!
    expect(indexes.content).toContain('ON `app`.`_default`.`orders`(DISTINCT ARRAY item.`product` FOR item IN `lines` END);')
    const jpa = schemaOf(EXAMPLES.find((example) => example.id === 'jpa')!.text, 'java')
    expect(generate(jpa, proposeDesign(jpa, 'document'), findOutput('couchbase'), settings).physical.notes).toContainEqual({
      code: 'uniqueInApplication',
      params: { database: 'Couchbase', field: 'Author.email' },
    })
  })

  it('follows the naming chosen for tables and columns', () => {
    const design = proposeDesign(schema, 'relational')
    const content = text(generate(schema, design, findOutput('postgresql'), { ...settings, naming: { tables: 'model', columns: 'field' } }))
    expect(content).toContain('CREATE TABLE "User"')
  })
})
