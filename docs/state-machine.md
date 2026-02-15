# VOC 처리 상태

## 상태 정의

| 상태 | 설명 | 다음 상태 |
|-----|------|----------|
| `detected` | VOC 감지됨 | `analyzing` |
| `analyzing` | 분석 중 | `analyzed` |
| `analyzed` | 분석 완료 | `prd_writing` (승인 시) |
| `prd_writing` | PRD 작성 중 | `prd_reviewing` |
| `prd_reviewing` | PRD 검토 중 | `developing` (승인 시) |
| `developing` | 개발 중 | `testing` |
| `testing` | 테스트 중 | `completed` (성공 시) |
| `completed` | 완료 | - |
| `rejected` | 반려 | - |
| `error` | 오류 | 수동 개입 필요 |

## 상태 전이 규칙

- 모든 상태는 `error`로 전이 가능
- `analyzed`, `prd_reviewing`, `testing` 상태에서 사용자 승인 대기
- 최대 3회 PRD 검토 후에도 승인 안 되면 `error` 상태로 전환
