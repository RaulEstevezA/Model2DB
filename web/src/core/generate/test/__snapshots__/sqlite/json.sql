-- SQLite schema written by Model2DB from Invoice.
-- Review it before running it: nothing here has been run.

PRAGMA foreign_keys = ON;

CREATE TABLE customers (
  customer_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  billing_address_street TEXT NOT NULL,
  billing_address_city TEXT NOT NULL,
  billing_address_zip_code TEXT NOT NULL,
  CONSTRAINT pk_customers PRIMARY KEY (customer_id)
);

CREATE TABLE invoices (
  invoice_id INTEGER NOT NULL,
  number TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  currency TEXT NOT NULL,
  paid INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  notes TEXT,
  CONSTRAINT pk_invoices PRIMARY KEY (invoice_id),
  CONSTRAINT fk_invoices_customer_id FOREIGN KEY (customer_id) REFERENCES customers (customer_id)
);
CREATE INDEX ix_invoices_customer_id ON invoices (customer_id);

CREATE TABLE lines (
  id INTEGER PRIMARY KEY,
  description TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  tax_rate REAL NOT NULL,
  invoice_id INTEGER NOT NULL,
  CONSTRAINT fk_lines_invoice_id FOREIGN KEY (invoice_id) REFERENCES invoices (invoice_id) ON DELETE CASCADE
);
CREATE INDEX ix_lines_invoice_id ON lines (invoice_id);

CREATE TABLE invoice_labels (
  invoice_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  value TEXT NOT NULL,
  CONSTRAINT pk_invoice_labels PRIMARY KEY (invoice_id, position),
  CONSTRAINT fk_invoice_labels_invoice_id FOREIGN KEY (invoice_id) REFERENCES invoices (invoice_id) ON DELETE CASCADE
);
