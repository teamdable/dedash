# SQL Agent

AI를 활용한 SQL 생성 및 에러 수정 기능입니다.

## 기능 소개

### 1. SQL 생성 (Generate)

자연어 설명을 기반으로 SQL 쿼리를 생성합니다.

- 테이블 구조와 컬럼 정보를 컨텍스트로 제공
- 사용자가 원하는 결과를 자연어로 설명
- AI가 적절한 SQL 쿼리 생성

### 2. 에러 수정 (Fix Error)

실행 실패한 쿼리의 에러를 분석하고 수정합니다.

- 현재 쿼리와 에러 메시지를 분석
- 에러 원인 파악 및 수정된 SQL 제안
- 수정 내용에 대한 설명 제공

## 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐ │
│  │ QuerySource.jsx │───▶│ useAIAgentDialog│───▶│AIAgentDialog │ │
│  │ (AI Agent 버튼) │    │     (hook)      │    │   (Modal)    │ │
│  └─────────────────┘    └─────────────────┘    └──────┬───────┘ │
│                                                        │         │
│  ┌─────────────────┐    ┌─────────────────┐           │         │
│  │  ai-agent.js    │◀───│  ai-agent.js    │◀──────────┘         │
│  │    (config)     │    │   (service)     │                     │
│  └─────────────────┘    └────────┬────────┘                     │
└──────────────────────────────────┼──────────────────────────────┘
                                   │ POST /api/ai_agent
                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                         Backend                                   │
│  ┌─────────────────┐    ┌─────────────────┐                      │
│  │    api.py       │───▶│  ai_agent.py    │───▶ Gemini API       │
│  │  (라우팅 등록)   │    │ (AIAgentResource)│                      │
│  └─────────────────┘    └─────────────────┘                      │
└──────────────────────────────────────────────────────────────────┘
```

## 파일 구조

### Frontend

| 파일 | 설명 |
|------|------|
| `client/app/config/ai-agent.js` | AI Agent 설정 (API key, model, temperature 등) |
| `client/app/services/ai-agent.js` | AI API 호출 서비스 (프롬프트 생성, 요청/응답 처리) |
| `client/app/components/queries/AIAgentDialog.jsx` | AI Agent 모달 UI 컴포넌트 |
| `client/app/pages/queries/hooks/useAIAgentDialog.js` | AI Agent Dialog를 열기 위한 커스텀 훅 |
| `client/app/pages/queries/QuerySource.jsx` | Query Editor 페이지 (AI Agent 버튼 통합) |

### Backend

| 파일 | 설명 |
|------|------|
| `redash/handlers/ai_agent.py` | AI Agent API 엔드포인트 (Gemini API 프록시) |
| `redash/handlers/api.py` | API 라우팅 등록 |

## API Key 설정

### 방법 1: 환경변수 (권장)

```bash
export GEMINI_API_KEY="your-api-key-here"
```

Docker/Podman 실행 시:

```bash
podman run -e GEMINI_API_KEY="your-api-key" dedash:latest
```

### 방법 2: localStorage (개발용)

브라우저 콘솔에서:

```javascript
// API Key 설정
localStorage.setItem("apiKey", "your-api-key-here");

// 설정 확인
window.aiAgent.showConfig();

// 설정 업데이트
window.aiAgent.updateConfig({ model: "gemini-2.5-flash" });
```

## 설정 옵션

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `apiKey` | `""` | Gemini API Key |
| `model` | `"gemini-2.5-pro"` | 사용할 AI 모델 |
| `temperature` | `0.2` | 응답의 창의성 (0.0 ~ 1.0) |
| `maxTokens` | `2000` | 최대 응답 토큰 수 |
| `timeout` | `30000` | 요청 타임아웃 (ms) |
| `enableLogging` | `true` | 콘솔 로깅 활성화 |

## 사용 방법

### 1. Query Editor에서 AI Agent 버튼 클릭

Query Editor 상단의 AI Assistant 버튼 (말풍선 아이콘)을 클릭합니다.

### 2. 모드 선택

- **SQL 생성**: 새로운 SQL을 생성하고 싶을 때
- **에러 수정**: 실행 실패한 쿼리를 수정하고 싶을 때

### 3. 요청 작성

- SQL 생성: 원하는 결과를 자연어로 설명
- 에러 수정: 자동으로 현재 쿼리와 에러 메시지가 포함됨

### 4. AI 응답 적용

- **SQL 적용**: 제안된 SQL만 Query Editor에 적용
- **SQL + 설명 적용**: SQL과 함께 설명을 주석으로 추가

## API 엔드포인트

### POST /api/ai_agent

**Request Body:**

```json
{
  "mode": "generate" | "fix_error",
  "prompt": "시스템 프롬프트 + 사용자 프롬프트",
  "config": {
    "model": "gemini-2.5-pro",
    "temperature": 0.2,
    "maxTokens": 2000
  }
}
```

**Response (성공):**

```json
{
  "success": true,
  "sql": "SELECT * FROM users WHERE ...",
  "explanation": "이 쿼리는 ..."
}
```

**Response (실패):**

```json
{
  "success": false,
  "error": "에러 메시지"
}
```

## 프롬프트 구조

### System Prompt

```
You are an expert SQL assistant for {database_type}.
Your task is to {generate SQL / fix SQL errors}.

Database Schema:
- Table: {table_name}
  Columns: {column_list}

Rules:
1. Return valid SQL only
2. Use proper syntax for {database_type}
3. Include explanations for complex queries
```

### User Prompt (SQL 생성)

```
User Request: {user_input}
Current Query (if any): {current_query}
```

### User Prompt (에러 수정)

```
Current Query:
{current_query}

Error Message:
{error_message}

Please fix this query and explain the issue.
```

## 보안 고려사항

1. **API Key 보호**: API Key는 Backend에서만 사용되며, Frontend로 노출되지 않습니다.
2. **Backend 프록시**: 모든 AI API 호출은 Backend를 통해 이루어져 CSP 정책을 준수합니다.
3. **권한 검사**: `edit_query` 권한이 있는 사용자만 AI Agent를 사용할 수 있습니다.

## 트러블슈팅

문제가 발생하면 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)를 참고하세요.

### 일반적인 문제

1. **API Key 미설정**: 환경변수 또는 localStorage에 API Key 설정 필요
2. **네트워크 에러**: Backend 서버가 Gemini API에 접근 가능한지 확인
3. **타임아웃**: 복잡한 쿼리의 경우 timeout 값 증가 필요

### 디버깅

브라우저 콘솔에서 `[AI Agent]` 로그 확인:

```javascript
// 로깅 활성화
window.aiAgent.updateConfig({ enableLogging: true });
```

## 확장 가능성

### 다른 AI Provider 지원

`ai-agent.js`의 `callAIAgent` 함수를 수정하여 OpenAI, Claude 등 다른 AI 서비스 지원 가능:

```javascript
// config에 provider 추가
const config = {
  provider: "openai", // "gemini" | "openai" | "claude"
  apiKey: "...",
};
```

### 추가 기능

- 쿼리 최적화 제안
- 쿼리 설명 생성
- 스키마 기반 자동완성
