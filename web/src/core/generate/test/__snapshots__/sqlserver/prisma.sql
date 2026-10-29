-- SQL Server schema written by Model2DB.
-- Review it before running it: nothing here has been run.

CREATE TABLE users (
  id NVARCHAR(255) NOT NULL,
  email NVARCHAR(255) NOT NULL,
  name NVARCHAR(255),
  created_at DATETIMEOFFSET NOT NULL DEFAULT CURRENT_TIMESTAMP,
  profile_bio NVARCHAR(255),
  profile_website NVARCHAR(255),
  CONSTRAINT pk_users PRIMARY KEY (id),
  CONSTRAINT uq_users_email UNIQUE (email)
);

CREATE TABLE posts (
  id INT NOT NULL IDENTITY(1, 1),
  title NVARCHAR(200) NOT NULL,
  body NVARCHAR(255) NOT NULL,
  published BIT NOT NULL DEFAULT 0,
  author_id NVARCHAR(255) NOT NULL,
  CONSTRAINT pk_posts PRIMARY KEY (id),
  CONSTRAINT fk_posts_author_id FOREIGN KEY (author_id) REFERENCES users (id)
);
CREATE INDEX ix_posts_author_id ON posts (author_id);

CREATE TABLE comments (
  id BIGINT NOT NULL IDENTITY(1, 1),
  text NVARCHAR(255) NOT NULL,
  written_at DATETIMEOFFSET NOT NULL,
  rating INT,
  post_id INT NOT NULL,
  CONSTRAINT pk_comments PRIMARY KEY (id),
  CONSTRAINT fk_comments_post_id FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
);
CREATE INDEX ix_comments_post_id ON comments (post_id);

CREATE TABLE post_tags (
  post_id INT NOT NULL,
  position INT NOT NULL,
  value NVARCHAR(255) NOT NULL,
  CONSTRAINT pk_post_tags PRIMARY KEY (post_id, position),
  CONSTRAINT fk_post_tags_post_id FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
);
