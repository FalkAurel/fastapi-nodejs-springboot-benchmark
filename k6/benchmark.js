import http from "k6/http";
import { sleep } from "k6";

export const options = {
  scenarios: {
    fastapi: {
      executor: "constant-vus",
      vus: 50,
      duration: "30s",
      env: { SERVICE: "fastapi", BASE_URL: "http://fastapi:8000" },
      tags: { service: "fastapi" },
    },
    nodejs: {
      executor: "constant-vus",
      vus: 50,
      duration: "30s",
      env: { SERVICE: "nodejs", BASE_URL: "http://nodejs:8000" },
      tags: { service: "nodejs" },
    },
    springboot: {
      executor: "constant-vus",
      vus: 50,
      duration: "30s",
      env: { SERVICE: "springboot", BASE_URL: "http://springboot:8000" },
      tags: { service: "springboot" },
    },
  },
};

export default function () {
  http.get(`${__ENV.BASE_URL}/get-age`);
  sleep(0.1);
}
