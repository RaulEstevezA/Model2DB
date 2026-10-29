// Sequelize models written by Model2DB from Order. Review them before using them.
import { DataTypes, Model, Sequelize, type CreationOptional, type InferAttributes, type InferCreationAttributes, type NonAttribute } from 'sequelize'

export enum OrderStatus {
  Draft = 'draft',
  Paid = 'paid',
  Shipped = 'shipped',
  Cancelled = 'cancelled',
}

export class Customer extends Model<InferAttributes<Customer>, InferCreationAttributes<Customer>> {
  declare id: string
  declare email: string
  declare fullName: string
  declare phone: CreationOptional<string | null>
  declare createdAt: Date
  declare shippingAddressStreet: string
  declare shippingAddressCity: string
  declare shippingAddressPostalCode: string
  declare shippingAddressCountry: string
}

export class Order extends Model<InferAttributes<Order>, InferCreationAttributes<Order>> {
  declare id: string
  declare status: OrderStatus
  declare couponCode: CreationOptional<string | null>
  declare placedAt: Date
  declare customerId: string
  declare customer?: NonAttribute<Customer>
  declare lines?: NonAttribute<OrderLine[]>
  declare tags?: NonAttribute<OrderTag[]>
}

export class OrderLine extends Model<InferAttributes<OrderLine>, InferCreationAttributes<OrderLine>> {
  declare id: CreationOptional<string>
  declare quantity: number
  declare unitPrice: number
  declare orderId: string
  declare productId: string
  declare order?: NonAttribute<Order>
  declare product?: NonAttribute<Product>
}

export class Product extends Model<InferAttributes<Product>, InferCreationAttributes<Product>> {
  declare id: string
  declare sku: string
  declare name: string
  declare price: number
  declare attributes: unknown
  declare categories?: NonAttribute<Category[]>
}

export class Category extends Model<InferAttributes<Category>, InferCreationAttributes<Category>> {
  declare id: string
  declare name: string
  declare products?: NonAttribute<Product[]>
}

export class OrderTag extends Model<InferAttributes<OrderTag>, InferCreationAttributes<OrderTag>> {
  declare orderId: string
  declare position: number
  declare value: string
  declare order?: NonAttribute<Order>
}

/** Defines every model and its associations on a Sequelize instance. */
export function initModels(sequelize: Sequelize): void {
  Customer.init(
    {
      id: { type: DataTypes.BIGINT, field: 'id', primaryKey: true, allowNull: false },
      email: { type: DataTypes.TEXT, field: 'email', allowNull: false },
      fullName: { type: DataTypes.TEXT, field: 'full_name', allowNull: false },
      phone: { type: DataTypes.TEXT, field: 'phone', allowNull: true },
      createdAt: { type: DataTypes.DATE, field: 'created_at', allowNull: false },
      shippingAddressStreet: { type: DataTypes.TEXT, field: 'shipping_address_street', allowNull: false },
      shippingAddressCity: { type: DataTypes.TEXT, field: 'shipping_address_city', allowNull: false },
      shippingAddressPostalCode: { type: DataTypes.TEXT, field: 'shipping_address_postal_code', allowNull: false },
      shippingAddressCountry: { type: DataTypes.TEXT, field: 'shipping_address_country', allowNull: false },
    },
    { sequelize, tableName: 'customers', timestamps: false },
  )
  Order.init(
    {
      id: { type: DataTypes.BIGINT, field: 'id', primaryKey: true, allowNull: false },
      status: { type: DataTypes.STRING(20), field: 'status', allowNull: false, validate: { isIn: [['draft', 'paid', 'shipped', 'cancelled']] } },
      couponCode: { type: DataTypes.TEXT, field: 'coupon_code', allowNull: true },
      placedAt: { type: DataTypes.DATE, field: 'placed_at', allowNull: false },
      customerId: { type: DataTypes.BIGINT, field: 'customer_id', allowNull: false },
    },
    { sequelize, tableName: 'orders', timestamps: false, indexes: [{ name: 'ix_orders_customer_id', unique: false, fields: ['customer_id'] }] },
  )
  OrderLine.init(
    {
      id: { type: DataTypes.BIGINT, field: 'id', primaryKey: true, autoIncrement: true, allowNull: false },
      quantity: { type: DataTypes.DOUBLE, field: 'quantity', allowNull: false },
      unitPrice: { type: DataTypes.DOUBLE, field: 'unit_price', allowNull: false },
      orderId: { type: DataTypes.BIGINT, field: 'order_id', allowNull: false },
      productId: { type: DataTypes.BIGINT, field: 'product_id', allowNull: false },
    },
    { sequelize, tableName: 'order_lines', timestamps: false, indexes: [{ name: 'ix_order_lines_order_id', unique: false, fields: ['order_id'] }, { name: 'ix_order_lines_product_id', unique: false, fields: ['product_id'] }] },
  )
  Product.init(
    {
      id: { type: DataTypes.BIGINT, field: 'id', primaryKey: true, allowNull: false },
      sku: { type: DataTypes.TEXT, field: 'sku', allowNull: false },
      name: { type: DataTypes.TEXT, field: 'name', allowNull: false },
      price: { type: DataTypes.DOUBLE, field: 'price', allowNull: false },
      attributes: { type: DataTypes.JSONB, field: 'attributes', allowNull: false },
    },
    { sequelize, tableName: 'products', timestamps: false },
  )
  Category.init(
    {
      id: { type: DataTypes.BIGINT, field: 'id', primaryKey: true, allowNull: false },
      name: { type: DataTypes.TEXT, field: 'name', allowNull: false },
    },
    { sequelize, tableName: 'categories', timestamps: false },
  )
  OrderTag.init(
    {
      orderId: { type: DataTypes.BIGINT, field: 'order_id', primaryKey: true, allowNull: false },
      position: { type: DataTypes.INTEGER, field: 'position', primaryKey: true, allowNull: false },
      value: { type: DataTypes.TEXT, field: 'value', allowNull: false },
    },
    { sequelize, tableName: 'order_tags', timestamps: false },
  )
  Order.belongsTo(Customer, { as: 'customer', foreignKey: 'customerId', targetKey: 'id' })
  Order.hasMany(OrderLine, { as: 'lines', foreignKey: 'orderId' })
  Order.hasMany(OrderTag, { as: 'tags', foreignKey: 'orderId' })
  OrderLine.belongsTo(Order, { as: 'order', foreignKey: 'orderId', targetKey: 'id', onDelete: 'CASCADE' })
  OrderLine.belongsTo(Product, { as: 'product', foreignKey: 'productId', targetKey: 'id' })
  Product.belongsToMany(Category, { as: 'categories', through: 'categories_products', foreignKey: 'product_id', otherKey: 'category_id', sourceKey: 'id', targetKey: 'id', timestamps: false })
  Category.belongsToMany(Product, { as: 'products', through: 'categories_products', foreignKey: 'category_id', otherKey: 'product_id', sourceKey: 'id', targetKey: 'id', timestamps: false })
  OrderTag.belongsTo(Order, { as: 'order', foreignKey: 'orderId', targetKey: 'id', onDelete: 'CASCADE' })
}
