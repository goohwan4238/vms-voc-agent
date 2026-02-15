# VMS VOC Agent

VMS Works VOC 자동 개발 워크플로우 시스템

## 개요

VMS Works에 등록된 VOC를 자동으로 감지하여 검토 → 분석 → PRD 작성 → 개발 → 테스트 → 배포까지의 전체 워크플로우를 자동화합니다.

## 아키텍처

```
VMS Works ──▶ Poller ──▶ Redis Queue ──▶ Worker
                          │
                          ▼
                    Webhook Server
                          │
                          ▼
                      Telegram
```

## 구성 요소

- **Poller**: VMS Works DB 감시 및 새 VOC 감지
- **Server**: Webhook 수신 및 HTTP API
- **Worker**: Redis 큐에서 작업을 꺼내 처리

## 설치

```bash
# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
# .env 파일 편집

# Docker로 Redis, PostgreSQL 실행
docker-compose up -d

# 빌드
npm run build

# 실행
npm start
```

## 개발 모드

```bash
# 각 컴포넌트별 개발
npm run dev:poller   # DB 감시
npm run dev:server   # HTTP 서버
npm run dev:worker   # 작업 처리
```

## 환경 변수

| 변수 | 설명 | 기본값 |
|-----|------|--------|
| `VMS_DB_URL` | VMS Works DB 연결 문자열 | - |
| `REDIS_URL` | Redis 연결 문자열 | redis://localhost:6379 |
| `OPENAI_API_KEY` | OpenAI API 키 | - |
| `TELEGRAM_BOT_TOKEN` | Telegram 봇 토큰 | - |
| `TELEGRAM_CHAT_ID` | 알림 받을 채팅 ID | - |

## 라이선스

MIT
