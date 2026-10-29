-- MySQL schema written by Model2DB.
-- Review it before running it: nothing here has been run.

CREATE TABLE users (
  id VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  profile_bio VARCHAR(255),
  profile_website VARCHAR(255),
  CONSTRAINT pk_users PRIMARY KEY (id),
  CONSTRAINT uq_users_email UNIQUE (email)
);

CREATE TABLE posts (
  id INT NOT NULL AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL,
  body VARCHAR(255) NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  author_id VARCHAR(255) NOT NULL,
  CONSTRAINT pk_posts PRIMARY KEY (id),
  CONSTRAINT fk_posts_author_id FOREIGN KEY (author_id) REFERENCES users (id)
);
CREATE INDEX ix_posts_author_id ON posts (author_id);

CREATE TABLE comments (
  id BIGINT NOT NULL AUTO_INCREMENT,
  text VARCHAR(255) NOT NULL,
  written_at DATETIME(6) NOT NULL,
  rating INT,
  post_id INT NOT NULL,
  CONSTRAINT pk_comments PRIMARY KEY (id),
  CONSTRAINT fk_comments_post_id FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
);
CREATE INDEX ix_comments_post_id ON comments (post_id);

CREATE TABLE post_tags (
  post_id INT NOT NULL,
  position INT NOT NULL,
  value VARCHAR(255) NOT NULL,
  CONSTRAINT pk_post_tags PRIMARY KEY (post_id, position),
  CONSTRAINT fk_post_tags_post_id FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
);
