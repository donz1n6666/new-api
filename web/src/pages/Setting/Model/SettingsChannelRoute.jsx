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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Banner,
  Button,
  Col,
  Divider,
  Form,
  Modal,
  Row,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { IconDelete, IconEdit, IconPlus } from '@douyinfe/semi-icons';
import {
  API,
  compareObjects,
  showError,
  showSuccess,
  showWarning,
  verifyJSON,
} from '../../../helpers';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

const KEY_ENABLED = 'channel_route_setting.enabled';
const KEY_RULES = 'channel_route_setting.rules';

const defaultInputs = {
  [KEY_ENABLED]: false,
  [KEY_RULES]: '[]',
};

const rulesExample = JSON.stringify(
  [
    {
      name: 'qwen messages native',
      group_regex: ['^default$'],
      model_regex: ['^Qwen3\\.5-35B-A3B$'],
      path_regex: ['^/v1/messages$'],
      channel_ids: [12],
      strict: true,
    },
    {
      name: 'qwen chat native',
      group_regex: ['^vip$'],
      model_regex: ['^Qwen3\\.5-35B-A3B$'],
      path_regex: ['^/v1/chat/completions$'],
      channel_ids: [34, 35],
      strict: true,
    },
  ],
  null,
  2,
);

const normalizeStringList = (text) => {
  if (!text) return [];
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
};

const normalizeChannelIds = (text) => {
  if (!text) return [];
  const parts = text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const ids = [];
  for (const part of parts) {
    const value = Number(part);
    if (!Number.isInteger(value) || value <= 0) {
      return null;
    }
    ids.push(value);
  }
  return [...new Set(ids)];
};

const stringifyPretty = (value) => JSON.stringify(value, null, 2);
const stringifyCompact = (value) => JSON.stringify(value);

const parseRulesJson = (jsonString) => {
  try {
    const parsed = JSON.parse(jsonString || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map((rule, index) => ({
      id: index,
      ...(rule || {}),
    }));
  } catch (e) {
    return [];
  }
};

const rulesToJson = (rules) => {
  const payload = (rules || []).map((rule) => {
    const { id, ...rest } = rule || {};
    return rest;
  });
  return stringifyPretty(payload);
};

const tryParseRulesJsonArray = (jsonString) => {
  const raw = jsonString || '[]';
  if (!verifyJSON(raw)) {
    return { ok: false, message: 'Rules JSON is invalid' };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return { ok: false, message: 'Rules JSON must be an array' };
    }
    return { ok: true, value: parsed };
  } catch (e) {
    return { ok: false, message: 'Rules JSON is invalid' };
  }
};

const buildModalFormValues = (rule) => {
  const current = rule || {};
  return {
    name: current.name || '',
    group_regex_text: (current.group_regex || []).join('\n'),
    model_regex_text: (current.model_regex || []).join('\n'),
    path_regex_text: (current.path_regex || []).join('\n'),
    channel_ids_text: (current.channel_ids || []).join('\n'),
    strict: !!current.strict,
  };
};

export default function SettingsChannelRoute(props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState(defaultInputs);
  const [inputsRow, setInputsRow] = useState(defaultInputs);
  const [editMode, setEditMode] = useState('visual');
  const [rules, setRules] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [isEdit, setIsEdit] = useState(false);
  const [modalInitValues, setModalInitValues] = useState(null);
  const [modalFormKey, setModalFormKey] = useState(0);
  const refForm = useRef();
  const modalFormRef = useRef();

  const ruleColumns = useMemo(
    () => [
      {
        title: t('名称'),
        dataIndex: 'name',
        render: (text) => <Text>{text || '-'}</Text>,
      },
      {
        title: t('分组正则'),
        dataIndex: 'group_regex',
        render: (list) =>
          (list || []).length > 0
            ? (list || []).slice(0, 2).map((item, index) => (
                <Tag key={`${item}-${index}`} style={{ marginRight: 4 }}>
                  {item}
                </Tag>
              ))
            : <Text type='tertiary'>-</Text>,
      },
      {
        title: t('模型正则'),
        dataIndex: 'model_regex',
        render: (list) =>
          (list || []).length > 0
            ? (list || []).slice(0, 2).map((item, index) => (
                <Tag key={`${item}-${index}`} style={{ marginRight: 4 }}>
                  {item}
                </Tag>
              ))
            : <Text type='tertiary'>-</Text>,
      },
      {
        title: t('路径正则'),
        dataIndex: 'path_regex',
        render: (list) =>
          (list || []).length > 0
            ? (list || []).slice(0, 2).map((item, index) => (
                <Tag key={`${item}-${index}`} style={{ marginRight: 4 }}>
                  {item}
                </Tag>
              ))
            : <Text type='tertiary'>-</Text>,
      },
      {
        title: t('渠道池'),
        dataIndex: 'channel_ids',
        render: (list) =>
          (list || []).length > 0
            ? (list || []).map((item) => (
                <Tag key={item} color='orange' style={{ marginRight: 4 }}>
                  #{item}
                </Tag>
              ))
            : <Text type='tertiary'>-</Text>,
      },
      {
        title: t('严格模式'),
        dataIndex: 'strict',
        render: (value) => (
          <Tag color={value ? 'red' : 'green'}>
            {value ? t('严格') : t('可回退')}
          </Tag>
        ),
      },
      {
        title: t('操作'),
        render: (_, record) => (
          <Space>
            <Button
              icon={<IconEdit />}
              theme='borderless'
              onClick={() => handleEditRule(record)}
            />
            <Button
              icon={<IconDelete />}
              theme='borderless'
              type='danger'
              onClick={() => handleDeleteRule(record.id)}
            />
          </Space>
        ),
      },
    ],
    [t],
  );

  const updateRulesState = (nextRules) => {
    const normalizedRules = (nextRules || []).map((rule, index) => ({
      ...(rule || {}),
      id: index,
    }));
    const jsonString = rulesToJson(normalizedRules);
    setRules(normalizedRules);
    setInputs((prev) => ({
      ...prev,
      [KEY_RULES]: jsonString,
    }));
    if (refForm.current) {
      refForm.current.setValue(KEY_RULES, jsonString);
    }
  };

  const openAddModal = () => {
    const nextRule = {
      name: '',
      group_regex: [],
      model_regex: [],
      path_regex: [],
      channel_ids: [],
      strict: true,
    };
    setEditingRule(nextRule);
    setIsEdit(false);
    setModalInitValues(buildModalFormValues(nextRule));
    setModalFormKey((value) => value + 1);
    setModalVisible(true);
  };

  const handleEditRule = (rule) => {
    const nextRule = { ...(rule || {}) };
    setEditingRule(nextRule);
    setIsEdit(true);
    setModalInitValues(buildModalFormValues(nextRule));
    setModalFormKey((value) => value + 1);
    setModalVisible(true);
  };

  const handleDeleteRule = (id) => {
    const nextRules = (rules || []).filter((rule) => rule.id !== id);
    updateRulesState(nextRules);
    showSuccess(t('删除成功'));
  };

  const handleModalSave = async () => {
    try {
      const values = await modalFormRef.current.validate();
      const modelRegex = normalizeStringList(values.model_regex_text);
      if (modelRegex.length === 0) {
        return showError(t('模型正则不能为空'));
      }
      const channelIds = normalizeChannelIds(values.channel_ids_text);
      if (!channelIds || channelIds.length === 0) {
        return showError(t('渠道 ID 必须是正整数，支持换行或逗号分隔'));
      }

      const rulePayload = {
        id: isEdit ? editingRule?.id : rules.length,
        name: (values.name || '').trim(),
        group_regex: normalizeStringList(values.group_regex_text),
        model_regex: modelRegex,
        path_regex: normalizeStringList(values.path_regex_text),
        channel_ids: channelIds,
        strict: !!values.strict,
      };
      if (!rulePayload.name) {
        return showError(t('名称不能为空'));
      }

      const nextRules = [...(rules || [])];
      if (isEdit) {
        const index = nextRules.findIndex((rule) => rule.id === editingRule?.id);
        if (index < 0) return showError(t('规则未找到，请刷新后重试'));
        nextRules[index] = rulePayload;
      } else {
        nextRules.push(rulePayload);
      }
      updateRulesState(nextRules);
      setModalVisible(false);
      setEditingRule(null);
      setModalInitValues(null);
      showSuccess(t('保存成功'));
    } catch (error) {
      showError(t('请检查输入'));
    }
  };

  const switchToVisualMode = () => {
    const validation = tryParseRulesJsonArray(inputs[KEY_RULES] || '[]');
    if (!validation.ok) {
      showError(t(validation.message));
      return;
    }
    setRules(parseRulesJson(inputs[KEY_RULES] || '[]'));
    setEditMode('visual');
  };

  const switchToJsonMode = () => {
    const jsonString = rulesToJson(rules);
    setInputs((prev) => ({
      ...prev,
      [KEY_RULES]: jsonString,
    }));
    if (refForm.current) {
      refForm.current.setValue(KEY_RULES, jsonString);
    }
    setEditMode('json');
  };

  function onSubmit() {
    const updateArray = compareObjects(inputs, inputsRow);
    if (!updateArray.length) return showWarning(t('你似乎并没有修改什么'));
    if (!verifyJSON(inputs[KEY_RULES] || '[]')) {
      return showError(t('规则 JSON 格式不正确'));
    }
    let compactRules;
    try {
      compactRules = stringifyCompact(JSON.parse(inputs[KEY_RULES] || '[]'));
    } catch (error) {
      return showError(t('规则 JSON 格式不正确'));
    }
    const requestQueue = updateArray.map((item) => {
      let value = inputs[item.key];
      if (item.key === KEY_RULES) {
        value = compactRules;
      }
      return API.put('/api/option/', {
        key: item.key,
        value: String(value),
      });
    });
    setLoading(true);
    Promise.all(requestQueue)
      .then((res) => {
        if (requestQueue.length === 1) {
          if (res.includes(undefined)) return;
        } else if (requestQueue.length > 1) {
          if (res.includes(undefined)) {
            return showError(t('部分保存失败，请重试'));
          }
        }
        showSuccess(t('保存成功'));
        props.refresh();
      })
      .catch(() => {
        showError(t('保存失败，请重试'));
      })
      .finally(() => {
        setLoading(false);
      });
  }

  useEffect(() => {
    const currentInputs = { ...defaultInputs };
    if (props.options[KEY_ENABLED] !== undefined) {
      currentInputs[KEY_ENABLED] = props.options[KEY_ENABLED];
    }
    if (props.options[KEY_RULES] !== undefined) {
      try {
        const parsed = JSON.parse(props.options[KEY_RULES] || '[]');
        currentInputs[KEY_RULES] = stringifyPretty(parsed);
      } catch (error) {
        currentInputs[KEY_RULES] = props.options[KEY_RULES] || '[]';
      }
    }
    setInputs(currentInputs);
    setInputsRow(structuredClone(currentInputs));
    setRules(parseRulesJson(currentInputs[KEY_RULES]));
    if (refForm.current) {
      refForm.current.setValues(currentInputs);
    }
  }, [props.options]);

  useEffect(() => {
    if (editMode === 'visual') {
      setRules(parseRulesJson(inputs[KEY_RULES]));
    }
  }, [editMode, inputs]);

  return (
    <>
      <Spin spinning={loading}>
        <Form
          values={inputs}
          getFormApi={(formAPI) => (refForm.current = formAPI)}
          style={{ marginBottom: 15 }}
        >
          <Form.Section text={t('静态渠道路由')}>
            <Banner
              type='info'
              fullMode={false}
              description={t(
                '根据分组、模型和请求路径静态限定渠道池。命中规则后只在指定渠道内继续按原优先级和权重选择，未配置时对现有行为无影响。',
              )}
            />
            <Divider style={{ marginTop: 12, marginBottom: 12 }} />
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Switch
                  field={KEY_ENABLED}
                  label={t('启用静态渠道路由')}
                  checkedText='|'
                  uncheckedText='O'
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      [KEY_ENABLED]: value,
                    })
                  }
                  extraText={t(
                    '适用于同模型存在多种原生格式渠道时，按调用路径和分组限定可选渠道，减少格式转换。',
                  )}
                />
              </Col>
            </Row>

            <Row style={{ marginTop: 12, marginBottom: 12 }}>
              <Space>
                <Button
                  type={editMode === 'visual' ? 'primary' : 'tertiary'}
                  onClick={switchToVisualMode}
                >
                  {t('可视化编辑')}
                </Button>
                <Button
                  type={editMode === 'json' ? 'primary' : 'tertiary'}
                  onClick={switchToJsonMode}
                >
                  JSON
                </Button>
              </Space>
            </Row>

            {editMode === 'visual' ? (
              <>
                <Row style={{ marginBottom: 12 }}>
                  <Space>
                    <Button icon={<IconPlus />} onClick={openAddModal}>
                      {t('新增规则')}
                    </Button>
                    <Text type='tertiary'>
                      {t(
                        '匹配顺序为分组、模型、路径。命中后只在渠道池内按原优先级和权重选。',
                      )}
                    </Text>
                  </Space>
                </Row>
                <Table
                  dataSource={rules}
                  columns={ruleColumns}
                  pagination={false}
                  rowKey='id'
                  empty={t('暂无规则')}
                />
              </>
            ) : (
              <Row>
                <Col span={24}>
                  <Form.TextArea
                    field={KEY_RULES}
                    label={t('路由规则')}
                    rows={18}
                    placeholder={rulesExample}
                    rules={[
                      {
                        validator: (rule, value) => verifyJSON(value || '[]'),
                        message: t('不是合法的 JSON 字符串'),
                      },
                    ]}
                    extraText={t(
                      '字段支持：group_regex、name、model_regex、path_regex、channel_ids、strict。',
                    )}
                    onChange={(value) =>
                      setInputs({
                        ...inputs,
                        [KEY_RULES]: value,
                      })
                    }
                  />
                </Col>
              </Row>
            )}

            <Row style={{ marginTop: 16 }}>
              <Button onClick={onSubmit}>{t('保存渠道路由设置')}</Button>
            </Row>
          </Form.Section>
        </Form>
      </Spin>

      <Modal
        title={isEdit ? t('编辑规则') : t('新增规则')}
        visible={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditingRule(null);
          setModalInitValues(null);
        }}
        onOk={handleModalSave}
        width={760}
      >
        <Form
          key={modalFormKey}
          initValues={modalInitValues || {}}
          getFormApi={(formAPI) => (modalFormRef.current = formAPI)}
          labelPosition='top'
        >
          <Form.Input
            field='name'
            label={t('规则名称')}
            placeholder={t('例如：qwen messages native')}
            rules={[{ required: true, message: t('名称不能为空') }]}
          />
          <Row gutter={12}>
            <Col span={8}>
              <Form.TextArea
                field='group_regex_text'
                label={t('分组正则')}
                rows={5}
                placeholder={'^default$\n^vip$'}
                extraText={t('可空。为空时表示不区分分组。')}
              />
            </Col>
            <Col span={8}>
              <Form.TextArea
                field='model_regex_text'
                label={t('模型正则')}
                rows={5}
                placeholder={'^Qwen3\\.5-35B-A3B$'}
                rules={[
                  { required: true, message: t('模型正则不能为空') },
                ]}
              />
            </Col>
            <Col span={8}>
              <Form.TextArea
                field='path_regex_text'
                label={t('路径正则')}
                rows={5}
                placeholder={'^/v1/messages$\n^/v1/chat/completions$'}
                extraText={t('可空。为空时表示不区分路径。')}
              />
            </Col>
          </Row>
          <Form.TextArea
            field='channel_ids_text'
            label={t('渠道池')}
            rows={4}
            placeholder={'12\n34\n56'}
            extraText={t('填写渠道 ID，支持换行或逗号分隔。')}
            rules={[
              { required: true, message: t('渠道池不能为空') },
            ]}
          />
          <Form.Switch
            field='strict'
            label={t('严格模式')}
            checkedText='|'
            uncheckedText='O'
            extraText={t(
              '开启后，规则命中但渠道池无可用渠道时直接拒绝；关闭则回退到原始选路。',
            )}
          />
        </Form>
      </Modal>
    </>
  );
}
