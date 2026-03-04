# VMS VOC Agent - System Architecture

## 전체 시스템 구조도

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          VMS VOC Agent System                               │
│                          (Node.js / TypeScript)                             │
│                                                                             │
│  ┌──────────────┐   ┌──────────────────┐   ┌────────────────────────────┐  │
│  │   Server      │   │   Worker          │   │   Poller                  │  │
│  │   (Express)   │   │   (BullMQ)        │   │   (setInterval 60s)      │  │
│  │   :3000       │   │   concurrency: 1  │   │                          │  │
│  │               │   │                   │   │   VMS Works DB 폴링      │  │
│  │ API Endpoints │   │ Job 처리 파이프라인│   │   → 새 VOC 감지         │  │
│  │ SSE Broadcast │   │ Telegram Bot      │   │   → 큐 등록             │  │
│  │ Static Files  │   │                   │   │                          │  │
│  └──────┬───────┘   └────────┬──────────┘   └────────────┬─────────────┘  │
│         │                    │                            │                 │
│         │     ┌──────────────┴──────────────┐             │                 │
│         │     │     Services Layer           │             │                 │
│         │     │                              │             │                 │
│         │     │  ┌─────────────────────┐     │             │                 │
│         │     │  │ analysisService     │     │             │                 │
│         │     │  │ Claude CLI → 분석   │     │             │                 │
│         │     │  └─────────────────────┘     │             │                 │
│         │     │  ┌─────────────────────┐     │             │                 │
│         │     │  │ prdService          │     │             │                 │
│         │     │  │ Claude CLI → PRD    │     │             │                 │
│         │     │  │ → docs/prd/에 저장  │     │             │                 │
│         │     │  └─────────────────────┘     │             │                 │
│         │     │  ┌─────────────────────┐     │             │                 │
│         │     │  │ developmentService  │     │             │                 │
│         │     │  │ Claude CLI (cwd:    │     │             │                 │
│         │     │  │   VMSWorks 레포)    │     │             │                 │
│         │     │  └─────────────────────┘     │             │                 │
│         │     │  ┌─────────────────────┐     │             │                 │
│         │     │  │ testingService      │     │             │                 │
│         │     │  │ ruff → pytest →     │     │             │                 │
│         │     │  │ Playwright (선택적) │     │             │                 │
│         │     │  └─────────────────────┘     │             │                 │
│         │     └──────────────────────────────┘             │                 │
│         │                                                  │                 │
│  ┌──────┴──────────────────────────────────────────────────┴──────────────┐ │
│  │                        Utils Layer                                     │ │
│  │  claude.ts │ db.ts │ sse.ts │ telegram.ts │ exec.ts │ logger.ts       │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────┬──────────────────────┘
                       │                              │
         ┌─────────────┼──────────────┐               │
         │             │              │               │
         ▼             ▼              ▼               ▼
┌──────────────┐ ┌──────────┐ ┌─────────────┐ ┌──────────────────┐
│  PostgreSQL  │ │  Redis   │ │  Telegram   │ │  VMSWorks DB     │
│  :5434       │ │  :6379   │ │  Bot API    │ │  (PostgreSQL)    │
│              │ │          │ │             │ │                  │
│ vocagent DB  │ │ BullMQ   │ │ @Vmsworks_  │ │ approval_        │
│              │ │ 큐 저장소│ │  bot        │ │  requests 테이블 │
│ voc_workflows│ │          │ │             │ │ users 테이블     │
│ 테이블       │ │          │ │ 알림/승인   │ │                  │
└──────────────┘ └──────────┘ └─────────────┘ └──────────────────┘
       ▲                                              ▲
       │                                              │
       │              ┌─────────────────────────┐     │
       │              │  VMSWorks 레포           │     │
       │              │  (Flask + SQLAlchemy)    │     │
       │              │  C:/Users/chunggh/       │     │
       │              │  Documents/GitHub/       │     │
       │              │  vmsworks               │─────┘
       │              │                         │
       │              │  Claude CLI가 이 레포   │
       │              │  에서 코드를 생성/수정  │
       │              │                         │
       │              │  ┌───────────────────┐  │
       │              │  │ app/blueprints/   │  │
       │              │  │ app/models/       │  │
       │              │  │ app/templates/    │  │
       │              │  │ app/static/       │  │
       │              │  │ tests/            │  │
       │              │  └───────────────────┘  │
       │              └─────────────────────────┘
       │
┌──────┴───────────────────────────────────────┐
│  Dashboard (React + Vite)                     │
│  :5173 (dev) / :3000 (prod - Express static) │
│                                               │
│  워크플로우 목록, 상세, PRD 뷰어,             │
│  승인/반려, 테스트 결과 탭                    │
│  SSE로 실시간 업데이트                        │
└───────────────────────────────────────────────┘


## 워크플로우 파이프라인

┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────────┐    ┌──────────┐
│ Webhook  │    │ Analysis │    │   PRD    │    │ Development  │    │ Testing  │
│ /poller  │───▶│          │───▶│ Writing  │───▶│              │───▶│          │
│          │    │ Claude   │    │ Claude   │    │ Claude CLI   │    │ ruff     │
│ VOC 등록 │    │ CLI -p   │    │ CLI -p   │    │ cwd:VMSWorks │    │ pytest   │
│          │    │ ~20초    │    │ ~2분     │    │              │    │ playwright│
└──────────┘    └──────────┘    └────┬─────┘    └──────────────┘    └──────────┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │  Telegram    │
                              │  승인/반려   │
                              │  (수동 개입) │
                              └──────────────┘

  자동 체이닝: analysis → prd-writing     (BullMQ 자동)
  수동 체이닝: prd-writing → development  (Telegram 승인 or Dashboard 승인)
  자동 체이닝: development → testing      (BullMQ 자동)


## 기술 스택

| 구성요소        | 기술                          |
|----------------|-------------------------------|
| 런타임          | Node.js 20 + TypeScript       |
| 서버            | Express.js                    |
| 작업 큐         | BullMQ (Redis 기반)           |
| DB             | PostgreSQL 16 (Docker)        |
| 캐시/큐 저장소  | Redis 7 (Docker)              |
| AI 엔진         | Claude CLI (`claude -p`)      |
| 알림/승인       | Telegram Bot (Telegraf)       |
| 대시보드        | React + Vite + shadcn/ui      |
| 실시간 업데이트  | SSE (Server-Sent Events)      |
| 대상 시스템     | VMSWorks (Flask + SQLAlchemy) |
| 테스트 도구     | ruff, pytest, Playwright      |
| 컨테이너        | Docker Compose                |
```
