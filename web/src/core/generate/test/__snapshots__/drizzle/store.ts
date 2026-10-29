// Drizzle schema written by Model2DB from Order. Review it, then run `npx drizzle-kit generate`.
import { relations, sql } from 'drizzle-orm'
import { type AnyPgColumn, bigint, check, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, varchar } from 'drizzle-orm/pg-core'

export const customers = pgTable('customers', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  email: text('email').notNull(),
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  shippingAddressStreet: text('shipping_address_street').notNull(),
  shippingAddressCity: text('shipping_address_city').notNull(),
  shippingAddressPostalCode: text('shipping_address_postal_code').notNull(),
  shippingAddressCountry: text('shipping_address_country').notNull(),
})

export const orders = pgTable('orders', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  status: varchar('status', { length: 20 }).notNull(),
  couponCode: text('coupon_code'),
  placedAt: timestamp('placed_at', { withTimezone: true }).notNull(),
  customerId: bigint('customer_id', { mode: 'number' }).notNull().references((): AnyPgColumn => customers.id),
}, (table) => [
  index('ix_orders_customer_id').on(table.customerId),
  check('ck_orders_status', sql`${table.status} IN ('draft', 'paid', 'shipped', 'cancelled')`),
])

export const orderLines = pgTable('order_lines', {
  id: bigint('id', { mode: 'number' }).generatedByDefaultAsIdentity().primaryKey(),
  quantity: doublePrecision('quantity').notNull(),
  unitPrice: doublePrecision('unit_price').notNull(),
  orderId: bigint('order_id', { mode: 'number' }).notNull().references((): AnyPgColumn => orders.id, { onDelete: 'cascade' }),
  productId: bigint('product_id', { mode: 'number' }).notNull().references((): AnyPgColumn => products.id),
}, (table) => [
  index('ix_order_lines_order_id').on(table.orderId),
  index('ix_order_lines_product_id').on(table.productId),
])

export const products = pgTable('products', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  sku: text('sku').notNull(),
  name: text('name').notNull(),
  price: doublePrecision('price').notNull(),
  attributes: jsonb('attributes').notNull(),
})

export const categories = pgTable('categories', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  name: text('name').notNull(),
})

export const orderTags = pgTable('order_tags', {
  orderId: bigint('order_id', { mode: 'number' }).notNull().references((): AnyPgColumn => orders.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  value: text('value').notNull(),
}, (table) => [
  primaryKey({ name: 'pk_order_tags', columns: [table.orderId, table.position] }),
])

export const categoriesProducts = pgTable('categories_products', {
  productId: bigint('product_id', { mode: 'number' }).notNull().references((): AnyPgColumn => products.id, { onDelete: 'cascade' }),
  categoryId: bigint('category_id', { mode: 'number' }).notNull().references((): AnyPgColumn => categories.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ name: 'pk_categories_products', columns: [table.productId, table.categoryId] }),
])

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, { fields: [orders.customerId], references: [customers.id], relationName: 'Order_customer' }),
  lines: many(orderLines, { relationName: 'OrderLine_order' }),
  tags: many(orderTags, { relationName: 'OrderTag_order' }),
}))

export const orderLinesRelations = relations(orderLines, ({ one, many }) => ({
  order: one(orders, { fields: [orderLines.orderId], references: [orders.id], relationName: 'OrderLine_order' }),
  product: one(products, { fields: [orderLines.productId], references: [products.id], relationName: 'OrderLine_product' }),
}))

export const productsRelations = relations(products, ({ one, many }) => ({
  categories: many(categoriesProducts, { relationName: 'categories_products_product' }),
}))

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  products: many(categoriesProducts, { relationName: 'categories_products_category' }),
}))

export const orderTagsRelations = relations(orderTags, ({ one, many }) => ({
  order: one(orders, { fields: [orderTags.orderId], references: [orders.id], relationName: 'OrderTag_order' }),
}))

export const categoriesProductsRelations = relations(categoriesProducts, ({ one }) => ({
  product: one(products, { fields: [categoriesProducts.productId], references: [products.id], relationName: 'categories_products_product' }),
  category: one(categories, { fields: [categoriesProducts.categoryId], references: [categories.id], relationName: 'categories_products_category' }),
}))
