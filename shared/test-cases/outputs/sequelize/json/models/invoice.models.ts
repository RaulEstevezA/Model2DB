// Sequelize models written by Model2DB from Invoice. Review them before using them.
import { DataTypes, Model, Sequelize, type CreationOptional, type InferAttributes, type InferCreationAttributes, type NonAttribute } from 'sequelize'

export class Invoice extends Model<InferAttributes<Invoice>, InferCreationAttributes<Invoice>> {
  declare invoiceId: number
  declare number: string
  declare issuedAt: Date
  declare currency: string
  declare paid: boolean
  declare customerId: number
  declare notes: CreationOptional<unknown | null>
  declare customer?: NonAttribute<Customer>
  declare lines?: NonAttribute<Line[]>
  declare labels?: NonAttribute<InvoiceLabel[]>
}

export class Customer extends Model<InferAttributes<Customer>, InferCreationAttributes<Customer>> {
  declare customerId: number
  declare name: string
  declare email: string
  declare billingAddressStreet: string
  declare billingAddressCity: string
  declare billingAddressZipCode: string
}

export class Line extends Model<InferAttributes<Line>, InferCreationAttributes<Line>> {
  declare id: CreationOptional<string>
  declare description: string
  declare qty: number
  declare unitPrice: number
  declare taxRate: number
  declare invoiceId: number
  declare invoice?: NonAttribute<Invoice>
}

export class InvoiceLabel extends Model<InferAttributes<InvoiceLabel>, InferCreationAttributes<InvoiceLabel>> {
  declare invoiceId: number
  declare position: number
  declare value: string
  declare invoice?: NonAttribute<Invoice>
}

/** Defines every model and its associations on a Sequelize instance. */
export function initModels(sequelize: Sequelize): void {
  Invoice.init(
    {
      invoiceId: { type: DataTypes.INTEGER, field: 'invoice_id', primaryKey: true, allowNull: false },
      number: { type: DataTypes.TEXT, field: 'number', allowNull: false },
      issuedAt: { type: DataTypes.DATE, field: 'issued_at', allowNull: false },
      currency: { type: DataTypes.TEXT, field: 'currency', allowNull: false },
      paid: { type: DataTypes.BOOLEAN, field: 'paid', allowNull: false },
      customerId: { type: DataTypes.INTEGER, field: 'customer_id', allowNull: false },
      notes: { type: DataTypes.JSONB, field: 'notes', allowNull: true },
    },
    { sequelize, tableName: 'invoices', timestamps: false, indexes: [{ name: 'ix_invoices_customer_id', unique: false, fields: ['customer_id'] }] },
  )
  Customer.init(
    {
      customerId: { type: DataTypes.INTEGER, field: 'customer_id', primaryKey: true, allowNull: false },
      name: { type: DataTypes.TEXT, field: 'name', allowNull: false },
      email: { type: DataTypes.TEXT, field: 'email', allowNull: false },
      billingAddressStreet: { type: DataTypes.TEXT, field: 'billing_address_street', allowNull: false },
      billingAddressCity: { type: DataTypes.TEXT, field: 'billing_address_city', allowNull: false },
      billingAddressZipCode: { type: DataTypes.TEXT, field: 'billing_address_zip_code', allowNull: false },
    },
    { sequelize, tableName: 'customers', timestamps: false },
  )
  Line.init(
    {
      id: { type: DataTypes.BIGINT, field: 'id', primaryKey: true, autoIncrement: true, allowNull: false },
      description: { type: DataTypes.TEXT, field: 'description', allowNull: false },
      qty: { type: DataTypes.INTEGER, field: 'qty', allowNull: false },
      unitPrice: { type: DataTypes.DOUBLE, field: 'unit_price', allowNull: false },
      taxRate: { type: DataTypes.DOUBLE, field: 'tax_rate', allowNull: false },
      invoiceId: { type: DataTypes.INTEGER, field: 'invoice_id', allowNull: false },
    },
    { sequelize, tableName: 'lines', timestamps: false, indexes: [{ name: 'ix_lines_invoice_id', unique: false, fields: ['invoice_id'] }] },
  )
  InvoiceLabel.init(
    {
      invoiceId: { type: DataTypes.INTEGER, field: 'invoice_id', primaryKey: true, allowNull: false },
      position: { type: DataTypes.INTEGER, field: 'position', primaryKey: true, allowNull: false },
      value: { type: DataTypes.TEXT, field: 'value', allowNull: false },
    },
    { sequelize, tableName: 'invoice_labels', timestamps: false },
  )
  Invoice.belongsTo(Customer, { as: 'customer', foreignKey: 'customerId', targetKey: 'customerId' })
  Invoice.hasMany(Line, { as: 'lines', foreignKey: 'invoiceId' })
  Invoice.hasMany(InvoiceLabel, { as: 'labels', foreignKey: 'invoiceId' })
  Line.belongsTo(Invoice, { as: 'invoice', foreignKey: 'invoiceId', targetKey: 'invoiceId', onDelete: 'CASCADE' })
  InvoiceLabel.belongsTo(Invoice, { as: 'invoice', foreignKey: 'invoiceId', targetKey: 'invoiceId', onDelete: 'CASCADE' })
}
