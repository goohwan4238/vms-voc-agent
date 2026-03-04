# PRD: 자재 입출고 이력 조회

**문서 버전**: 1.0
**작성일**: 2026-02-22
**상태**: 초안
**우선순위**: Medium
**예상 공수**: Low

---

## 1. 개요

### 1.1 배경

VMSWorks 시스템에서 자재 입출고 처리 기능은 운영 중이나, 과거 트랜잭션 이력을 날짜 범위 및 자재코드 조건으로 검색·조회할 수 있는 전용 화면이 존재하지 않는다. 담당자는 현재 입출고 현황 파악을 위해 별도 쿼리 또는 수작업 대장에 의존하고 있으며, 이로 인해 재고 이상 원인 추적 및 감사(Audit) 업무에 비효율이 발생하고 있다.

### 1.2 문제 정의

- 특정 기간의 입출고 이력을 시스템 내에서 즉시 조회할 수 없음
- 자재코드 기준 입출고 누적 현황 파악이 어려움
- 이력 데이터가 DB에 존재하더라도 조회 UI가 없어 현장 활용 불가
- 재고 불일치 발생 시 원인 추적 수단이 부재

### 1.3 범위

| 구분 | 내용 |
|------|------|
| 포함 (MVP) | 날짜 범위 + 자재코드 필터 조건 이력 조회 화면 |
| 포함 (MVP) | 페이지네이션 지원 조회 API |
| 포함 (MVP) | 입출고 구분(IN/OUT) 표시 |
| 2차 릴리즈 | Excel/CSV 내보내기(Export) |
| 2차 릴리즈 | 창고별 필터 조건 추가 |
| 제외 | 입출고 데이터 수정·삭제 기능 |
| 제외 | 이력 그래프/차트 시각화 |

---

## 2. 목표

### 2.1 비즈니스 목표

- 자재 입출고 이력 즉시 조회를 통해 재고 관리 업무 효율 향상
- 감사·정산 시 데이터 추적 신뢰성 확보

### 2.2 제품 목표

- 사용자가 원하는 날짜 범위 및 자재코드를 설정하고 3초 이내에 이력 목록을 확인할 수 있도록 한다
- 입출고 구분(IN/OUT), 수량, 일시 등 핵심 정보를 한 화면에서 파악할 수 있도록 한다
- 페이지네이션을 통해 대용량 이력 데이터도 안정적으로 조회할 수 있도록 한다

### 2.3 성공 지표 (KPI)

| 지표 | 목표치 |
|------|--------|
| 이력 조회 API 응답 시간 | 1,000건 기준 2초 이하 |
| 기본 날짜 범위 내 데이터 로드 성공률 | 99.5% 이상 |
| 재고 이상 원인 추적 소요 시간 단축 | 기존 대비 50% 이상 |

---

## 3. 사용자 스토리

### 3.1 창고 담당자

```
As a 창고 담당자,
I want to 날짜 범위와 자재코드를 선택하여 입출고 이력을 조회하고 싶다,
So that 특정 기간의 자재 흐름을 즉시 확인하고 재고 현황을 파악할 수 있다.
```

```
As a 창고 담당자,
I want to 입출고 구분(IN/OUT)이 명확히 표시된 이력 목록을 보고 싶다,
So that 입고와 출고를 구분하여 재고 변동 원인을 추적할 수 있다.
```

### 3.2 재고 관리자

```
As a 재고 관리자,
I want to 특정 자재코드의 입출고 누적 이력을 기간별로 조회하고 싶다,
So that 재고 불일치 발생 시 원인을 빠르게 추적할 수 있다.
```

```
As a 재고 관리자,
I want to 조회 결과를 페이지 단위로 탐색하고 싶다,
So that 수천 건의 이력 데이터도 시스템 부하 없이 확인할 수 있다.
```

### 3.3 경영진 / 감사 담당자

```
As a 감사 담당자,
I want to 원하는 기간의 자재 입출고 전체 내역을 조회하고 싶다,
So that 정기 감사 및 정산 업무에 필요한 데이터 근거를 확보할 수 있다.
```

---

## 4. 기능 명세

### 4.1 이력 조회 화면 (MVP)

#### 4.1.1 필터 조건 영역

| 필터 항목 | 타입 | 설명 |
|---------|------|------|
| 조회 시작일 | DatePicker | 기본값: 오늘 기준 -3개월 |
| 조회 종료일 | DatePicker | 기본값: 오늘 |
| 자재코드 | 텍스트 입력 + 검색 버튼 | 직접 입력 또는 자재 마스터 검색 팝업 |
| 입출고 구분 | Select (전체/입고/출고) | 기본값: 전체 |

- 조회 시작일은 종료일보다 이전이어야 하며, 위반 시 입력 오류 메시지 표시
- 날짜 범위 최대 조회 기간: **1년** (성능 보호를 위한 서버 측 제한)
- 조회 버튼 클릭 시 API 호출, 초기화 버튼 클릭 시 기본값으로 리셋

#### 4.1.2 이력 목록 테이블

| 컬럼 | 데이터 소스 | 설명 |
|------|-----------|------|
| 일시 | `transaction_date` | YYYY-MM-DD HH:mm 형식 |
| 자재코드 | `material_code` | - |
| 자재명 | `materials.name` (JOIN) | 자재 마스터 연동 |
| 입출고 구분 | `transaction_type` | IN / OUT 배지(Badge) 표시 |
| 수량 | `quantity` | 입고: 양수(+), 출고: 음수(-) 표시 |
| 단위 | `unit` | 자재 마스터 연동 |
| 비고 | `note` | 선택적 표시 |

- 기본 정렬: 일시 내림차순 (최신 순)
- 컬럼 헤더 클릭으로 정렬 방향 전환 (일시, 자재코드)

#### 4.1.3 페이지네이션

- 1페이지 기본 표시 건수: **50건** (사용자 변경 가능: 20 / 50 / 100)
- 페이지 번호 직접 이동 지원
- 전체 조회 건수 표시 (예: "총 1,234건")

### 4.2 데이터 조회 API (MVP)

#### `GET /api/materials/history`

**Query Parameters**

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `from` | string (YYYY-MM-DD) | 필수 | 조회 시작일 |
| `to` | string (YYYY-MM-DD) | 필수 | 조회 종료일 |
| `material_code` | string | 선택 | 자재코드 (부분 일치 검색) |
| `transaction_type` | string | 선택 | `IN` / `OUT` / 미입력 시 전체 |
| `page` | integer | 선택 | 기본값 1 |
| `per_page` | integer | 선택 | 기본값 50, 최대 100 |

**Response (200 OK)**

```json
{
  "total": 1234,
  "page": 1,
  "per_page": 50,
  "items": [
    {
      "id": 1001,
      "transaction_date": "2026-02-20T14:35:00",
      "material_code": "MAT-001",
      "material_name": "볼트 M10",
      "transaction_type": "IN",
      "quantity": 500,
      "unit": "EA",
      "note": "정기 입고"
    }
  ]
}
```

**Error Responses**

| 상태 코드 | 조건 |
|---------|------|
| 400 | `from` / `to` 미입력, 날짜 형식 오류, 범위 1년 초과 |
| 500 | 서버 내부 오류 |

---

## 5. 타 기능 영향도

### 5.1 데이터베이스

| 테이블 | 변경 내용 |
|--------|---------|
| `material_transactions` (또는 `stock_history`) | **읽기 전용** — 기존 테이블 구조 변경 없음 |
| `materials` | **읽기 전용** — 자재명·단위 조회를 위한 JOIN만 수행 |

> **전제 조건**: `material_transactions` 테이블이 존재하고 `transaction_type`, `quantity`, `transaction_date`, `material_code` 컬럼이 있어야 함.
> 테이블 미존재 또는 컬럼 구조 불일치 시 **착수 전 DB 설계 작업 선행 필요** (공수 Medium으로 재평가).

**권장 인덱스 (신규 추가)**

```sql
-- 이력 조회 성능 최적화
CREATE INDEX IF NOT EXISTS idx_material_transactions_date
  ON material_transactions (transaction_date);

CREATE INDEX IF NOT EXISTS idx_material_transactions_code_date
  ON material_transactions (material_code, transaction_date);
```

### 5.2 API

| 엔드포인트 | 변경 유형 | 내용 |
|-----------|---------|------|
| `GET /api/materials/history` | **신규** | 입출고 이력 조회 |
| 기타 기존 API | **없음** | 기존 로직 변경 불필요 |

### 5.3 프론트엔드

| 영역 | 영향 |
|------|------|
| 신규 페이지 (`/materials/history`) | 신규 Vue.js 컴포넌트 추가 |
| 사이드 메뉴 / 내비게이션 | "자재 입출고 이력" 메뉴 항목 추가 |
| 기존 입출고 처리 화면 | **변경 없음** |
| 재고 현황 화면 | **변경 없음** |

### 5.4 연관 기능

| 기능 | 영향 |
|------|------|
| 자재 입출고 처리 | **없음** — 조회 전용, 기존 처리 로직 무변경 |
| 재고 현황 조회 | **없음** — 독립 화면으로 분리 |
| 자재 마스터 관리 | 자재명·단위 조회를 위한 읽기 참조만 발생 |

---

## 6. 기술적 접근 방안

### 6.1 아키텍처

```
[Vue.js SPA]
  └─ MaterialHistoryView.vue
       ├─ FilterPanel.vue   (날짜 범위 + 자재코드 + 입출고 구분 필터)
       └─ HistoryTable.vue  (페이지네이션 포함 목록 테이블)
            │
            ▼ HTTP GET /api/materials/history
[Flask Blueprint: inventory 또는 warehouse]
  └─ history.py (Route + Query Logic)
       │
       ▼ SELECT ... FROM material_transactions
         LEFT JOIN materials ON ...
         WHERE transaction_date BETWEEN :from AND :to
           AND (:material_code IS NULL OR material_code ILIKE :material_code)
           AND (:type IS NULL OR transaction_type = :type)
         ORDER BY transaction_date DESC
         LIMIT :per_page OFFSET :offset
[PostgreSQL]
  └─ material_transactions + materials
```

### 6.2 Flask Blueprint 구현 방향

```python
# inventory/routes/history.py (신규)

from flask import Blueprint, request, jsonify
from ..services import material_history_service

history_bp = Blueprint('material_history', __name__)

@history_bp.route('/api/materials/history', methods=['GET'])
def get_material_history():
    from_date = request.args.get('from')
    to_date   = request.args.get('to')
    code      = request.args.get('material_code')
    trx_type  = request.args.get('transaction_type')
    page      = int(request.args.get('page', 1))
    per_page  = min(int(request.args.get('per_page', 50)), 100)

    # 입력 검증: from/to 필수, 1년 이내
    # ...

    result = material_history_service.query(
        from_date, to_date, code, trx_type, page, per_page
    )
    return jsonify(result)
```

### 6.3 성능 최적화

| 전략 | 내용 |
|------|------|
| 인덱스 | `transaction_date`, `(material_code, transaction_date)` 복합 인덱스 |
| 날짜 범위 제한 | 최대 1년 서버 측 강제 제한으로 풀스캔 방지 |
| 페이지네이션 | LIMIT/OFFSET 기반, 기본값 50건으로 I/O 최소화 |
| 기본 조회 범위 | 프론트엔드 초기 로드 시 최근 3개월 자동 설정 |

### 6.4 Vue.js 컴포넌트 구성

```
views/materials/
  └─ HistoryView.vue          # 페이지 진입점
components/materials/history/
  ├─ FilterPanel.vue           # 필터 조건 영역
  ├─ HistoryTable.vue          # 이력 목록 테이블
  └─ Pagination.vue            # 페이지네이션 (공통 컴포넌트 재사용 우선)
```

- 기존 공통 테이블 컴포넌트 재사용 여부 사전 확인 권장
- 상태 관리: Vuex 또는 Pinia 기존 패턴 따름

---

## 7. 테스트 계획

### 7.1 단위 테스트

| 대상 | 테스트 항목 |
|------|-----------|
| `GET /api/materials/history` | `from` / `to` 파라미터 미입력 시 400 반환 |
| | 날짜 범위 1년 초과 시 400 반환 |
| | 정상 파라미터 입력 시 200 + 페이지네이션 구조 반환 |
| | `material_code` 필터 적용 시 해당 코드만 반환 |
| | `transaction_type=IN` 필터 시 입고 이력만 반환 |
| | `per_page` 최대값(100) 초과 입력 시 100으로 클램핑 |

### 7.2 통합 테스트

| 시나리오 | 기대 결과 |
|---------|---------|
| 날짜 범위 + 자재코드 복합 필터 조회 | 조건에 맞는 이력만 반환, 총 건수 정확 |
| 데이터 없는 조건 조회 | 빈 배열 반환 (`total: 0`) |
| 페이지 2 이상 이동 | 올바른 OFFSET 적용, 중복 없음 |
| 자재 마스터 JOIN | 자재명·단위 정상 표시 (자재코드 존재 시) |
| 자재 마스터 미존재 자재코드 | 자재명 `null` 또는 코드 그대로 표시 |

### 7.3 성능 테스트

| 시나리오 | 목표 |
|---------|------|
| 3개월 기본 범위 조회 (약 1,000건) | 응답 2초 이하 |
| 1년 최대 범위 조회 (약 10,000건) | 응답 5초 이하 |
| 동시 사용자 10명 동시 조회 | 응답 시간 2배 이하 유지 |

### 7.4 UI/UX 검증

| 항목 | 확인 내용 |
|------|---------|
| 날짜 역순 입력 | 오류 메시지 표시, 조회 차단 |
| 빈 결과 | "조회 결과가 없습니다" 안내 문구 표시 |
| 로딩 상태 | 조회 중 스피너 표시, 중복 클릭 방지 |
| 페이지네이션 경계 | 첫/마지막 페이지에서 이전/다음 버튼 비활성화 |

### 7.5 브라우저 호환성

- Chrome 최신, Firefox 최신, Edge 최신

---

## 8. 일정

### 8.1 사전 확인 사항 (착수 전)

| 확인 항목 | 담당 |
|---------|------|
| `material_transactions` 테이블 존재 여부 및 컬럼 구조 확인 | 백엔드 |
| 입출고 구분 컬럼(`transaction_type`) 존재 여부 확인 | 백엔드 |
| 기존 Blueprint 구조 파악 (inventory / warehouse) | 백엔드 |
| 공통 테이블 컴포넌트 재사용 가능 여부 | 프론트엔드 |

### 8.2 개발 일정 (DB 테이블 존재 전제)

| 주차 | 작업 | 담당 |
|------|------|------|
| 1주차 | DB 인덱스 추가, Flask API 개발 (`/api/materials/history`) | 백엔드 |
| 1주차 | 필터 패널 컴포넌트 구현 | 프론트엔드 |
| 2주차 | 이력 목록 테이블 + 페이지네이션 구현, API 연동 | 프론트엔드 |
| 2주차 | API 단위 테스트 작성 | 백엔드 |
| 3주차 | UI 통합 테스트, 성능 테스트, QA 수정 | 전체 |
| 3주차 말 | **릴리즈** | - |

> **총 예상 공수**: 백엔드 2~3일 + 프론트엔드 4~6일

### 8.3 DB 테이블 미존재 시 추가 일정

| 작업 | 예상 공수 |
|------|---------|
| 입출고 이력 테이블 스키마 설계 | 1~2일 |
| 기존 입출고 데이터 마이그레이션 | 1~3일 |
| 전체 공수 재산정 | **Medium** |

---

## 9. 리스크 및 대응 방안

| 리스크 | 가능성 | 영향도 | 대응 방안 |
|--------|--------|--------|---------|
| 입출고 이력 테이블 미존재 | 중 | 高 | 착수 전 DB 스키마 사전 확인 필수, 미존재 시 공수 Medium 재산정 |
| 대용량 누적 이력으로 인한 쿼리 성능 저하 | 중 | 중 | 날짜 범위 1년 서버 제한, 복합 인덱스 선행 적용 |
| 입출고 구분 컬럼 부재 (IN/OUT 미분리) | 저~중 | 중 | 착수 전 확인, 부재 시 구분 로직 추가 설계 필요 |
| 자재 마스터 JOIN 시 데이터 정합성 문제 | 저 | 저 | LEFT JOIN 적용으로 마스터 미존재 자재도 이력 표시 |
| 기본 조회 범위 미정의로 인한 초기 로드 과부하 | 저 | 중 | 프론트엔드 기본값 최근 3개월 고정 |

---

## 10. 미결 사항 (Open Questions)

- [ ] `material_transactions` 테이블명 및 실제 컬럼 구조 확인 필요
- [ ] 입출고 구분을 `transaction_type` 단일 컬럼으로 관리하는지, 별도 테이블/코드로 분리하는지 확인
- [ ] 조회 결과 Excel/CSV 내보내기 기능을 MVP에 포함할지 여부
- [ ] 창고별(warehouse) 필터 조건을 MVP에 포함할지 여부
- [ ] 날짜 최대 조회 범위 1년 제한이 업무 요건에 부합하는지 확인

---

**작성자**: VMS VOC Agent
**검토 필요**: 백엔드 리드, 프론트엔드 리드, 프로덕트 오너, 재고 관리 담당자
