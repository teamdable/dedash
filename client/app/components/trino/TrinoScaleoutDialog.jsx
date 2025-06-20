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
import CheckCircleOutlinedIcon from "@ant-design/icons/CheckCircleOutlined";

const { Title, Text } = Typography;
const { Option } = Select;

function TrinoScaleoutDialog({ dialog }) {
  const [scaleoutInProgress, setScaleoutInProgress] = useState(false);
  const [scaleLevel, setScaleLevel] = useState("LIGHT");
  const [hoursToExpire, setHoursToExpire] = useState(0.5);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  function getScaleLevelText(level) {
    const levelMap = {
      "LIGHT": "LIGHT (For faster daily tasks)",
      "STANDARD": "STANDARD (For large datasets)", 
      "MAXIMUM": "MAXIMUM (Maximum performance)"
    };
    return levelMap[level] || level;
  }

  function getDurationText(hours) {
    const durationMap = {
      [10/60]: "10 minutes",
      [0.5]: "30 minutes",
      [1]: "1 hour",
      [2]: "2 hours"
    };
    return durationMap[hours] || `${hours} hours`;
  }

  function handleApplyClick() {
    setShowConfirmation(true);
  }

  function handleConfirmApply() {
    setShowConfirmation(false);
    setScaleoutInProgress(true);
    
    return axios
      .post("api/trino/scaleout", {
        scale_level: scaleLevel,
        hours_to_expire: hoursToExpire
      })
      .then((response) => {
        const data = response.data;
        setScaleoutInProgress(false);
        setShowSuccess(true);
        // Close success modal after 3 seconds
        setTimeout(() => {
          setShowSuccess(false);
          dialog.close();
        }, 3000);
        return data;
      })
      .catch((error) => {
        message.error("Failed to apply performance boost: " + (error?.response?.data?.message || error.message));
        setScaleoutInProgress(false);
        throw error;
      });
  }

  return (
    <>
      <Modal
        {...dialog.props}
        title={
          <Space>
            <RocketOutlinedIcon style={{ fontSize: 24, color: '#faad14' }} />
            EDA Performance Booster
          </Space>
        }
        onCancel={dialog.close}
        closable={!scaleoutInProgress}
        maskClosable={!scaleoutInProgress}
        wrapProps={{
          "data-test": "TrinoScaleoutDialog",
        }}
        width={480}
        footer={[
          <Button key="cancel" onClick={dialog.close} disabled={scaleoutInProgress}>
            Cancel
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={scaleoutInProgress}
            disabled={scaleoutInProgress}
            onClick={handleApplyClick}
            data-test="TrinoScaleoutButton">
            Apply Boost
          </Button>,
        ]}>
        <Card>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Title level={4}>EDA Performance Enhancement - dev</Title>
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

      {/* Confirmation Modal */}
      <Modal
        title="Confirm Performance Boost"
        visible={showConfirmation}
        onOk={handleConfirmApply}
        onCancel={() => setShowConfirmation(false)}
        okText="Confirm"
        cancelText="Cancel"
        width={400}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>Please confirm your performance boost settings:</Text>
          <Card size="small" style={{ backgroundColor: '#f5f5f5' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Text strong>Performance Level:</Text> {getScaleLevelText(scaleLevel)}
              </div>
              <div>
                <Text strong>Duration:</Text> {getDurationText(hoursToExpire)}
              </div>
            </Space>
          </Card>
          <Text type="secondary">
            This will apply the performance boost immediately and will be active for the specified duration.
          </Text>
        </Space>
      </Modal>

      {/* Success Modal */}
      <Modal
        title={
          <Space>
            <CheckCircleOutlinedIcon style={{ fontSize: 24, color: '#52c41a' }} />
            Performance Boost Applied Successfully
          </Space>
        }
        visible={showSuccess}
        footer={null}
        closable={false}
        maskClosable={false}
        width={400}
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <CheckCircleOutlinedIcon style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
          <Title level={4} style={{ color: '#52c41a' }}>
            Performance Boost Active!
          </Title>
          <Text>
            Your EDA cluster performance has been enhanced successfully.
          </Text>
          <br />
          <Text type="secondary">
            The boost will remain active for {getDurationText(hoursToExpire)}.
          </Text>
          <div style={{ marginTop: 16 }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              This dialog will close automatically in a few seconds...
            </Text>
          </div>
        </div>
      </Modal>
    </>
  );
}

TrinoScaleoutDialog.propTypes = {
  dialog: DialogPropType.isRequired,
};

export default wrapDialog(TrinoScaleoutDialog);