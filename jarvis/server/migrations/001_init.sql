CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);

CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  goal TEXT NOT NULL DEFAULT '', audience TEXT NOT NULL DEFAULT '', offer TEXT NOT NULL DEFAULT '',
  kpi TEXT NOT NULL DEFAULT '', materials TEXT NOT NULL DEFAULT '', next_steps TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  vault_hash TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);

CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folder TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'note',           -- fact | assumption | suggestion | decision | note
  status TEXT NOT NULL DEFAULT 'active',       -- active | archived
  decision_status TEXT,                        -- draft | accepted | rejected (faqat kind=decision)
  project_id INTEGER REFERENCES projects(id),
  source TEXT NOT NULL DEFAULT '',
  source_ref TEXT NOT NULL DEFAULT '',
  system_key TEXT UNIQUE,
  vault_path TEXT, vault_hash TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX notes_folder ON notes(folder, deleted_at);
CREATE INDEX notes_project ON notes(project_id);

CREATE TABLE note_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER NOT NULL REFERENCES notes(id),
  title TEXT NOT NULL, body TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', saved_at TEXT NOT NULL
);

CREATE TABLE documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,                          -- pdf | txt | md | url
  file TEXT, url TEXT,
  status TEXT NOT NULL,                        -- ready | unreadable | error
  pages INTEGER NOT NULL DEFAULT 0, chars INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL, deleted_at TEXT
);

CREATE TABLE chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id),
  page INTEGER, idx INTEGER NOT NULL, text TEXT NOT NULL
);
CREATE INDEX chunks_doc ON chunks(document_id);
CREATE VIRTUAL TABLE chunks_fts USING fts5(norm, tokenize='unicode61');

CREATE TABLE roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE, name TEXT NOT NULL, purpose TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '', output_format TEXT NOT NULL DEFAULT '',
  builtin INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, deleted_at TEXT
);

CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, project_id INTEGER REFERENCES projects(id), role_id INTEGER REFERENCES roles(id),
  provider TEXT, model TEXT,
  source_mode TEXT NOT NULL DEFAULT 'assist',  -- off | assist | strict
  document_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL, content TEXT NOT NULL,
  citations TEXT NOT NULL DEFAULT '[]', meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL, model TEXT NOT NULL, kind TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL, ok INTEGER NOT NULL, error TEXT, created_at TEXT NOT NULL
);

CREATE TABLE workflow_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL, title TEXT NOT NULL, project_id INTEGER REFERENCES projects(id),
  brief TEXT NOT NULL DEFAULT '{}', input TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',      -- pending | running | error | done
  steps TEXT NOT NULL DEFAULT '[]', result_note_id INTEGER,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);

CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  project_id INTEGER REFERENCES projects(id),
  due_date TEXT, priority TEXT NOT NULL DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'todo',
  recurring_id INTEGER, sop_note_id INTEGER,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT, deleted_at TEXT
);

CREATE TABLE recurring (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                          -- task | audit
  title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  project_id INTEGER REFERENCES projects(id), priority TEXT NOT NULL DEFAULT 'medium',
  sop_note_id INTEGER,
  freq TEXT NOT NULL,                          -- daily | weekly | monthly
  weekday INTEGER NOT NULL DEFAULT 1, monthday INTEGER NOT NULL DEFAULT 1, time TEXT NOT NULL DEFAULT '09:00',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE job_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recurring_id INTEGER NOT NULL REFERENCES recurring(id),
  slot TEXT NOT NULL,                          -- Asia/Tashkent, YYYY-MM-DDTHH:MM
  status TEXT NOT NULL,                        -- done | late | missed | error
  detail TEXT NOT NULL DEFAULT '', ran_at TEXT NOT NULL,
  UNIQUE (recurring_id, slot)
);

CREATE TABLE vault_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER NOT NULL REFERENCES notes(id),
  path TEXT NOT NULL, file_content TEXT NOT NULL, detected_at TEXT NOT NULL, resolved_at TEXT, resolution TEXT
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL, entity TEXT NOT NULL DEFAULT '', entity_id TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
