-- SQLite schema written by Model2DB from Order.
-- Review it before running it: nothing here has been run.

PRAGMA foreign_keys = ON;

CREATE TABLE customers (
  id INTEGER NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  created_at TEXT NOT NULL,
  shipping_address_street TEXT NOT NULL,
  shipping_address_city TEXT NOT NULL,
  shipping_address_postal_code TEXT NOT NULL,
  shipping_address_country TEXT NOT NULL,
  CONSTRAINT pk_customers PRIMARY KEY (id)
);

CREATE TABLE orders (
  id INTEGER NOT NULL,
  status TEXT NOT NULL,
  coupon_code TEXT,
  placed_at TEXT NOT NULL,
  customer_id INTEGER NOT NULL,
  CONSTRAINT pk_orders PRIMARY KEY (id),
  CONSTRAINT fk_orders_customer_id FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT ck_orders_status CHECK (status IN ('draft', 'paid', 'shipped', 'cancelled'))
);
CREATE INDEX ix_orders_customer_id ON orders (customer_id);

CREATE TABLE products (
  id INTEGER NOT NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  attributes TEXT NOT NULL,
  CONSTRAINT pk_products PRIMARY KEY (id)
);

CREATE TABLE order_lines (
  id INTEGER PRIMARY KEY,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  CONSTRAINT fk_order_lines_order_id FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_lines_product_id FOREIGN KEY (product_id) REFERENCES products (id)
);
CREATE INDEX ix_order_lines_order_id ON order_lines (order_id);
CREATE INDEX ix_order_lines_product_id ON order_lines (product_id);

CREATE TABLE categories (
  id INTEGER NOT NULL,
  name TEXT NOT NULL,
  CONSTRAINT pk_categories PRIMARY KEY (id)
);

CREATE TABLE order_tags (
  order_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  value TEXT NOT NULL,
  CONSTRAINT pk_order_tags PRIMARY KEY (order_id, position),
  CONSTRAINT fk_order_tags_order_id FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
);

CREATE TABLE categories_products (
  product_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  CONSTRAINT pk_categories_products PRIMARY KEY (product_id, category_id),
  CONSTRAINT fk_categories_products_product_id FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT fk_categories_products_category_id FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE
);
