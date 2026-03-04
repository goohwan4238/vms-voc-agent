# VOC 자동 개발 파이프라인 재활성화 - PRD

**버전**: 0.1.0
**생성일**: 2026-03-04
**상태**: 🚧 개발 중

## 1. 개요

vms-voc-agent는 VOC를 자동 감지하여 분석 → PRD 작성 → 개발 → 테스트까지 수행하는 파이프라인이다.
2026-02-22에 9건의 PRD를 생성한 이력이 있으나 이후 비활성 상태다.

현재 vmsworks VOC 시스템(`app/models/voc.py`)과 실제 연결이 맞지 않고,
환경 설정 누락/불일치, review phase 미구현 등 마무리 작업이 필요하다.

**참조 문서**: `docs/2026-03-04_reactivation_plan.md`

## 2. 목표

- [ ] vmsworks VOC 테이블과 poller 쿼리를 실제 스키마에 맞게 수정
- [ ] 환경 변수 불일치 해결 (.env.example ↔ 코드)
- [ ] Docker 환경에서 전체 파이프라인 E2E 동작 확인
- [ ] vmsworks VOC 상태 양방향 동기화 구현
- [ ] review phase를 자동 코드 리뷰 품질 게이트로 강화 구현

## 3. 요구사항

### 3.1 기능 요구사항

- FR-1: poller가 vmsworks의 실제 VOC 테이블을 폴링해야 한다
  - 현재: `approval_requests` 테이블 조회 (잘못된 매핑)
  - 목표: vmsworks `voc` 모델의 실제 테이블/컬럼에 맞게 수정
  - 상태 필터: `status = 'registered'` (vmsworks VOC 상태값)
- FR-2: VOC 처리 완료 시 vmsworks DB에 상태를 업데이트해야 한다
  - `registered → in_progress` (분석 시작 시)
  - `in_progress → planned` (PRD 승인 시)
  - `planned → deployed` (개발+테스트 완료 시)
- FR-3: review phase를 자동 코드 리뷰 품질 게이트로 강화
  - 파이프라인: `analysis → prd-writing → (승인) → development → review → testing`
  - development 완료 후 자동으로 review 단계 진입
  - Claude CLI로 생성된 코드를 대상으로 자동 리뷰 수행:
    - ruff check (린트 검사)
    - 보안 취약점 스캔 (기본적인 패턴 검사)
    - PRD 요구사항 대비 구현 완성도 검증
  - review 통과 시 자동으로 testing 단계 진행
  - review 실패 시 development로 재진입 (재작업 요청)
- FR-4: testing phase에서 Playwright E2E 테스트를 필수로 실행
  - 현재: `PLAYWRIGHT_ENABLED === 'true'`일 때만 선택적 실행, 미설정 시 스킵
  - 목표: Playwright UI 테스트를 필수 단계로 변경
  - ruff → pytest → **Playwright E2E** 3단계 모두 통과해야 testing 완료
  - Playwright 테스트 실패 시 testing phase를 failed로 처리
  - vmsworks 앱 기동 확인 후 Playwright 실행 (서버 health check 선행)
  - `PLAYWRIGHT_ENABLED` 환경 변수 제거 (항상 실행)
- FR-5: .env.example에 누락된 환경 변수 추가
  - `VMSWORKS_REPO_PATH`, `CLAUDE_SOFT_TIMEOUT_MS`
- FR-6: docker-compose.yml에 voc-agent 서비스 포트 매핑 추가
- FR-7: Poller 시작 시 lastCheckedTime을 DB에서 마지막 처리 시간으로 초기화

### 3.2 비기능 요구사항

- NFR-1: 기존 동작 방식(BullMQ, Claude CLI, Telegram, SSE)을 변경하지 않는다
- NFR-2: vmsworks DB 쓰기는 상태 변경만 허용 (최소 권한)
- NFR-3: poller의 vmsworks 쿼리 실패 시 에이전트 자체 동작에 영향 없어야 한다

## 4. 설계

### 4.1 영향 범위 (변경 파일)

| 파일 | 변경 유형 | 설명 |
|------|-----------|------|
| `src/poller.ts` | 수정 | VOC 테이블 쿼리 변경, lastCheckedTime 초기화, 양방향 동기화 함수 추가 |
| `src/worker.ts` | 수정 | review phase 체이닝 연결 (development → review → testing), 상태 동기화 콜백 추가 |
| `src/services/reviewService.ts` | 신규 | 자동 코드 리뷰 서비스 (ruff, 보안 검사, PRD 완성도 검증) |
| `src/services/analysisService.ts` | 수정 | vmsworks 상태 → in_progress 업데이트 호출 |
| `src/services/developmentService.ts` | 수정 | 완료 시 vmsworks 상태 → deployed 업데이트 |
| `src/services/testingService.ts` | 수정 | Playwright 필수화, PLAYWRIGHT_ENABLED 조건 제거, 서버 health check 추가, vmsworks 상태 동기화 |
| `src/utils/db.ts` | 수정 | vmsworks 상태 업데이트 함수 추가 (updateVmsVocStatus) |
| `.env.example` | 수정 | 누락 변수 추가, CLAUDE_TIMEOUT_MS → CLAUDE_SOFT_TIMEOUT_MS, PLAYWRIGHT_ENABLED 제거 |
| `docker-compose.yml` | 수정 | voc-agent 포트 매핑, VMSWORKS_REPO_PATH 볼륨 |
| `dashboard/src/components/workflow/WorkflowDetail.tsx` | 수정 | review 결과 탭 추가 |

### 4.2 핵심 설계 결정

- **Decision 1**: vmsworks DB 쓰기를 poller.ts의 기존 `vmsPool`을 재사용하여 구현 (새 커넥션 불필요)
- **Decision 2**: review phase를 development → testing 사이의 자동 코드 리뷰 게이트로 강화 (Claude CLI로 PRD 대비 구현 검증)
- **Decision 3**: vmsworks 상태 동기화 실패는 로깅만 하고 에이전트 파이프라인은 계속 진행

## 5. 개발 계획

### Phase 1: Poller 및 환경 설정 수정
- [x] Task 1.1: vmsworks VOC 테이블 스키마 확인 — vmsworks `app/models/voc.py` 조사
- [x] Task 1.2: `src/poller.ts` 쿼리를 실제 VOC 테이블에 맞게 수정
- [x] Task 1.3: `src/poller.ts` lastCheckedTime을 DB 기반으로 초기화
- [x] Task 1.4: `.env.example` 누락 변수 추가 및 불일치 수정
- [x] Task 1.5: `docker-compose.yml` 포트 매핑 및 볼륨 추가

### Phase 2: 양방향 동기화 구현
- [x] Task 2.1: `src/utils/db.ts`에 `updateVmsVocStatus()` 함수 추가
- [x] Task 2.2: `src/services/analysisService.ts`에 상태 동기화 호출 추가 (→ in_progress)
- [x] Task 2.3: `src/services/developmentService.ts`에 상태 동기화 호출 추가 (→ planned)
- [x] Task 2.4: `src/services/testingService.ts` 완료 시 상태 동기화 (→ deployed)

### Phase 2.5: Testing Phase Playwright 필수화
- [x] Task 2.5: `src/services/testingService.ts` — `PLAYWRIGHT_ENABLED` 조건 제거, Playwright를 필수 단계로 변경
- [x] Task 2.6: `src/services/testingService.ts` — Playwright 실행 전 vmsworks 서버 health check 추가
- [x] Task 2.7: `src/services/testingService.ts` — Playwright 테스트 실패 시 상세 리포트 저장 (스크린샷 경로 포함)

### Phase 3: Review Phase 강화 구현
- [x] Task 3.1: `src/services/reviewService.ts` 신규 생성 — 자동 코드 리뷰 로직 구현
  - ruff check 실행 (lint 검사)
  - 기본 보안 패턴 검사 (하드코딩된 비밀번호, SQL 인젝션 패턴 등)
  - Claude CLI로 PRD 대비 구현 완성도 검증
- [x] Task 3.2: `src/worker.ts` 체이닝 수정 — development → review → testing 연결
  - review 통과 시 → testing 자동 진행
  - review 실패 시 → Telegram 알림 + 재작업 판단 대기
- [x] Task 3.3: `dashboard/src/components/workflow/WorkflowDetail.tsx` — review 결과 탭 추가
- [x] Task 3.4: `src/utils/db.ts` — review_results 컬럼 추가 (voc_workflows 테이블)

### Phase 4: E2E 검증 (로컬 실행)
- [ ] Task 4.1: Redis + PostgreSQL 기동 확인, `npm run dev` (all 모드) 실행
- [ ] Task 4.2: 테스트 VOC 등록 → 전체 파이프라인 동작 확인 (analysis → prd → review → testing)
- [ ] Task 4.3: Telegram 알림 및 승인 플로우 확인

## 6. 검증

- [ ] poller가 vmsworks VOC 테이블에서 새 VOC를 정상 감지하는가
- [ ] 파이프라인 완료 후 vmsworks DB에 상태가 반영되는가
- [ ] development 완료 후 review phase가 자동 진입하는가
- [ ] review에서 ruff check, 보안 검사, PRD 완성도 검증이 수행되는가
- [ ] review 통과 시 testing으로 자동 체이닝되는가
- [ ] review 실패 시 Telegram 알림이 발송되는가
- [ ] testing phase에서 Playwright E2E가 필수로 실행되는가 (PLAYWRIGHT_ENABLED 없이)
- [ ] Playwright 실행 전 vmsworks 서버 health check가 동작하는가
- [ ] Playwright 실패 시 스크린샷이 포함된 상세 리포트가 저장되는가
- [ ] ruff + pytest + Playwright 3단계 모두 통과해야 testing completed가 되는가
- [ ] 로컬 환경(Redis + PostgreSQL + npm run dev)으로 전체 시스템이 기동되는가
- [ ] Telegram 승인/반려가 정상 동작하는가
- [ ] 대시보드에서 review 결과를 확인할 수 있는가

## 7. 개발 진행 로그

| 일시 | 작업 | 상태 |
|------|------|------|
| 2026-03-04 09:00 | PRD 생성 | ✅ |
| 2026-03-04 09:30 | 개발 계획 수립 (5 Phase / 19 Tasks) | ✅ |
| 2026-03-04 10:00 | Phase 1 완료: poller VOC 테이블 매핑, 환경 설정 수정 | ✅ |
| 2026-03-04 10:15 | Phase 2 완료: vmsworks 양방향 동기화 (in_progress/planned/deployed) | ✅ |
| 2026-03-04 10:25 | Phase 2.5 완료: Playwright E2E 필수화 + health check + 스크린샷 리포트 | ✅ |
| 2026-03-04 10:45 | Phase 3 완료: reviewService.ts 신규, worker 체이닝, 대시보드 review 탭 | ✅ |
