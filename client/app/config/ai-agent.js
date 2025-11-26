// AI Agent Configuration
// 이 파일에서 AI 모델 정보와 API 설정을 관리합니다.

// localStorage에서 설정 가져오기 (브라우저 콘솔에서 변경 가능)
function getFromLocalStorage(key, defaultValue) {
  if (typeof window !== "undefined" && window.localStorage) {
    const value = window.localStorage.getItem(`aiAgent.${key}`);
    return value !== null ? value : defaultValue;
  }
  return defaultValue;
}

// 환경변수를 안전하게 가져오기
function getEnvVar(key, defaultValue = "") {
  try {
    // Webpack DefinePlugin으로 주입된 환경변수
    return process.env[key] || defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

const aiAgentConfig = {
  // API Key는 서버 환경변수에서 관리 (GEMINI_API_KEY)
  // 브라우저에서는 더 이상 API Key가 필요하지 않습니다 (Backend Proxy 사용)

  // 모델 설정
  // Gemini 모델: gemini-pro, gemini-1.5-pro, gemini-1.5-flash, gemini-2.5-pro 등
  model: getFromLocalStorage("model", "gemini-2.5-pro"),

  // 온도 설정 (0.0 ~ 2.0)
  // 낮을수록 더 결정적(deterministic), 높을수록 더 창의적
  temperature: parseFloat(getFromLocalStorage("temperature", "0.2")),

  // 최대 토큰 수 (Gemini의 경우 maxOutputTokens)
  maxTokens: parseInt(getFromLocalStorage("maxTokens", "2000"), 10),

  // 타임아웃 (밀리초)
  timeout: parseInt(getFromLocalStorage("timeout", "30000"), 10),

  // AI Agent 기능 활성화 여부
  enabled: getFromLocalStorage("enabled", "true") === "true",

  // 로깅 설정
  // true로 설정하면 production 환경에서도 상세 로그 출력
  enableLogging: getFromLocalStorage("enableLogging", "true") === "true",

  // 커스텀 시스템 프롬프트 (선택사항)
  // 기본 프롬프트를 오버라이드하려면 여기에 설정
  customSystemPrompt: getFromLocalStorage("customSystemPrompt", null),
};

// AI Agent가 활성화되었는지 확인
// API Key는 서버에서 관리하므로 브라우저에서는 enabled만 체크
export function isAIAgentConfigured() {
  return aiAgentConfig.enabled;
}

// 설정 가져오기
export function getAIAgentConfig() {
  return { ...aiAgentConfig };
}

// 런타임에 설정 업데이트 및 localStorage에 저장
export function updateAIAgentConfig(updates) {
  Object.assign(aiAgentConfig, updates);

  // localStorage에도 저장
  if (typeof window !== "undefined" && window.localStorage) {
    Object.keys(updates).forEach(key => {
      window.localStorage.setItem(`aiAgent.${key}`, String(updates[key]));
    });
    console.log("[AI Agent] Configuration updated and saved to localStorage:", updates);
  }
}

// localStorage에서 모든 설정 삭제 (초기화)
export function resetAIAgentConfig() {
  if (typeof window !== "undefined" && window.localStorage) {
    const keys = Object.keys(aiAgentConfig);
    keys.forEach(key => {
      window.localStorage.removeItem(`aiAgent.${key}`);
    });
    console.log("[AI Agent] Configuration reset. Please reload the page.");
  }
}

// 현재 설정을 콘솔에 출력 (디버깅용)
export function showAIAgentConfig() {
  console.log("[AI Agent] Current Configuration:", {
    ...aiAgentConfig,
    note: "API Key is managed on the server (GEMINI_API_KEY environment variable)",
  });
}

// 브라우저 콘솔에서 쉽게 접근할 수 있도록 window 객체에 추가
if (typeof window !== "undefined") {
  window.aiAgent = {
    getConfig: getAIAgentConfig,
    updateConfig: updateAIAgentConfig,
    resetConfig: resetAIAgentConfig,
    showConfig: showAIAgentConfig,
    isConfigured: isAIAgentConfigured,
  };
  console.log(
    "[AI Agent] Console helpers loaded. Use window.aiAgent.showConfig() to view current settings."
  );
}

export default aiAgentConfig;
