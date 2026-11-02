-- Couchbase collections written by Model2DB from Order. Run it with cbq or the Query Workbench.
-- Review it before running it: nothing here has been run.
-- The bucket “app” must exist: rename it here if yours is called otherwise.

-- TODO: decide how "Order.lines.product" is stored (pending in the design).
-- Each document of “orders” is stored under a key: the value of the model's key field, written as text. Its fields:
--   customer: object
--     id: number
--     email: text
--     full_name: text
--     phone?: text
--     shipping_address: object
--       street: text
--       city: text
--       postal_code: text
--       country: text
--     created_at: date (ISO 8601 text)
--   status: "draft" | "paid" | "shipped" | "cancelled"
--   lines: list of objects
--     quantity: number
--     unit_price: number
--   coupon_code?: text or null
--   tags: list of text
--   placed_at: date (ISO 8601 text)
CREATE COLLECTION `app`.`_default`.`orders` IF NOT EXISTS;

-- Each document of “products” is stored under a key: the value of the model's key field, written as text. Its fields:
--   sku: text
--   name: text
--   price: number
--   categories: list of number
--   attributes: object with any fields
CREATE COLLECTION `app`.`_default`.`products` IF NOT EXISTS;

-- Each document of “categories” is stored under a key: the value of the model's key field, written as text. Its fields:
--   name: text
--   products: list of number
CREATE COLLECTION `app`.`_default`.`categories` IF NOT EXISTS;
