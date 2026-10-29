package com.example.model;

/** The values of Genre as the database stores them. */
public enum Genre {
    FICTION("FICTION"),
    ESSAY("ESSAY"),
    POETRY("POETRY"),
    SCIENCE("SCIENCE");

    private final String value;

    Genre(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }
}
