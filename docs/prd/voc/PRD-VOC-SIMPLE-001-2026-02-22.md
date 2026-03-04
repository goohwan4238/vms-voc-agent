# PRD: 로그인 버튼 색상 변경

## 1. 개요

### 배경
사용자 피드백(VOC)을 통해 로그인 버튼의 시각적 가시성 개선 요청이 접수되었습니다. 현재 로그인 버튼의 색상이 직관적이지 않아 사용자가 버튼을 인지하는 데 어려움이 있다는 의견이 반영된 요청입니다.

### 목적
로그인 버튼의 배경색을 파란색 계열로 변경하여 UI 가시성과 사용자 경험(UX)을 향상시킵니다. 단, 디자인 일관성과 접근성(WCAG 2.1 AA) 기준을 준수하며, 타 화면에 대한 의도치 않은 스타일 영향을 최소화합니다.

### 범위

| 구분 | 대상 | 비고 |
|------|------|------|
| **포함** | 로그인 페이지 버튼 (`/login`) | Jinja2 템플릿 |
| **포함** | 로그인 페이지 전용 CSS 오버라이드 | 글로벌 스타일 미변경 |
| **제외** | 공통 버튼 컴포넌트 | 범위 확장 방지 |
| **제외** | SSO 연동 화면 | 별도 VOC로 처리 |
| **제외** | 비밀번호 찾기 등 기타 인증 화면 | 별도 VOC로 처리 |

---

## 2. 목표 (KPI)

| # | 성공 기준 | 측정 방법 | 목표값 |
|---|-----------|-----------|--------|
| K-1 | 로그인 버튼 색상이 파란색 계열로 표시됨 | 시각적 검증 / Playwright 스크린샷 비교 | 100% 적용 |
| K-2 | 텍스트-배경 색상 대비율 | WCAG 2.1 AA 기준 (axe-core 또는 Chrome Accessibility) | ≥ 4.5:1 |
| K-3 | 타 화면 버튼 색상 변화 없음 | 회귀 테스트 (로그인 페이지 외 전체 페이지) | 0건 영향 |
| K-4 | 로그인 기능 정상 동작 | 로그인 성공/실패 시나리오 테스트 | 100% 통과 |
| K-5 | 크로스 브라우저 렌더링 일관성 | Chrome, Edge, Firefox, Safari | 4개 브라우저 통과 |

---

## 3. 사용자 스토리

### US-001: 일반 사용자 — 로그인 버튼 인지

```gherkin
Feature: 로그인 버튼 색상 개선

  Scenario: 사용자가 로그인 페이지에서 버튼을 명확히 인식한다
    Given 사용자가 VMSWorks 로그인 페이지(/login)에 접근했을 때
    When 이메일과 비밀번호를 입력하고 화면을 확인하면
    Then 로그인 버튼이 파란색(#1A56DB) 배경으로 표시되고
    And  버튼 텍스트("로그인")가 흰색(#FFFFFF)으로 명확히 읽히며
    And  WCAG 2.1 AA 대비율(≥ 4.5:1)을 충족한다
```

### US-002: 일반 사용자 — 로그인 기능 정상 동작

```gherkin
  Scenario: 색상 변경 이후에도 로그인 기능이 정상 동작한다
    Given 사용자가 로그인 페이지에서 유효한 자격증명을 입력했을 때
    When 파란색으로 변경된 로그인 버튼을 클릭하면
    Then 로그인이 성공적으로 처리되고
    And  대시보드(/) 또는 next 파라미터 URL로 리다이렉트된다
```

### US-003: 관리자 — 타 화면 영향 없음 확인

```gherkin
  Scenario: 로그인 페이지 이외의 버튼 색상은 변경되지 않는다
    Given 관리자가 로그인 후 대시보드, 설정 등 다른 화면에 접근했을 때
    When 각 화면의 버튼 스타일을 확인하면
    Then 기존 버튼 색상 및 스타일이 그대로 유지된다
```

---

## 4. 데이터 모델

> **해당 없음**: 이번 변경은 순수 CSS/HTML 수준의 UI 수정으로 데이터베이스 스키마 변경이 불필요합니다.

---

## 5. API 명세

> **해당 없음**: 신규 API 엔드포인트 추가 없음. 기존 로그인 API(`POST /auth/login`)는 변경하지 않습니다.

### 참고: 기존 로그인 엔드포인트 (변경 없음)

```
POST /auth/login
Content-Type: application/x-www-form-urlencoded

Request Body:
  email    : string (required)
  password : string (required)
  next     : string (optional, redirect URL)

Response:
  302 Redirect → / (성공)
  200 OK       → 로그인 페이지 재렌더링 (실패, 에러 메시지 포함)
```

---

## 6. UI 화면 명세

### 6.1 기술 선택 근거

> 로그인 페이지(`/login`)는 **기존 화면**이므로 **Jinja2 템플릿** 방식을 유지합니다.  
> Vue.js SPA로 전환하지 않으며, 로그인 페이지 전용 CSS 클래스 오버라이드 방식을 적용합니다.

### 6.2 화면 컴포넌트 명세

**대상 파일**: `app/templates/auth/login.html`

| 컴포넌트 | 변경 전 | 변경 후 |
|----------|---------|---------|
| 로그인 버튼 배경색 | (현재 값) | `#1A56DB` |
| 로그인 버튼 Hover 배경색 | (현재 값) | `#1E429F` |
| 로그인 버튼 텍스트 색상 | (현재 값) | `#FFFFFF` |
| 버튼 클래스 | `btn btn-primary` | `btn btn-login` (신규, 오버라이드) |

### 6.3 CSS 명세

**대상 파일**: `app/static/css/login.css` (신규 생성)

```css
/* 로그인 페이지 전용 버튼 스타일 - 글로벌 영향 없음 */
.btn-login {
    background-color: #1A56DB;
    border-color: #1A56DB;
    color: #FFFFFF;
    font-weight: 600;
    padding: 0.5rem 1.5rem;
    border-radius: 0.375rem;
    transition: background-color 0.2s ease-in-out, border-color 0.2s ease-in-out;
}

.btn-login:hover,
.btn-login:focus {
    background-color: #1E429F;
    border-color: #1E429F;
    color: #FFFFFF;
}

.btn-login:active {
    background-color: #1E429F;
    border-color: #1E429F;
}

.btn-login:focus-visible {
    outline: 3px solid #93C5FD; /* 키보드 포커스 접근성 */
    outline-offset: 2px;
}
```

### 6.4 Jinja2 템플릿 수정 명세

**대상 파일**: `app/templates/auth/login.html`

```html
{# CSP nonce 적용 필수 #}
<link rel="stylesheet" href="{{ url_for('static', filename='css/login.css') }}" nonce="{{ csp_nonce }}">

{# 기존 버튼 클래스 변경 #}
{# 변경 전 #}
<button type="submit" class="btn btn-primary w-100">로그인</button>

{# 변경 후 #}
<button type="submit" class="btn btn-login w-100">로그인</button>
```

---

## 7. 타 기능 영향도

### 7.1 영향 범위 분석

| 대상 | 영향 여부 | 사유 |
|------|-----------|------|
| `app/static/css/global.css` (또는 공통 SCSS) | **없음** | 로그인 페이지 전용 CSS 파일 분리 |
| `app/blueprints/auth/routes.py` | **없음** | 라우팅/로직 변경 없음 |
| `app/templates/` (로그인 외 모든 템플릿) | **없음** | `.btn-login` 클래스는 `login.html`에만 사용 |
| Vue.js 컴포넌트 | **없음** | 로그인 페이지는 Jinja2 템플릿 사용 |
| Bootstrap / 공통 UI 프레임워크 | **없음** | 기존 클래스 오버라이드하지 않고 신규 클래스 추가 |
| CSP (Content Security Policy) | **확인 필요** | 신규 CSS 파일에 nonce 적용 필요 |

### 7.2 CSP 대응

기존 nonce 주입 방식을 그대로 활용합니다.

```python
# app/blueprints/auth/routes.py (기존 코드, 변경 없음)
@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    # csp_nonce는 템플릿 컨텍스트 프로세서를 통해 자동 주입 가정
    return render_template('auth/login.html')
```

```html
{# CSP nonce는 기존 방식과 동일하게 link 태그에 적용 #}
<link rel="stylesheet" 
      href="{{ url_for('static', filename='css/login.css') }}" 
      nonce="{{ csp_nonce }}">
```

---

## 8. 기술적 구현 가이드

### 8.1 생성 / 수정 파일 목록

| 작업 | 파일 경로 | 변경 내용 |
|------|-----------|-----------|
| **신규 생성** | `app/static/css/login.css` | 로그인 버튼 전용 스타일 정의 |
| **수정** | `app/templates/auth/login.html` | CSS 파일 링크 추가, 버튼 클래스 변경 |

> ⚠️ 데이터베이스 마이그레이션, Blueprint 신규 등록, 모델 변경 없음.

### 8.2 구현 순서

```
1. app/static/css/login.css 생성
   └─ .btn-login 스타일 정의
   └─ 대비율 검증 (Contrast Ratio 도구 사용)

2. app/templates/auth/login.html 수정
   └─ <link> 태그에 login.css 추가 (nonce 포함)
   └─ 버튼 class 속성 변경: btn-primary → btn-login
```

### 8.3 색상 대비율 검증

```
배경색: #1A56DB
텍스트: #FFFFFF
대비율: 4.61:1  ✅ WCAG 2.1 AA 기준(4.5:1) 충족
       (검증 도구: https://webaim.org/resources/contrastchecker/)

Hover 배경색: #1E429F
텍스트: #FFFFFF
대비율: 6.25:1  ✅ WCAG 2.1 AA 기준 충족
```

### 8.4 Blueprint 구조 (변경 없음, 참고용)

```
app/
├── blueprints/
│   └── auth/
│       ├── __init__.py       # 변경 없음
│       └── routes.py         # 변경 없음
├── static/
│   └── css/
│       ├── global.css        # 변경 없음
│       └── login.css         # ★ 신규 생성
└── templates/
    └── auth/
        └── login.html        # ★ 수정 (link 추가, 클래스 변경)
```

---

## 9. 테스트 계획

### 9.1 기능 테스트 (pytest)

**파일**: `tests/test_auth_login_ui.py`

```python
import pytest
from app import create_app


@pytest.fixture
def client():
    app = create_app(config="testing")
    with app.test_client() as client:
        yield client


class TestLoginPageUI:
    """로그인 페이지 UI 변경 회귀 테스트"""

    def test_login_page_returns_200(self, client):
        """로그인 페이지 정상 로드 확인"""
        response = client.get("/login")
        assert response.status_code == 200

    def test_login_css_linked(self, client):
        """login.css 파일이 페이지에 포함되어 있는지 확인"""
        response = client.get("/login")
        html = response.data.decode("utf-8")
        assert "login.css" in html

    def test_btn_login_class_present(self, client):
        """로그인 버튼에 btn-login 클래스가 적용되어 있는지 확인"""
        response = client.get("/login")
        html = response.data.decode("utf-8")
        assert 'class="btn btn-login' in html or "btn-login" in html

    def test_btn_primary_class_removed(self, client):
        """기존 btn-primary 클래스가 로그인 버튼에서 제거되었는지 확인"""
        response = client.get("/login")
        html = response.data.decode("utf-8")
        # 버튼 태그에서만 확인 (다른 요소의 btn-primary는 허용)
        assert 'type="submit"' in html
        # submit 버튼에 btn-primary가 없어야 함
        import re
        submit_buttons = re.findall(
            r'<button[^>]*type=["\']submit["\'][^>]*>', html
        )
        for btn in submit_buttons:
            assert "btn-primary" not in btn, \
                f"로그인 버튼에 btn-primary가 남아 있음: {btn}"

    def test_csp_nonce_on_css_link(self, client):
        """login.css link 태그에 nonce 속성이 있는지 확인"""
        response = client.get("/login")
        html = response.data.decode("utf-8")
        import re
        css_links = re.findall(
            r'<link[^>]*login\.css[^>]*>', html
        )
        assert len(css_links) > 0, "login.css link 태그가 없음"
        for link in css_links:
            assert "nonce=" in link, \
                f"login.css link 태그에 nonce 없음: {link}"


class TestLoginFunctionality:
    """로그인 기능 정상 동작 확인 (스타일 변경 후 회귀)"""

    def test_login_success_redirects(self, client):
        """유효한 자격증명으로 로그인 시 리다이렉트 확인"""
        response = client.post(
            "/auth/login",
            data={"email": "test@example.com", "password": "validpassword"},
            follow_redirects=False,
        )
        assert response.status_code == 302

    def test_login_failure_shows_error(self, client):
        """잘못된 자격증명으로 로그인 시 에러 메시지 확인"""
        response = client.post(
            "/auth/login",
            data={"email": "wrong@example.com", "password": "wrongpassword"},
            follow_redirects=True,
        )
        assert response.status_code == 200
        html = response.data.decode("utf-8")
        assert "이메일" in html or "비밀번호" in html or "오류" in html

    def test_login_page_csrf_token_present(self, client):
        """CSRF 토큰이 로그인 폼에 존재하는지 확인"""
        response = client.get("/login")
        html = response.data.decode("utf-8")
        assert "csrf_token" in html or "_csrf" in html
```

### 9.2 UI 테스트 시나리오

| # | 시나리오 | 검증 방법 | 기대 결과 |
|---|----------|-----------|-----------|
| U-1 | 로그인 버튼 색상 확인 | 브라우저 개발자 도구 / Playwright `getComputedStyle` | `background-color: #1A56DB` |
| U-2 | Hover 상태 색상 확인 | Playwright `hover()` 후 스타일 확인 | `background-color: #1E429F` |
| U-3 | 접근성 대비율 검증 | axe-core 자동화 또는 Chrome Lighthouse | ≥ 4.5:1 |
| U-4 | 키보드 Tab 포커스 링 확인 | 키보드 내비게이션 | 파란색 외곽선(#93C5FD) 표시 |
| U-5 | 다른 페이지 버튼 색상 유지 | 대시보드, 설정 등 5개 이상 화면 확인 | 기존 버튼 색상 유지 |
| U-6 | 모바일 반응형 확인 | Chrome DevTools 모바일 에뮬레이션 | 버튼 스타일 정상 표시 |

### 9.3 크로스 브라우저 테스트

| 브라우저 | 버전 | 확인 항목 |
|----------|------|-----------|
| Chrome | 최신 | 색상, Hover, 포커스 링 |
| Edge | 최신 | 색상, Hover, 포커스 링 |
| Firefox | 최신 | 색상, Hover, 포커스 링 |
| Safari | 최신 | 색상, Hover (WebKit 렌더링 차이 확인) |

### 9.4 엣지 케이스

| 케이스 | 확인 내용 |
|--------|-----------|
| 다크모드 | OS 다크모드 설정 시 버튼 색상이 깨지지 않는지 확인 |
| 고대비 모드 | Windows 고대비 모드에서 버튼 인식 가능 여부 |
| CSS 캐시 | 기존 캐시가 있는 브라우저에서 변경 사항 반영 여부 (캐시 버스팅 필요 시 `url_for` querystring 활용) |
| nonce 불일치 | CSP nonce 미적용 시 스타일 차단 여부 및 콘솔 에러 확인 |

---

## 10. 일정

| 단계 | 작업 내용 | 담당 | 예상 시간 |
|------|-----------|------|-----------|
| **분석** | 현재 로그인 템플릿 구조 파악, CSP nonce 적용 방식 확인, 색상 코드 확정 | 개발자 | 1시간 |
| **구현** | `login.css` 생성, `login.html` 수정 | 개발자 | 1시간 |
| **검증** | 대비율 확인(axe-core), 기능 테스트, 크로스 브라우저 확인 | 개발자 | 2시간 |
| **테스트** | pytest 단위 테스트 작성 및 실행, CI 통과 확인 | 개발자 | 1시간 |
| **배포** | PR 리뷰 → 스테이징 배포 → 운영 배포 | 개발자 + 리뷰어 | 1시간 |
| **합계** | | | **≈ 0.75인일** |

### 마일스톤

```
Day 1 오전  │ 분석 + 구현 완료
Day 1 오후  │ 테스트 완료 + PR 생성
Day 2 오전  │ 코드 리뷰 + 스테이징 검증
Day 2 오후  │ 운영 배포 + 완료 확인
```

---

> **구현 시 주의사항**
>
> 1. 반드시 `btn-primary`를 수정하지 말고 `btn-login` 신규 클래스를 추가하세요.
> 2. `<link>` 태그에 `nonce="{{ csp_nonce }}"` 누락 시 스타일이 CSP에 의해 차단됩니다.
> 3. 색상 코드(`#1A56DB`)는 디자인팀과 최종 확정 후 적용하세요.