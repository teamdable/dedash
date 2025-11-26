import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import Modal from "antd/lib/modal";
import Button from "antd/lib/button";
import Input from "antd/lib/input";
import Radio from "antd/lib/radio";
import Alert from "antd/lib/alert";
import Spin from "antd/lib/spin";
import Typography from "antd/lib/typography";
import Space from "antd/lib/space";
import Divider from "antd/lib/divider";
import { wrap as wrapDialog, DialogPropType } from "@/components/DialogWrapper";
import { AIAgentMode, callAIAgent } from "@/services/ai-agent";
import { isAIAgentConfigured } from "@/config/ai-agent";
import notification from "@/services/notification";

const { TextArea } = Input;
const { Title, Text, Paragraph } = Typography;

function AIAgentDialog({ dialog, query, queryResult, dataSource, onApply }) {
  const [mode, setMode] = useState(AIAgentMode.GENERATE);
  const [userInput, setUserInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiResponse, setAIResponse] = useState(null);
  const [error, setError] = useState(null);

  // 에러가 있으면 자동으로 FIX_ERROR 모드로 설정
  useEffect(() => {
    const errorMessage = queryResult?.getError();
    if (errorMessage && query?.query) {
      setMode(AIAgentMode.FIX_ERROR);
    }
  }, [query, queryResult]);

  // AI Agent 설정 확인
  const isConfigured = isAIAgentConfigured();

  // 모드 변경 핸들러
  const handleModeChange = e => {
    setMode(e.target.value);
    setAIResponse(null);
    setError(null);
  };

  // AI 요청 처리
  const handleSubmit = async () => {
    if (!isConfigured) {
      notification.error("AI Agent가 설정되지 않았습니다. config/ai-agent.js에서 API key를 설정해주세요.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setAIResponse(null);

    const context = {
      currentQuery: query?.query || "",
      errorMessage: queryResult?.getError() || "",
      userInput: userInput.trim(),
      selectedText: null, // 필요시 추가
    };

    try {
      const response = await callAIAgent(mode, context, dataSource);

      if (response.success) {
        setAIResponse(response);
      } else {
        setError(response.error || "Unknown error occurred");
      }
    } catch (err) {
      setError(err.message || "Failed to process AI request");
    } finally {
      setIsProcessing(false);
    }
  };

  // SQL 적용
  const handleApplySQL = () => {
    console.log("[AI Agent] handleApplySQL called", {
      hasAiResponse: !!aiResponse,
      hasSql: !!aiResponse?.sql,
      sql: aiResponse?.sql?.substring(0, 50),
      onApplyType: typeof onApply,
    });

    if (aiResponse?.sql) {
      try {
        onApply(aiResponse.sql);
        notification.success("AI가 제안한 SQL이 적용되었습니다.");
        dialog.close();
      } catch (error) {
        console.error("[AI Agent] Error applying SQL:", error);
        notification.error("SQL 적용 중 오류가 발생했습니다: " + error.message);
      }
    } else {
      console.warn("[AI Agent] No SQL to apply");
      notification.warning("적용할 SQL이 없습니다.");
    }
  };

  // 전체 응답을 Query에 적용
  const handleApplyExplanation = () => {
    console.log("[AI Agent] handleApplyExplanation called", {
      hasAiResponse: !!aiResponse,
      hasExplanation: !!aiResponse?.explanation,
      hasSql: !!aiResponse?.sql,
    });

    if (aiResponse?.explanation) {
      try {
        const fullText = `-- ${aiResponse.explanation}\n\n${aiResponse.sql || ""}`;
        onApply(fullText);
        notification.success("SQL과 설명이 적용되었습니다.");
        dialog.close();
      } catch (error) {
        console.error("[AI Agent] Error applying SQL with explanation:", error);
        notification.error("SQL 적용 중 오류가 발생했습니다: " + error.message);
      }
    } else {
      console.warn("[AI Agent] No explanation to apply");
      notification.warning("적용할 설명이 없습니다.");
    }
  };

  // 입력 필드 렌더링
  const renderInputField = () => {
    const currentQuery = query?.query || "";
    const errorMessage = queryResult?.getError() || "";

    switch (mode) {
      case AIAgentMode.GENERATE:
        return (
          <div>
            <Text strong>자연어로 원하는 SQL을 설명하세요:</Text>
            <TextArea
              rows={4}
              placeholder="예: Show me all users who signed up in the last 30 days with their total orders"
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              style={{ marginTop: 8 }}
            />
          </div>
        );

      case AIAgentMode.FIX_ERROR:
        return (
          <div>
            <Space direction="vertical" style={{ width: "100%" }}>
              <div>
                <Text strong>현재 Query:</Text>
                <TextArea rows={4} value={currentQuery} disabled style={{ marginTop: 8 }} />
              </div>
              <div>
                <Text strong type="danger">
                  Error Message:
                </Text>
                <TextArea rows={3} value={errorMessage} disabled style={{ marginTop: 8 }} />
              </div>
              <div>
                <Text strong>추가 컨텍스트 (선택사항):</Text>
                <TextArea
                  rows={2}
                  placeholder="에러 수정에 도움이 될 추가 정보를 입력하세요"
                  value={userInput}
                  onChange={e => setUserInput(e.target.value)}
                  style={{ marginTop: 8 }}
                />
              </div>
            </Space>
          </div>
        );

      case AIAgentMode.OPTIMIZE:
        return (
          <div>
            <Space direction="vertical" style={{ width: "100%" }}>
              <div>
                <Text strong>현재 Query:</Text>
                <TextArea rows={6} value={currentQuery} disabled style={{ marginTop: 8 }} />
              </div>
              <div>
                <Text strong>최적화 요구사항 (선택사항):</Text>
                <TextArea
                  rows={2}
                  placeholder="예: 특정 인덱스 사용, JOIN 순서 변경 등"
                  value={userInput}
                  onChange={e => setUserInput(e.target.value)}
                  style={{ marginTop: 8 }}
                />
              </div>
            </Space>
          </div>
        );

      case AIAgentMode.EXPLAIN:
        return (
          <div>
            <Text strong>현재 Query:</Text>
            <TextArea rows={6} value={currentQuery} disabled style={{ marginTop: 8 }} />
          </div>
        );

      default:
        return null;
    }
  };

  // AI 응답 렌더링
  const renderAIResponse = () => {
    if (!aiResponse) return null;

    return (
      <div style={{ marginTop: 16 }}>
        <Divider />
        <Title level={5}>AI 응답:</Title>

        {aiResponse.sql && (
          <div style={{ marginBottom: 16 }}>
            <Text strong>제안된 SQL:</Text>
            <TextArea
              rows={8}
              value={aiResponse.sql}
              style={{ marginTop: 8, fontFamily: "monospace" }}
              readOnly
            />
          </div>
        )}

        {aiResponse.explanation && (
          <div>
            <Text strong>설명:</Text>
            <Paragraph style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{aiResponse.explanation}</Paragraph>
          </div>
        )}
      </div>
    );
  };

  return (
    <Modal
      {...dialog.props}
      title="AI Assistant"
      width={800}
      footer={
        aiResponse ? [
          // AI 응답이 있을 때
          <Button key="close" onClick={dialog.close}>
            닫기
          </Button>,
          aiResponse.sql && (
            <Button key="apply" type="primary" onClick={handleApplySQL}>
              SQL 적용
            </Button>
          ),
          aiResponse.sql && aiResponse.explanation && (
            <Button key="applyWithExplanation" onClick={handleApplyExplanation}>
              SQL + 설명 적용
            </Button>
          ),
        ] : [
          // AI 응답이 없을 때
          <Button key="cancel" onClick={dialog.close}>
            취소
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={isProcessing}
            onClick={handleSubmit}
            disabled={
              !isConfigured ||
              (mode === AIAgentMode.GENERATE && !userInput.trim()) ||
              (mode === AIAgentMode.FIX_ERROR && !query?.query)
            }>
            {isProcessing ? "처리 중..." : "AI에게 요청"}
          </Button>,
        ]
      }>
      <Spin spinning={isProcessing}>
        {!isConfigured && (
          <Alert
            message="AI Agent 미설정"
            description="AI Agent를 사용하려면 client/app/config/ai-agent.js에서 API key를 설정해주세요."
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <Space direction="vertical" style={{ width: "100%" }} size="large">
          {/* 모드 선택 */}
          <div>
            <Text strong>모드 선택:</Text>
            <Radio.Group
              onChange={handleModeChange}
              value={mode}
              style={{ marginTop: 8, display: "block" }}
              buttonStyle="solid">
              <Space direction="vertical">
                <Radio.Button value={AIAgentMode.GENERATE}>SQL 생성</Radio.Button>
                <Radio.Button value={AIAgentMode.FIX_ERROR} disabled={!query?.query}>
                  에러 수정
                </Radio.Button>
                <Radio.Button value={AIAgentMode.OPTIMIZE} disabled={!query?.query}>
                  쿼리 최적화
                </Radio.Button>
                <Radio.Button value={AIAgentMode.EXPLAIN} disabled={!query?.query}>
                  쿼리 설명
                </Radio.Button>
              </Space>
            </Radio.Group>
          </div>

          {/* 입력 필드 */}
          {renderInputField()}

          {/* 에러 메시지 */}
          {error && (
            <Alert message="에러 발생" description={error} type="error" showIcon style={{ marginTop: 16 }} />
          )}

          {/* AI 응답 */}
          {renderAIResponse()}
        </Space>
      </Spin>
    </Modal>
  );
}

AIAgentDialog.propTypes = {
  dialog: DialogPropType.isRequired,
  query: PropTypes.object,
  queryResult: PropTypes.object,
  dataSource: PropTypes.object,
  onApply: PropTypes.func.isRequired,
};

AIAgentDialog.defaultProps = {
  query: null,
  queryResult: null,
  dataSource: null,
};

export default wrapDialog(AIAgentDialog);
