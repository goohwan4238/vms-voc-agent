# vms-voc-agent 재활성화 및 확장 계획

**작성일**: 2026-03-04
**협의 참여**: chunggh, Claude Code
**상태**: 협의 완료, 구현 대기

---

## 1. 배경

### 현재 보유 시스템

| 시스템 | 역할 | 상태 |
|--------|------|------|
| **vmsworks** | Flask 기반 업무 시스템 (프로젝트/인사/휴가/공수/VOC) | 운영 중 |
| **vms-voc-agent** | VOC 자동 개발 파이프라인 (Node.js/TypeScript) | 개발 완료, 비활성 |
| **OpenClaw** | LLM 게이트웨이 (Function Calling, 지식베이스) | 운영 중 |
| **Mozza 챗봇** | vmsworks 내 AI 어시스턴트 (개인용 + Admin 모드) | 운영 중 |

### vms-voc-agent 기존 기능 (이미 구현됨)
- VMS Works DB 폴링 (60초 간격) → 새 VOC 감지
- 4단계 파이프라인: 분석 → PRD → 개발 → 테스트
- Claude CLI (`claude -p --model sonnet`) 자식 프로세스로 실행
- BullMQ (Redis) 기반 작업 큐
- Telegram 봇 (알림 + PRD 승인/반려)
- React 대시보드 + SSE 실시간 모니터링
- 전용 PostgreSQL DB (`vocagent`)

---

## 2. 목표

### 우선순위 1: VOC 자동 개발 파이프라인 재활성화
- 현재 vmsworks의 VOC 시스템과 연결
- 기존 파이프라인 (분석 → PRD → 승인 → 개발 → 테스트) 정상 동작 확인
- vmsworks VOC 상태와 양방향 동기화

### 우선순위 2: 관리자 챗봇 추가
- vms-voc-agent 대시보드에 챗봇 UI 탑재
- vmsworks Mozza 챗봇의 Admin 모드를 강화한 버전
- 자연어 DB 쿼리 + 시스템 관리 기능

---

## 3. 관리자 챗봇 설계

### 3.1 위치
- **vms-voc-agent 대시보드 내** (React 앱에 챗봇 컴포넌트 추가)
- vmsworks의 기존 Mozza 챗봇 Admin 모드 기능을 강화

### 3.2 LLM 연동
- OpenClaw 게이트웨이 사용 (vmsworks와 동일)
  - URL: `http://192.168.1.195:18789`
  - Function Calling 지원

### 3.3 DB 접근 정책

**읽기 전용 (모든 테이블)**
- 자연어로 DB 쿼리 가능 ("이번 달 휴가 현황", "프로젝트별 공수 요약" 등)
- SELECT만 허용, 결과를 테이블/차트로 시각화

**쓰기 가능 (제한된 테이블만, 기능화)**
- 특정 관리 작업만 Tool(Function)로 제공
- 예시:
  - VOC 상태 변경
  - 사용자 권한 관리
  - 시스템 설정 변경
  - 코드/카테고리 관리
- 직접 SQL INSERT/UPDATE는 불가, 반드시 정의된 Tool을 통해서만 쓰기

### 3.4 주요 기능 (예상)

| 기능 | 예시 명령 | 유형 |
|------|-----------|------|
| DB 조회 | "이번 달 휴가 현황 보여줘" | 읽기 |
| 통계/리포트 | "프로젝트별 투입 공수 요약" | 읽기 |
| VOC 관리 | "VOC-15 상태를 해결됨으로 변경" | 쓰기(Tool) |
| 파이프라인 제어 | "VOC-20 개발 시작해" | 쓰기(Tool) |
| 시스템 모니터링 | "오늘 에러 로그 요약" | 읽기 |
| 사용자 관리 | "김철수 승인권자를 박단호로 설정" | 쓰기(Tool) |

---

## 4. 아키텍처 (확장 후)

```
┌──────────────────────────────────────────────────────────┐
│                   vms-voc-agent                            │
│                                                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────────┐ │
│  │  Poller  │  │  Worker  │  │   Express Server          │ │
│  │ (VOC감지) │  │(파이프라인)│  │  ├─ REST API             │ │
│  └────┬─────┘  └────┬─────┘  │  ├─ SSE (실시간)          │ │
│       │              │        │  └─ 챗봇 API (OpenClaw)   │ │
│       └──── Redis ───┘        └──────────┬───────────────┘ │
│              (BullMQ)                     │                  │
│                                           │                  │
│  ┌────────────────────────────────────────┴─────────────┐  │
│  │              React Dashboard                          │  │
│  │  ├─ 워크플로우 목록/상세 (기존)                         │  │
│  │  ├─ VOC 등록 (기존)                                    │  │
│  │  └─ 관리자 챗봇 (신규)                                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  외부 연동:                                                 │
│  ├─ VMS Works DB (PostgreSQL) — 읽기 + 제한된 쓰기          │
│  ├─ OpenClaw (LLM 게이트웨이) — 챗봇 AI                    │
│  ├─ Claude CLI — 코드 생성/수정                             │
│  └─ Telegram — 알림/승인                                    │
└──────────────────────────────────────────────────────────┘
```

---

## 5. 기술 참조

### vmsworks Mozza 챗봇 (참고용)
- **서비스**: `app/services/chat_service.py`
- **모델**: `app/models/chat.py`
- **라우트**: `app/routes/chat.py` (웹), `app/api/chat.py` (모바일)
- **OpenClaw 연동**: OpenAI-compatible API, Function Calling, SSE 스트리밍
- **Admin 모드**: `/admin on` 명령어로 토글, superadmin 전용
- **Tool 개수**: 개인용 16개 (조회 10 + 등록 6)

### vmsworks VOC 시스템
- **모델**: `app/models/voc.py`
- **라우트**: `app/routes/voc.py`
- **상태**: registered → in_progress → planned → deployed / resolved / rejected
- **VOC 유형**: feature, improvement, bug, question

### vmsworks DB 접속 정보
- 운영 DB 설정: `sync_tools/deploy/AttendanceSync/config.ini` 의 `[TARGET_DB]` 섹션

---

## 6. 구현 순서 (제안)

### Phase 1: 파이프라인 재활성화
1. vms-voc-agent 환경 점검 (Docker, Redis, DB)
2. vmsworks VOC 테이블과 폴링 연결 확인
3. Claude CLI 실행 환경 확인
4. 테스트 VOC로 전체 파이프라인 E2E 테스트

### Phase 2: 관리자 챗봇
1. Express 서버에 챗봇 API 엔드포인트 추가 (OpenClaw 연동)
2. 읽기 전용 자연어 DB 쿼리 Tool 구현
3. 쓰기 가능 Tool 구현 (VOC 상태 변경, 파이프라인 제어 등)
4. React 대시보드에 챗봇 UI 컴포넌트 추가
5. SSE 스트리밍 지원

---

## 7. GitHub Issue 연동 결론

초기 논의에서 GitHub Issues 연동을 검토했으나, **VOC 자체가 Issue 역할을 하므로 불필요**하다고 결론.
- VOC가 Single Source of Truth
- Claude CLI는 GitHub Actions 없이 직접 자식 프로세스로 실행
- PR 생성이 필요하면 Claude CLI가 직접 git 작업 수행
