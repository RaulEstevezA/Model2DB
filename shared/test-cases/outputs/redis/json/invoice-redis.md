# Redis keys for Invoice

Written by Model2DB. Review it before using it: nothing here has been run.
Redis keeps every value as text; the application writes and reads them as described here.

## `invoices:<key>`: a hash for each Invoice

> TODO: decide how "Invoice.lines" is stored (pending in the design).

The key is the value of `invoice_id`.

| Field | Holds |
| --- | --- |
| `invoice_id` | number |
| `number` | text |
| `issued_at` | date (ISO 8601 text) |
| `currency` | text |
| `paid` | `true` or `false` |
| `customer_id` | key of a `customers` (`customers:<key>`) |
| `notes` | JSON text; may be missing |

Under the same key:

- `invoices:<key>:labels`: list, each item text (from `Invoice.labels`)

## `customers:<key>`: a hash for each Customer

The key is the value of `customer_id`.

| Field | Holds |
| --- | --- |
| `customer_id` | number |
| `name` | text |
| `email` | text |
| `billing_address_street` | text |
| `billing_address_city` | text |
| `billing_address_zip_code` | text |

## Search

`invoice-redis-search.redis` creates a search index for each hash, on the fields other keys point to and the ones chosen to be indexed. Run it with `redis-cli < invoice-redis-search.redis` on Redis 8, or Redis Stack.
