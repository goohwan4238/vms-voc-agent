# VOC 상태 동기화 개선 + 배포 phase + 타임라인 UI - PRD

**버전**: 0.1.0
**생성일**: 2026-03-04
**상태**: ✅ 완료

## 1. 개요

현재 파이프라인은 testing까지만 존재하고 실제 배포 단계가 없다. vmsworks VOC 상태 동기화 시점이 사용자 의도와 맞지 않고(분석 시작에서 in_progress, 테스트 통과에서 deployed), 대시보드에 phase별 시간 기록이 없어 진행 추적이 어렵다.

이 PRD는 세 가지 문제를 한 번에 해결한다:
1. vmsworks VOC 상태 동기화 시점을 사용자 관점에 맞게 재배치
2. phase별 타임스탬프를 DB에 기록하고 대시보드에 타임라인 UI로 표시
3. 배포(deploy) phase 추가 — 테스트 통과 후 수동 배포 버튼

## 2. 목표

- [ ] vmsworks 상태 동기화가 PRD 완료 시 `in_progress`, 승인 시 `planned`, 배포 시 `deployed`로 발생한다
- [ ] 모든 phase의 시작/완료 시각이 DB에 기록된다
- [ ] 대시보드에서 각 VOC의 세로 타임라인으로 진행 과정을 시각적으로 확인할 수 있다
- [ ] 테스트 통과된 VOC를 일괄 배포하는 버튼이 동작한다

## 3. 요구사항

### 3.1 기능 요구사항

- FR-1: vmsworks 상태 동기화 시점 변경 — 분석 시작 시 in_progress 제거, PRD 완료 시 in_progress, 승인 시 planned, 개발 완료 시 planned 제거, 테스트 통과 시 deployed 제거, 배포 버튼 시 deployed
- FR-2: voc_workflows 테이블에 phase별 타임스탬프 컬럼 13개 추가 (queued_at ~ deployed_at)
- FR-3: 각 서비스에서 해당 phase 시작/완료 시 타임스탬프 기록
- FR-4: `deployAll()` 함수 — testing completed인 모든 VOC를 git add/commit/push 후 deployed 상태로 전환
- FR-5: `POST /deploy` API 엔드포인트
- FR-6: 대시보드에 DeployButton 컴포넌트 — testing 완료 VOC 수 표시, 확인 다이얼로그 후 배포
- FR-7: 대시보드에 WorkflowTimeline 컴포넌트 — 세로 타임라인, 완료/진행중/대기 시각 표시

### 3.2 비기능 요구사항

- NFR-1: 기존 VOC 데이터와 호환 — 새 컬럼은 모두 NULL 허용
- NFR-2: vmsworks 동기화 실패 시 파이프라인은 계속 진행 (기존 동작 유지)

## 4. 설계

### 4.1 영향 범위 (변경 파일)

| 파일 | 변경 유형 | 설명 |
|------|-----------|------|
| `src/utils/db.ts` | 수정 | 타임스탬프 컬럼 ALTER, upsertWorkflow 타입 확장, getDeployableWorkflows(), extractVmsVocId() |
| `src/services/analysisService.ts` | 수정 | updateVmsVocStatus 호출 제거, analysis_started_at/completed_at 기록 |
| `src/services/prdService.ts` | 수정 | prd_started_at/completed_at 기록, PRD 완료 시 updateVmsVocStatus(in_progress) |
| `src/services/developmentService.ts` | 수정 | updateVmsVocStatus 호출 제거, dev_started_at/completed_at 기록 |
| `src/services/reviewService.ts` | 수정 | review_started_at/completed_at 기록 |
| `src/services/testingService.ts` | 수정 | updateVmsVocStatus 호출 제거, testing_started_at/completed_at 기록 |
| `src/services/deployService.ts` | 신규 | deployAll() — git add/commit/push + DB/vmsworks 상태 업데이트 |
| `src/utils/telegram.ts` | 수정 | approve 콜백에 approved_at + updateVmsVocStatus(planned) 추가 |
| `src/server.ts` | 수정 | POST /approve에 approved_at + updateVmsVocStatus(planned), POST /deploy 추가 |
| `src/poller.ts` | 수정 | 큐 등록 시 queued_at 기록 |
| `dashboard/src/types/workflow.ts` | 수정 | VocWorkflow 타임스탬프 필드, PHASE_ORDER/LABELS에 deployed 추가 |
| `dashboard/src/api/workflows.ts` | 수정 | deployAll() API 함수 추가 |
| `dashboard/src/components/workflow/WorkflowTimeline.tsx` | 신규 | 세로 타임라인 컴포넌트 |
| `dashboard/src/components/workflow/DeployButton.tsx` | 신규 | 배포 버튼 컴포넌트 |
| `dashboard/src/components/workflow/WorkflowDetail.tsx` | 수정 | 기본 정보 카드 아래에 WorkflowTimeline 배치 |
| `dashboard/src/components/workflow/WorkflowList.tsx` | 수정 | 헤더에 DeployButton 배치 |

### 4.2 핵심 설계 결정

- Decision 1: 배포는 수동(버튼 클릭)으로만 — 테스트 통과 후 자동 배포하지 않음
- Decision 2: deployAll()은 일괄 배포 — 개별 VOC 배포가 아닌 testing completed 전체
- Decision 3: git push 실패 시 DB 상태는 업데이트하지 않음 (트랜잭션 보장)
- Decision 4: 타임라인은 탭이 아닌 기본 정보 카드 아래에 항상 표시

### 4.3 vmsworks 상태 동기화 매핑

| 시점 | 현재 | 변경 후 |
|------|------|---------|
| 분석 시작 | `in_progress` | (제거) |
| PRD 작성 완료 | - | `in_progress` |
| Telegram/대시보드 승인 | - | `planned` + `planned_at` |
| 개발 완료 | `planned` + `planned_at` | (제거) |
| 테스트 통과 | `deployed` + `deployed_at` | (제거) |
| 배포 버튼 클릭 | - | `deployed` + `deployed_at` |

## 5. 개발 계획

### Phase 1: DB 스키마 + 헬퍼
- [x] Task 1.1: voc_workflows에 타임스탬프 컬럼 13개 ALTER TABLE 추가 — `src/utils/db.ts`
- [x] Task 1.2: upsertWorkflow 타입에 타임스탬프 필드 추가 — `src/utils/db.ts`
- [x] Task 1.3: getDeployableWorkflows() 함수 추가 (phase=testing, status=completed) — `src/utils/db.ts`
- [x] Task 1.4: extractVmsVocId(vocId) 헬퍼 추가 (VOC-19 → 19) — `src/utils/db.ts`

### Phase 2: vmsworks 상태 동기화 변경 + 타임스탬프 기록
- [x] Task 2.1: analysisService — updateVmsVocStatus 제거, analysis_started_at/completed_at 기록 — `src/services/analysisService.ts`
- [x] Task 2.2: prdService — prd_started_at/completed_at 기록, PRD 완료 시 updateVmsVocStatus(in_progress) — `src/services/prdService.ts`
- [x] Task 2.3: developmentService — updateVmsVocStatus 제거, dev_started_at/completed_at 기록 — `src/services/developmentService.ts`
- [x] Task 2.4: reviewService — review_started_at/completed_at 기록 — `src/services/reviewService.ts`
- [x] Task 2.5: testingService — updateVmsVocStatus 제거, testing_started_at/completed_at 기록 — `src/services/testingService.ts`
- [x] Task 2.6: telegram.ts approve 콜백 — approved_at + updateVmsVocStatus(planned, planned_at) — `src/utils/telegram.ts`
- [x] Task 2.7: server.ts POST /approve — approved_at + updateVmsVocStatus(planned, planned_at) — `src/server.ts`
- [x] Task 2.8: poller.ts — 큐 등록 시 queued_at 기록 — `src/poller.ts`

### Phase 3: 배포 서비스 + API
- [x] Task 3.1: deployService.ts 신규 — deployAll() 함수 (git add/commit/push + DB 상태 + vmsworks 동기화) — `src/services/deployService.ts`
- [x] Task 3.2: server.ts에 POST /deploy 엔드포인트 추가 — `src/server.ts`

### Phase 4: 대시보드 업데이트
- [x] Task 4.1: workflow.ts 타입 — 타임스탬프 필드 + PHASE_ORDER/LABELS에 deployed — `dashboard/src/types/workflow.ts`
- [x] Task 4.2: workflows.ts API — deployAll() 함수 추가 — `dashboard/src/api/workflows.ts`
- [x] Task 4.3: WorkflowTimeline.tsx 신규 — 세로 타임라인 컴포넌트 — `dashboard/src/components/workflow/WorkflowTimeline.tsx`
- [x] Task 4.4: DeployButton.tsx 신규 — 배포 버튼 (testing 완료 VOC 수 표시, 확인 다이얼로그) — `dashboard/src/components/workflow/DeployButton.tsx`
- [x] Task 4.5: WorkflowDetail.tsx — 기본 정보 카드 아래에 WorkflowTimeline 배치 — `dashboard/src/components/workflow/WorkflowDetail.tsx`
- [x] Task 4.6: WorkflowList.tsx — 헤더에 DeployButton 배치 — `dashboard/src/components/workflow/WorkflowList.tsx`

### Phase 5: 검증
- [x] Task 5.1: tsc 빌드 확인 — 백엔드
- [x] Task 5.2: 대시보드 빌드 확인 — `npm run build`

## 6. 검증

- [x] 백엔드 tsc 빌드 성공 (Task 5.1)
- [x] 대시보드 빌드 성공 (Task 5.2)
- [ ] 서비스 재시작 후 기존 VOC 조회 시 타임라인 표시 (기존 데이터는 타임스탬프 NULL → 회색 원)
- [ ] testing completed VOC 있을 때 배포 버튼 표시 확인

## 7. 개발 진행 로그

| 일시 | 작업 | 상태 |
|------|------|------|
| 2026-03-04 12:00 | PRD 생성 | ✅ |
| 2026-03-04 12:05 | 개발 계획 수립 (5 Phase, 22 Task) | ✅ |
| 2026-03-04 12:30 | Phase 1~5 전체 구현 + 빌드 검증 완료 | ✅ |
