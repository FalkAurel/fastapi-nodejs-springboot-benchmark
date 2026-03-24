# 🚀 framework-benchmark

> A reproducible, containerised performance benchmark comparing **FastAPI**, **Node.js / Express**, and **Spring Boot** under identical load conditions — measuring HTTP response time and memory consumption.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Business Logic](#business-logic)
- [Load Test Configuration](#load-test-configuration)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Monitoring](#monitoring)
- [Project Structure](#project-structure)

---

## Overview

All three frameworks expose the **same endpoint** (`GET /get-age`) performing the **same database query** against the **same dataset**. This isolates framework and runtime performance from algorithmic differences.

| Metric | Tool |
|---|---|
| HTTP response time | k6 → InfluxDB → Grafana |
| Container memory usage | Telegraf → InfluxDB → Grafana |
| Load generation | k6 (50 VUs × 30 s per service) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Docker Network                             │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    k6  Load Generator                        │  │
│  │              50 VUs · 30 s · 3 parallel scenarios            │  │
│  └───────┬──────────────────┬──────────────────┬───────────────┘  │
│          │                  │                  │                   │
│          ▼                  ▼                  ▼                   │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐           │
│  │   FastAPI     │ │   Node.js     │ │  Spring Boot  │           │
│  │  Python 3.12  │ │   Node 20     │ │    Java 21    │           │
│  │   port 8001   │ │   port 8002   │ │   port 8003   │           │
│  └───────┬───────┘ └───────┬───────┘ └───────┬───────┘           │
│          └─────────────────┼─────────────────┘                   │
│                            │  SQL query (all via connection pool) │
│                            ▼                                      │
│                   ┌─────────────────┐                            │
│                   │    MariaDB 11   │                            │
│                   │  10 000 users   │                            │
│                   │  10 departments │                            │
│                   └─────────────────┘                            │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │                  Observability Stack                      │   │
│  │                                                           │   │
│  │  k6 metrics ──────────────────────────┐                  │   │
│  │                                       ▼                  │   │
│  │  Telegraf ──► Docker Stats ──► InfluxDB 1.8 ──► Grafana  │   │
│  │  (every 3 s)   (via socket-proxy)   port 8086   port 3000│   │
│  └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Service Dependencies

```
mariadb (healthy)
    ├── fastapi  (healthy) ──┐
    ├── nodejs   (healthy) ──┼── k6 (starts load test)
    └── springboot (healthy)─┘

influxdb
    ├── grafana
    ├── telegraf
    └── k6 (writes metrics here)
```

---

## Business Logic

Every service implements one endpoint that runs the same SQL query on every request. There is **no caching** — each HTTP call hits the database.

### Endpoint

```
GET /get-age
```

### Database Schema

```
┌─────────────────────┐        ┌──────────────────────────────┐
│     departments     │        │           users              │
├─────────────────────┤        ├──────────────────────────────┤
│ id   INT  PK        │◄───FK──│ id            INT  PK        │
│ name VARCHAR(100)   │        │ name          VARCHAR(100)   │
└─────────────────────┘        │ age           INT  (18–80)   │
                                │ salary        DECIMAL(10,2)  │
  10 rows:                      │               (30k – 120k)   │
  Engineering, Marketing,       │ department_id INT  FK        │
  Sales, HR, Finance,           └──────────────────────────────┘
  Operations, Legal,
  Product, Design, Support        10 000 rows (cyclic, via CTE)
```

### The SQL Query

```sql
SELECT
    d.name                                                      AS department,
    AVG(u.age)                                                  AS avg_age,
    AVG(u.salary)                                               AS avg_salary,
    COUNT(u.id)                                                 AS employee_count,
    SUM(CASE WHEN u.salary > da.avg_sal THEN 1 ELSE 0 END)     AS above_avg_salary_count
FROM users u
JOIN departments d ON u.department_id = d.id
JOIN (
    SELECT department_id, AVG(salary) AS avg_sal      -- ← derived table subquery
    FROM users
    GROUP BY department_id
) da ON u.department_id = da.department_id
GROUP BY d.id, d.name
ORDER BY avg_age DESC;
```

**Why this query is demanding:**

| Operation | What the database does |
|---|---|
| `JOIN departments` | Resolves the department name for every user row |
| Subquery (derived table) | Full second scan of `users` to compute per-department salary averages |
| `JOIN` on subquery | Attaches the derived average to every user row |
| `CASE WHEN + SUM` | Row-by-row comparison of individual salary vs. department average |
| `GROUP BY + ORDER BY` | Collapses 10 000 rows into 10 grouped & sorted result rows |

### Example Response

```json
{
  "departments": [
    {
      "department":             "Finance",
      "avg_age":                49.31,
      "avg_salary":             74850.00,
      "employee_count":         1000,
      "above_avg_salary_count": 487
    },
    { "department": "Engineering", "...": "..." },
    { "..." }
  ]
}
```

### Framework Implementations

```
FastAPI (Python)          Node.js (Express)         Spring Boot (Java)
─────────────────         ─────────────────         ──────────────────
async def get_age()       app.get('/get-age',        @GetMapping("/get-age")
  async with pool:          async (_req, res) => {   public Map getAge() {
    await cur.execute(Q)      const [rows] =           return Map.of(
    return fetchall()           await pool               "departments",
                                  .execute(Q);            userRepository
aiomysql pool               res.json({rows});              .getDepartmentStats()
  min=2 / max=10          }                          );
  non-blocking I/O                                   }
                          mysql2/promise pool
                            limit=10                 HikariCP pool
                            non-blocking I/O           min=2 / max=10
                                                       thread-per-request
```

---

## Load Test Configuration

k6 runs **3 scenarios in parallel**, one per service:

```
Timeline (each scenario independent):

  t=0s                              t=30s
   │                                  │
   ├──── fastapi    [50 VUs] ─────────┤
   ├──── nodejs     [50 VUs] ─────────┤
   └──── springboot [50 VUs] ─────────┘

  After 30 s: 5 s pause → repeat indefinitely
```

| Parameter | Value |
|---|---|
| Executor | `constant-vus` |
| Virtual users per service | 50 |
| Duration per run | 30 s |
| Sleep between requests | 100 ms |
| Loop | ∞ (until `docker compose down`) |
| Metrics output | InfluxDB at `http://influxdb:8086/k6` |

---

## Tech Stack

| Component | Technology | Version |
|---|---|---|
| Load testing | [k6](https://k6.io) | 0.50.0 |
| Python framework | [FastAPI](https://fastapi.tiangolo.com) + Uvicorn | 0.110.0 |
| JS framework | [Express.js](https://expressjs.com) | 4.18.2 |
| Java framework | [Spring Boot](https://spring.io/projects/spring-boot) | 3.2.4 |
| Database | [MariaDB](https://mariadb.org) | 11 |
| Metrics storage | [InfluxDB](https://www.influxdata.com) | 1.8 |
| Metrics collection | [Telegraf](https://www.influxdata.com/time-series-platform/telegraf/) | 1.30 |
| Dashboards | [Grafana](https://grafana.com) | 10.4.0 |
| Container runtime | Docker + Compose | — |

---

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) ≥ 24
- [Docker Compose](https://docs.docker.com/compose/) ≥ 2.20 (included in Docker Desktop)

### Run the benchmark

```bash
# Clone the repository
git clone https://github.com/FalkAurel/fastapi-nodejs-springboot-benchmark.git
cd fastapi-nodejs-springboot-benchmark

# Build images and start all services
docker compose up --build
```

Docker Compose will:
1. Start **MariaDB** and seed 10 000 rows
2. Build and start **FastAPI**, **Node.js**, and **Spring Boot** services
3. Wait for all three services to pass their health checks
4. Start **k6** and begin load testing automatically
5. Start **Telegraf** to collect container memory stats
6. Provide **Grafana** at `http://localhost:3000`

> Spring Boot may take ~60 s to become healthy on the first run (JVM warm-up + image build).

### Stop everything

```bash
docker compose down
```

### Service URLs (once running)

| Service | URL |
|---|---|
| FastAPI | http://localhost:8001/get-age |
| Node.js | http://localhost:8002/get-age |
| Spring Boot | http://localhost:8003/get-age |
| Grafana | http://localhost:3000 |
| InfluxDB | http://localhost:8086 |

---

## Monitoring

Open Grafana at **http://localhost:3000** (no login required, anonymous viewer access is enabled).

```
Grafana Dashboard: "Performance Benchmark: FastAPI vs Node.js vs Spring Boot"
┌──────────────────────────────────────────────────────────────────┐
│  Ranking – Average Response Time          [refresh every 5 s]   │
│                                                                  │
│  fastapi     ████████░░░░░░░░░░░░░░  xx ms   🟢 < 50 ms        │
│  nodejs      ██████████░░░░░░░░░░░░  xx ms   🟡 < 200 ms       │
│  springboot  ████████████████░░░░░░  xx ms   🔴 > 200 ms       │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  Ranking – Memory Usage                                          │
│                                                                  │
│  fastapi     ████░░░░░░░░░░░░░░░░░░  xx MB   🟢 < 100 MB       │
│  nodejs      ██████░░░░░░░░░░░░░░░░  xx MB   🟡 < 500 MB       │
│  springboot  ████████████████░░░░░░  xx MB   🔴 > 500 MB       │
└──────────────────────────────────────────────────────────────────┘
```

The dashboard is pre-provisioned — no manual setup needed. Both data sources (k6 HTTP metrics and Telegraf container stats) are wired to InfluxDB automatically.

---

## Project Structure

```
framework-benchmark/
│
├── db/
│   └── init.sql              # Schema + 10 000-row seed data (recursive CTE)
│
├── fastapi/
│   ├── Dockerfile
│   ├── main.py               # Async FastAPI app with aiomysql pool
│   └── requirements.txt
│
├── node-js/
│   ├── Dockerfile
│   ├── index.js              # Express app with mysql2/promise pool
│   └── package.json
│
├── spring-boot/
│   ├── Dockerfile            # Multi-stage build (Maven → JRE)
│   ├── pom.xml
│   └── src/main/java/com/benchmark/
│       ├── BenchmarkApplication.java
│       ├── AgeController.java        # REST endpoint
│       ├── UserRepository.java       # Native JPA query
│       ├── DepartmentStats.java      # Projection interface
│       └── User.java                 # JPA entity
│
├── k6/
│   └── benchmark.js          # 3-scenario load test (50 VUs × 30 s each)
│
├── grafana/
│   └── provisioning/
│       ├── dashboards/
│       │   ├── benchmark.json        # Pre-built dashboard
│       │   └── provider.yml
│       └── datasources/
│           └── influxdb.yml          # Auto-configured InfluxDB datasource
│
├── telegraf/
│   └── telegraf.conf         # Docker container stats → InfluxDB
│
├── docker-compose.yml        # Full stack orchestration
└── index.html                # Benchmark explainer webpage
```
