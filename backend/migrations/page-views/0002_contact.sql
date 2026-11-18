CREATE TABLE contact_messages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'replied')),
  discord_message_id TEXT,
  created_at INTEGER NOT NULL,
  replied_at INTEGER
);
CREATE TABLE contact_replies (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contact_messages(id) ON DELETE CASCADE,
  discord_user_id TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE contact_outbox (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contact_messages(id) ON DELETE CASCADE,
  reply_id TEXT REFERENCES contact_replies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('discord', 'email')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  lease_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  provider_id TEXT,
  last_error TEXT
);
CREATE INDEX contact_outbox_pending ON contact_outbox(status, next_attempt_at, lease_until);
CREATE INDEX contact_replies_contact ON contact_replies(contact_id);
