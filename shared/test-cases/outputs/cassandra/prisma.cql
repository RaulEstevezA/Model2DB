-- Cassandra schema written by Model2DB from User. Run it with cqlsh -f.
-- Review it before running it: nothing here has been run.
-- The keyspace “app” keeps one copy of each row: raise its replication factor for a cluster.

CREATE KEYSPACE IF NOT EXISTS app WITH replication = {'class': 'NetworkTopologyStrategy', 'replication_factor': 1};
USE app;

CREATE TYPE IF NOT EXISTS profile (
  bio text,
  website text
);

-- TODO: decide how "User.posts" is stored (pending in the design).
CREATE TABLE IF NOT EXISTS users (
  id text,
  email text,
  name text,
  profile frozen<profile>,
  created_at timestamp,
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS ix_users_email ON users (email) USING 'sai';
