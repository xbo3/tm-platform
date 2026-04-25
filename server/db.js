import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isInternalDb = (process.env.DATABASE_URL || '').includes('.railway.internal');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.NODE_ENV === 'production' && !isInternalDb) ? { rejectUnauthorized: false } : false,
  // 연결 풀 안정성 — Railway Postgres 재시작 / idle conn 대비
  idleTimeoutMillis: 30000,        // 30초 idle 후 close
  connectionTimeoutMillis: 5000,   // 5초 연결 타임아웃
  max: 10,                         // 동시 연결 상한
});

// 풀 에러 글로벌 핸들러 — 미처리 시 프로세스 죽음
pool.on('error', (err) => {
  console.error('[db] pool error:', err.code, err.message);
});

export const query = (text, params) => pool.query(text, params);

async function runMigration(file) {
  const sql = fs.readFileSync(path.join(__dirname, 'migrations', file), 'utf8');
  await query(sql);
  console.log(`[migration] ${file} applied`);
}

export async function initDB() {
  // Base schema (v7) — idempotent
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('super_admin','center_admin','agent','lead_monitor')),
      name VARCHAR(100),
      center_id INTEGER,
      phone_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS centers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      owner_id INTEGER REFERENCES users(id),
      dist_mode VARCHAR(10) DEFAULT 'auto' CHECK (dist_mode IN ('auto','manual')),
      show_phone BOOLEAN DEFAULT false,
      auto_noans_exclude BOOLEAN DEFAULT true,
      auto_invalid_detect BOOLEAN DEFAULT true,
      plan VARCHAR(20) DEFAULT 'basic' CHECK (plan IN ('basic','premium')),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS phones (
      id SERIAL PRIMARY KEY,
      center_id INTEGER REFERENCES centers(id) ON DELETE CASCADE,
      sip_account VARCHAR(20) NOT NULL,
      status VARCHAR(20) DEFAULT 'idle' CHECK (status IN ('idle','calling','busy')),
      is_active BOOLEAN DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS customer_lists (
      id SERIAL PRIMARY KEY,
      center_id INTEGER REFERENCES centers(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL,
      source VARCHAR(100),
      is_test BOOLEAN DEFAULT false,
      total_count INTEGER DEFAULT 0,
      connect_rate NUMERIC(5,2) DEFAULT 0,
      invalid_rate NUMERIC(5,2) DEFAULT 0,
      uploaded_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      list_id INTEGER REFERENCES customer_lists(id) ON DELETE CASCADE,
      center_id INTEGER REFERENCES centers(id) ON DELETE CASCADE,
      assigned_agent VARCHAR(10),
      name VARCHAR(100),
      phone_number VARCHAR(20) NOT NULL,
      region VARCHAR(100),
      status VARCHAR(20) DEFAULT 'pending',
      no_answer_count INTEGER DEFAULT 0,
      memo TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS calls (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER REFERENCES customers(id),
      center_id INTEGER REFERENCES centers(id),
      agent VARCHAR(10),
      phone_id INTEGER REFERENCES phones(id),
      result VARCHAR(20),
      duration_sec INTEGER DEFAULT 0,
      started_at TIMESTAMP DEFAULT NOW(),
      ended_at TIMESTAMP,
      is_inbound BOOLEAN DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS recordings (
      id SERIAL PRIMARY KEY,
      call_id INTEGER REFERENCES calls(id),
      file_path VARCHAR(500),
      file_size INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP
    );

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_center') THEN
        ALTER TABLE users ADD CONSTRAINT fk_users_center FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE SET NULL;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_phone') THEN
        ALTER TABLE users ADD CONSTRAINT fk_users_phone FOREIGN KEY (phone_id) REFERENCES phones(id) ON DELETE SET NULL;
      END IF;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // Run v8 migration
  try {
    await runMigration('002_v8.sql');
  } catch (e) {
    console.error('[migration] 002_v8.sql failed:', e.message);
    throw e;
  }

  // Run ws-lock migration (commit 2)
  try {
    await runMigration('003_ws_lock.sql');
  } catch (e) {
    console.error('[migration] 003_ws_lock.sql failed:', e.message);
    throw e;
  }

  // Seed: super admin + demo center + 5 agents (only on fresh DB)
  const { rows } = await query(`SELECT id FROM users WHERE role='super_admin' LIMIT 1`);
  if (rows.length === 0) {
    const bcrypt = (await import('bcryptjs')).default;

    const adminHash = await bcrypt.hash('admin123', 10);
    await query(
      `INSERT INTO users (email, password, role, name) VALUES ($1, $2, 'super_admin', 'Super Admin')`,
      ['admin@tm.co.kr', adminHash]
    );

    const center = await query(
      `INSERT INTO centers (name, plan) VALUES ('서울 강남센터', 'premium') RETURNING id`
    );
    const cid = center.rows[0].id;

    const centerHash = await bcrypt.hash('center123', 10);
    const cAdmin = await query(
      `INSERT INTO users (email, password, role, name, center_id) VALUES ($1, $2, 'center_admin', '김센터장', $3) RETURNING id`,
      ['center@tm.co.kr', centerHash, cid]
    );
    await query(`UPDATE centers SET owner_id=$1 WHERE id=$2`, [cAdmin.rows[0].id, cid]);

    // 5 agents per methodology: 김정희(KJ)/이상진(LS)/박진우(PJ)/최서연(CS)/정하늘(JH)
    // but keep simple letter agent_name (A-E) for compat with existing data model
    const agentSeeds = [
      { letter: 'A', kor: '김정희' },
      { letter: 'B', kor: '이상진' },
      { letter: 'C', kor: '박진우' },
      { letter: 'D', kor: '최서연' },
      { letter: 'E', kor: '정하늘' },
    ];
    const agentHash = await bcrypt.hash('agent123', 10);
    for (let i = 0; i < agentSeeds.length; i++) {
      const { letter, kor } = agentSeeds[i];
      const phone = await query(
        `INSERT INTO phones (center_id, sip_account) VALUES ($1, $2) RETURNING id`,
        [cid, `200${i + 1}`]
      );
      await query(
        `INSERT INTO users (email, password, role, name, agent_name, center_id, phone_id) VALUES ($1, $2, 'agent', $3, $4, $5, $6)`,
        [`agent${letter.toLowerCase()}@tm.co.kr`, agentHash, kor, letter, cid, phone.rows[0].id]
      );
    }

    // Seed sample suppliers
    await query(
      `INSERT INTO suppliers (tg_id, note) VALUES ('@lee_db_kr','샘플 공급자'),('@kim_leads','샘플 공급자') ON CONFLICT (tg_id) DO NOTHING`
    );

    console.log('[seed] super_admin + center + 5 agents + sample suppliers');
  }

  console.log('[db] initialized');
}

export default pool;
