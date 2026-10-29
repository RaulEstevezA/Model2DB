// Drizzle schema written by Model2DB from Invoice. Review it, then run `npx drizzle-kit generate`.
import { relations } from 'drizzle-orm'
import { type AnyPgColumn, bigint, boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

export const invoices = pgTable('invoices', {
  invoiceId: integer('invoice_id').primaryKey(),
  number: text('number').notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
  currency: text('currency').notNull(),
  paid: boolean('paid').notNull(),
  customerId: integer('customer_id').notNull().references((): AnyPgColumn => customers.customerId),
  notes: jsonb('notes'),
}, (table) => [
  index('ix_invoices_customer_id').on(table.customerId),
])

export const customers = pgTable('customers', {
  customerId: integer('customer_id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  billingAddressStreet: text('billing_address_street').notNull(),
  billingAddressCity: text('billing_address_city').notNull(),
  billingAddressZipCode: text('billing_address_zip_code').notNull(),
})

export const lines = pgTable('lines', {
  id: bigint('id', { mode: 'number' }).generatedByDefaultAsIdentity().primaryKey(),
  description: text('description').notNull(),
  qty: integer('qty').notNull(),
  unitPrice: doublePrecision('unit_price').notNull(),
  taxRate: doublePrecision('tax_rate').notNull(),
  invoiceId: integer('invoice_id').notNull().references((): AnyPgColumn => invoices.invoiceId, { onDelete: 'cascade' }),
}, (table) => [
  index('ix_lines_invoice_id').on(table.invoiceId),
])

export const invoiceLabels = pgTable('invoice_labels', {
  invoiceId: integer('invoice_id').notNull().references((): AnyPgColumn => invoices.invoiceId, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  value: text('value').notNull(),
}, (table) => [
  primaryKey({ name: 'pk_invoice_labels', columns: [table.invoiceId, table.position] }),
])

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  customer: one(customers, { fields: [invoices.customerId], references: [customers.customerId], relationName: 'Invoice_customer' }),
  lines: many(lines, { relationName: 'Line_invoice' }),
  labels: many(invoiceLabels, { relationName: 'InvoiceLabel_invoice' }),
}))

export const linesRelations = relations(lines, ({ one, many }) => ({
  invoice: one(invoices, { fields: [lines.invoiceId], references: [invoices.invoiceId], relationName: 'Line_invoice' }),
}))

export const invoiceLabelsRelations = relations(invoiceLabels, ({ one, many }) => ({
  invoice: one(invoices, { fields: [invoiceLabels.invoiceId], references: [invoices.invoiceId], relationName: 'InvoiceLabel_invoice' }),
}))
