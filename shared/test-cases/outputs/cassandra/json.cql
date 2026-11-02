-- Cassandra schema written by Model2DB from Invoice. Run it with cqlsh -f.
-- Review it before running it: nothing here has been run.
-- The keyspace “app” keeps one copy of each row: raise its replication factor for a cluster.

CREATE KEYSPACE IF NOT EXISTS app WITH replication = {'class': 'NetworkTopologyStrategy', 'replication_factor': 1};
USE app;

CREATE TYPE IF NOT EXISTS billing_address (
  street text,
  city text,
  zip_code text
);

-- TODO: decide how "Invoice.lines" is stored (pending in the design).
CREATE TABLE IF NOT EXISTS invoices (
  invoice_id int,
  number text,
  issued_at timestamp,
  currency text,
  paid boolean,
  customer_customer_id int,
  notes text,
  labels list<text>,
  PRIMARY KEY (invoice_id)
);

CREATE TABLE IF NOT EXISTS customers (
  customer_id int,
  name text,
  email text,
  billing_address frozen<billing_address>,
  PRIMARY KEY (customer_id)
);
