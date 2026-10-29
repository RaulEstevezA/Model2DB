// TypeORM entities written by Model2DB from Invoice. Review them before using them.
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm'

@Index('ix_invoices_customer_id', ['customerId'])
@Entity({ name: 'invoices' })
export class Invoice {
  @PrimaryColumn({ name: 'invoice_id', type: 'integer' })
  invoiceId!: number

  @Column({ name: 'number', type: 'text' })
  number!: string

  @Column({ name: 'issued_at', type: 'timestamptz' })
  issuedAt!: Date

  @Column({ name: 'currency', type: 'text' })
  currency!: string

  @Column({ name: 'paid', type: 'boolean' })
  paid!: boolean

  @Column({ name: 'customer_id', type: 'integer' })
  customerId!: number

  @Column({ name: 'notes', type: 'jsonb', nullable: true })
  notes!: unknown | null

  @ManyToOne(() => Customer, { nullable: false })
  @JoinColumn({ name: 'customer_id', referencedColumnName: 'customerId' })
  customer!: Customer

  @OneToMany(() => Line, (other) => other.invoice)
  lines!: Line[]

  @OneToMany(() => InvoiceLabel, (other) => other.invoice)
  labels!: InvoiceLabel[]
}

@Entity({ name: 'customers' })
export class Customer {
  @PrimaryColumn({ name: 'customer_id', type: 'integer' })
  customerId!: number

  @Column({ name: 'name', type: 'text' })
  name!: string

  @Column({ name: 'email', type: 'text' })
  email!: string

  @Column({ name: 'billing_address_street', type: 'text' })
  billingAddressStreet!: string

  @Column({ name: 'billing_address_city', type: 'text' })
  billingAddressCity!: string

  @Column({ name: 'billing_address_zip_code', type: 'text' })
  billingAddressZipCode!: string
}

@Index('ix_lines_invoice_id', ['invoiceId'])
@Entity({ name: 'lines' })
export class Line {
  @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
  id!: string

  @Column({ name: 'description', type: 'text' })
  description!: string

  @Column({ name: 'qty', type: 'integer' })
  qty!: number

  @Column({ name: 'unit_price', type: 'double precision' })
  unitPrice!: number

  @Column({ name: 'tax_rate', type: 'double precision' })
  taxRate!: number

  @Column({ name: 'invoice_id', type: 'integer' })
  invoiceId!: number

  @ManyToOne(() => Invoice, (other) => other.lines, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id', referencedColumnName: 'invoiceId' })
  invoice!: Invoice
}

@Entity({ name: 'invoice_labels' })
export class InvoiceLabel {
  @PrimaryColumn({ name: 'invoice_id', type: 'integer' })
  invoiceId!: number

  @PrimaryColumn({ name: 'position', type: 'integer' })
  position!: number

  @Column({ name: 'value', type: 'text' })
  value!: string

  @ManyToOne(() => Invoice, (other) => other.labels, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id', referencedColumnName: 'invoiceId' })
  invoice!: Invoice
}
