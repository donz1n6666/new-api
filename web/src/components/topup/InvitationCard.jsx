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
  Input,
  Badge,
  Space,
  Table,
  Tag,
} from '@douyinfe/semi-ui';
import { Copy, Users, BarChart2, TrendingUp, Gift, Zap, Ticket } from 'lucide-react';
import { API, showError, showSuccess } from '../../helpers';
import { StatusContext } from '../../context/Status';

const { Text } = Typography;

const InvitationCard = ({
  t,
  userState,
  renderQuota,
  setOpenTransfer,
  affLink,
  handleAffLinkClick,
}) => {
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

  return (
    <Card className='!rounded-2xl shadow-sm border-0'>
      {/* 卡片头部 */}
      <div className='flex items-center mb-4'>
        <Avatar size='small' color='green' className='mr-3 shadow-md'>
          <Gift size={16} />
        </Avatar>
        <div>
          <Typography.Text className='text-lg font-medium'>
            {t('邀请奖励')}
          </Typography.Text>
          <div className='text-xs'>{t('邀请好友获得额外奖励')}</div>
        </div>
      </div>

      {/* 收益展示区域 */}
      <Space vertical style={{ width: '100%' }}>
        {/* 统计数据统一卡片 */}
        <Card
          className='!rounded-xl w-full'
          cover={
            <div
              className='relative h-30'
              style={{
                '--palette-primary-darkerChannel': '0 75 80',
                backgroundImage: `linear-gradient(0deg, rgba(var(--palette-primary-darkerChannel) / 80%), rgba(var(--palette-primary-darkerChannel) / 80%)), url('/cover-4.webp')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
              }}
            >
              {/* 标题和按钮 */}
              <div className='relative z-10 h-full flex flex-col justify-between p-4'>
                <div className='flex justify-between items-center'>
                  <Text strong style={{ color: 'white', fontSize: '16px' }}>
                    {t('收益统计')}
                  </Text>
                  <Button
                    type='primary'
                    theme='solid'
                    size='small'
                    disabled={
                      !userState?.user?.aff_quota ||
                      userState?.user?.aff_quota <= 0
                    }
                    onClick={() => setOpenTransfer(true)}
                    className='!rounded-lg'
                  >
                    <Zap size={12} className='mr-1' />
                    {t('划转到余额')}
                  </Button>
                </div>

                {/* 统计数据 */}
                <div className='grid grid-cols-3 gap-6 mt-4'>
                  {/* 待使用收益 */}
                  <div className='text-center'>
                    <div
                      className='text-base sm:text-2xl font-bold mb-2'
                      style={{ color: 'white' }}
                    >
                      {renderQuota(userState?.user?.aff_quota || 0)}
                    </div>
                    <div className='flex items-center justify-center text-sm'>
                      <TrendingUp
                        size={14}
                        className='mr-1'
                        style={{ color: 'rgba(255,255,255,0.8)' }}
                      />
                      <Text
                        style={{
                          color: 'rgba(255,255,255,0.8)',
                          fontSize: '12px',
                        }}
                      >
                        {t('待使用收益')}
                      </Text>
                    </div>
                  </div>

                  {/* 总收益 */}
                  <div className='text-center'>
                    <div
                      className='text-base sm:text-2xl font-bold mb-2'
                      style={{ color: 'white' }}
                    >
                      {renderQuota(userState?.user?.aff_history_quota || 0)}
                    </div>
                    <div className='flex items-center justify-center text-sm'>
                      <BarChart2
                        size={14}
                        className='mr-1'
                        style={{ color: 'rgba(255,255,255,0.8)' }}
                      />
                      <Text
                        style={{
                          color: 'rgba(255,255,255,0.8)',
                          fontSize: '12px',
                        }}
                      >
                        {t('总收益')}
                      </Text>
                    </div>
                  </div>

                  {/* 邀请人数 */}
                  <div className='text-center'>
                    <div
                      className='text-base sm:text-2xl font-bold mb-2'
                      style={{ color: 'white' }}
                    >
                      {userState?.user?.aff_count || 0}
                    </div>
                    <div className='flex items-center justify-center text-sm'>
                      <Users
                        size={14}
                        className='mr-1'
                        style={{ color: 'rgba(255,255,255,0.8)' }}
                      />
                      <Text
                        style={{
                          color: 'rgba(255,255,255,0.8)',
                          fontSize: '12px',
                        }}
                      >
                        {t('邀请人数')}
                      </Text>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          }
        >
          {/* 邀请链接部分 */}
          <Input
            value={affLink}
            readonly
            className='!rounded-lg'
            prefix={t('邀请链接')}
            suffix={
              <Button
                type='primary'
                theme='solid'
                onClick={handleAffLinkClick}
                icon={<Copy size={14} />}
                className='!rounded-lg'
              >
                {t('复制')}
              </Button>
            }
          />
        </Card>

        {/* 奖励说明 */}
        <Card
          className='!rounded-xl w-full'
          title={<Text type='tertiary'>{t('奖励说明')}</Text>}
        >
          <div className='space-y-3'>
            <div className='flex items-start gap-2'>
              <Badge dot type='success' />
              <Text type='tertiary' className='text-sm'>
                {t('邀请好友注册，好友充值后您可获得相应奖励')}
              </Text>
            </div>

            <div className='flex items-start gap-2'>
              <Badge dot type='success' />
              <Text type='tertiary' className='text-sm'>
                {t('通过划转功能将奖励额度转入到您的账户余额中')}
              </Text>
            </div>

            <div className='flex items-start gap-2'>
              <Badge dot type='success' />
              <Text type='tertiary' className='text-sm'>
                {t('邀请的好友越多，获得的奖励越多')}
              </Text>
            </div>
          </div>
        </Card>

        {/* 邀请码管理 - 仅在启用邀请码时显示 */}
        {invitationCodeEnabled && (
          <Card
            className='!rounded-xl w-full'
            title={
              <div className='flex items-center gap-2'>
                <Ticket size={16} />
                <Text>{t('我的邀请码')}</Text>
              </div>
            }
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
        )}
      </Space>
    </Card>
  );
};

export default InvitationCard;
