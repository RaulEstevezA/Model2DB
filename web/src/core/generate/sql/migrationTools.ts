import type { Dialect } from '../../physical/types.ts'
import { fileBase, type RelationalWriter } from '../types.ts'
import { DIALECT_NAMES, generateSql } from './sql.ts'

/** The plain SQL schema as a Flyway or Liquibase migration, for projects that run their schema with one of
 * them and no ORM. The SQL is the same the engine's own output writes. */

const ENGINES: readonly Dialect[] = ['postgresql', 'mysql', 'mariadb', 'sqlite', 'sqlserver', 'oracle']

/** A JDBC URL to fill in: both tools connect through JDBC. */
const JDBC_URLS: Record<Dialect, string> = {
  postgresql: 'jdbc:postgresql://localhost:5432/app',
  mysql: 'jdbc:mysql://localhost:3306/app',
  mariadb: 'jdbc:mariadb://localhost:3306/app',
  sqlite: 'jdbc:sqlite:app.db',
  sqlserver: 'jdbc:sqlserver://localhost:1433;databaseName=app;encrypt=false',
  oracle: 'jdbc:oracle:thin:@//localhost:1521/FREEPDB1',
}

export const flywayOutput: RelationalWriter = {
  id: 'flyway',
  label: 'Flyway',
  group: 'relational',
  engines: ENGINES,
  write(physical, context) {
    const engine = context.settings.engine
    const base = fileBase(context.title)
    return [
      {
        name: 'flyway.toml',
        content: [
          `# Flyway settings written by Model2DB from ${context.title}. Fill in the connection, then run: flyway migrate`,
          '# The password is read from the FLYWAY_PASSWORD environment variable.',
          '[environments.default]',
          `url = "${JDBC_URLS[engine]}"`,
          ...(engine === 'sqlite' ? [] : ['user = "app"']),
          '',
          '[flyway]',
          'environment = "default"',
          'locations = ["filesystem:db/migration"]',
          '',
        ].join('\n'),
        editorLanguage: 'text',
      },
      {
        name: `db/migration/V1__create_${base}_schema.sql`,
        content: generateSql(physical, engine, { title: context.title, migration: true }),
        editorLanguage: 'sql',
      },
    ]
  },
}

export const liquibaseOutput: RelationalWriter = {
  id: 'liquibase',
  label: 'Liquibase',
  group: 'relational',
  engines: ENGINES,
  write(physical, context) {
    const engine = context.settings.engine
    const changes = `changes/001-create-${base(context.title)}-schema.sql`
    return [
      {
        name: 'liquibase.properties',
        content: [
          `# Liquibase settings written by Model2DB from ${context.title}. Fill in the connection, then run: liquibase update`,
          '# The password is read from the LIQUIBASE_COMMAND_PASSWORD environment variable.',
          'changeLogFile=db/changelog/db.changelog-master.yaml',
          `url=${JDBC_URLS[engine]}`,
          ...(engine === 'sqlite' ? [] : ['username=app']),
          '',
        ].join('\n'),
        editorLanguage: 'text',
      },
      {
        name: 'db/changelog/db.changelog-master.yaml',
        content: ['databaseChangeLog:', '  - include:', `      file: ${changes}`, '      relativeToChangelogFile: true', ''].join('\n'),
        editorLanguage: 'yaml',
      },
      {
        name: `db/changelog/${changes}`,
        content: formattedSql(generateSql(physical, engine, { title: context.title, migration: true }), engine, context.title),
        editorLanguage: 'sql',
      },
    ]
  },
}

function base(title: string): string {
  return fileBase(title).replace(/_/g, '-')
}

interface Statement {
  comments: string[]
  text: string
}

/** The statements of a schema script, each with the comments written just before it. */
function statements(sql: string): Statement[] {
  const result: Statement[] = []
  let comments: string[] = []
  let lines: string[] = []
  // The first two lines are the script's header
  for (const line of sql.split('\n').slice(2)) {
    if (lines.length === 0 && line.startsWith('--')) comments.push(line)
    else if (line.trim() !== '' || lines.length > 0) lines.push(line)
    if (lines.length > 0 && line.trimEnd().endsWith(';')) {
      result.push({ comments, text: lines.join('\n') })
      comments = []
      lines = []
    }
  }
  return result
}

interface Changeset {
  id: string
  rollback: string
  lines: string[]
}

/** One changeset per table with its indexes and rows, per enum type and per foreign key added afterwards,
 * each with the statement that undoes it, so `liquibase rollback` works. */
function formattedSql(sql: string, engine: Dialect, title: string): string {
  const changesets: Changeset[] = []
  const ids = new Set<string>()
  for (const statement of statements(sql)) {
    const started = changeOf(statement.text, engine)
    if (started || changesets.length === 0) {
      const change = started ?? { id: 'schema', rollback: 'empty' }
      let id = change.id
      for (let n = 2; ids.has(id); n++) id = `${change.id}-${n}`
      ids.add(id)
      changesets.push({ id, rollback: change.rollback, lines: [] })
    }
    changesets[changesets.length - 1].lines.push(...statement.comments, statement.text)
  }
  const out = [
    '--liquibase formatted sql',
    '',
    `-- ${DIALECT_NAMES[engine]} schema written by Model2DB from ${title}.`,
    '-- Review it before running it: nothing here has been run.',
  ]
  for (const change of changesets) out.push('', `--changeset model2db:${change.id}`, ...change.lines, `--rollback ${change.rollback}`)
  return out.join('\n') + '\n'
}

/** The changeset a statement starts and how to undo it; null for statements that belong to the previous
 * one (the indexes and rows of a table). */
function changeOf(text: string, engine: Dialect): { id: string; rollback: string } | null {
  const name = (pattern: RegExp) => pattern.exec(text)?.[1] ?? ''
  const plain = (quoted: string) => quoted.replace(/["`[\]]/g, '')
  if (text.startsWith('CREATE TABLE ')) {
    const table = name(/^CREATE TABLE (\S+)/)
    return { id: `create-table-${plain(table)}`, rollback: `DROP TABLE ${table};` }
  }
  if (text.startsWith('CREATE TYPE ')) {
    const type = name(/^CREATE TYPE (\S+)/)
    return { id: `create-type-${plain(type)}`, rollback: `DROP TYPE ${type};` }
  }
  if (text.startsWith('ALTER TABLE ')) {
    const table = name(/^ALTER TABLE (\S+)/)
    const constraint = name(/ADD CONSTRAINT (\S+)/)
    const drop = engine === 'mysql' || engine === 'mariadb' ? 'DROP FOREIGN KEY' : 'DROP CONSTRAINT'
    return { id: `add-${plain(constraint)}`, rollback: `ALTER TABLE ${table} ${drop} ${constraint};` }
  }
  return null
}
