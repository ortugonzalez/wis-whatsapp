PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS connections(id TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'disconnected',phone TEXT,expected_phone_e164 TEXT,qr_payload TEXT,qr_expires_at TEXT,last_error TEXT,lease_owner TEXT,lease_expires_at TEXT,command TEXT,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tokens(id TEXT PRIMARY KEY,name TEXT NOT NULL,token_hash TEXT UNIQUE NOT NULL,scopes TEXT NOT NULL,created_at TEXT NOT NULL,revoked_at TEXT);
CREATE TABLE IF NOT EXISTS contacts(id TEXT PRIMARY KEY,phone_e164 TEXT UNIQUE,wa_jid TEXT UNIQUE,display_name TEXT NOT NULL DEFAULT '',consent_at TEXT,consent_source TEXT,consent_scope TEXT,opted_out_at TEXT,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,contact_id TEXT REFERENCES contacts(id),wa_chat_id TEXT UNIQUE NOT NULL,display_name TEXT,title TEXT,last_message_preview TEXT,last_message_at TEXT);
CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,conversation_id TEXT REFERENCES conversations(id),wa_message_id TEXT UNIQUE,direction TEXT NOT NULL,type TEXT NOT NULL DEFAULT 'text',body TEXT,media_path TEXT,source TEXT NOT NULL DEFAULT 'live',delivery_status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,to_e164 TEXT NOT NULL,type TEXT NOT NULL DEFAULT 'text',body TEXT,media_path TEXT,message_id TEXT REFERENCES messages(id),status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','sending','sent','delivered','read','failed','outcome_unknown')),idempotency_key TEXT UNIQUE NOT NULL,request_hash TEXT NOT NULL,last_error TEXT,wa_message_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS webhooks(id TEXT PRIMARY KEY,url TEXT NOT NULL,secret TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS webhook_deliveries(id TEXT PRIMARY KEY,webhook_id TEXT REFERENCES webhooks(id),event_id TEXT NOT NULL,event_type TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,available_at TEXT NOT NULL,last_error TEXT,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS campaigns(id TEXT PRIMARY KEY,name TEXT NOT NULL,body TEXT NOT NULL,contact_ids TEXT NOT NULL,daily_limit INTEGER NOT NULL,window_start TEXT NOT NULL,window_end TEXT NOT NULL,timezone TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',status TEXT NOT NULL DEFAULT 'draft',approved_at TEXT,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,action TEXT NOT NULL,actor TEXT NOT NULL,resource_id TEXT,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS operations_pending ON operations(status,created_at);
CREATE INDEX IF NOT EXISTS messages_chat ON messages(conversation_id,created_at);
-- Additive live-dashboard schema: existing account, messages and sessions remain intact.
CREATE TABLE IF NOT EXISTS snapshots(kind TEXT NOT NULL,resource_id TEXT NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(kind,resource_id));
CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,kind TEXT NOT NULL,resource_id TEXT,payload TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS read_commands(id TEXT PRIMARY KEY,kind TEXT NOT NULL,target TEXT,status TEXT NOT NULL DEFAULT 'pending',error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS events_created ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS snapshots_kind ON snapshots(kind,updated_at DESC);
CREATE INDEX IF NOT EXISTS read_commands_pending ON read_commands(status,created_at);
CREATE TRIGGER IF NOT EXISTS retain_recent_events AFTER INSERT ON events BEGIN
 DELETE FROM events WHERE id IN(SELECT id FROM events ORDER BY created_at DESC,id DESC LIMIT -1 OFFSET 1000);
END;
CREATE TRIGGER IF NOT EXISTS message_created AFTER INSERT ON messages BEGIN
 INSERT INTO webhook_deliveries(id,webhook_id,event_id,event_type,payload,available_at,created_at)
 SELECT lower(hex(randomblob(16))),id,'message.created:'||NEW.id,'message.created',json_object('id','message.created:'||NEW.id,'type','message.created','data',json_object('id',NEW.id,'conversation_id',NEW.conversation_id,'direction',NEW.direction,'type',NEW.type,'body',NEW.body,'delivery_status',NEW.delivery_status)),strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM webhooks WHERE enabled=1;
END;
CREATE TRIGGER IF NOT EXISTS message_updated AFTER UPDATE OF delivery_status ON messages WHEN OLD.delivery_status<>NEW.delivery_status BEGIN
 INSERT INTO webhook_deliveries(id,webhook_id,event_id,event_type,payload,available_at,created_at)
 SELECT lower(hex(randomblob(16))),id,'message.updated:'||NEW.id||':'||NEW.delivery_status,'message.updated',json_object('id','message.updated:'||NEW.id||':'||NEW.delivery_status,'type','message.updated','data',json_object('id',NEW.id,'delivery_status',NEW.delivery_status)),strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM webhooks WHERE enabled=1;
END;
CREATE TRIGGER IF NOT EXISTS operation_updated AFTER UPDATE OF status ON operations WHEN OLD.status<>NEW.status BEGIN
 INSERT INTO webhook_deliveries(id,webhook_id,event_id,event_type,payload,available_at,created_at)
 SELECT lower(hex(randomblob(16))),id,'operation.updated:'||NEW.id||':'||NEW.status,'operation.updated',json_object('id','operation.updated:'||NEW.id||':'||NEW.status,'type','operation.updated','data',json_object('id',NEW.id,'status',NEW.status,'wa_message_id',NEW.wa_message_id)),strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM webhooks WHERE enabled=1;
END;
