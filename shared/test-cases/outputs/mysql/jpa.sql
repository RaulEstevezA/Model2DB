-- MySQL schema written by Model2DB from Author.
-- Review it before running it: nothing here has been run.

CREATE TABLE authors (
  id BIGINT AUTO_INCREMENT NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL,
  CONSTRAINT pk_authors PRIMARY KEY (id),
  CONSTRAINT uq_authors_email UNIQUE (email)
);

CREATE TABLE books (
  id BIGINT AUTO_INCREMENT NOT NULL,
  isbn VARCHAR(13) NOT NULL,
  title VARCHAR(255) NOT NULL,
  price DECIMAL(8, 2) NOT NULL,
  published_on DATE NOT NULL,
  genre VARCHAR(20) NOT NULL,
  author_id BIGINT NOT NULL,
  shelf_room VARCHAR(255) NOT NULL,
  shelf_row INT,
  CONSTRAINT pk_books PRIMARY KEY (id),
  CONSTRAINT uq_books_isbn UNIQUE (isbn),
  CONSTRAINT fk_books_author_id FOREIGN KEY (author_id) REFERENCES authors (id),
  CONSTRAINT ck_books_genre CHECK (genre IN ('FICTION', 'ESSAY', 'POETRY', 'SCIENCE'))
);
CREATE INDEX ix_books_author_id ON books (author_id);

CREATE TABLE tags (
  code VARCHAR(255) NOT NULL,
  label VARCHAR(255) NOT NULL,
  CONSTRAINT pk_tags PRIMARY KEY (code)
);

CREATE TABLE books_tags (
  book_id BIGINT NOT NULL,
  tag_code VARCHAR(255) NOT NULL,
  CONSTRAINT pk_books_tags PRIMARY KEY (book_id, tag_code),
  CONSTRAINT fk_books_tags_book_id FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE,
  CONSTRAINT fk_books_tags_tag_code FOREIGN KEY (tag_code) REFERENCES tags (code) ON DELETE CASCADE
);
