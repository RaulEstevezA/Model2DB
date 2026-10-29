-- SQL Server schema written by Model2DB from Author.
-- Review it before running it: nothing here has been run.

CREATE TABLE authors (
  id BIGINT IDENTITY(1, 1) NOT NULL,
  name NVARCHAR(120) NOT NULL,
  email NVARCHAR(255) NOT NULL,
  CONSTRAINT pk_authors PRIMARY KEY (id),
  CONSTRAINT uq_authors_email UNIQUE (email)
);

CREATE TABLE books (
  id BIGINT IDENTITY(1, 1) NOT NULL,
  isbn NVARCHAR(13) NOT NULL,
  title NVARCHAR(255) NOT NULL,
  price DECIMAL(8, 2) NOT NULL,
  published_on DATE NOT NULL,
  genre NVARCHAR(20) NOT NULL,
  author_id BIGINT NOT NULL,
  shelf_room NVARCHAR(255) NOT NULL,
  shelf_row INT,
  CONSTRAINT pk_books PRIMARY KEY (id),
  CONSTRAINT uq_books_isbn UNIQUE (isbn),
  CONSTRAINT fk_books_author_id FOREIGN KEY (author_id) REFERENCES authors (id),
  CONSTRAINT ck_books_genre CHECK (genre IN ('FICTION', 'ESSAY', 'POETRY', 'SCIENCE'))
);
CREATE INDEX ix_books_author_id ON books (author_id);

CREATE TABLE tags (
  code NVARCHAR(255) NOT NULL,
  label NVARCHAR(255) NOT NULL,
  CONSTRAINT pk_tags PRIMARY KEY (code)
);

CREATE TABLE books_tags (
  book_id BIGINT NOT NULL,
  tag_code NVARCHAR(255) NOT NULL,
  CONSTRAINT pk_books_tags PRIMARY KEY (book_id, tag_code),
  CONSTRAINT fk_books_tags_book_id FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE,
  CONSTRAINT fk_books_tags_tag_code FOREIGN KEY (tag_code) REFERENCES tags (code) ON DELETE CASCADE
);
