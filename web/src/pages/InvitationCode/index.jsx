import React, { useEffect, useState, useCallback } from 'react';
import {
  Button,
  Table,
  Tag,
  Popconfirm,
  Form,
  Modal,
  InputNumber,
  Input,
  Space,
  Typography,
  Card,
} from '@douyinfe/semi-ui';
import {
  IconPlus,
  IconDelete,
  IconCopy,
  IconSearch,
  IconRefresh,
} from '@douyinfe/semi-icons';
import { API, showError, showSuccess, showInfo } from '../../helpers';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

const STATUS_MAP = {
  1: { text: '未使用', color: 'green' },
  2: { text: '已使用', color: 'grey' },
  3: { text: '已禁用', color: 'red' },
};

const InvitationCodePage = () => {
  const { t } = useTranslation();
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addCount, setAddCount] = useState(10);
  const [addRemark, setAddRemark] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  const loadCodes = useCallback(async () => {
    setLoading(true);
    try {
      let url;
      if (searchKeyword) {
        url = `/api/invitation_code/search?keyword=${encodeURIComponent(searchKeyword)}&p=${activePage}&page_size=${pageSize}`;
      } else {
        url = `/api/invitation_code/?p=${activePage}&page_size=${pageSize}`;
      }
      const res = await API.get(url);
      const { success, message, data } = res.data;
      if (success) {
        setCodes(data.items || []);
        setTotal(data.total || 0);
      } else {
        showError(message);
      }
    } catch (error) {
      showError(t('加载失败'));
    } finally {
      setLoading(false);
    }
  }, [activePage, pageSize, searchKeyword, t]);

  useEffect(() => {
    loadCodes();
  }, [loadCodes]);

  const handleAdd = async () => {
    if (addCount <= 0 || addCount > 100) {
      showError(t('数量必须在 1-100 之间'));
      return;
    }
    setAddLoading(true);
    try {
      const res = await API.post('/api/invitation_code/', {
        count: addCount,
        remark: addRemark,
      });
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('创建成功'));
        setShowAddModal(false);
        setAddCount(10);
        setAddRemark('');
        loadCodes();
      } else {
        showError(message);
      }
    } catch (error) {
      showError(t('创建失败'));
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await API.delete(`/api/invitation_code/${id}`);
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('删除成功'));
        loadCodes();
      } else {
        showError(message);
      }
    } catch (error) {
      showError(t('删除失败'));
    }
  };

  const handleDeleteUsed = async () => {
    try {
      const res = await API.post('/api/invitation_code/delete_used');
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('清理成功'));
        loadCodes();
      } else {
        showError(message);
      }
    } catch (error) {
      showError(t('清理失败'));
    }
  };

  const handleToggleStatus = async (record) => {
    const newStatus = record.status === 1 ? 3 : 1;
    try {
      const res = await API.put('/api/invitation_code/', {
        ...record,
        status: newStatus,
      });
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('更新成功'));
        loadCodes();
      } else {
        showError(message);
      }
    } catch (error) {
      showError(t('更新失败'));
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      showSuccess(t('已复制到剪贴板'));
    }).catch(() => {
      showError(t('复制失败'));
    });
  };

  const copyInvitationLink = (code) => {
    const link = `${window.location.origin}/register?invitation_code=${code}`;
    copyToClipboard(link);
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 60,
    },
    {
      title: t('邀请码'),
      dataIndex: 'code',
      width: 220,
      render: (text) => (
        <Space>
          <Text copyable={{ content: text }}>{text}</Text>
        </Space>
      ),
    },
    {
      title: t('状态'),
      dataIndex: 'status',
      width: 90,
      render: (status) => {
        const info = STATUS_MAP[status] || { text: t('未知'), color: 'grey' };
        return <Tag color={info.color}>{t(info.text)}</Tag>;
      },
    },
    {
      title: t('生成者 ID'),
      dataIndex: 'user_id',
      width: 90,
    },
    {
      title: t('使用者 ID'),
      dataIndex: 'used_user_id',
      width: 90,
      render: (val) => val || '-',
    },
    {
      title: t('备注'),
      dataIndex: 'remark',
      width: 120,
      render: (val) => val || '-',
    },
    {
      title: t('创建时间'),
      dataIndex: 'created_time',
      width: 160,
      render: (val) =>
        val ? new Date(val * 1000).toLocaleString() : '-',
    },
    {
      title: t('使用时间'),
      dataIndex: 'used_time',
      width: 160,
      render: (val) =>
        val ? new Date(val * 1000).toLocaleString() : '-',
    },
    {
      title: t('操作'),
      width: 220,
      render: (_, record) => (
        <Space>
          <Button
            size='small'
            icon={<IconCopy />}
            onClick={() => copyInvitationLink(record.code)}
          >
            {t('复制链接')}
          </Button>
          {record.status !== 2 && (
            <Button
              size='small'
              type={record.status === 1 ? 'danger' : 'primary'}
              onClick={() => handleToggleStatus(record)}
            >
              {record.status === 1 ? t('禁用') : t('启用')}
            </Button>
          )}
          <Popconfirm
            title={t('确定要删除此邀请码吗？')}
            onConfirm={() => handleDelete(record.id)}
          >
            <Button size='small' type='danger' icon={<IconDelete />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className='mt-[60px] px-2'>
      <Card>
        <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4'>
          <div className='flex flex-wrap gap-2'>
            <Button
              icon={<IconPlus />}
              theme='solid'
              type='primary'
              onClick={() => setShowAddModal(true)}
            >
              {t('批量生成')}
            </Button>
            <Popconfirm
              title={t('确定要清理所有已使用的邀请码吗？')}
              onConfirm={handleDeleteUsed}
            >
              <Button icon={<IconDelete />} type='warning'>
                {t('清理已使用')}
              </Button>
            </Popconfirm>
            <Button icon={<IconRefresh />} onClick={loadCodes}>
              {t('刷新')}
            </Button>
          </div>
          <div className='flex gap-2 w-full md:w-auto'>
            <Input
              placeholder={t('搜索邀请码或备注')}
              value={searchKeyword}
              onChange={setSearchKeyword}
              onEnterPress={() => {
                setActivePage(1);
                loadCodes();
              }}
              prefix={<IconSearch />}
              style={{ width: 240 }}
            />
            <Button
              onClick={() => {
                setActivePage(1);
                loadCodes();
              }}
            >
              {t('搜索')}
            </Button>
          </div>
        </div>

        <Table
          columns={columns}
          dataSource={codes}
          loading={loading}
          rowKey='id'
          pagination={{
            currentPage: activePage,
            pageSize: pageSize,
            total: total,
            onPageChange: setActivePage,
            onPageSizeChange: (size) => {
              setPageSize(size);
              setActivePage(1);
            },
            showSizeChanger: true,
            pageSizeOpts: [10, 20, 50, 100],
          }}
          scroll={{ x: 1000 }}
        />
      </Card>

      <Modal
        title={t('批量生成邀请码')}
        visible={showAddModal}
        onOk={handleAdd}
        onCancel={() => setShowAddModal(false)}
        okText={t('生成')}
        confirmLoading={addLoading}
      >
        <Form layout='vertical'>
          <Form.Slot label={t('生成数量')}>
            <InputNumber
              value={addCount}
              onChange={setAddCount}
              min={1}
              max={100}
              style={{ width: '100%' }}
            />
          </Form.Slot>
          <Form.Slot label={t('备注')}>
            <Input
              value={addRemark}
              onChange={setAddRemark}
              placeholder={t('可选备注信息')}
            />
          </Form.Slot>
        </Form>
      </Modal>
    </div>
  );
};

export default InvitationCodePage;
