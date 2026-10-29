// Drizzle schema written by Model2DB from User. Review it, then run `npx drizzle-kit generate`.
import { relations } from 'drizzle-orm'
import { type AnyPgColumn, bigint, boolean, index, integer, pgTable, primaryKey, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  profileBio: text('profile_bio'),
  profileWebsite: text('profile_website'),
}, (table) => [
  unique('uq_users_email').on(table.email),
])

export const posts = pgTable('posts', {
  id: integer('id').generatedByDefaultAsIdentity().primaryKey(),
  title: varchar('title', { length: 200 }).notNull(),
  body: text('body').notNull(),
  published: boolean('published').notNull().default(false),
  authorId: text('author_id').notNull().references((): AnyPgColumn => users.id),
}, (table) => [
  index('ix_posts_author_id').on(table.authorId),
])

export const comments = pgTable('comments', {
  id: bigint('id', { mode: 'number' }).generatedByDefaultAsIdentity().primaryKey(),
  text: text('text').notNull(),
  writtenAt: timestamp('written_at', { withTimezone: true }).notNull(),
  rating: integer('rating'),
  postId: integer('post_id').notNull().references((): AnyPgColumn => posts.id, { onDelete: 'cascade' }),
}, (table) => [
  index('ix_comments_post_id').on(table.postId),
])

export const postTags = pgTable('post_tags', {
  postId: integer('post_id').notNull().references((): AnyPgColumn => posts.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  value: text('value').notNull(),
}, (table) => [
  primaryKey({ name: 'pk_post_tags', columns: [table.postId, table.position] }),
])

export const usersRelations = relations(users, ({ one, many }) => ({
  posts: many(posts, { relationName: 'Post_author' }),
}))

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id], relationName: 'Post_author' }),
  comments: many(comments, { relationName: 'Comment_post' }),
  tags: many(postTags, { relationName: 'PostTag_post' }),
}))

export const commentsRelations = relations(comments, ({ one, many }) => ({
  post: one(posts, { fields: [comments.postId], references: [posts.id], relationName: 'Comment_post' }),
}))

export const postTagsRelations = relations(postTags, ({ one, many }) => ({
  post: one(posts, { fields: [postTags.postId], references: [posts.id], relationName: 'PostTag_post' }),
}))
