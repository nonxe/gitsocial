-- Cloudflare D1 / SQLite Schema for GitSocial

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  imageUrl TEXT NOT NULL,
  caption TEXT,
  author TEXT DEFAULT 'Anonymous',
  timestamp INTEGER NOT NULL,
  likes INTEGER DEFAULT 0,
  type TEXT NOT NULL
);
