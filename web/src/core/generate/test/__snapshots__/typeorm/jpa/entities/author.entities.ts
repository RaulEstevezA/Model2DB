// TypeORM entities written by Model2DB from Author. Review them before using them.
import { Check, Column, Entity, Index, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm'

export enum Genre {
  FICTION = 'FICTION',
  ESSAY = 'ESSAY',
  POETRY = 'POETRY',
  SCIENCE = 'SCIENCE',
}

@Unique('uq_authors_email', ['email'])
@Entity({ name: 'authors' })
export class Author {
  @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
  id!: string

  @Column({ name: 'name', type: 'varchar', length: 120 })
  name!: string

  @Column({ name: 'email', type: 'text' })
  email!: string

  @OneToMany(() => Book, (other) => other.author)
  books!: Book[]
}

@Check('ck_books_genre', 'genre IN (\'FICTION\', \'ESSAY\', \'POETRY\', \'SCIENCE\')')
@Unique('uq_books_isbn', ['isbn'])
@Index('ix_books_author_id', ['authorId'])
@Entity({ name: 'books' })
export class Book {
  @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
  id!: string

  @Column({ name: 'isbn', type: 'varchar', length: 13 })
  isbn!: string

  @Column({ name: 'title', type: 'text' })
  title!: string

  @Column({ name: 'price', type: 'decimal', precision: 8, scale: 2 })
  price!: string

  @Column({ name: 'published_on', type: 'date' })
  publishedOn!: Date

  @Column({ name: 'genre', type: 'varchar', length: 20 })
  genre!: Genre

  @Column({ name: 'author_id', type: 'bigint' })
  authorId!: string

  @Column({ name: 'shelf_room', type: 'text' })
  shelfRoom!: string

  @Column({ name: 'shelf_row', type: 'integer', nullable: true })
  shelfRow!: number | null

  @ManyToOne(() => Author, (other) => other.books, { nullable: false })
  @JoinColumn({ name: 'author_id', referencedColumnName: 'id' })
  author!: Author

  @ManyToMany(() => Tag)
  @JoinTable({ name: 'books_tags', joinColumn: { name: 'book_id', referencedColumnName: 'id' }, inverseJoinColumn: { name: 'tag_code', referencedColumnName: 'code' } })
  tags!: Tag[]
}

@Entity({ name: 'tags' })
export class Tag {
  @PrimaryColumn({ name: 'code', type: 'text' })
  code!: string

  @Column({ name: 'label', type: 'text' })
  label!: string
}
