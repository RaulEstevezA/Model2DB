# Redis keys for Order

Written by Model2DB. Review it before using it: nothing here has been run.
Redis keeps every value as text; the application writes and reads them as described here.

## `customers:<key>`: a hash for each Customer

The key is the value of `id`.

| Field | Holds |
| --- | --- |
| `id` | number |
| `email` | text |
| `full_name` | text |
| `phone` | text; may be missing |
| `shipping_address_street` | text |
| `shipping_address_city` | text |
| `shipping_address_postal_code` | text |
| `shipping_address_country` | text |
| `created_at` | date (ISO 8601 text) |

## `orders:<key>`: a hash for each Order

> TODO: decide how "Order.lines" is stored (pending in the design).

The key is the value of `id`.

| Field | Holds |
| --- | --- |
| `id` | number |
| `customer_id` | key of a `customers` (`customers:<key>`) |
| `status` | text: `draft`, `paid`, `shipped`, `cancelled` |
| `coupon_code` | text; may be missing |
| `placed_at` | date (ISO 8601 text) |

Under the same key:

- `orders:<key>:tags`: list, each item text (from `Order.tags`)

## Search

`order-redis-search.redis` creates a search index for each hash, on the fields other keys point to and the ones chosen to be indexed. Run it with `redis-cli < order-redis-search.redis` on Redis 8, or Redis Stack.
