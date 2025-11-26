import { axios } from "@/services/axios";
import { isAIAgentConfigured, getAIAgentConfig } from "@/config/ai-agent";

/**
 * AI Agent 모드 타입
 */
export const AIAgentMode = {
  GENERATE: "generate", // SQL 생성
  FIX_ERROR: "fix_error", // 에러 수정
  OPTIMIZE: "optimize", // 쿼리 최적화
  EXPLAIN: "explain", // 쿼리 설명
};

/**
 * 시스템 프롬프트 생성
 */
function buildSystemPrompt(mode, dataSource) {
  const basePrompt = `You are an expert SQL assistant. You help users write, fix, and optimize SQL queries.`;

  const dataSourceInfo = dataSource
    ? `The database type is ${dataSource.type || "unknown"} (${dataSource.name}).`
    : "";

  const modePrompts = {
    [AIAgentMode.GENERATE]: `
${basePrompt}
${dataSourceInfo}

Your task is to generate SQL queries based on the user's natural language description.
- Write clean, efficient SQL code
- Use appropriate syntax for the database type
- Add helpful comments if the query is complex
- Return ONLY the SQL query without explanations unless asked
`,
    [AIAgentMode.FIX_ERROR]: `
${basePrompt}
${dataSourceInfo}

Your task is to fix SQL queries that have errors.
- Analyze the error message carefully
- Identify the root cause
- Provide a corrected version of the query
- Explain what was wrong and how you fixed it
- Return the fixed SQL query and a brief explanation
`,
    [AIAgentMode.OPTIMIZE]: `
${basePrompt}
${dataSourceInfo}

Your task is to optimize SQL queries for better performance.
- Analyze the query structure
- Suggest optimizations (indexes, joins, subqueries, etc.)
- Rewrite the query if needed
- Explain the optimizations made
- Return the optimized SQL query and explanation
`,
    [AIAgentMode.EXPLAIN]: `
${basePrompt}
${dataSourceInfo}

Your task is to explain SQL queries in clear, simple language.
- Break down the query step by step
- Explain what each part does
- Mention any potential issues or improvements
- Use simple language that non-technical users can understand
`,
  };

  return modePrompts[mode] || modePrompts[AIAgentMode.GENERATE];
}

/**
 * 사용자 프롬프트 생성
 */
function buildUserPrompt(mode, context) {
  const { currentQuery, errorMessage, userInput, selectedText } = context;

  switch (mode) {
    case AIAgentMode.GENERATE:
      return `Generate a SQL query for the following request:\n\n${userInput}`;

    case AIAgentMode.FIX_ERROR:
      return `Fix this SQL query that has an error:

SQL Query:
\`\`\`sql
${currentQuery || selectedText}
\`\`\`

Error Message:
\`\`\`
${errorMessage || "Unknown error"}
\`\`\`

Please provide:
1. The corrected SQL query
2. A brief explanation of what was wrong and how you fixed it`;

    case AIAgentMode.OPTIMIZE:
      return `Optimize this SQL query:

\`\`\`sql
${currentQuery || selectedText}
\`\`\`

${userInput ? `Additional context: ${userInput}` : ""}

Please provide:
1. The optimized SQL query
2. Explanation of the optimizations made`;

    case AIAgentMode.EXPLAIN:
      return `Explain this SQL query in simple terms:

\`\`\`sql
${currentQuery || selectedText}
\`\`\``;

    default:
      return userInput || currentQuery;
  }
}

/**
 * AI API 호출
 */
export async function callAIAgent(mode, context, dataSource) {
  // 설정 확인
  if (!isAIAgentConfigured()) {
    const error = "AI Agent is not configured. Please set up your API key in config/ai-agent.js";
    console.error("[AI Agent] Configuration Error:", error);
    throw new Error(error);
  }

  const config = getAIAgentConfig();

  // 커스텀 시스템 프롬프트가 있으면 사용, 없으면 기본 프롬프트 생성
  const systemPrompt = config.customSystemPrompt || buildSystemPrompt(mode, dataSource);
  const userPrompt = buildUserPrompt(mode, context);

  // 요청 시작 로그 (항상 출력)
  console.log("[AI Agent] Request started:", {
    mode,
    model: config.model,
    provider: config.provider,
    dataSourceType: dataSource?.type,
    timestamp: new Date().toISOString(),
  });

  try {
    // Backend API를 통해 프록시 호출 (CSP 우회)
    console.log("[AI Agent] Calling backend proxy API:", {
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });

    const requestBody = {
      mode,
      prompt: `${systemPrompt}\n\n${userPrompt}`,
      config: {
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      },
    };

    const response = await axios.post("/api/ai_agent", requestBody, {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: config.timeout,
    });

    console.log("[AI Agent] Axios response object:", response);

    // Backend 응답 파싱
    // Axios는 자동으로 JSON을 파싱하여 response.data에 저장
    const data = response?.data || response;

    console.log("[AI Agent] Parsed data:", data);
    console.log("[AI Agent] Data success field:", data?.success);

    if (!data || typeof data !== 'object') {
      console.error("[AI Agent] Invalid response:", { response, data });
      throw new Error("No response data from server");
    }

    if (data.success === false) {
      const errorMsg = data.error || data.message || "AI Agent request failed";
      console.error("[AI Agent] Backend error:", errorMsg);
      throw new Error(errorMsg);
    }

    // Backend에서 이미 파싱된 SQL과 설명 사용
    const sql = data.sql || "";
    const explanation = data.explanation || "";

    console.log("[AI Agent] Extracted data:", { sql: sql.substring(0, 50), explanation: explanation.substring(0, 50) });

    if (!sql && !explanation) {
      console.error("[AI Agent] Empty response:", data);
      throw new Error("Empty response from AI");
    }

    // 성공 로그 (항상 출력)
    console.log("[AI Agent] Request successful:", {
      mode,
      hasSql: !!sql,
      hasExplanation: !!explanation,
      sqlLength: sql.length,
      explanationLength: explanation.length,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      sql: sql,
      explanation: explanation,
    };
  } catch (error) {
    // 에러 로그 (항상 출력, 더 상세하게)
    console.error("[AI Agent] API Error:", {
      mode,
      errorType: error.response ? "API_ERROR" : error.request ? "NETWORK_ERROR" : "UNKNOWN_ERROR",
      status: error.response?.status,
      statusText: error.response?.statusText,
      errorData: error.response?.data,
      message: error.message,
      timestamp: new Date().toISOString(),
    });

    let errorMessage = "Failed to call AI Agent API";

    if (error.response) {
      // API 에러 응답
      const backendError = error.response.data;
      if (backendError && backendError.error) {
        errorMessage = backendError.error;
        console.error("[AI Agent] Backend Error:", backendError.error);
      } else if (backendError && backendError.message) {
        errorMessage = backendError.message;
      } else {
        errorMessage = error.response.statusText || "Unknown API error";
      }
    } else if (error.request) {
      // 네트워크 에러
      errorMessage = "Network error: Could not reach backend API";
      console.error("[AI Agent] Network Error - Request was made but no response received");
    } else {
      // 기타 에러
      errorMessage = error.message;
      console.error("[AI Agent] Error during request setup:", error.message);
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * SQL 생성
 */
export function generateSQL(userInput, dataSource) {
  return callAIAgent(AIAgentMode.GENERATE, { userInput }, dataSource);
}

/**
 * SQL 에러 수정
 */
export function fixSQLError(currentQuery, errorMessage, dataSource) {
  return callAIAgent(AIAgentMode.FIX_ERROR, { currentQuery, errorMessage }, dataSource);
}

/**
 * SQL 최적화
 */
export function optimizeSQL(currentQuery, userInput, dataSource) {
  return callAIAgent(AIAgentMode.OPTIMIZE, { currentQuery, userInput }, dataSource);
}

/**
 * SQL 설명
 */
export function explainSQL(currentQuery, dataSource) {
  return callAIAgent(AIAgentMode.EXPLAIN, { currentQuery }, dataSource);
}

export default {
  AIAgentMode,
  callAIAgent,
  generateSQL,
  fixSQLError,
  optimizeSQL,
  explainSQL,
  isAIAgentConfigured,
};
