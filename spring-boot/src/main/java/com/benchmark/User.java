package com.benchmark;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;
    private int age;
    private BigDecimal salary;

    @Column(name = "department_id")
    private Long departmentId;

    public Long getId() { return id; }
    public String getName() { return name; }
    public int getAge() { return age; }
    public BigDecimal getSalary() { return salary; }
    public Long getDepartmentId() { return departmentId; }
}
