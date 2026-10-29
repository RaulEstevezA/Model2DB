-- SQLite schema written by Model2DB from Author.
-- Review it before running it: nothing here has been run.

PRAGMA foreign_keys = ON;

CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  CONSTRAINT uq_authors_email UNIQUE (email)
);

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  isbn TEXT NOT NULL,
  title TEXT NOT NULL,
  price NUMERIC NOT NULL,
  published_on TEXT NOT NULL,
  genre TEXT NOT NULL,
  author_id INTEGER NOT NULL,
  shelf_room TEXT NOT NULL,
  shelf_row INTEGER,
  CONSTRAINT uq_books_isbn UNIQUE (isbn),
  CONSTRAINT fk_books_author_id FOREIGN KEY (author_id) REFERENCES authors (id),
  CONSTRAINT ck_books_genre CHECK (genre IN ('FICTION', 'ESSAY', 'POETRY', 'SCIENCE'))
);
CREATE INDEX ix_books_author_id ON books (author_id);

CREATE TABLE tags (
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  CONSTRAINT pk_tags PRIMARY KEY (code)
);

CREATE TABLE books_tags (
  book_id INTEGER NOT NULL,
  tag_code TEXT NOT NULL,
  CONSTRAINT pk_books_tags PRIMARY KEY (book_id, tag_code),
  CONSTRAINT fk_books_tags_book_id FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE,
  CONSTRAINT fk_books_tags_tag_code FOREIGN KEY (tag_code) REFERENCES tags (code) ON DELETE CASCADE
);
