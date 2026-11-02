-- Couchbase collections written by Model2DB from User. Run it with cbq or the Query Workbench.
-- Review it before running it: nothing here has been run.
-- The bucket “app” must exist: rename it here if yours is called otherwise.
-- Then run 2-indexes.sql, once these collections exist.

-- Each document of “users” is stored under a key: the value of the model's key field, written as text. Its fields:
--   email: text
--   name?: text or null
--   profile?: object or null
--     bio?: text or null
--     website?: text or null
--   created_at?: date (ISO 8601 text)
CREATE COLLECTION `app`.`_default`.`users` IF NOT EXISTS;

-- Each document of “posts” is stored under a key: the value of the model's key field, written as text. Its fields:
--   title: text
--   body: text
--   published?: true or false
--   author_id: text
--   comments: list of objects
--     text: text
--     written_at: date (ISO 8601 text)
--     rating?: number or null
--   tags: list of text
CREATE COLLECTION `app`.`_default`.`posts` IF NOT EXISTS;
