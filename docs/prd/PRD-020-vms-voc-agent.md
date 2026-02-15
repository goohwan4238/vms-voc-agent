# PRD-020: VMS VOC Agent (Voice of Customer 자동 개발 워크플로우 시스템)

**작성일:** 2026-02-15  
**작성자:** 에릭 (AI Assistant)  
**버전:** 1.0-draft  
**GitHub:** https://github.com/goohwan4238/vms-voc-agent

---

## 1. 개요 (Overview)

VMS VOC Agent는 VMS Works 시스템에 등록된 VOC(Voice of Customer, 개선요청)를 자동으로 감지하여, 분석→승인→개발→테스트→배포까지의 전체 워크플로우를 자동화하는 시스템이다. PO(Product Owner)의 주요 결정 시점에만 개입하되, 반복적인 검토/문서화/코딩 작업은 AI가 자동으로 처리한다.

---

## 2. 목표 (Goals)

### Primary Goals
1. VOC 등록 시 10분 이내 자동 감지 및 1차 피드백 제공
2. VOC 분석 → 개발 필요성 판단 → PRD 작성 자동화
3. PRD 품질 검토를 2~3회 자동 반복하여 완성도 확보
4. 개발 완료 후 테스트 결과 보고 및 배포 의사결정 지원
5. 개발자(구환)의 반복적 작업 부담 70% 이상 감소

### Secondary Goals
1. 타 기능 영향도 자동 분석 (반자동화)
2. 개발 난이도 및 공수 자동 산정
3. 디자인 변경 필요성 자동 감지
4. VOC 처리 이력 추적 및 보고

---

## 3. 사용자 (Stakeholders)

| 역할 | 주요 활동 | 시스템 상호작용 |
|-----|----------|----------------|
| **PO (정구환)** | VOC 검토, 개발 결정, 승인, 배포 결정 | Telegram으로 알림 수신 및 응답 |
| **에릭 (AI Agent)** | VOC 감지, 분석, PRD 작성, 검토, 결과 보고 | OpenClaw Gateway를 통해 실행 |
| **Claude Code** | PRD 검토, 코드 작성, 테스트 | tmux 세션으로 독립 실행 |
| **VMS Works** | VOC 등록, 원천 데이터 제공 | PostgreSQL DB |

---

## 4. 시스템 아키텍처

### 4.1 전체 구성도

```
┌─────────────────────────────────────────────────────────────────┐
│                        사용자 (정구환)                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   Telegram      │  │  VMS Works Web  │  │   Claude Code   │ │
│  │   (명령/승인)   │  │   (VOC 확인)    │  │   (코드 작성)   │ │
│  └────────┬────────┘  └─────────────────┘  └─────────────────┘ │
└───────────┼─────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                          에릭 (AI Agent)                        │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                    OpenClaw Gateway                        │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │ │
│  │  │  메시지     │  │  Cron       │  │  Sub-Agent      │   │ │
│  │  │  핸들러     │  │  스케줄러   │  │  (sessions_spawn)│   │ │
│  │  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘   │ │
│  │         └─────────────────┴──────────────────┘            │ │
│  │                          │                                │ │
│  │  ┌───────────────────────┼───────────────────────────┐    │ │
│  │  │       VOC Workflow 엔진 (Node.js/TypeScript)      │    │ │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │    │ │
│  │  │  │  Poller  │──│  Server  │──│   Worker     │    │    │ │
│  │  │  │(DB 감시) │  │(Webhook) │  │(Job Process) │    │    │ │
│  │  │  └──────────┘  └──────────┘  └──────────────┘    │    │ │
│  │  │         │              │              │           │    │ │
│  │  │         └──────────────┼──────────────┘           │    │ │
│  │  │                        ▼                          │    │ │
│  │  │              ┌──────────────────┐                 │    │ │
│  │  │              │   Redis Queue    │                 │    │ │
│  │  │              │   (BullMQ)       │                 │    │ │
│  │  └──────────────┴──────────────────┴─────────────────┘    │ │
│  └───────────────────────────────────────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  PostgreSQL   │   │  File System  │   │  VMS Works    │
│  (로컬 상태)   │   │  (PRD 저장)   │   │  (원천 DB)    │
│               │   │               │   │               │
│ • VOC 상태    │   │ /docs/prd/    │   │ • approval_   │
│ • 처리 이력   │   │ /docs/voc/    │   │   requests    │
│ • 설정        │   │               │   │ • projects    │
└───────────────┘   └───────────────┘   └───────────────┘
```

### 4.2 컴포넌트 상세

#### Poller (DB 감시기)
- **역할:** VMS Works DB에서 새 VOC 감지
- **방식:** PostgreSQL LISTEN/NOTIFY 또는 1분 간격 폴
- **출력:** Redis Queue에 작업 등록
- **실행:** `npm run dev:poller`

#### Server (HTTP 서버)
- **역할:** Webhook 수신, HTTP API 제공
- **엔드포인트:**
  - `POST /webhook/voc` - VOC 등록 Webhook
  - `GET /health` - 헬스체크
  - `GET /voc/:id` - VOC 상태 조회
- **실행:** `npm run dev:server`

#### Worker (작업 처리기)
- **역할:** Redis Queue에서 작업 꺼내 처리
- **처리 단계:** 분석 → PRD 작성 → 검토 → 개발 → 테스트
- **동시성:** 최대 2개 작업 (WIP 제한)
- **실행:** `npm run dev:worker`

---

## 5. 워크플로우 (Workflow)

### Phase 1: VOC 감지
```
VMS Works DB에 새 VOC 등록
        ↓
Poller 감지 (LISTEN 또는 폴)
        ↓
Redis Queue에 'analysis' 작업 등록
        ↓
Telegram 알림: "VOC 접수되었습니다. 검토 후 의견 드리겠습니다."
```

### Phase 2: VOC 분석
```
Worker가 'analysis' 작업 처리
        ↓
GPT-4/Kimi로 VOC 분석 수행
        ↓
분석 결과:
- 요약
- 핵심 요구사항
- 공수 산정 (Low/Medium/High/Critical)
- 타 기능 영향도 (AI 제안 + 체크리스트)
- 개발 권고 (개발/보류/반려)
        ↓
Telegram 알림:
"📋 VOC 분석 완료
요약: ...
공수: Medium (8~24h)
권고: 개발 권장
개발하시겠습니까? (예/아니오)"
        ↓
[결정점 1] 사용자 응답 대기
```

### Phase 3: PRD 작성
```
사용자 "예" 응답
        ↓
Redis Queue에 'prd-writing' 작업 등록
        ↓
Worker가 PRD 초안 작성 (GPT-4/Kimi)
        ↓
PRD 파일 저장: /docs/prd/voc/PRD-{voc_id}-{date}.md
        ↓
Git 커밋 (선택적)
        ↓
Telegram 알림:
"📝 PRD 작성 완료
파일: PRD-XXX-2026-02-15.md
승인하시겠습니까? (승인/수정/반려)"
```

### Phase 4: PRD 검토 루프 (2~3회)
```
[1차 검토] 타 기능 영향도 + 아키텍처
  → Claude Code 또는 sub-agent Kimi 세션 스폰
  → 검토 결과: 문제점 및 개선 제안
  → PRD 수정
        ↓
[2차 검토] 난이도 + 공수
  → 공수 산정 타당성 검토
  → 리스크 요소 추가 식별
  → PRD 수정
        ↓
[3차 검토] 디자인/UI 측면
  → UI/UX 적절성 검토
  → 디자인 시스템 준수 여부
  → PRD 수정
        ↓
Telegram 알림:
"✅ PRD 검토 완료 (3회)
승인하시겠습니까? (승인/수정)"
        ↓
[결정점 2] 사용자 승인 대기
```

### Phase 5: 개발
```
사용자 "승인" 응답
        ↓
Redis Queue에 'development' 작업 등록
        ↓
Claude Code 세션 스폰 (또는 에릭이 직접)
        ↓
PRD 기반 코드 작성
        ↓
Git 브랜치: feature/voc-{voc_id}
        ↓
코드 커밋
        ↓
Telegram 알림:
"💻 개발 완료
브랜치: feature/voc-XXX
테스트 진행하겠습니다."
```

### Phase 6: 테스트
```
Worker가 자동 테스트 실행
        ↓
- 단위 테스트
- 통합 테스트 (타 기능 영향도 기반)
- 사용자 시나리오 테스트
        ↓
테스트 결과 리포트 생성
        ↓
Telegram 알림:
"🧪 테스트 결과
통과: 12/12 ✅
배포하시겠습니까? (배포/수정/보류)"
        ↓
[결정점 3] 배포 결정 대기
```

### Phase 7: 배포
```
사용자 "배포" 응답
        ↓
운영 환경 배포
        ↓
VMS Works VOC 상태 업데이트 (완료)
        ↓
Telegram 알림:
"🚀 배포 완료
VOC-XXX 처리 완료되었습니다."
```

---

## 6. 기능 명세 (Functional Requirements)

### 6.1 VOC 감지 (FR-001 ~ FR-003)

**FR-001: VOC 자동 감지**
- VMS Works DB(`approval_requests` 테이블) 감시
- 새로운 요청 등록 시 감지
- 감지 방식:
  - Option A: PostgreSQL LISTEN/NOTIFY (권고)
  - Option B: 1분 간격 폴 (fallback)
- 감지 기준:
  - `status` = 'submitted'
  - `category_id`가 개발 관련 카테고리

**FR-002: VOC 메타데이터 추출**
- 요청자 정보 (`requester_id` → `users` 테이블 조인)
- 요청일시 (`created_at`)
- 제목, 상세 설명 (`title`, `description`)
- 관련 프로젝트 (`project_id`)
- 우선순위 (`priority`)

**FR-003: 중복 감지 방지**
- 동일 내용의 중복 요청 필터링
- Redis 캐시 활용 (24시간)

### 6.2 1차 피드백 (FR-004 ~ FR-005)

**FR-004: 자동 응답 생성**
- 접수 확인 메시지 생성
- 예상 검토 소요시간 안내 (예: "2시간 내 검토 완료")

**FR-005: Telegram 알림 발송**
- VOC 요약 포함 (제목, 요청자, 핵심 내용 3줄)
- 봇 토큰 및 채팅 ID 환경 변수로 관리

### 6.3 VOC 분석 (FR-006 ~ FR-010)

**FR-006: 요구사항 파악**
- AI로 핵심 요구사항 추출 (3개 이내)
- 기능적/비기능적 요구사항 분류
- 암시적 요구사항 추론

**FR-007: 타 기능 영향도 분석 (반자동화)**
- AI가 의심되는 테이블/API 목록 제시
- 개발자가 체크리스트로 확인/추가
- 외래키 관계 기반 초안 생성

**FR-008: 공수 산정**
| 레벨 | 공수 | 기준 |
|-----|------|------|
| Low | 2~8h | 버그 수정, 단순 조회 추가 |
| Medium | 8~24h | 신규 CRUD, API 수정 |
| High | 24~56h | 아키텍처 변경, 대규모 리팩토링 |
| Critical | 56h+ | 데이터 마이그레이션, 전면 개편 |

**FR-009: 디자인 변경 필요성 체크**
- 키워드 매칭: "화면", "페이지", "UI", "버튼", "테이블"
- 정확도 70~80% 예상 → "디자인 검토 필요" 플래그로 표시
- PO가 최종 판단

**FR-010: 분석 결과 보고**
- Telegram 리포트 발송
- 구성: 요약, 영향도, 공수, 디자인 필요성, 리스크, 권고사항

### 6.4 PRD 작성 (FR-011 ~ FR-013)

**FR-011: PRD 자동 생성**
- 분석 결과 기반 PRD 초안 작성
- 표준 템플릿: 개요, 목표, 사용자 스토리, 기능 명세, 영향도, 기술적 접근, 테스트, 일정

**FR-012: PRD 파일 저장**
- 파일명: `PRD-{voc_id}-{YYYYMMDD}.md`
- 경로: `/docs/prd/voc/`
- Git 커밋 (선택적)

**FR-013: PRD 완료 알림**
- Telegram으로 승인 요청
- PRD 파일 경로 포함

### 6.5 PRD 검토 루프 (FR-014 ~ FR-019)

**FR-014: 1차 검토 - 아키텍처/영향도**
- 검토자: Claude Code 또는 sub-agent Kimi
- 항목: 타 기능 영향도 정확성, 아키텍처 적절성, 기술적 실현 가능성

**FR-015: 2차 검토 - 난이도/공수**
- 검토자: Claude Code 또는 sub-agent Kimi
- 항목: 공수 산정 타당성, 리스크 추가 식별

**FR-016: 3차 검토 - 디자인/UI**
- 검토자: Claude Code 또는 sub-agent Kimi
- 항목: UI/UX 적절성, 디자인 시스템 준수

**FR-017: 검토 결과 반영**
- 각 회차별 개선사항 PRD에 반영
- 버전 업데이트 (v0.1 → v0.2 → v0.3)

**FR-018: 검토 완료 알림**
- 2~3회 검토 완료 후 사용자 알림

**FR-019: 수정 요청 처리**
- 사용자 수정 요청 시 해당 단계부터 재진행
- 최대 3회 반복 제한

### 6.6 개발 (FR-020 ~ FR-023)

**FR-020: 개발 환경 준비**
- 브랜치 생성: `feature/voc-{voc_id}`
- Claude Code 세션 준비

**FR-021: 코드 생성**
- PRD 기반 코드 구현
- Claude Code 활용

**FR-022: 개발 진행상황 보고 (선택적)**
- 일일 진행상황 Telegram 알림
- 블로커 발생 시 즉시 알림

**FR-023: 개발 완료 알림**
- 브랜치 정보 포함
- 테스트 진행 예정 안내

### 6.7 테스트 (FR-024 ~ FR-027)

**FR-024: 단위 테스트**
- 핵심 기능 단위 테스트 실행
- 커버리지: 핵심 로직 80% 이상 목표

**FR-025: 통합 테스트**
- 타 기능과의 연동 테스트
- 영향도 분석 기반 회귀 테스트

**FR-026: 사용자 시나리오 테스트**
- VOC 요구사항 기반 E2E 테스트
- 예상 사용 흐름 검증

**FR-027: 테스트 결과 리포트**
- 통과/실패 항목
- 버그 리스트
- 보완 필요사항

### 6.8 배포 (FR-028 ~ FR-030)

**FR-028: 테스트 결과 알림**
- Telegram으로 결과 발송
- 성공/실패 여부 명시

**FR-029: 배포 권고사항**
- 배포 가능 여부 판단
- 리스크 분석
- 롤백 플랜

**FR-030: 배포 실행**
- 운영 환경 배포
- VMS Works VOC 상태 업데이트 (완료)
- 배포 완료 알림

---

## 7. 비기능 요구사항 (Non-Functional Requirements)

| ID | 항목 | 요구사항 |
|---|------|---------|
| NFR-001 | 감지 지연 | VOC 등록 후 10분 이내 감지 |
| NFR-002 | 처리량 | 동시에 5개 VOC 처리 가능 |
| NFR-003 | 가용성 | 99% uptime (평일 9~18시) |
| NFR-004 | 보안 | VMS Works DB 읽기 전용 권한, 로그 기록 |
| NFR-005 | 알림 신뢰성 | Telegram 실패 시 재시도 3회 |
| NFR-006 | API 비용 제어 | 일일 토큰 사용량 상한, 월별 예산 알림 |
| NFR-007 | 데이터 보존 | VOC 히스토리 최소 90일 보관 |
| NFR-008 | 동시성 | 동일 VOC 동시 편집 시 Conflict 감지 |

---

## 8. 데이터 모델

### 8.1 VOC 처리 상태

```sql
CREATE TABLE voc_workflow (
  id SERIAL PRIMARY KEY,
  voc_id INTEGER NOT NULL,              -- VMS Works의 approval_requests.id
  status VARCHAR(50) NOT NULL,          -- 현재 상태
  title TEXT,
  description TEXT,
  requester VARCHAR(100),
  analysis_result JSONB,                -- 분석 결과
  prd_path VARCHAR(500),                -- PRD 파일 경로
  dev_branch VARCHAR(100),              -- 개발 브랜치
  test_result JSONB,                    -- 테스트 결과
  review_count INTEGER DEFAULT 0,       -- 검토 횟수
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);
```

### 8.2 상태 정의

| 상태 | 설명 | 다음 상태 |
|-----|------|----------|
| `detected` | VOC 감지됨 | `analyzing` |
| `analyzing` | 분석 중 | `analyzed` |
| `analyzed` | 분석 완료 | `prd_writing` 또는 `rejected` |
| `prd_writing` | PRD 작성 중 | `prd_reviewing` |
| `prd_reviewing` | PRD 검토 중 | `developing` 또는 재검토 |
| `developing` | 개발 중 | `testing` |
| `testing` | 테스트 중 | `completed` 또는 `error` |
| `completed` | 완료 | - |
| `rejected` | 반려 | - |
| `error` | 오류 | 수동 개입 필요 |

---

## 9. 기술 스택

| 구성요소 | 기술 | 비고 |
|---------|------|------|
| Runtime | Node.js 20 + TypeScript | |
| Web Framework | Express.js | HTTP 서버 |
| Queue | BullMQ + Redis | 작업 큐 관리 |
| DB (로컬) | PostgreSQL 16 | 상태 관리 |
| DB (외부) | VMS Works PostgreSQL | 읽기 전용 |
| AI | GPT-4 / Kimi (via OpenClaw) | 분석, PRD 작성 |
| 알림 | Telegram Bot API | |
| Dev Environment | Docker Compose | Redis, PostgreSQL |
| Code Review | Claude Code | tmux 세션 |

---

## 10. 실행 방법

### 10.1 환경 설정

```bash
# .env 파일 생성
cp .env.example .env

# .env 파일 편집
VMS_DB_URL=postgresql://vmsworks:...  # VMS Works DB
DB_URL=postgresql://vocagent:...       # 로컬 DB
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-...                  # 또는 생략 (Kimi 사용)
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

### 10.2 개발 모드 실행

```bash
# 1. Docker로 Redis, PostgreSQL 실행
docker-compose up -d redis postgres

# 2. 의존성 설치
npm install

# 3. 각 컴포넌트 실행 (별도 터미널)
npm run dev:poller   # DB 감시
npm run dev:server   # HTTP 서버
npm run dev:worker   # 작업 처리
```

---

## 11. 에러 처리 및 예외 상황

| 상황 | 대응 |
|-----|------|
| VMS Works DB 접근 실패 | 5분 후 재시도, 3회 실패 시 사용자 알림 |
| VOC 분석 실패 | "수동 검토 필요" 알림, 상태 `error`로 전환 |
| PRD 검토 무한 루프 | 최대 3회 제한, 초과 시 사용자 개입 |
| 개발 블로커 | 사용자에게 즉시 알림, 대안 제시 |
| 테스트 실패 | 버그 리포트 작성, 수정/반려 결정 요청 |
| 배포 실패 | 롤백 실행, 사용자 알림 |
| Telegram 전송 실패 | 재시도 3회, 로컬 로그 저장 |

---

## 12. 성공 지표 (KPIs)

| 지표 | 목표값 | 측정 방법 |
|-----|--------|----------|
| VOC 감지 → 1차 피드백 | ≤ 10분 | 타임스탬프 비교 |
| VOC 분석 완료 | ≤ 2시간 | 타임스탬프 비교 |
| PRD 작성 완료 | ≤ 4시간 | 타임스탬프 비교 |
| PRD 검토 루프 | 2~3회 내 완료 | review_count 필드 |
| 사용자 개입 필요 비율 | ≤ 30% | (수동 처리 / 전체 VOC) × 100 |
| 배포 성공률 | ≥ 95% | (성공 배포 / 전체 배포 시도) × 100 |
| 개발자 작업 부담 감소 | 70% 이상 | 기존 대비 처리 시간 비교 |

---

## 13. 위험 요소 및 대응

| 위험 | 영향 | 대응 |
|-----|------|------|
| AI 분석 오류 | 높음 | 사용자 승인 체크포인트 3단계로 필터링 |
| 타 기능 영향도 오판 | 높음 | 반자동화 체크리스트 + 회귀 테스트 강화 |
| API 비용 폭주 | 중간 | 일일 토큰 상한, 예산 알림 |
| Claude Code 연동 실패 | 중간 | 수동 개발 모드 폴백 |
| 알림 피로도 | 중간 | 필수 알림만 즉시, 나머지 일일 요약 |
| 데이터 정합성 | 중간 | VMS Works를 Single Source of Truth로 유지 |

---

## 14. 향후 로드맵

### Phase 1 (MVP) - 2주
- VOC 감지 + 1차 피드백
- 간단한 VOC 분석 (요약, 공수)
- PRD 자동 생성 (1차 검토만)
- Telegram 알림

### Phase 2 (고도화) - 4주
- 2~3차 PRD 검토 루프
- 타 기능 영향도 반자동화
- Claude Code 연동
- 자동 테스트

### Phase 3 (완성) - 8주
- 자동 배포
- VOC 처리 이력 대시보드
- 성능 메트릭 수집
- 팀 공유 기능

---

## 15. 참고자료

- PRD-019: VOC 자동 개발 워크플로우 시스템 (초안)
- GitHub: https://github.com/goohwan4238/vms-voc-agent
- VMS Works 스키마: `/home/chunggh/clawd/memory/vmsworks_schema.md`

---

**승인:**  
**작성일:** 2026-02-15  
**버전:** 1.0-draft
