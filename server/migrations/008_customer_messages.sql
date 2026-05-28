-- 008_customer_messages — SMS 수신/발신 통합. customer 와 연결.
-- direction = 'inbound' (고객→폰) | 'outbound' (폰→고객)
-- 매칭 정책: from_number 정규화 후 customers.phone_number 와 일치하는 가장 최근 행에 연결. 매칭 실패 시 customer_id=NULL (orphan)

CREATE TABLE IF NOT EXISTS customer_messages (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  center_id INTEGER REFERENCES centers(id) ON DELETE CASCADE,
  phone_id INTEGER REFERENCES phones(id) ON DELETE SET NULL,
  phone_number VARCHAR(20) NOT NULL,
  body TEXT NOT NULL,
  direction VARCHAR(16) NOT NULL CHECK (direction IN ('inbound','outbound')),
  status VARCHAR(16) NOT NULL DEFAULT 'received',
  error_msg TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  sent_by VARCHAR(50),
  received_at TIMESTAMP NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_messages_customer ON customer_messages(customer_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_messages_phone ON customer_messages(phone_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_messages_number ON customer_messages(phone_number, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_messages_unread ON customer_messages(center_id, is_read, received_at DESC) WHERE direction='inbound' AND is_read=false;
