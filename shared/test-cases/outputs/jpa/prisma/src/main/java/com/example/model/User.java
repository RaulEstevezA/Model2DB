package com.example.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

/** Entity written by Model2DB from User. Review it before using it. */
@Entity
@Table(name = "users", uniqueConstraints = { @UniqueConstraint(name = "uq_users_email", columnNames = { "email" }) })
public class User {
    @Id
    @Column(name = "id", nullable = false)
    private String id;

    @Column(name = "email", nullable = false)
    private String email;

    @Column(name = "name")
    private String name;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "profile_bio")
    private String profileBio;

    @Column(name = "profile_website")
    private String profileWebsite;

    @OneToMany(mappedBy = "author")
    private List<Post> posts = new ArrayList<>();

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public String getProfileBio() {
        return profileBio;
    }

    public void setProfileBio(String profileBio) {
        this.profileBio = profileBio;
    }

    public String getProfileWebsite() {
        return profileWebsite;
    }

    public void setProfileWebsite(String profileWebsite) {
        this.profileWebsite = profileWebsite;
    }

    public List<Post> getPosts() {
        return posts;
    }

    public void setPosts(List<Post> posts) {
        this.posts = posts;
    }
}
