/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useMemo } from 'react';
import { Button, Modal, Space, Spin, Typography } from '@douyinfe/semi-ui';
import { QRCodeSVG } from 'qrcode.react';
import { copy, showSuccess } from '../../../helpers';
import { useIsMobile } from '../../../hooks/common/useIsMobile';

const { Paragraph, Text } = Typography;

function getMetaMaskWalletConnectLink(uri) {
  if (!uri) return '';
  return `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`;
}

function getRawWalletConnectLink(uri) {
  if (!uri) return '';
  return uri;
}

const EthereumWalletConnectModal = ({
  t,
  visible,
  uri,
  statusText,
  onCancel,
}) => {
  const isMobile = useIsMobile();

  const walletActions = useMemo(() => {
    if (!uri) return [];
    return [
      {
        key: 'metamask',
        label: t('打开 MetaMask'),
        href: getMetaMaskWalletConnectLink(uri),
      },
      {
        key: 'raw',
        label: t('尝试打开钱包'),
        href: getRawWalletConnectLink(uri),
      },
    ];
  }, [t, uri]);

  const handleCopy = async () => {
    if (!uri) return;
    await copy(uri);
    showSuccess(t('复制成功'));
  };

  const openWalletLink = (href) => {
    if (!href) return;
    window.location.href = href;
  };

  return (
    <Modal
      title={t('连接钱包')}
      visible={visible}
      onCancel={onCancel}
      footer={
        <Space>
          <Button theme='light' onClick={onCancel}>
            {t('取消')}
          </Button>
          <Button
            type='primary'
            theme='solid'
            disabled={!uri}
            onClick={handleCopy}
          >
            {t('复制连接')}
          </Button>
        </Space>
      }
      centered
    >
      <div className='space-y-4'>
        {!uri ? (
          <div className='py-8 text-center'>
            <Spin size='large' />
            <div className='mt-4 text-sm text-gray-500'>
              {statusText || t('正在生成 WalletConnect 连接信息...')}
            </div>
          </div>
        ) : (
          <>
            <div className='flex flex-col items-center gap-3'>
              <div className='rounded-xl border border-gray-200 bg-white p-3'>
                <QRCodeSVG
                  value={uri}
                  size={isMobile ? 180 : 220}
                  includeMargin
                />
              </div>
              <Text type='secondary'>
                {isMobile
                  ? t(
                      '手机端可尝试直接打开钱包 App；如果没有反应，可复制连接并在支持 WalletConnect 的钱包内打开，或使用另一台设备扫描二维码。',
                    )
                  : t(
                      '桌面端可使用手机钱包扫描二维码，或复制连接到支持 WalletConnect 的钱包 App 中打开。',
                    )}
              </Text>
              {statusText ? <Text type='tertiary'>{statusText}</Text> : null}
            </div>

            <div className='rounded-lg border border-gray-200 bg-gray-50 p-3'>
              <Text strong>{t('WalletConnect 连接链接')}</Text>
              <Paragraph
                className='mt-2 mb-0 break-all'
                copyable={{ content: uri, tooltips: false }}
              >
                {uri}
              </Paragraph>
            </div>

            {isMobile ? (
              <div className='space-y-2'>
                <Text strong>{t('已安装钱包 App？')}</Text>
                <Space wrap>
                  {walletActions.map((wallet) => (
                    <Button
                      key={wallet.key}
                      theme='outline'
                      type='primary'
                      onClick={() => openWalletLink(wallet.href)}
                    >
                      {wallet.label}
                    </Button>
                  ))}
                </Space>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  );
};

export default EthereumWalletConnectModal;
