"""PyMongo collections written by Model2DB from Invoice. Run create_collections(db) once on an empty database."""

from pymongo import ASCENDING
from pymongo.database import Database

# The $jsonSchema validator of each collection
VALIDATORS = {
    "invoices": {
        "bsonType": "object",
        "required": ["_id", "number", "issued_at", "currency", "paid", "customer", "lines", "labels"],
        "properties": {
            "_id": {
                "bsonType": "int",
            },
            "number": {
                "bsonType": "string",
            },
            "issued_at": {
                "bsonType": "date",
            },
            "currency": {
                "bsonType": "string",
            },
            "paid": {
                "bsonType": "bool",
            },
            "customer": {
                "bsonType": "object",
                "required": ["customer_id", "name", "email", "billing_address"],
                "properties": {
                    "customer_id": {
                        "bsonType": "int",
                    },
                    "name": {
                        "bsonType": "string",
                    },
                    "email": {
                        "bsonType": "string",
                    },
                    "billing_address": {
                        "bsonType": "object",
                        "required": ["street", "city", "zip_code"],
                        "properties": {
                            "street": {
                                "bsonType": "string",
                            },
                            "city": {
                                "bsonType": "string",
                            },
                            "zip_code": {
                                "bsonType": "string",
                            },
                        },
                        "additionalProperties": False,
                    },
                },
                "additionalProperties": False,
            },
            "lines": {
                "bsonType": "array",
                "items": {
                    "bsonType": "object",
                    "required": ["description", "qty", "unit_price", "tax_rate"],
                    "properties": {
                        "description": {
                            "bsonType": "string",
                        },
                        "qty": {
                            "bsonType": "int",
                        },
                        "unit_price": {
                            "bsonType": "double",
                        },
                        "tax_rate": {
                            "bsonType": "double",
                        },
                    },
                    "additionalProperties": False,
                },
            },
            "notes": {},
            "labels": {
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
    "invoices": [],
}


def create_collections(db: Database) -> None:
    """Creates each collection with its validator, then its indexes."""
    for name, validator in VALIDATORS.items():
        db.create_collection(name, validator={"$jsonSchema": validator})
        for keys, index_name, unique in INDEXES[name]:
            db[name].create_index(keys, name=index_name, unique=unique)
