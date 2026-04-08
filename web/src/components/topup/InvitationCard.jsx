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

import React, { useState, useEffect, useContext, useMemo } from 'react';
import {
  Avatar,
  Typography,
  Card,
  Button,
  Space,
  Table,
  Tag,
} from '@douyinfe/semi-ui';
import { Copy, Ticket } from 'lucide-react';
import { API, showError, showSuccess } from '../../helpers';
import { StatusContext } from '../../context/Status';

const { Text } = Typography;

const InvitationCard = ({ t }) => {
  const [statusState] = useContext(StatusContext);
  const status = useMemo(() => {
    if (statusState?.status) return statusState.status;
    const saved = localStorage.getItem('status');
    if (!saved) return {};
    try { return JSON.parse(saved) || {}; } catch { return {}; }
  }, [statusState?.status]);

  const invitationCodeEnabled = !!status?.invitation_code_enabled;

  const [myCodes, setMyCodes] = useState([]);
  const [myCodesLoading, setMyCodesLoading] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);

  const loadMyCodes = async () => {
    setMyCodesLoading(true);
    try {
      const res = await API.get('/api/invitation_code/mine?p=0&page_size=50');
      const { success, data } = res.data;
      if (success) {
        setMyCodes(data.items || []);
      }
    } catch (e) {
      // ignore
    } finally {
      setMyCodesLoading(false);
    }
  };

  useEffect(() => {
    if (invitationCodeEnabled) {
      loadMyCodes();
    }
  }, [invitationCodeEnabled]);

  const handleGenerate = async () => {
    setGenerateLoading(true);
    try {
      const res = await API.post('/api/invitation_code/generate');
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('邀请码生成成功'));
        loadMyCodes();
      } else {
        showError(message);
      }
    } catch (e) {
      showError(t('生成失败'));
    } finally {
      setGenerateLoading(false);
    }
  };

  const copyInvLink = (code) => {
    const link = `${window.location.origin}/register?invitation_code=${code}`;
    navigator.clipboard.writeText(link).then(() => {
      showSuccess(t('已复制到剪贴板'));
    }).catch(() => showError(t('复制失败')));
  };

  // 邀请码功能未启用时不渲染
  if (!invitationCodeEnabled) {
    return null;
  }

  return (
    <Card className='!rounded-2xl shadow-sm border-0'>
      {/* 卡片头部 */}
      <div className='flex items-center mb-4'>
        <Avatar size='small' color='green' className='mr-3 shadow-md'>
          <Ticket size={16} />
        </Avatar>
        <div>
          <Typography.Text className='text-lg font-medium'>
            {t('我的邀请码')}
          </Typography.Text>
          <div className='text-xs'>{t('生成邀请码邀请好友注册')}</div>
        </div>
      </div>

      <Space vertical style={{ width: '100%' }}>
        <Card
          className='!rounded-xl w-full'
          headerExtraContent={
            <Button
              theme='solid'
              type='primary'
              size='small'
              onClick={handleGenerate}
              loading={generateLoading}
              className='!rounded-lg'
            >
              {t('生成邀请码')}
            </Button>
          }
        >
          <Table
            dataSource={myCodes}
            loading={myCodesLoading}
            rowKey='id'
            size='small'
            pagination={false}
            columns={[
              {
                title: t('邀请码'),
                dataIndex: 'code',
                render: (text) => <Text copyable={{ content: text }}>{text}</Text>,
              },
              {
                title: t('状态'),
                dataIndex: 'status',
                width: 80,
                render: (s) => {
                  const map = { 1: { text: t('未使用'), color: 'green' }, 2: { text: t('已使用'), color: 'grey' }, 3: { text: t('已禁用'), color: 'red' } };
                  const info = map[s] || { text: t('未知'), color: 'grey' };
                  return <Tag color={info.color}>{info.text}</Tag>;
                },
              },
              {
                title: t('操作'),
                width: 100,
                render: (_, record) =>
                  record.status === 1 ? (
                    <Button size='small' icon={<Copy size={12} />} onClick={() => copyInvLink(record.code)}>
                      {t('复制链接')}
                    </Button>
                  ) : null,
              },
            ]}
            empty={<Text type='tertiary'>{t('暂无邀请码，点击上方按钮生成')}</Text>}
          />
        </Card>
      </Space>
    </Card>
  );
};

export default InvitationCard;
