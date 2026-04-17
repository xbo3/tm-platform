# TM Platform — 텔레마케팅 운영 플랫폼

## 배포 정보

| 항목 | 값 |
|------|-----|
| GitHub | https://github.com/xbo3/tm-platform |
| Railway | https://tm-web-production.up.railway.app |
| Stack | React + Vite + Express |
| Font | Poppins (200~400) |
| Theme | Glossy Black |

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
