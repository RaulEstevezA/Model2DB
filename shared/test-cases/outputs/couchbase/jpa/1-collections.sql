-- Couchbase collections written by Model2DB from Author. Run it with cbq or the Query Workbench.
-- Review it before running it: nothing here has been run.
-- The bucket “app” must exist: rename it here if yours is called otherwise.
-- Then run 2-indexes.sql, once these collections exist.

-- Each document of “authors” is stored under a key: the value of the model's key field, written as text. Its fields:
--   name: text
--   email: text
CREATE COLLECTION `app`.`_default`.`authors` IF NOT EXISTS;

-- Each document of “books” is stored under a key: the value of the model's key field, written as text. Its fields:
--   isbn: text
--   title: text
--   author: number
--   price: number
--   published_on: date (ISO 8601 text)
--   genre: "FICTION" | "ESSAY" | "POETRY" | "SCIENCE"
--   shelf: object
--     room: text
--     row?: number or null
--   tags: list of objects
--     code: text
--     label: text
CREATE COLLECTION `app`.`_default`.`books` IF NOT EXISTS;
