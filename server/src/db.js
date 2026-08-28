import pg from "pg";
import "dotenv/config";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || "postgres://onction:onction_dev@localhost:5432/onction_grid",
});
