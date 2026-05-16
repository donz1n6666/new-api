import React from 'react';
import { Button, Modal, Space, Typography } from '@douyinfe/semi-ui';
import { QRCodeSVG } from 'qrcode.react';

const { Text, Title } = Typography;

const WalletConnectQrModal = ({ t, visible, uri, onCancel }) => {
  const copyUri = async () => {
    if (!uri || typeof navigator === 'undefined') return;
    await navigator.clipboard?.writeText(uri);
  };

  return (
    <Modal
      visible={visible}
      onCancel={onCancel}
      footer={null}
      centered
      maskClosable={false}
      width={380}
      bodyStyle={{ padding: 24 }}
    >
      <Space vertical align='center' spacing='medium' style={{ width: '100%' }}>
        <Title heading={5} style={{ margin: 0 }}>
          WalletConnect
        </Title>
        <Text type='secondary'>
          {t('请使用手机钱包扫码连接，授权后将自动发起交易请求')}
        </Text>
        <div
          style={{
            padding: 16,
            borderRadius: 20,
            background: '#fff',
            boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)',
          }}
        >
          {uri ? (
            <QRCodeSVG value={uri} size={240} level='M' includeMargin />
          ) : (
            <div style={{ width: 240, height: 240 }} />
          )}
        </div>
        <Button onClick={copyUri} disabled={!uri}>
          {t('复制连接')}
        </Button>
        <Text type='tertiary' size='small'>
          {t('如果钱包已连接但未弹出交易，请回到钱包确认当前请求')}
        </Text>
      </Space>
    </Modal>
  );
};

export default WalletConnectQrModal;
