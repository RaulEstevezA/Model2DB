-- MariaDB schema written by Model2DB from Invoice.
-- Review it before running it: nothing here has been run.

CREATE TABLE customers (
  customer_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  billing_address_street VARCHAR(255) NOT NULL,
  billing_address_city VARCHAR(255) NOT NULL,
  billing_address_zip_code VARCHAR(255) NOT NULL,
  CONSTRAINT pk_customers PRIMARY KEY (customer_id)
);

CREATE TABLE invoices (
  invoice_id INT NOT NULL,
  number VARCHAR(255) NOT NULL,
  issued_at DATETIME(6) NOT NULL,
  currency VARCHAR(255) NOT NULL,
  paid BOOLEAN NOT NULL,
  customer_id INT NOT NULL,
  notes JSON,
  CONSTRAINT pk_invoices PRIMARY KEY (invoice_id),
  CONSTRAINT fk_invoices_customer_id FOREIGN KEY (customer_id) REFERENCES customers (customer_id)
);
CREATE INDEX ix_invoices_customer_id ON invoices (customer_id);

CREATE TABLE lines (
  id BIGINT AUTO_INCREMENT NOT NULL,
  description VARCHAR(255) NOT NULL,
  qty INT NOT NULL,
  unit_price DOUBLE NOT NULL,
  tax_rate DOUBLE NOT NULL,
  invoice_id INT NOT NULL,
  CONSTRAINT pk_lines PRIMARY KEY (id),
  CONSTRAINT fk_lines_invoice_id FOREIGN KEY (invoice_id) REFERENCES invoices (invoice_id) ON DELETE CASCADE
);
CREATE INDEX ix_lines_invoice_id ON lines (invoice_id);

CREATE TABLE invoice_labels (
  invoice_id INT NOT NULL,
  position INT NOT NULL,
  value VARCHAR(255) NOT NULL,
  CONSTRAINT pk_invoice_labels PRIMARY KEY (invoice_id, position),
  CONSTRAINT fk_invoice_labels_invoice_id FOREIGN KEY (invoice_id) REFERENCES invoices (invoice_id) ON DELETE CASCADE
);
