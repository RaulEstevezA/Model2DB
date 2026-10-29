// TypeORM entities written by Model2DB from User. Review them before using them.
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm'

@Unique('uq_users_email', ['email'])
@Entity({ name: 'users' })
export class User {
  @PrimaryColumn({ name: 'id', type: 'text' })
  id!: string

  @Column({ name: 'email', type: 'text' })
  email!: string

  @Column({ name: 'name', type: 'text', nullable: true })
  name!: string | null

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date

  @Column({ name: 'profile_bio', type: 'text', nullable: true })
  profileBio!: string | null

  @Column({ name: 'profile_website', type: 'text', nullable: true })
  profileWebsite!: string | null

  @OneToMany(() => Post, (other) => other.author)
  posts!: Post[]
}

@Index('ix_posts_author_id', ['authorId'])
@Entity({ name: 'posts' })
export class Post {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number

  @Column({ name: 'title', type: 'varchar', length: 200 })
  title!: string

  @Column({ name: 'body', type: 'text' })
  body!: string

  @Column({ name: 'published', type: 'boolean', default: false })
  published!: boolean

  @Column({ name: 'author_id', type: 'text' })
  authorId!: string

  @ManyToOne(() => User, (other) => other.posts, { nullable: false })
  @JoinColumn({ name: 'author_id', referencedColumnName: 'id' })
  author!: User

  @OneToMany(() => Comment, (other) => other.post)
  comments!: Comment[]

  @OneToMany(() => PostTag, (other) => other.post)
  tags!: PostTag[]
}

@Index('ix_comments_post_id', ['postId'])
@Entity({ name: 'comments' })
export class Comment {
  @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
  id!: string

  @Column({ name: 'text', type: 'text' })
  text!: string

  @Column({ name: 'written_at', type: 'timestamptz' })
  writtenAt!: Date

  @Column({ name: 'rating', type: 'integer', nullable: true })
  rating!: number | null

  @Column({ name: 'post_id', type: 'integer' })
  postId!: number

  @ManyToOne(() => Post, (other) => other.comments, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id', referencedColumnName: 'id' })
  post!: Post
}

@Entity({ name: 'post_tags' })
export class PostTag {
  @PrimaryColumn({ name: 'post_id', type: 'integer' })
  postId!: number

  @PrimaryColumn({ name: 'position', type: 'integer' })
  position!: number

  @Column({ name: 'value', type: 'text' })
  value!: string

  @ManyToOne(() => Post, (other) => other.tags, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id', referencedColumnName: 'id' })
  post!: Post
}
