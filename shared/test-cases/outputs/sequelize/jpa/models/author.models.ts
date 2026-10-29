// Sequelize models written by Model2DB from Author. Review them before using them.
import { DataTypes, Model, Sequelize, type CreationOptional, type InferAttributes, type InferCreationAttributes, type NonAttribute } from 'sequelize'

export enum Genre {
  FICTION = 'FICTION',
  ESSAY = 'ESSAY',
  POETRY = 'POETRY',
  SCIENCE = 'SCIENCE',
}

export class Author extends Model<InferAttributes<Author>, InferCreationAttributes<Author>> {
  declare id: CreationOptional<string>
  declare name: string
  declare email: string
  declare books?: NonAttribute<Book[]>
}

export class Book extends Model<InferAttributes<Book>, InferCreationAttributes<Book>> {
  declare id: CreationOptional<string>
  declare isbn: string
  declare title: string
  declare price: string
  declare publishedOn: Date
  declare genre: Genre
  declare authorId: string
  declare shelfRoom: string
  declare shelfRow: CreationOptional<number | null>
  declare author?: NonAttribute<Author>
  declare tags?: NonAttribute<Tag[]>
}

export class Tag extends Model<InferAttributes<Tag>, InferCreationAttributes<Tag>> {
  declare code: string
  declare label: string
}

/** Defines every model and its associations on a Sequelize instance. */
export function initModels(sequelize: Sequelize): void {
  Author.init(
    {
      id: { type: DataTypes.BIGINT, field: 'id', primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: DataTypes.STRING(120), field: 'name', allowNull: false },
      email: { type: DataTypes.TEXT, field: 'email', allowNull: false },
    },
    { sequelize, tableName: 'authors', timestamps: false, indexes: [{ name: 'uq_authors_email', unique: true, fields: ['email'] }] },
  )
  Book.init(
    {
      id: { type: DataTypes.BIGINT, field: 'id', primaryKey: true, autoIncrement: true, allowNull: false },
      isbn: { type: DataTypes.STRING(13), field: 'isbn', allowNull: false },
      title: { type: DataTypes.TEXT, field: 'title', allowNull: false },
      price: { type: DataTypes.DECIMAL(8, 2), field: 'price', allowNull: false },
      publishedOn: { type: DataTypes.DATEONLY, field: 'published_on', allowNull: false },
      genre: { type: DataTypes.STRING(20), field: 'genre', allowNull: false, validate: { isIn: [['FICTION', 'ESSAY', 'POETRY', 'SCIENCE']] } },
      authorId: { type: DataTypes.BIGINT, field: 'author_id', allowNull: false },
      shelfRoom: { type: DataTypes.TEXT, field: 'shelf_room', allowNull: false },
      shelfRow: { type: DataTypes.INTEGER, field: 'shelf_row', allowNull: true },
    },
    { sequelize, tableName: 'books', timestamps: false, indexes: [{ name: 'uq_books_isbn', unique: true, fields: ['isbn'] }, { name: 'ix_books_author_id', unique: false, fields: ['author_id'] }] },
  )
  Tag.init(
    {
      code: { type: DataTypes.TEXT, field: 'code', primaryKey: true, allowNull: false },
      label: { type: DataTypes.TEXT, field: 'label', allowNull: false },
    },
    { sequelize, tableName: 'tags', timestamps: false },
  )
  Author.hasMany(Book, { as: 'books', foreignKey: 'authorId' })
  Book.belongsTo(Author, { as: 'author', foreignKey: 'authorId', targetKey: 'id' })
  Book.belongsToMany(Tag, { as: 'tags', through: 'books_tags', foreignKey: 'book_id', otherKey: 'tag_code', sourceKey: 'id', targetKey: 'code', timestamps: false })
}
