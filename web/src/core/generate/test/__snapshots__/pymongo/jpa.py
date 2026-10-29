"""PyMongo collections written by Model2DB from Author. Run create_collections(db) once on an empty database."""

from pymongo import ASCENDING
from pymongo.database import Database

# The $jsonSchema validator of each collection
VALIDATORS = {
    "authors": {
        "bsonType": "object",
        "required": ["_id", "name", "email", "books"],
        "properties": {
            "_id": {
                "bsonType": "long",
            },
            "name": {
                "bsonType": "string",
            },
            "email": {
                "bsonType": "string",
            },
            "books": {
                "bsonType": "array",
                "items": {
                    "bsonType": "long",
                },
            },
        },
        "additionalProperties": False,
    },
    "books": {
        "bsonType": "object",
        "required": ["_id", "isbn", "title", "author", "price", "published_on", "genre", "shelf", "tags"],
        "properties": {
            "_id": {
                "bsonType": "long",
            },
            "isbn": {
                "bsonType": "string",
            },
            "title": {
                "bsonType": "string",
            },
            "author": {
                "bsonType": "long",
            },
            "price": {
                "bsonType": "decimal",
            },
            "published_on": {
                "bsonType": "date",
            },
            "genre": {
                "enum": ["FICTION", "ESSAY", "POETRY", "SCIENCE"],
            },
            "shelf": {
                "bsonType": "object",
                "required": ["room"],
                "properties": {
                    "room": {
                        "bsonType": "string",
                    },
                    "row": {
                        "bsonType": ["int", "null"],
                    },
                },
                "additionalProperties": False,
            },
            "tags": {
                "bsonType": "array",
                "items": {
                    "bsonType": "object",
                    "required": ["code", "label"],
                    "properties": {
                        "code": {
                            "bsonType": "string",
                        },
                        "label": {
                            "bsonType": "string",
                        },
                    },
                    "additionalProperties": False,
                },
            },
        },
        "additionalProperties": False,
    },
}

# (fields, name, unique) of each collection
INDEXES = {
    "authors": [([("email", ASCENDING)], "uq_authors_email", True)],
    "books": [([("isbn", ASCENDING)], "uq_books_isbn", True), ([("author", ASCENDING)], "ix_books_author", False)],
}


def create_collections(db: Database) -> None:
    """Creates each collection with its validator, then its indexes."""
    for name, validator in VALIDATORS.items():
        db.create_collection(name, validator={"$jsonSchema": validator})
        for keys, index_name, unique in INDEXES[name]:
            db[name].create_index(keys, name=index_name, unique=unique)
