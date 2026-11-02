-- Couchbase indexes written by Model2DB from User. Run it with cbq or the Query Workbench.
-- Review it before running it: nothing here has been run.
-- The bucket “app” must exist: rename it here if yours is called otherwise.
-- Run it after 1-collections.sql.

-- “users”
-- Couchbase has no unique indexes: check that “email” is unique before saving.
CREATE INDEX `uq_users_email` IF NOT EXISTS ON `app`.`_default`.`users`(`email`);

-- “posts”
CREATE INDEX `ix_posts_author_id` IF NOT EXISTS ON `app`.`_default`.`posts`(`author_id`);
