#!/bin/bash
# Initialize PostgreSQL database with schema
# Usage: ./scripts/init-db.sh

if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL environment variable is not set"
  echo "Example: export DATABASE_URL='postgresql://user:pass@host:port/db?sslmode=require'"
  exit 1
fi

echo "Initializing database schema..."
psql "$DATABASE_URL" < schema.sql

if [ $? -eq 0 ]; then
  echo "✅ Database schema initialized successfully!"
else
  echo "❌ Failed to initialize database schema"
  exit 1
fi
