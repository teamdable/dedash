import React, { useState } from "react";
import Modal from "antd/lib/modal";
import Button from "antd/lib/button";
import message from "antd/lib/message";
import Spin from "antd/lib/spin";
import Card from "antd/lib/card";
import Typography from "antd/lib/typography";
import Space from "antd/lib/space";
import InputNumber from "antd/lib/input-number";
import Select from "antd/lib/select";
import Form from "antd/lib/form";
import { wrap as wrapDialog, DialogPropType } from "@/components/DialogWrapper";
import axios from "@/services/axios";

const { Title, Text } = Typography;
const { Option } = Select;

function TrinoScaleoutDialog({ dialog }) {
  const [scaleoutInProgress, setScaleoutInProgress] = useState(false);
  const [scaleSize, setScaleSize] = useState(20);
  const [hoursToExpire, setHoursToExpire] = useState(2);

  function handleScaleout() {
    setScaleoutInProgress(true);
    
    // Redis를 통해 Trino Scale-out 요청 보내기
    axios
      .post("/api/trino/scaleout", {
        scale_size: scaleSize,
        hours_to_expire: hoursToExpire
      })
      .then((response) => {
        const data = response.data;
        message.success(`${data.message}`);
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
          
          <Form layout="vertical" style={{ marginTop: 16 }}>
            <Form.Item label="스케일 크기" style={{ marginBottom: 16 }}>
              <InputNumber
                min={1}
                max={100}
                value={scaleSize}
                onChange={setScaleSize}
                style={{ width: '100%' }}
                disabled={scaleoutInProgress}
              />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                확장할 Trino 워커 노드 수를 설정하세요 (기본값: 20)
              </Text>
            </Form.Item>
            
            <Form.Item label="만료 시간" style={{ marginBottom: 16 }}>
              <Select
                value={hoursToExpire}
                onChange={setHoursToExpire}
                style={{ width: '100%' }}
                disabled={scaleoutInProgress}
              >
                <Option value={1}>1시간</Option>
                <Option value={2}>2시간</Option>
                <Option value={4}>4시간</Option>
                <Option value={8}>8시간</Option>
                <Option value={24}>24시간</Option>
              </Select>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Scale-out이 자동으로 해제될 시간을 설정하세요 (기본값: 2시간)
              </Text>
            </Form.Item>
          </Form>
          
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