// TypeORM entities written by Model2DB from Order. Review them before using them.
import { Check, Column, Entity, Index, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm'

export enum OrderStatus {
  Draft = 'draft',
  Paid = 'paid',
  Shipped = 'shipped',
  Cancelled = 'cancelled',
}

@Entity({ name: 'customers' })
export class Customer {
  @PrimaryColumn({ name: 'id', type: 'bigint' })
  id!: string

  @Column({ name: 'email', type: 'text' })
  email!: string

  @Column({ name: 'full_name', type: 'text' })
  fullName!: string

  @Column({ name: 'phone', type: 'text', nullable: true })
  phone!: string | null

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @Column({ name: 'shipping_address_street', type: 'text' })
  shippingAddressStreet!: string

  @Column({ name: 'shipping_address_city', type: 'text' })
  shippingAddressCity!: string

  @Column({ name: 'shipping_address_postal_code', type: 'text' })
  shippingAddressPostalCode!: string

  @Column({ name: 'shipping_address_country', type: 'text' })
  shippingAddressCountry!: string
}

@Check('ck_orders_status', 'status IN (\'draft\', \'paid\', \'shipped\', \'cancelled\')')
@Index('ix_orders_customer_id', ['customerId'])
@Entity({ name: 'orders' })
export class Order {
  @PrimaryColumn({ name: 'id', type: 'bigint' })
  id!: string

  @Column({ name: 'status', type: 'varchar', length: 20 })
  status!: OrderStatus

  @Column({ name: 'coupon_code', type: 'text', nullable: true })
  couponCode!: string | null

  @Column({ name: 'placed_at', type: 'timestamptz' })
  placedAt!: Date

  @Column({ name: 'customer_id', type: 'bigint' })
  customerId!: string

  @ManyToOne(() => Customer, { nullable: false })
  @JoinColumn({ name: 'customer_id', referencedColumnName: 'id' })
  customer!: Customer

  @OneToMany(() => OrderLine, (other) => other.order)
  lines!: OrderLine[]

  @OneToMany(() => OrderTag, (other) => other.order)
  tags!: OrderTag[]
}

@Index('ix_order_lines_order_id', ['orderId'])
@Index('ix_order_lines_product_id', ['productId'])
@Entity({ name: 'order_lines' })
export class OrderLine {
  @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
  id!: string

  @Column({ name: 'quantity', type: 'double precision' })
  quantity!: number

  @Column({ name: 'unit_price', type: 'double precision' })
  unitPrice!: number

  @Column({ name: 'order_id', type: 'bigint' })
  orderId!: string

  @Column({ name: 'product_id', type: 'bigint' })
  productId!: string

  @ManyToOne(() => Order, (other) => other.lines, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id', referencedColumnName: 'id' })
  order!: Order

  @ManyToOne(() => Product, { nullable: false })
  @JoinColumn({ name: 'product_id', referencedColumnName: 'id' })
  product!: Product
}

@Entity({ name: 'products' })
export class Product {
  @PrimaryColumn({ name: 'id', type: 'bigint' })
  id!: string

  @Column({ name: 'sku', type: 'text' })
  sku!: string

  @Column({ name: 'name', type: 'text' })
  name!: string

  @Column({ name: 'price', type: 'double precision' })
  price!: number

  @Column({ name: 'attributes', type: 'jsonb' })
  attributes!: unknown

  @ManyToMany(() => Category, (other) => other.products)
  @JoinTable({ name: 'categories_products', joinColumn: { name: 'product_id', referencedColumnName: 'id' }, inverseJoinColumn: { name: 'category_id', referencedColumnName: 'id' } })
  categories!: Category[]
}

@Entity({ name: 'categories' })
export class Category {
  @PrimaryColumn({ name: 'id', type: 'bigint' })
  id!: string

  @Column({ name: 'name', type: 'text' })
  name!: string

  @ManyToMany(() => Product, (other) => other.categories)
  products!: Product[]
}

@Entity({ name: 'order_tags' })
export class OrderTag {
  @PrimaryColumn({ name: 'order_id', type: 'bigint' })
  orderId!: string

  @PrimaryColumn({ name: 'position', type: 'integer' })
  position!: number

  @Column({ name: 'value', type: 'text' })
  value!: string

  @ManyToOne(() => Order, (other) => other.tags, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id', referencedColumnName: 'id' })
  order!: Order
}
