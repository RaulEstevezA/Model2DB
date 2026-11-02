# Redis keys for User

Written by Model2DB. Review it before using it: nothing here has been run.
Redis keeps every value as text; the application writes and reads them as described here.

## `users:<key>`: a hash for each User

> TODO: decide how "User.posts" is stored (pending in the design).

The key is the value of `id`.

| Field | Holds |
| --- | --- |
| `id` | text |
| `email` | text |
| `name` | text; may be missing |
| `profile_bio` | text; may be missing |
| `profile_website` | text; may be missing |
| `created_at` | date (ISO 8601 text) |

## Search

`user-redis-search.redis` creates a search index for each hash, on the fields other keys point to and the ones chosen to be indexed. Run it with `redis-cli < user-redis-search.redis` on Redis 8, or Redis Stack.
