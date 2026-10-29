"""Built-in examples, with invented data. The same as web/src/examples/index.ts: shared/test-cases/outputs/
checks that both versions write the same files for them."""

STORE = """\
// An online shop: customers, orders, products and categories
export interface Customer {
  id: number
  email: string
  fullName: string
  phone?: string
  shippingAddress: Address
  createdAt: Date
}

export interface Address {
  street: string
  city: string
  postalCode: string
  country: string
}

export enum OrderStatus {
  Draft = 'draft',
  Paid = 'paid',
  Shipped = 'shipped',
  Cancelled = 'cancelled',
}

export interface Order {
  id: number
  customer: Customer
  status: OrderStatus
  lines: OrderLine[]
  couponCode: string | null
  tags: string[]
  placedAt: Date
}

export interface OrderLine {
  product: Product
  quantity: number
  unitPrice: number
}

export interface Product {
  id: number
  sku: string
  name: string
  price: number
  categories: Category[]
  attributes: Record<string, string>
}

export interface Category {
  id: number
  name: string
  products: Product[]
}
"""

JPA = """\
package com.example.library;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Entity
public class Author {
    @Id
    @GeneratedValue
    private Long id;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(unique = true)
    private String email;

    @OneToMany(mappedBy = "author")
    private List<Book> books;
}

@Entity
public class Book {
    @Id
    @GeneratedValue
    private Long id;

    @Column(nullable = false, unique = true, length = 13)
    private String isbn;

    @Column(nullable = false)
    private String title;

    @ManyToOne
    private Author author;

    @Column(precision = 8, scale = 2)
    private BigDecimal price;

    private LocalDate publishedOn;

    @Enumerated(EnumType.STRING)
    private Genre genre;

    @Embedded
    private Shelf shelf;

    @ManyToMany
    private List<Tag> tags;
}

@Embeddable
public class Shelf {
    private String room;
    private Integer row;
}

@Entity
public class Tag {
    @Id
    private String code;
    private String label;
}

public enum Genre { FICTION, ESSAY, POETRY, SCIENCE }
"""

JSON = """\
{
  "invoice_id": 1048,
  "number": "INV-2026-0042",
  "issued_at": "2026-10-28T09:30:00Z",
  "currency": "EUR",
  "paid": false,
  "customer": {
    "customer_id": 311,
    "name": "Raúl Estévez",
    "email": "raul@example.com",
    "billing_address": {
      "street": "Calle del Olmo 7",
      "city": "Villaluna",
      "zip_code": "28999"
    }
  },
  "lines": [
    { "description": "Annual plan", "qty": 1, "unit_price": 120.0, "tax_rate": 0.21 },
    { "description": "Extra seats", "qty": 3, "unit_price": 15.5, "tax_rate": 0.21 }
  ],
  "notes": null,
  "labels": ["priority", "renewal"]
}
"""

PRISMA = """\
// A blog in Prisma, opened for a document database
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?
  profile   Profile?
  posts     Post[]
  createdAt DateTime @default(now())
}

model Profile {
  bio     String?
  website String?
}

model Post {
  id        Int       @id @default(autoincrement())
  title     String    @db.VarChar(200)
  body      String
  published Boolean   @default(false)
  author    User      @relation(fields: [authorId], references: [id])
  authorId  String
  comments  Comment[]
  tags      String[]
}

model Comment {
  text      String
  writtenAt DateTime
  rating    Int?
}
"""

# id, input format, the output it opens with, text
EXAMPLES = (
    {"id": "store", "format": "typescript", "output": "postgresql", "text": STORE},
    {"id": "jpa", "format": "java", "output": "mysql", "text": JPA},
    {"id": "json", "format": "json", "output": "sqlite", "text": JSON},
    {"id": "prisma", "format": "prisma", "output": "mongodb", "text": PRISMA},
)


def find_example(example_id: str) -> dict | None:
    return next((example for example in EXAMPLES if example["id"] == example_id), None)
