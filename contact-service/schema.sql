CREATE TABLE IF NOT EXISTS contact_requests (
  id TEXT PRIMARY KEY,
  payload_hash TEXT NOT NULL,
  email_state TEXT NOT NULL,
  whatsapp_state TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS contact_rate_limits (
  key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
