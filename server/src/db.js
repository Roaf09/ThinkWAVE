import mysql from "mysql2/promise";
import fs from "fs";
import { env } from "./env.js";

const poolConfig = {
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASS,
  database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  decimalNumbers: true,
};

if (env.DB_SSL) {
  poolConfig.ssl = env.DB_SSL_CA_PATH
    ? {
        ca: fs.readFileSync(env.DB_SSL_CA_PATH, "utf8"),
        rejectUnauthorized: true,
      }
    : {
        rejectUnauthorized: true,
      };
}

export const pool = mysql.createPool(poolConfig);