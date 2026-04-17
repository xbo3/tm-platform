import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export const query = (text, params) => pool.query(text, params);

export async function initDB() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('super_admin','center_admin','agent')),
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
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','calling','done','no_answer','invalid','retry')),
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
      result VARCHAR(20) CHECK (result IN ('connected','no_answer','busy','failed','invalid')),
      duration_sec INTEGER DEFAULT 0,
      started_at TIMESTAMP DEFAULT NOW(),
      ended_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recordings (
      id SERIAL PRIMARY KEY,
      call_id INTEGER REFERENCES calls(id),
      file_path VARCHAR(500),
      file_size INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP
    );

    -- Add foreign keys to users after centers/phones exist
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

  // Seed super admin if not exists
  const { rows } = await query(`SELECT id FROM users WHERE role='super_admin' LIMIT 1`);
  if (rows.length === 0) {
    const bcrypt = (await import('bcryptjs')).default;
    const hash = await bcrypt.hash('admin123', 10);
    await query(`INSERT INTO users (email, password, role, name) VALUES ($1, $2, 'super_admin', 'Super Admin')`, ['admin@tm.co.kr', hash]);

    // Seed demo center
    const center = await query(`INSERT INTO centers (name, plan) VALUES ('서울 강남센터', 'premium') RETURNING id`);
    const cid = center.rows[0].id;

    const centerHash = await bcrypt.hash('center123', 10);
    const cAdmin = await query(`INSERT INTO users (email, password, role, name, center_id) VALUES ($1, $2, 'center_admin', '김센터장', $3) RETURNING id`, ['center@tm.co.kr', centerHash, cid]);
    await query(`UPDATE centers SET owner_id=$1 WHERE id=$2`, [cAdmin.rows[0].id, cid]);

    // Create 5 phones + agents
    const agentHash = await bcrypt.hash('agent123', 10);
    for (let i = 0; i < 5; i++) {
      const phone = await query(`INSERT INTO phones (center_id, sip_account) VALUES ($1, $2) RETURNING id`, [cid, `200${i + 1}`]);
      const letter = String.fromCharCode(65 + i);
      await query(`INSERT INTO users (email, password, role, name, center_id, phone_id) VALUES ($1, $2, 'agent', $3, $4, $5)`,
        [`agent${letter.toLowerCase()}@tm.co.kr`, agentHash, `Agent ${letter}`, cid, phone.rows[0].id]);
    }
  }

  console.log('DB initialized');
}

export default pool;
