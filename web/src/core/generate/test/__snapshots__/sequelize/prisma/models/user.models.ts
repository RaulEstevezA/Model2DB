// Sequelize models written by Model2DB from User. Review them before using them.
import { DataTypes, Model, Sequelize, type CreationOptional, type InferAttributes, type InferCreationAttributes, type NonAttribute } from 'sequelize'

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: string
  declare email: string
  declare name: CreationOptional<string | null>
  declare createdAt: CreationOptional<Date>
  declare profileBio: CreationOptional<string | null>
  declare profileWebsite: CreationOptional<string | null>
  declare posts?: NonAttribute<Post[]>
}

export class Post extends Model<InferAttributes<Post>, InferCreationAttributes<Post>> {
  declare id: CreationOptional<number>
  declare title: string
  declare body: string
  declare published: CreationOptional<boolean>
  declare authorId: string
  declare author?: NonAttribute<User>
  declare comments?: NonAttribute<Comment[]>
  declare tags?: NonAttribute<PostTag[]>
}

export class Comment extends Model<InferAttributes<Comment>, InferCreationAttributes<Comment>> {
  declare id: CreationOptional<string>
  declare text: string
  declare writtenAt: Date
  declare rating: CreationOptional<number | null>
  declare postId: number
  declare post?: NonAttribute<Post>
}

export class PostTag extends Model<InferAttributes<PostTag>, InferCreationAttributes<PostTag>> {
  declare postId: number
  declare position: number
  declare value: string
  declare post?: NonAttribute<Post>
}

/** Defines every model and its associations on a Sequelize instance. */
export function initModels(sequelize: Sequelize): void {
  User.init(
    {
      id: { type: DataTypes.TEXT, field: 'id', primaryKey: true, allowNull: false },
      email: { type: DataTypes.TEXT, field: 'email', allowNull: false },
      name: { type: DataTypes.TEXT, field: 'name', allowNull: true },
      createdAt: { type: DataTypes.DATE, field: 'created_at', allowNull: false, defaultValue: DataTypes.NOW },
      profileBio: { type: DataTypes.TEXT, field: 'profile_bio', allowNull: true },
      profileWebsite: { type: DataTypes.TEXT, field: 'profile_website', allowNull: true },
    },
    { sequelize, tableName: 'users', timestamps: false, indexes: [{ name: 'uq_users_email', unique: true, fields: ['email'] }] },
  )
  Post.init(
    {
      id: { type: DataTypes.INTEGER, field: 'id', primaryKey: true, autoIncrement: true, allowNull: false },
      title: { type: DataTypes.STRING(200), field: 'title', allowNull: false },
      body: { type: DataTypes.TEXT, field: 'body', allowNull: false },
      published: { type: DataTypes.BOOLEAN, field: 'published', allowNull: false, defaultValue: false },
      authorId: { type: DataTypes.TEXT, field: 'author_id', allowNull: false },
    },
    { sequelize, tableName: 'posts', timestamps: false, indexes: [{ name: 'ix_posts_author_id', unique: false, fields: ['author_id'] }] },
  )
  Comment.init(
    {
      id: { type: DataTypes.BIGINT, field: 'id', primaryKey: true, autoIncrement: true, allowNull: false },
      text: { type: DataTypes.TEXT, field: 'text', allowNull: false },
      writtenAt: { type: DataTypes.DATE, field: 'written_at', allowNull: false },
      rating: { type: DataTypes.INTEGER, field: 'rating', allowNull: true },
      postId: { type: DataTypes.INTEGER, field: 'post_id', allowNull: false },
    },
    { sequelize, tableName: 'comments', timestamps: false, indexes: [{ name: 'ix_comments_post_id', unique: false, fields: ['post_id'] }] },
  )
  PostTag.init(
    {
      postId: { type: DataTypes.INTEGER, field: 'post_id', primaryKey: true, allowNull: false },
      position: { type: DataTypes.INTEGER, field: 'position', primaryKey: true, allowNull: false },
      value: { type: DataTypes.TEXT, field: 'value', allowNull: false },
    },
    { sequelize, tableName: 'post_tags', timestamps: false },
  )
  User.hasMany(Post, { as: 'posts', foreignKey: 'authorId' })
  Post.belongsTo(User, { as: 'author', foreignKey: 'authorId', targetKey: 'id' })
  Post.hasMany(Comment, { as: 'comments', foreignKey: 'postId' })
  Post.hasMany(PostTag, { as: 'tags', foreignKey: 'postId' })
  Comment.belongsTo(Post, { as: 'post', foreignKey: 'postId', targetKey: 'id', onDelete: 'CASCADE' })
  PostTag.belongsTo(Post, { as: 'post', foreignKey: 'postId', targetKey: 'id', onDelete: 'CASCADE' })
}
