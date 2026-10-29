// Drizzle schema written by Model2DB from Author. Review it, then run `npx drizzle-kit generate`.
import { relations, sql } from 'drizzle-orm'
import { type AnyPgColumn, bigint, check, date, index, integer, numeric, pgTable, primaryKey, text, unique, varchar } from 'drizzle-orm/pg-core'

export const authors = pgTable('authors', {
  id: bigint('id', { mode: 'number' }).generatedByDefaultAsIdentity().primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  email: text('email').notNull(),
}, (table) => [
  unique('uq_authors_email').on(table.email),
])

export const books = pgTable('books', {
  id: bigint('id', { mode: 'number' }).generatedByDefaultAsIdentity().primaryKey(),
  isbn: varchar('isbn', { length: 13 }).notNull(),
  title: text('title').notNull(),
  price: numeric('price', { precision: 8, scale: 2 }).notNull(),
  publishedOn: date('published_on').notNull(),
  genre: varchar('genre', { length: 20 }).notNull(),
  authorId: bigint('author_id', { mode: 'number' }).notNull().references((): AnyPgColumn => authors.id),
  shelfRoom: text('shelf_room').notNull(),
  shelfRow: integer('shelf_row'),
}, (table) => [
  unique('uq_books_isbn').on(table.isbn),
  index('ix_books_author_id').on(table.authorId),
  check('ck_books_genre', sql`${table.genre} IN ('FICTION', 'ESSAY', 'POETRY', 'SCIENCE')`),
])

export const tags = pgTable('tags', {
  code: text('code').primaryKey(),
  label: text('label').notNull(),
})

export const booksTags = pgTable('books_tags', {
  bookId: bigint('book_id', { mode: 'number' }).notNull().references((): AnyPgColumn => books.id, { onDelete: 'cascade' }),
  tagCode: text('tag_code').notNull().references((): AnyPgColumn => tags.code, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ name: 'pk_books_tags', columns: [table.bookId, table.tagCode] }),
])

export const authorsRelations = relations(authors, ({ one, many }) => ({
  books: many(books, { relationName: 'Book_author' }),
}))

export const booksRelations = relations(books, ({ one, many }) => ({
  author: one(authors, { fields: [books.authorId], references: [authors.id], relationName: 'Book_author' }),
  tags: many(booksTags, { relationName: 'books_tags_book' }),
}))

export const tagsRelations = relations(tags, ({ one, many }) => ({
  booksTagsLinks: many(booksTags, { relationName: 'books_tags_tag' }),
}))

export const booksTagsRelations = relations(booksTags, ({ one }) => ({
  book: one(books, { fields: [booksTags.bookId], references: [books.id], relationName: 'books_tags_book' }),
  tag: one(tags, { fields: [booksTags.tagCode], references: [tags.code], relationName: 'books_tags_tag' }),
}))
