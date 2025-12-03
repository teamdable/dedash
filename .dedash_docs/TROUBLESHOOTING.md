# Troubleshooting Guide

이 문서는 dedash 프로젝트 개발 중 발생할 수 있는 문제들과 해결 방법을 정리합니다.

## 목차

1. [Hadoop YARN vs Node.js yarn 충돌](#1-hadoop-yarn-vs-nodejs-yarn-충돌)
2. [Node.js 버전 호환성 문제](#2-nodejs-버전-호환성-문제)
3. [webpack: not found 에러](#3-webpack-not-found-에러)
4. [메모리 부족 문제](#4-메모리-부족-문제)
5. [process.env TypeError 문제](#5-processenv-typeerror-문제)
6. [CSP (Content Security Policy) 에러](#6-csp-content-security-policy-에러)
7. [500 Internal Server Error (JSON 파싱)](#7-500-internal-server-error-json-파싱)
8. [AI 응답 데이터 처리 문제](#8-ai-응답-데이터-처리-문제)
9. [Query Editor에 SQL이 적용되지 않는 문제](#9-query-editor에-sql이-적용되지-않는-문제)

---

## 1. Hadoop YARN vs Node.js yarn 충돌

### 증상

```bash
$ yarn build
ERROR: Unrecognized option: -c
```

또는 Hadoop 관련 에러 메시지가 출력됨

### 원인

시스템에 Hadoop이 설치되어 있으면 `yarn` 명령어가 Node.js의 yarn이 아닌 Hadoop YARN을 실행합니다.

### 해결 방법

**방법 1: npm 사용 (권장)**

```bash
npm install
npm run build
```

**방법 2: npx 사용**

```bash
npx yarn install
npx yarn build
```

**방법 3: Hadoop 제거**

```bash
brew uninstall hadoop
```

---

## 2. Node.js 버전 호환성 문제

### 증상

```
error @redash/viz@25.8.0: The engine "node" is incompatible with this module.
Expected version ">16.0 <21.0". Got "22.19.0"
```

### 원인

프로젝트가 Node.js 16.x ~ 20.x 버전을 요구하지만, 시스템에 설치된 버전이 다릅니다.

### 해결 방법

asdf를 사용하여 Node.js 18.20.5 설치:

```bash
# asdf Node.js 플러그인 설치
asdf plugin add nodejs

# Node.js 18.20.5 설치
asdf install nodejs 18.20.5

# 프로젝트에서 해당 버전 사용
asdf local nodejs 18.20.5

# 확인
node --version
# v18.20.5
```

---

## 3. webpack: not found 에러

### 증상

```bash
$ webpack
webpack: not found
```

### 원인

webpack이 전역 설치되지 않았거나 `node_modules/.bin/`이 PATH에 없습니다.

### 해결 방법

**방법 1: npx 사용**

```bash
npx webpack
```

**방법 2: npm script 사용**

```bash
npm run build
```

**방법 3: PATH에 추가**

```bash
export PATH="./node_modules/.bin:$PATH"
webpack
```

---

## 4. 메모리 부족 문제

### 증상

- 빌드 중 프로세스가 멈춤
- `FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory`
- 시스템 메모리 사용량이 급격히 증가

### 원인

webpack 빌드 시 기본 Node.js 메모리 제한(약 1.5GB)을 초과합니다.

### 해결 방법

`NODE_OPTIONS`로 메모리 제한 증가:

```bash
# 6GB로 설정
NODE_OPTIONS="--max-old-space-size=6144 --openssl-legacy-provider" npm run build
```

`package.json`에 영구 설정:

```json
{
  "scripts": {
    "build": "NODE_OPTIONS='--max-old-space-size=6144 --openssl-legacy-provider' webpack"
  }
}
```

### webpack.config.js 최적화

```javascript
// TerserPlugin 최적화
optimization: {
  minimizer: [
    new TerserPlugin({
      parallel: true,  // 병렬 처리
      terserOptions: {
        compress: {
          passes: 1,  // 압축 패스 수 감소
        },
      },
      extractComments: false,
    }),
  ],
}
```

---

## 5. process.env TypeError 문제

### 증상

브라우저 콘솔에서:

```
TypeError: (void 0) is not a function
```

또는 `process.env.VARIABLE_NAME`이 undefined

### 원인

브라우저 환경에서는 `process.env`가 존재하지 않습니다. webpack의 `DefinePlugin`으로 빌드 시점에 값을 주입해야 합니다.

### 해결 방법

`webpack.config.js`에 DefinePlugin 추가:

```javascript
const webpack = require("webpack");

module.exports = {
  plugins: [
    new webpack.DefinePlugin({
      "process.env.GEMINI_API_KEY": JSON.stringify(process.env.GEMINI_API_KEY || ""),
      "process.env.AI_MODEL": JSON.stringify(process.env.AI_MODEL || "gemini-2.5-pro"),
      // 필요한 환경변수 추가
    }),
  ],
};
```

### 런타임에서 설정 변경하기

빌드 시점에 주입된 환경변수는 런타임에 변경할 수 없습니다. 런타임 설정이 필요하면 `localStorage` 사용:

```javascript
// 설정
localStorage.setItem("aiAgentConfig", JSON.stringify({ apiKey: "..." }));

// 읽기
const config = JSON.parse(localStorage.getItem("aiAgentConfig") || "{}");
```

---

## 6. CSP (Content Security Policy) 에러

### 증상

```
Connecting to 'https://generativelanguage.googleapis.com/...' violates the
following Content Security Policy directive: "default-src 'self'"
```

### 원인

브라우저의 CSP 정책이 외부 API 호출을 차단합니다. Frontend에서 직접 외부 API를 호출할 수 없습니다.

### 해결 방법

Backend 프록시를 통해 API 호출:

**Backend (Flask)**

```python
# redash/handlers/ai_agent.py
class AIAgentResource(BaseResource):
    def post(self):
        # Frontend에서 받은 요청을 Gemini API로 전달
        response = requests.post(gemini_api_url, json=request_body)
        return response.json()
```

**Frontend**

```javascript
// 직접 호출 (X)
// axios.post("https://generativelanguage.googleapis.com/...");

// Backend 프록시 사용 (O)
axios.post("/api/ai_agent", requestBody);
```

---

## 7. 500 Internal Server Error (JSON 파싱)

### 증상

```
500 Internal Server Error
werkzeug.exceptions.BadRequest: 400 Bad Request: The browser (or proxy)
sent a request that this server could not understand.
```

### 원인

Flask에서 JSON 요청을 파싱하지 못했습니다.

### 해결 방법

**request.json 사용**

```python
# 권장
data = request.json

# 또는 force=True로 강제 파싱
data = request.get_json(force=True)
```

**Content-Type 헤더 확인**

```javascript
axios.post("/api/ai_agent", data, {
  headers: { "Content-Type": "application/json" },
});
```

---

## 8. AI 응답 데이터 처리 문제

### 증상

```
[AI Agent] No response data from server
```

Backend 로그에는 성공으로 표시되지만 Frontend에서 데이터를 받지 못함

### 원인

axios는 응답을 자동으로 `response.data`에 파싱합니다. 이중으로 접근하면 undefined가 됩니다.

### 해결 방법

```javascript
// 잘못된 방법 (X)
const result = response.data.data;

// 올바른 방법 (O)
const result = response.data;

// 안전한 접근
const data = response?.data;
if (!data || typeof data !== "object") {
  throw new Error("No response data from server");
}
```

---

## 9. Query Editor에 SQL이 적용되지 않는 문제

### 증상

- AI Agent에서 "SQL 적용" 버튼 클릭
- notification은 표시되지만 Query Editor의 SQL이 변경되지 않음

### 원인

`updateQuery()` 함수가 실제로 Query Editor를 업데이트하지 않습니다.

### 해결 방법

`formatQuery()`와 동일한 방식으로 `setQuery()` 직접 사용:

```javascript
// 작동하지 않음 (X)
updateQuery(suggestedQuery);

// 작동함 (O)
import { extend } from "lodash";

const openAIAgentDialog = useAIAgentDialog(query, queryResult, dataSource, (suggestedQuery) => {
  const updatedQuery = extend(query.clone(), { query: suggestedQuery });
  setQuery(updatedQuery);
});
```

---

## 디버깅 팁

### Frontend 로그 확인

브라우저 개발자 도구 > Console에서 `[AI Agent]` 태그로 필터링:

```javascript
// ai-agent.js에서 로깅
console.log("[AI Agent] Request:", requestBody);
console.log("[AI Agent] Response:", response.data);
```

### Backend 로그 확인

```python
# ai_agent.py에서 로깅
import logging
logger = logging.getLogger(__name__)

logger.info(f"[AI Agent] Request received: {data}")
logger.error(f"[AI Agent] Error: {str(e)}")
```

### Network 탭 확인

1. 브라우저 개발자 도구 > Network 탭
2. `/api/ai_agent` 요청 필터링
3. Request/Response 내용 확인

---

## 추가 도움이 필요하면

- [LOCAL_BUILD_GUIDE.md](./LOCAL_BUILD_GUIDE.md) - 빌드 가이드
- [SQL_AGENT.md](./SQL_AGENT.md) - AI Agent 기능 설명
