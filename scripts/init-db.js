#!/usr/bin/env node
/**
 * Initialize PostgreSQL database with schema
 * Usage: node scripts/init-db.js
 * Requires: DATABASE_URL environment variable
 */

const { readFileSync } = require("fs");
const { join } = require("path");
const { Pool } = require("pg");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Error: DATABASE_URL environment variable is not set");
  console.error(
    'Example: export DATABASE_URL="postgresql://user:pass@host:port/db?sslmode=require"'
  );
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function init() {
  try {
    const schemaPath = join(__dirname, "..", "schema.sql");
    const schema = readFileSync(schemaPath, "utf-8");

    console.log("Initializing database schema...");
    await pool.query(schema);

    console.log("✅ Database schema initialized successfully!");
    await pool.end();
  } catch (error) {
    console.error("❌ Failed to initialize database schema:", error.message);
    await pool.end();
    process.exit(1);
  }
}

init();
