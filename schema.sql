-- Macrofactor PostgreSQL Schema
-- Run this to initialize the database

-- Users table (for authentication)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255), -- For future password auth
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Food log entries
CREATE TABLE IF NOT EXISTS food_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  food_text TEXT NOT NULL,
  meal_type VARCHAR(50) NOT NULL,
  estimated_calories INTEGER NOT NULL,
  grams INTEGER,
  confidence_range VARCHAR(50),
  protein_g DECIMAL(10, 2),
  carbs_g DECIMAL(10, 2),
  fat_g DECIMAL(10, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workout plans (optional, for future)
CREATE TABLE IF NOT EXISTS workout_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_food_logs_user_id ON food_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_food_logs_created_at ON food_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_food_logs_user_date ON food_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
