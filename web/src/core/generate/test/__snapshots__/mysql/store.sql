-- MySQL schema written by Model2DB.
-- Review it before running it: nothing here has been run.

CREATE TABLE customers (
  id BIGINT NOT NULL,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(255),
  created_at DATETIME(6) NOT NULL,
  shipping_address_street VARCHAR(255) NOT NULL,
  shipping_address_city VARCHAR(255) NOT NULL,
  shipping_address_postal_code VARCHAR(255) NOT NULL,
  shipping_address_country VARCHAR(255) NOT NULL,
  CONSTRAINT pk_customers PRIMARY KEY (id)
);

CREATE TABLE orders (
  id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL,
  coupon_code VARCHAR(255),
  placed_at DATETIME(6) NOT NULL,
  customer_id BIGINT NOT NULL,
  CONSTRAINT pk_orders PRIMARY KEY (id),
  CONSTRAINT fk_orders_customer_id FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT ck_orders_status CHECK (status IN ('draft', 'paid', 'shipped', 'cancelled'))
);
CREATE INDEX ix_orders_customer_id ON orders (customer_id);

CREATE TABLE products (
  id BIGINT NOT NULL,
  sku VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  price DOUBLE NOT NULL,
  attributes JSON NOT NULL,
  CONSTRAINT pk_products PRIMARY KEY (id)
);

CREATE TABLE order_lines (
  id BIGINT NOT NULL AUTO_INCREMENT,
  quantity DOUBLE NOT NULL,
  unit_price DOUBLE NOT NULL,
  order_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  CONSTRAINT pk_order_lines PRIMARY KEY (id),
  CONSTRAINT fk_order_lines_order_id FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_lines_product_id FOREIGN KEY (product_id) REFERENCES products (id)
);
CREATE INDEX ix_order_lines_order_id ON order_lines (order_id);
CREATE INDEX ix_order_lines_product_id ON order_lines (product_id);

CREATE TABLE categories (
  id BIGINT NOT NULL,
  name VARCHAR(255) NOT NULL,
  CONSTRAINT pk_categories PRIMARY KEY (id)
);

CREATE TABLE order_tags (
  order_id BIGINT NOT NULL,
  position INT NOT NULL,
  value VARCHAR(255) NOT NULL,
  CONSTRAINT pk_order_tags PRIMARY KEY (order_id, position),
  CONSTRAINT fk_order_tags_order_id FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
);

CREATE TABLE categories_products (
  product_id BIGINT NOT NULL,
  category_id BIGINT NOT NULL,
  CONSTRAINT pk_categories_products PRIMARY KEY (product_id, category_id),
  CONSTRAINT fk_categories_products_product_id FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT fk_categories_products_category_id FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE
);
