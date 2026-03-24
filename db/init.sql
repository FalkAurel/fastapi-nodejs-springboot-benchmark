CREATE DATABASE IF NOT EXISTS benchmark;
USE benchmark;

CREATE TABLE departments (
    id   INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

CREATE TABLE users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(100)   NOT NULL,
    age           INT            NOT NULL,
    salary        DECIMAL(10,2)  NOT NULL,
    department_id INT            NOT NULL,
    FOREIGN KEY (department_id) REFERENCES departments(id)
);

INSERT INTO departments (name) VALUES
    ('Engineering'), ('Marketing'), ('Sales'), ('HR'), ('Finance'),
    ('Operations'), ('Legal'), ('Product'), ('Design'), ('Support');

SET max_recursive_iterations = 10000;
INSERT INTO users (name, age, salary, department_id)
WITH RECURSIVE seq (n) AS (
    SELECT 1
    UNION ALL
    SELECT n + 1 FROM seq WHERE n < 10000
)
SELECT
    CONCAT('User_', n),
    18 + (n MOD 63),
    30000 + (n MOD 90000),
    1 + (n MOD 10)
FROM seq;
