-- Settings (single row: key='global')
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  is_maintenance INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO settings(key, is_maintenance, updated_at)
VALUES ('global', 0, (unixepoch() * 1000));

-- Users are anonymous but have a stable nickname for UX
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

-- Links submitted by users
-- state: 'queued' | 'claimed' | 'consumed'
CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued',
  queued_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  claimed_by_user_id TEXT,
  claim_expires_at INTEGER,
  claimed_at INTEGER,
  consumed_at INTEGER,

  FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_links_queue ON links(state, queued_at);
CREATE INDEX IF NOT EXISTS idx_links_owner ON links(owner_user_id, state);
CREATE INDEX IF NOT EXISTS idx_links_claimed_by ON links(claimed_by_user_id, state);

-- Enforce: "한 사람 링크는 딱 1번만 받을 수 있어요"
CREATE TABLE IF NOT EXISTS receipts (
  link_id TEXT NOT NULL,
  receiver_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (link_id, receiver_user_id),
  FOREIGN KEY (link_id) REFERENCES links(id),
  FOREIGN KEY (receiver_user_id) REFERENCES users(id)
);

