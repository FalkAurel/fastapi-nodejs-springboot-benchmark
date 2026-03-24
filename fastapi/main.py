from contextlib import asynccontextmanager
from fastapi import FastAPI
import aiomysql
import os

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "mariadb"),
    "port": int(os.getenv("DB_PORT", 3306)),
    "user": os.getenv("DB_USER", "benchmark"),
    "password": os.getenv("DB_PASSWORD", "benchmark"),
    "db": os.getenv("DB_NAME", "benchmark"),
    "minsize": 2,
    "maxsize": 10,
}

QUERY = """
    SELECT
        d.name                                                          AS department,
        AVG(u.age)                                                      AS avg_age,
        AVG(u.salary)                                                   AS avg_salary,
        COUNT(u.id)                                                     AS employee_count,
        SUM(CASE WHEN u.salary > da.avg_sal THEN 1 ELSE 0 END)         AS above_avg_salary_count
    FROM users u
    JOIN departments d  ON u.department_id = d.id
    JOIN (
        SELECT department_id, AVG(salary) AS avg_sal
        FROM users
        GROUP BY department_id
    ) da ON u.department_id = da.department_id
    GROUP BY d.id, d.name
    ORDER BY avg_age DESC
"""

pool = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pool
    pool = await aiomysql.create_pool(**DB_CONFIG)
    yield
    pool.close()
    await pool.wait_closed()


app = FastAPI(lifespan=lifespan)


@app.get("/get-age")
async def get_age():
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(QUERY)
            rows = await cur.fetchall()
    return {"departments": [dict(r) for r in rows]}
