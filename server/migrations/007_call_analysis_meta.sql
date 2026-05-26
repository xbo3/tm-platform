-- 007 — call_classifications 에 분석 메타 JSON 컬럼 추가 (biplays spec 5/26)
-- 거절 사유 / 거절 발화 / 거절 직전 멘트 / 욕설 감지 / 멘트 교정 제안 누적.
-- 스키마 변경 회피 위해 jsonb 단일 컬럼 사용 (확장 자유).

ALTER TABLE call_classifications
  ADD COLUMN IF NOT EXISTS analysis_meta jsonb;

-- 거절 사유 별 집계 / 멘트 교정 제안 lookup 위해 GIN 인덱스
CREATE INDEX IF NOT EXISTS idx_call_class_analysis_gin
  ON call_classifications USING GIN (analysis_meta);
