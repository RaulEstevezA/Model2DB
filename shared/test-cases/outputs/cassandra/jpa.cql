-- Cassandra schema written by Model2DB from Author. Run it with cqlsh -f.
-- Review it before running it: nothing here has been run.
-- The keyspace “app” keeps one copy of each row: raise its replication factor for a cluster.

CREATE KEYSPACE IF NOT EXISTS app WITH replication = {'class': 'NetworkTopologyStrategy', 'replication_factor': 1};
USE app;

-- TODO: decide how "Author.books" is stored (pending in the design).
CREATE TABLE IF NOT EXISTS authors (
  id bigint,
  name text,
  email text,
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS ix_authors_email ON authors (email) USING 'sai';
