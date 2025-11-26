import os
import logging
import requests
from flask import request

from redash.handlers.base import BaseResource
from redash.permissions import require_permission

logger = logging.getLogger(__name__)


class AIAgentResource(BaseResource):
    """
    AI Agent API Proxy
    브라우저의 CSP 제한을 우회하기 위해 백엔드에서 Gemini API를 호출합니다.
    """

    @require_permission("edit_query")
    def post(self):
        """
        AI Agent API 호출을 프록시합니다.

        Request Body:
        {
            "mode": "generate|fix_error|optimize|explain",
            "prompt": "combined system + user prompt",
            "config": {
                "model": "gemini-2.5-pro",
                "temperature": 0.2,
                "maxTokens": 2000
            }
        }
        """
        try:
            # Flask-RESTful에서는 request.json 사용
            data = request.json
            if not data:
                return {"success": False, "error": "Request body is required"}, 400

            prompt = data.get("prompt", "")
            if not prompt:
                return {"success": False, "error": "Prompt is required"}, 400

            config = data.get("config", {})

            # 환경변수 또는 요청에서 API Key 가져오기
            api_key = os.environ.get("GEMINI_API_KEY", "")
            if not api_key:
                return {"success": False, "error": "GEMINI_API_KEY is not configured on the server"}, 400

            # Gemini API 설정
            model = config.get("model", "gemini-2.5-pro")
            temperature = config.get("temperature", 0.2)
            max_tokens = config.get("maxTokens", 2000)

            api_endpoint = os.environ.get(
                "AI_API_ENDPOINT",
                "https://generativelanguage.googleapis.com/v1beta/models"
            )

            # Gemini API 호출
            url = f"{api_endpoint}/{model}:generateContent?key={api_key}"

            request_body = {
                "contents": [
                    {
                        "role": "user",
                        "parts": [{"text": prompt}]
                    }
                ],
                "generationConfig": {
                    "temperature": temperature,
                    "maxOutputTokens": max_tokens,
                    "responseMimeType": "application/json",
                    "responseSchema": {
                        "type": "object",
                        "properties": {
                            "sql": {
                                "type": "string",
                                "description": "The SQL query (corrected, optimized, or generated)"
                            },
                            "explanation": {
                                "type": "string",
                                "description": "Detailed explanation of the SQL query or changes made"
                            }
                        },
                        "required": ["sql", "explanation"]
                    }
                }
            }

            logger.info(f"[AI Agent] Calling Gemini API: model={model}, temperature={temperature}")

            response = requests.post(
                url,
                json=request_body,
                headers={"Content-Type": "application/json"},
                timeout=30
            )

            if response.status_code != 200:
                logger.error(f"[AI Agent] Gemini API error: {response.status_code} - {response.text}")
                return {"success": False, "error": f"Gemini API error: {response.text}"}, response.status_code

            result = response.json()

            logger.info(f"[AI Agent] Gemini API response structure: {result.keys()}")

            # 응답 파싱 (안전하게)
            candidates = result.get("candidates", [])
            if not candidates:
                logger.error(f"[AI Agent] No candidates in response: {result}")
                return {"success": False, "error": "No response from Gemini API"}, 500

            try:
                first_candidate = candidates[0]
                content = first_candidate.get("content", {})
                parts = content.get("parts", [])

                if not parts:
                    logger.error(f"[AI Agent] No parts in content: {first_candidate}")
                    return {"success": False, "error": "Invalid response structure from Gemini API"}, 500

                ai_response_text = parts[0].get("text", "")

                if not ai_response_text:
                    logger.error(f"[AI Agent] No text in parts: {parts[0]}")
                    return {"success": False, "error": "Empty response from Gemini API"}, 500

                # JSON 응답 파싱
                import json
                try:
                    ai_response_json = json.loads(ai_response_text)
                    sql = ai_response_json.get("sql", "")
                    explanation = ai_response_json.get("explanation", "")

                    if not sql:
                        logger.warning("[AI Agent] No SQL in JSON response, using raw text")
                        sql = ai_response_text
                        explanation = ""

                except json.JSONDecodeError:
                    logger.warning("[AI Agent] Failed to parse JSON response, using raw text")
                    sql = ai_response_text
                    explanation = ""

            except (KeyError, IndexError, TypeError) as e:
                logger.error(f"[AI Agent] Error parsing Gemini response: {str(e)}")
                logger.error(f"[AI Agent] Raw response: {result}")
                return {"success": False, "error": f"Failed to parse Gemini API response: {str(e)}"}, 500

            logger.info(f"[AI Agent] Request successful: sql_length={len(sql)}, explanation_length={len(explanation)}")

            return {
                "success": True,
                "sql": sql,
                "explanation": explanation,
            }, 200

        except requests.exceptions.Timeout:
            logger.error("[AI Agent] Request timeout")
            return {"success": False, "error": "AI Agent request timeout"}, 504
        except requests.exceptions.RequestException as e:
            logger.error(f"[AI Agent] Network error: {str(e)}")
            return {"success": False, "error": f"Network error: {str(e)}"}, 502
        except Exception as e:
            import traceback
            logger.error(f"[AI Agent] Unexpected error: {str(e)}")
            logger.error(traceback.format_exc())
            return {"success": False, "error": f"Internal server error: {str(e)}"}, 500
