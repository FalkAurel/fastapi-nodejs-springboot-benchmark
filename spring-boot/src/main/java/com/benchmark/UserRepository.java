package com.benchmark;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface UserRepository extends JpaRepository<User, Long> {

    @Query(nativeQuery = true, value = """
            SELECT
                d.name                                                        AS department,
                AVG(u.age)                                                    AS avgAge,
                AVG(u.salary)                                                 AS avgSalary,
                COUNT(u.id)                                                   AS employeeCount,
                SUM(CASE WHEN u.salary > da.avg_sal THEN 1 ELSE 0 END)       AS aboveAvgSalaryCount
            FROM users u
            JOIN departments d  ON u.department_id = d.id
            JOIN (
                SELECT department_id, AVG(salary) AS avg_sal
                FROM users
                GROUP BY department_id
            ) da ON u.department_id = da.department_id
            GROUP BY d.id, d.name
            ORDER BY avgAge DESC
            """)
    List<DepartmentStats> getDepartmentStats();
}
