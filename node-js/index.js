const express = require("express");
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "mariadb",
  port: parseInt(process.env.DB_PORT || "3306"),
  user: process.env.DB_USER || "benchmark",
  password: process.env.DB_PASSWORD || "benchmark",
  database: process.env.DB_NAME || "benchmark",
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0,
});

const QUERY = `
  SELECT
    d.name                                                        AS department,
    AVG(u.age)                                                    AS avg_age,
    AVG(u.salary)                                                 AS avg_salary,
    COUNT(u.id)                                                   AS employee_count,
    SUM(CASE WHEN u.salary > da.avg_sal THEN 1 ELSE 0 END)       AS above_avg_salary_count
  FROM users u
  JOIN departments d  ON u.department_id = d.id
  JOIN (
    SELECT department_id, AVG(salary) AS avg_sal
    FROM users
    GROUP BY department_id
  ) da ON u.department_id = da.department_id
  GROUP BY d.id, d.name
  ORDER BY avg_age DESC
`;

const app = express();

app.get("/get-age", async (_req, res) => {
  const [rows] = await pool.execute(QUERY);
  res.json({ departments: rows });
});

app.listen(8000, "0.0.0.0", () => {
  console.log("Node.js server listening on port 8000");
});
