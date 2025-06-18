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
import { axios } from "@/services/axios";
import RocketOutlinedIcon from "@ant-design/icons/RocketOutlined";

const { Title, Text } = Typography;
const { Option } = Select;

function TrinoScaleoutDialog({ dialog }) {
  const [scaleoutInProgress, setScaleoutInProgress] = useState(false);
  const [scaleLevel, setScaleLevel] = useState("LIGHT");
  const [hoursToExpire, setHoursToExpire] = useState(0.5);

  function handleApplyClick() {
    setScaleoutInProgress(true);
    
    axios
      .post("api/trino/scaleout", {
        scale_level: scaleLevel,
        hours_to_expire: hoursToExpire
      })
      .then((response) => {
        const data = response.data;
        message.success(`${data.message}`);
        dialog.close();
      })
      .catch((error) => {
        message.error("Failed to apply performance boost: " + (error?.response?.data?.message || error.message));
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
          <RocketOutlinedIcon style={{ fontSize: 24, color: '#faad14' }} />
          EDA Performance Booster
        </Space>
      }
      okText="Apply Boost"
      cancelText="Cancel"
      okButtonProps={{
        disabled: scaleoutInProgress,
        loading: scaleoutInProgress,
        type: "primary",
        "data-test": "TrinoScaleoutButton",
      }}
      cancelButtonProps={{
        disabled: scaleoutInProgress,
      }}
      onOk={handleApplyClick}
      onCancel={dialog.close}
      closable={!scaleoutInProgress}
      maskClosable={!scaleoutInProgress}
      wrapProps={{
        "data-test": "TrinoScaleoutDialog",
      }}
      width={480}
    >
      <Card>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Title level={4}>EDA Performance Enhancement</Title>
          <Text>
            Boost your query performance for faster data analysis. Would you like to enhance the EDA cluster capacity?
          </Text>
          
          <Form layout="vertical" style={{ marginTop: 16 }}>
            <Form.Item label="Performance Level" style={{ marginBottom: 16 }}>
              <Select
                value={scaleLevel}
                onChange={setScaleLevel}
                style={{ width: '100%' }}
                disabled={scaleoutInProgress}
              >
                <Option value="LIGHT">LIGHT (For faster daily tasks)</Option>
                <Option value="STANDARD">STANDARD (For large datasets)</Option>
                <Option value="MAXIMUM">MAXIMUM (Maximum performance)</Option>
              </Select>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Choose the performance level based on your workload requirements (Default: LIGHT)
              </Text>
            </Form.Item>
            
            <Form.Item label="Duration" style={{ marginBottom: 16 }}>
              <Select
                value={hoursToExpire}
                onChange={setHoursToExpire}
                style={{ width: '100%' }}
                disabled={scaleoutInProgress}
              >
                <Option value={10/60}>10 minutes</Option>
                <Option value={0.5}>30 minutes</Option>
                <Option value={1}>1 hour</Option>
                <Option value={2}>2 hours</Option>
              </Select>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Set how long the performance boost will remain active (Default: 30 minutes)
              </Text>
            </Form.Item>
          </Form>
          
          <Text type="secondary">
            This will temporarily enhance the EDA cluster performance for better query execution.
          </Text>
          
          {scaleoutInProgress && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <Spin size="large" />
              <div style={{ marginTop: 16 }}>
                <Text>Applying performance boost...</Text>
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