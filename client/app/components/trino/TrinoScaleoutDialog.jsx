import React, { useState } from "react";
import Modal from "antd/lib/modal";
import Button from "antd/lib/button";
import message from "antd/lib/message";
import Spin from "antd/lib/spin";
import Card from "antd/lib/card";
import Typography from "antd/lib/typography";
import Space from "antd/lib/space";
import { wrap as wrapDialog, DialogPropType } from "@/components/DialogWrapper";
import axios from "@/services/axios";

const { Title, Text } = Typography;

function TrinoScaleoutDialog({ dialog }) {
  const [scaleoutInProgress, setScaleoutInProgress] = useState(false);

  function handleScaleout() {
    setScaleoutInProgress(true);
    
    // Redis CLI를 통해 Trino Scale-out 요청 보내기
    axios
      .post("/api/trino/scaleout")
      .then(() => {
        message.success("Trino Scale-out 요청이 성공적으로 전송되었습니다.");
        dialog.close();
      })
      .catch((error) => {
        message.error("Trino Scale-out 요청 중 오류가 발생했습니다: " + (error?.response?.data?.message || error.message));
      })
      .finally(() => {
        setScaleoutInProgress(false);
      });
  }

  return (
    <Modal
      {...dialog.props}
      title={
        <Space>
          <img 
            src="/static/images/db-logos/trino.png" 
            alt="Trino" 
            style={{ width: 24, height: 24 }}
          />
          Trino Scale-out
        </Space>
      }
      okText="Scale-out 실행"
      cancelText="취소"
      okButtonProps={{
        disabled: scaleoutInProgress,
        loading: scaleoutInProgress,
        type: "primary",
        "data-test": "TrinoScaleoutButton",
      }}
      cancelButtonProps={{
        disabled: scaleoutInProgress,
      }}
      onOk={handleScaleout}
      closable={!scaleoutInProgress}
      maskClosable={!scaleoutInProgress}
      wrapProps={{
        "data-test": "TrinoScaleoutDialog",
      }}
      width={480}
    >
      <Card>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Title level={4}>Trino 클러스터 확장</Title>
          <Text>
            대용량 쿼리 실행을 위해 Trino 클러스터를 Scale-out 하시겠습니까?
          </Text>
          <Text type="secondary">
            이 작업은 Redis를 통해 Trino 클러스터에 확장 명령을 전송합니다.
          </Text>
          {scaleoutInProgress && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <Spin size="large" />
              <div style={{ marginTop: 16 }}>
                <Text>Scale-out 요청을 처리 중입니다...</Text>
              </div>
            </div>
          )}
        </Space>
      </Card>
    </Modal>
  );
}

TrinoScaleoutDialog.propTypes = {
  dialog: DialogPropType.isRequired,
};

export default wrapDialog(TrinoScaleoutDialog);