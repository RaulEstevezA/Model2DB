-- Couchbase indexes written by Model2DB from Author. Run it with cbq or the Query Workbench.
-- Review it before running it: nothing here has been run.
-- The bucket “app” must exist: rename it here if yours is called otherwise.
-- Run it after 1-collections.sql.

-- “authors”
-- Couchbase has no unique indexes: check that “email” is unique before saving.
CREATE INDEX `uq_authors_email` IF NOT EXISTS ON `app`.`_default`.`authors`(`email`);

-- “books”
-- Couchbase has no unique indexes: check that “isbn” is unique before saving.
CREATE INDEX `uq_books_isbn` IF NOT EXISTS ON `app`.`_default`.`books`(`isbn`);
CREATE INDEX `ix_books_author` IF NOT EXISTS ON `app`.`_default`.`books`(`author`);
