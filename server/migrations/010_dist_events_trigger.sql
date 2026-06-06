-- distribution_events.triggered_by 체크 제약 확장 (2026-06-06 DB 교체 테스트에서 발견).
-- 002_v8 에서 ('manual','auto_connect') 만 허용했으나, 이후 connect-list('connect')·회수('recall')
-- 기능이 추가되며 제약 위반으로 INSERT 가 500 → DB 교체/회수 버튼이 죽어 있었음.
-- 허용값을 실제 사용 4종으로 확장. DROP IF EXISTS + ADD 라 매 부팅 재실행 멱등.
ALTER TABLE distribution_events DROP CONSTRAINT IF EXISTS distribution_events_triggered_by_check;
ALTER TABLE distribution_events ADD CONSTRAINT distribution_events_triggered_by_check
  CHECK (triggered_by IN ('manual','auto_connect','connect','recall'));
