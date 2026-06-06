-- 슈퍼어드민 콜 제어 (2026-06-06 biplays): 콜 STOP(일시정지) + 일일 콜 임계값.
-- calling_paused=true 면 /calls/next 가 그 센터에 번호를 안 내줌(발신 정지, 데이터/로그인은 유지).
-- daily_call_limit=오늘 콜 임계(0=무제한). 슈퍼어드민이 임계 근처서 STOP 판단용 표시.
ALTER TABLE centers ADD COLUMN IF NOT EXISTS calling_paused BOOLEAN DEFAULT false;
ALTER TABLE centers ADD COLUMN IF NOT EXISTS daily_call_limit INTEGER DEFAULT 0;
