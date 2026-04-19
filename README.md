# TM Platform — 텔레마케팅 운영 플랫폼 (v8)

## 배포 정보

| 항목 | 값 |
|------|-----|
| GitHub | https://github.com/xbo3/tm-platform |
| Railway | https://tm-web-production.up.railway.app |
| Stack | React 19 + Vite + Express + PostgreSQL |
| Font | Pretendard + JetBrains Mono |
| Theme | Dark (v13 디자인 토큰) |

---

## v8 변경 사항 (2026-04-19)

### 데이터 영구화
- **PostgreSQL 도입**: 기존 in-memory DB 를 Railway Postgres 로 전환. 서버 재시작에도 데이터 유지.
- 마이그레이션 파일: `server/migrations/002_v8.sql` (idempotent, 자동 실행)

### 스키마 확장
- `customer_lists` 신규 컬럼: `category`, `supplier_tg`, `auto_connect`, `auto_connect_threshold`, `is_distributed`, `is_active`, `is_sip_prechecked`
- `customers` status 확장: 기존 + `invalid_pre`, `dormant`, `recall`, `positive`. 신규 컬럼: `recall_at`, `recall_agent`, `dormant_since`
- `calls.result` 확장: 기존 + `positive`, `reject`, `recall`
- 신규 테이블: `sip_precheck_runs`, `distribution_events`, `call_classifications`, `suppliers`

### 백엔드 신규 라우트
- `POST /api/dist/preview` · `POST /api/dist/execute` — 5명 균등 분배 미리보기 + 확정
- `POST /api/sip/precheck/:list_id` — SIP 결번 사전 거르기 (현재 mock 10%, VMGate 연동 TODO)
- `POST /api/classify/:call_id` — 통화 분류 (현재 duration mock, Claude Haiku + STT 연동 TODO)
- `GET/POST/PUT/DELETE /api/suppliers` — 공급자 텔레그램 ID CRUD (super_admin 전용)
- `GET /api/admin/db-quality` · `/api/admin/supplier-rank` · `/api/admin/overview` — 슈퍼어드민 점수 (env 가중치)

### 스케줄러 (`server/jobs.js`, node-cron)
- 매 5분: 오토연결 — 활성 DB 잔여 < threshold 면 같은 카테고리 다음 DB 자동 분배
- 매 10분: 휴면 승격 — `no_answer_count >= 3` 인 customer 를 `dormant`
- 매 1시간: 녹음 만료 path 로그 (실제 삭제는 TODO)
- 매일 23:00 UTC (08:00 KST): SIP precheck 자동 트리거 스켈레톤

### 프론트 4뷰 분할
- `src/views/AdminView.jsx` — 슈퍼어드민 (DB 품질 랭킹, 점수 공식 슬라이더, 공급자 관리, 최근 긍정)
- `src/views/ManagerView.jsx` — 센터장 (Hero 2분할, 실장 테이블, DB 목록 + 분배 모달, 카테고리/공급자/오토연결)
- `src/views/LeadMonitorView.jsx` — 실시간 상담원 라이브, 큐 잔여, 활성 DB
- `src/views/AgentView.jsx` — 본인 큐, dialer, 결과 분류 (자동 classify 호출)
- 상단 `<Topbar>` 가 role 별 view 탭 노출 (super_admin 만 4뷰 전환 가능)

### 디자인 토큰 (`src/styles/tokens.css`)
- v13 HTML `<style>` 의 CSS 변수 22개 전부 이관 (--bg, --text, --accent, --pos, --info, --mono, etc.)
- Pretendard Variable + JetBrains Mono 로딩
- 다크 테마 표준 컴포넌트 (`.card`, `.btn`, `.tag`, `.modal-overlay`)

### 분배 확인 모달 (`src/components/DistributeModal.jsx`)
- v13 `#distribute-modal` 마크업/동작을 React 로 포팅
- `/api/dist/preview` 호출 → 5분할 표시 → 확인 시 `/api/dist/execute`

### 환경 변수
- `DATABASE_URL` (필수, Railway 자동 주입)
- `JWT_SECRET` (선택, 기본값 있음)
- `QUALITY_FORMULA_A` / `_B` / `_C` (점수 가중치, 기본 0.4/0.4/0.2)
- `ANTHROPIC_API_KEY` (classify mock 단계라 미사용)

### 다음 TODO
- VMGate + SIP 서버 실제 결번 판별 연결 (`server/routes/sip.js`)
- Claude Haiku + Whisper STT 연결 (`server/routes/classify.js`)
- 녹음 파일 실제 삭제 + 7일 정책 (`server/jobs.js`)
- 휴면 재활성화 정책 (방침 §12)
- 카테고리 재분류 가능 여부 (방침 §12)
- 실장 탭 / 상담원 탭 다이어트 (방침 §12)

---

---

## 시스템 구조

```
슈퍼어드민 (본사)
  └─ 센터 생성 / 전체 통계 / 수익 관리
      │
센터장 어드민 (총판)
  └─ 대시보드 / DB 관리 / 전화기 관리 / 녹음 / 설정
      │
상담원 TM A~E (전화기 5대)
  └─ 원클릭 콜 / 메모 / 자동 다음 고객
```

---

## 화면 목록 (10개)

### 공통
- **로그인** — 3가지 역할 선택 (Super Admin / 센터장 / 상담원)

### 슈퍼어드민 (3개)
- **센터 관리** — 센터 목록, 생성 모달
- **전체 통계** — 센터별 비교 차트
- **수익 관리** — 센터별 요금제, 월 매출

### 센터장 어드민 (5개)
- **대시보드** — Agent 5명 실시간 성과, DB 퀄리티, 시간별 차트
- **DB 관리** — 엑셀 업로드, 100건 테스트, DB별 성과, 분배
- **녹음 관리** — 녹음 목록, 재생
- **설정** — 분배방식, 번호 마스킹, 자동감지 토글

### 상담원 (1개)
- **콜 화면** — 다음 고객 → 전화 → 메모 → 반복

---

## 대시보드 핵심 기능

### Agent 실시간 모니터링
- 5명 각각 카드: 총콜 / 연결 / 부재 / 결번 / 대기 / 총통화시간
- **WORK** (초록) / **IDLE** (빨간 깜박임) 뱃지
- 링 차트로 목표 대비 진행률
- 연결률 색상: 25%↑ 초록, 15~25% 주황, 15%↓ 빨강

### 부재 상세 추적
- 1회 부재 (노란색)
- 2회 부재 (주황색)
- 3회 부재 (빨간색) → 자동 제외

### DB 퀄리티 현황
- DB 타이틀별: 연결률, 결번률, 잔여건수
- 클릭 시 Agent별 사용 상세 (배정/사용/잔여/연결/부재/결번)
- 잔여 부족 → 빨간 경고 → 추가 분배 버튼

---

## DB 관리

### 업로드
- 엑셀(.xlsx/.csv) 업로드
- DB 타이틀 + 출처(업자명) 태그
- 테스트 모드 옵션

### 100건 테스트
- Agent A~E에 20건씩 분배
- 실시간 진행률 + 연결/부재/결번 카운트
- 완료 시 채택/폐기 선택

### 분배
- DB 타이틀별 Agent에게 건수 지정
- 균등 분배 버튼
- 사용량 실시간 추적 (잔여건 표시)

### 자동감지
- 부재 3회 이상 → 자동 제외
- 결번 → 자동 감지 및 제외
- 설정에서 ON/OFF 토글

---

## 센터장 설정

| 설정 | 옵션 |
|------|------|
| DB 분배 방식 | Auto (균등) / Manual (직접) |
| 전화번호 노출 | 마스킹 (010-****-5678) / 전체 표시 |
| 부재 자동제외 | ON / OFF |
| 결번 자동감지 | ON / OFF |

---

## DB 테이블 (7개)

```
users         — 슈퍼어드민/센터장/상담원
centers       — 센터 정보 + 설정
phones        — 전화기 (SIP 계정)
customer_lists — 업로드 리스트 (출처, 테스트여부, 연결률)
customers     — 고객 (상태: pending/calling/done/no_answer/invalid)
calls         — 콜 기록 (결과, 통화시간)
recordings    — 녹음 파일
```

---

## API (18개)

```
POST   /auth/login
POST   /auth/logout

POST   /centers              — 센터 생성
GET    /centers              — 센터 목록
GET    /centers/:id          — 센터 상세
PUT    /centers/:id          — 센터 수정

POST   /customers/upload     — 엑셀 업로드
GET    /customers            — 고객 목록
PUT    /customers/:id        — 상태 변경
POST   /customers/distribute — 분배

POST   /calls/next           — 다음 고객
POST   /calls/start          — 발신
PUT    /calls/:id/end        — 종료
POST   /calls/:id/memo       — 메모

GET    /stats/center/:id     — 센터 통계
GET    /stats/phone/:id      — 전화기별

GET    /recordings           — 녹음 목록
GET    /recordings/:id/play  — 재생

POST   /test/start           — 100건 테스트
POST   /test/stop            — 테스트 중지
```

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| Frontend | React + Recharts |
| Build | Vite |
| Server | Express (static serve) |
| Hosting | Railway |
| Repository | GitHub (xbo3/tm-platform) |
| Design | Glossy Black + Poppins |

---

## 다음 단계

1. ✅ UI 완성 (현재)
2. ⬜ 백엔드 API (Node.js + Express)
3. ⬜ PostgreSQL DB 연결
4. ⬜ Asterisk 연동
5. ⬜ VMGate + 실제 발신
6. ⬜ WebSocket 실시간
7. ⬜ 녹음 시스템
