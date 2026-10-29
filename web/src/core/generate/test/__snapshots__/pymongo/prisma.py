"""PyMongo collections written by Model2DB from User. Run create_collections(db) once on an empty database."""

from pymongo import ASCENDING
from pymongo.database import Database

# The $jsonSchema validator of each collection
VALIDATORS = {
    "users": {
        "bsonType": "object",
        "required": ["_id", "email", "posts"],
        "properties": {
            "_id": {
                "bsonType": "string",
            },
            "email": {
                "bsonType": "string",
            },
            "name": {
                "bsonType": ["string", "null"],
            },
            "profile": {
                "bsonType": ["object", "null"],
                "properties": {
                    "bio": {
                        "bsonType": ["string", "null"],
                    },
                    "website": {
                        "bsonType": ["string", "null"],
                    },
                },
                "additionalProperties": False,
            },
            "posts": {
                "bsonType": "array",
                "items": {
                    "bsonType": "int",
                },
            },
            "created_at": {
                "bsonType": "date",
            },
        },
        "additionalProperties": False,
    },
    "posts": {
        "bsonType": "object",
        "required": ["_id", "title", "body", "author_id", "comments", "tags"],
        "properties": {
            "_id": {
                "bsonType": "int",
            },
            "title": {
                "bsonType": "string",
            },
            "body": {
                "bsonType": "string",
            },
            "published": {
                "bsonType": "bool",
            },
            "author_id": {
                "bsonType": "string",
            },
            "comments": {
                "bsonType": "array",
                "items": {
                    "bsonType": "object",
                    "required": ["text", "written_at"],
                    "properties": {
                        "text": {
                            "bsonType": "string",
                        },
                        "written_at": {
                            "bsonType": "date",
                        },
                        "rating": {
                            "bsonType": ["int", "null"],
                        },
                    },
                    "additionalProperties": False,
                },
            },
            "tags": {
                "bsonType": "array",
                "items": {
                    "bsonType": "string",
                },
            },
        },
        "additionalProperties": False,
    },
}

# (fields, name, unique) of each collection
INDEXES = {
    "users": [([("email", ASCENDING)], "uq_users_email", True)],
    "posts": [([("author_id", ASCENDING)], "ix_posts_author_id", False)],
}


def create_collections(db: Database) -> None:
    """Creates each collection with its validator, then its indexes."""
    for name, validator in VALIDATORS.items():
        db.create_collection(name, validator={"$jsonSchema": validator})
        for keys, index_name, unique in INDEXES[name]:
            db[name].create_index(keys, name=index_name, unique=unique)
