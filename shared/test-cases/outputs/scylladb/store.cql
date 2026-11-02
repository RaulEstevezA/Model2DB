-- ScyllaDB schema written by Model2DB from Order. Run it with cqlsh -f.
-- Review it before running it: nothing here has been run.
-- The keyspace “app” keeps one copy of each row: raise its replication factor for a cluster.

CREATE KEYSPACE IF NOT EXISTS app WITH replication = {'class': 'NetworkTopologyStrategy', 'replication_factor': 1};
USE app;

CREATE TYPE IF NOT EXISTS address (
  street text,
  city text,
  postal_code text,
  country text
);

CREATE TABLE IF NOT EXISTS customers (
  id bigint,
  email text,
  full_name text,
  phone text,
  shipping_address frozen<address>,
  created_at timestamp,
  PRIMARY KEY (id)
);

-- TODO: decide how "Order.lines" is stored (pending in the design).
CREATE TABLE IF NOT EXISTS orders (
  id bigint,
  customer_id bigint,
  status text,
  coupon_code text,
  tags list<text>,
  placed_at timestamp,
  PRIMARY KEY (id)
);
