-- Initialize VeriHire database with extensions

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fuzzy text search

-- Create schemas for organization
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS analytics;

-- Grant privileges
GRANT ALL PRIVILEGES ON SCHEMA auth TO verihire;
GRANT ALL PRIVILEGES ON SCHEMA app TO verihire;
GRANT ALL PRIVILEGES ON SCHEMA analytics TO verihire;

-- Log initialization
DO $$
BEGIN
  RAISE NOTICE 'VeriHire database initialized successfully';
END $$;
