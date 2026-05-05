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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Banner,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
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
import {
  GroupSelector,
  ModelNameMatcher,
  PathSelector,
  ChannelSelector,
  useChannelNameMap,
} from '../../../components/common/ui/channel-route-selectors';

const { Text, Title } = Typography;

const KEY_ENABLED = 'channel_route_setting.enabled';
const KEY_RULES = 'channel_route_setting.rules';

const defaultInputs = {
  [KEY_ENABLED]: false,
  [KEY_RULES]: '[]',
};

const CONDITION_VARS = [
  { value: 'len', label: 'len (输入长度)' },
  { value: 'p', label: 'p (prompt)' },
  { value: 'c', label: 'c (completion)' },
];
const CONDITION_OPS = ['<', '<=', '>', '>='];

const formatTokenHint = (value) => {
  if (!value || value <= 0) return '';
  if (value >= 1_000_000) return `= ${(value / 1_000_000).toFixed(1)}M tokens`;
  if (value >= 1_000) return `= ${(value / 1_000).toFixed(0)}K tokens`;
  return `= ${value} tokens`;
};

const formatTokenShort = (value) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
};

const autoTierLabel = (conditions) => {
  if (!conditions || conditions.length === 0) return '';
  return conditions.map((c) => `${c.var} ${c.op} ${formatTokenShort(c.value)}`).join(' AND ');
};

const validateTiers = (tiers) => {
  const warnings = [];
  if (tiers.length <= 1) return warnings;
  for (let i = 0; i < tiers.length - 1; i++) {
    if (tiers[i].conditions.length === 0) {
      warnings.push(`档位 ${i + 1} 无条件（兜底）但不是最后一档，会阻塞后续档位。`);
    }
  }
  for (let i = 1; i < tiers.length; i++) {
    const tier = tiers[i];
    if (tier.conditions.length === 0) continue;
    for (const cond of tier.conditions) {
      for (let j = 0; j < i; j++) {
        const prevTier = tiers[j];
        if (prevTier.conditions.length === 0) continue;
        for (const prevCond of prevTier.conditions) {
          if (prevCond.var !== cond.var) continue;
          if (prevCond.op === '<' && cond.op === '<' && cond.value <= prevCond.value) {
            warnings.push(`档位 ${i + 1} "${cond.var} < ${formatTokenShort(cond.value)}" 已被档位 ${j + 1} "${prevCond.var} < ${formatTokenShort(prevCond.value)}" 覆盖。`);
          }
          if (prevCond.op === '<=' && cond.op === '<=' && cond.value <= prevCond.value) {
            warnings.push(`档位 ${i + 1} "${cond.var} <= ${formatTokenShort(cond.value)}" 已被档位 ${j + 1} "${prevCond.var} <= ${formatTokenShort(prevCond.value)}" 覆盖。`);
          }
          if (prevCond.op === '>=' && cond.op === '>=' && cond.value <= prevCond.value) {
            warnings.push(`档位 ${i + 1} "${cond.var} >= ${formatTokenShort(cond.value)}" 已被档位 ${j + 1} "${prevCond.var} >= ${formatTokenShort(prevCond.value)}" 覆盖。`);
          }
          if (prevCond.op === '>' && cond.op === '>' && cond.value <= prevCond.value) {
            warnings.push(`档位 ${i + 1} "${cond.var} > ${formatTokenShort(cond.value)}" 已被档位 ${j + 1} "${prevCond.var} > ${formatTokenShort(prevCond.value)}" 覆盖。`);
          }
          if (prevCond.op === '<' && cond.op === '>=' && cond.value < prevCond.value) {
            warnings.push(`档位 ${i + 1} "${cond.var} >= ${formatTokenShort(cond.value)}" 与档位 ${j + 1} "${prevCond.var} < ${formatTokenShort(prevCond.value)}" 重叠。`);
          }
          if (prevCond.op === '<=' && cond.op === '>' && cond.value < prevCond.value) {
            warnings.push(`档位 ${i + 1} "${cond.var} > ${formatTokenShort(cond.value)}" 与档位 ${j + 1} "${prevCond.var} <= ${formatTokenShort(prevCond.value)}" 重叠。`);
          }
          if (prevCond.op === '>=' && cond.op === '<' && cond.value > prevCond.value) {
            warnings.push(`档位 ${i + 1} "${cond.var} < ${formatTokenShort(cond.value)}" 与档位 ${j + 1} "${prevCond.var} >= ${formatTokenShort(prevCond.value)}" 重叠。`);
          }
          if (prevCond.op === '>' && cond.op === '<=' && cond.value > prevCond.value) {
            warnings.push(`档位 ${i + 1} "${cond.var} <= ${formatTokenShort(cond.value)}" 与档位 ${j + 1} "${prevCond.var} > ${formatTokenShort(prevCond.value)}" 重叠。`);
          }
        }
      }
    }
  }
  return warnings;
};

const emptyTier = () => ({ label: '', conditions: [], channel_ids: [] });

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
      name: 'GPT-4o 多档位渠道路由',
      model_regex: ['^gpt-4o$'],
      channel_ids: [5, 6, 7, 8],
      route_tiers: [
        {
          label: '短请求',
          conditions: [{ var: 'len', op: '<', value: 17000 }],
          channel_ids: [5, 6],
        },
        { label: '长请求', conditions: [], channel_ids: [7, 8] },
      ],
      strict: false,
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

const channelIdsToText = (ids) => (ids || []).join('\n');

const stringifyPretty = (value) => JSON.stringify(value, null, 2);
const stringifyCompact = (value) => JSON.stringify(value);

const migrateOldFormat = (rule) => {
  if (rule.route_tiers) return rule;
  const threshold = rule.token_threshold;
  const shortIds = rule.short_channel_ids;
  const longIds = rule.long_channel_ids;
  if (threshold && threshold > 0) {
    const tiers = [];
    if (shortIds && shortIds.length > 0) {
      tiers.push({
        label: '短请求',
        conditions: [{ var: 'len', op: '<', value: threshold }],
        channel_ids: shortIds,
      });
    }
    if (longIds && longIds.length > 0) {
      tiers.push({ label: '长请求', conditions: [], channel_ids: longIds });
    }
    if (tiers.length > 0) rule.route_tiers = tiers;
  }
  delete rule.token_threshold;
  delete rule.short_channel_ids;
  delete rule.long_channel_ids;
  return rule;
};

const parseRulesJson = (jsonString) => {
  try {
    const parsed = JSON.parse(jsonString || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map((rule, index) => ({
      id: index,
      ...migrateOldFormat(rule || {}),
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

// ---------------------------------------------------------------------------
// Visual Condition Row (Semi Design)
// ---------------------------------------------------------------------------

function ConditionRow({ condition, onChange, onRemove }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <Select
        value={condition.var}
        onChange={(value) => onChange({ ...condition, var: value })}
        style={{ width: 140 }}
        size='small'
      >
        {CONDITION_VARS.map((opt) => (
          <Select.Option key={opt.value} value={opt.value}>
            {opt.label}
          </Select.Option>
        ))}
      </Select>
      <Select
        value={condition.op}
        onChange={(value) => onChange({ ...condition, op: value })}
        style={{ width: 80 }}
        size='small'
      >
        {CONDITION_OPS.map((op) => (
          <Select.Option key={op} value={op}>
            {op}
          </Select.Option>
        ))}
      </Select>
      <InputNumber
        value={condition.value}
        onChange={(value) => onChange({ ...condition, value: value || 0 })}
        min={0}
        placeholder='tokens'
        style={{ width: 120 }}
        size='small'
      />
      <Text type='tertiary' size='small'>
        {formatTokenHint(condition.value)}
      </Text>
      <Button
        icon={<IconDelete />}
        theme='borderless'
        type='danger'
        size='small'
        onClick={onRemove}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visual Tier Card (Semi Design)
// ---------------------------------------------------------------------------

function RouteTierCard({ tier, index, total, onChange, onRemove, onAddCondition }) {
  const { t } = useTranslation();
  const isCatchAll = tier.conditions.length === 0 && index === total - 1;

  const handleConditionChange = (ci, next) => {
    const conditions = [...tier.conditions];
    conditions[ci] = next;
    onChange({ ...tier, conditions });
  };

  const handleConditionRemove = (ci) => {
    onChange({ ...tier, conditions: tier.conditions.filter((_, i) => i !== ci) });
  };

  const handleChannelIdsChange = (text) => {
    const ids = normalizeChannelIds(text);
    onChange({ ...tier, channel_ids: ids || [] });
  };

  return (
    <Card
      style={{ marginBottom: 12 }}
      bodyStyle={{ padding: 12 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Space>
          <Tag color='blue'>{t('档位')} {index + 1}/{total}</Tag>
          <Input
            value={tier.label}
            onChange={(value) => onChange({ ...tier, label: value })}
            placeholder={autoTierLabel(tier.conditions) || t('档位名称')}
            size='small'
            style={{ width: 140 }}
          />
          {!tier.label && autoTierLabel(tier.conditions) && (
            <Text type='tertiary' size='small'>{autoTierLabel(tier.conditions)}</Text>
          )}
          {isCatchAll && <Tag color='green'>{t('兜底')}</Tag>}
        </Space>
        <Button
          icon={<IconDelete />}
          theme='borderless'
          type='danger'
          size='small'
          onClick={onRemove}
          disabled={total <= 1}
        />
      </div>

      {!isCatchAll && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text size='small' strong>{t('条件 (AND)')}</Text>
            <Button
              icon={<IconPlus />}
              theme='borderless'
              size='small'
              onClick={onAddCondition}
              disabled={tier.conditions.length >= 2}
            >
              {t('添加条件')}
            </Button>
          </div>
          {tier.conditions.length === 0 ? (
            <Text type='tertiary' size='small'>{t('始终匹配（默认档位）')}</Text>
          ) : (
            tier.conditions.map((cond, ci) => (
              <ConditionRow
                key={ci}
                condition={cond}
                onChange={(next) => handleConditionChange(ci, next)}
                onRemove={() => handleConditionRemove(ci)}
              />
            ))
          )}
        </div>
      )}

      <div>
        <ChannelSelector
          value={channelIdsToText(tier.channel_ids)}
          onChange={(text) => handleChannelIdsChange(text)}
          compact
        />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Visual Tier Editor (Semi Design)
// ---------------------------------------------------------------------------

function RouteTierEditor({ tiers, onChange }) {
  const { t } = useTranslation();

  const handleTierChange = useCallback((index, next) => {
    const nextTiers = [...tiers];
    nextTiers[index] = next;
    onChange(nextTiers);
  }, [tiers, onChange]);

  const handleAddTier = useCallback(() => {
    const nextTiers = [...tiers];
    const lastIndex = nextTiers.length - 1;
    if (lastIndex >= 0 && nextTiers[lastIndex].conditions.length === 0) {
      nextTiers[lastIndex] = {
        ...nextTiers[lastIndex],
        conditions: [{ var: 'len', op: '<', value: 200000 }],
      };
    }
    nextTiers.push(emptyTier());
    onChange(nextTiers);
  }, [tiers, onChange]);

  const handleRemoveTier = useCallback((index) => {
    const nextTiers = tiers.filter((_, i) => i !== index);
    onChange(nextTiers.length > 0 ? nextTiers : [emptyTier()]);
  }, [tiers, onChange]);

  const handleAddCondition = useCallback((index) => {
    if (tiers[index].conditions.length >= 2) return;
    const usedVars = new Set(tiers[index].conditions.map((c) => c.var));
    const nextVar = usedVars.has('len') ? 'c' : 'len';
    const nextTiers = tiers.map((tier, i) =>
      i === index
        ? { ...tier, conditions: [...tier.conditions, { var: nextVar, op: '<', value: 200000 }] }
        : tier,
    );
    onChange(nextTiers);
  }, [tiers, onChange]);

  return (
    <div>
      {tiers.map((tier, index) => (
        <RouteTierCard
          key={index}
          tier={tier}
          index={index}
          total={tiers.length}
          onChange={(next) => handleTierChange(index, next)}
          onRemove={() => handleRemoveTier(index)}
          onAddCondition={() => handleAddCondition(index)}
        />
      ))}
      <Button
        icon={<IconPlus />}
        onClick={handleAddTier}
        style={{ marginTop: 4 }}
      >
        {t('添加档位')}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

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
  const [editingTiers, setEditingTiers] = useState([emptyTier()]);
  // Selector values (managed outside the form)
  const [selectorGroupRegex, setSelectorGroupRegex] = useState('');
  const [selectorModelRegex, setSelectorModelRegex] = useState('');
  const [selectorPathRegex, setSelectorPathRegex] = useState('');
  const [selectorChannelIds, setSelectorChannelIds] = useState('');
  const refForm = useRef();
  const modalFormRef = useRef();

  const getChannelName = useChannelNameMap();

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
        title: t('兜底渠道池'),
        dataIndex: 'channel_ids',
        render: (list) =>
          (list || []).length > 0
            ? (list || []).map((item) => (
                <Tag key={item} color='orange' style={{ marginRight: 4 }}>
                  {getChannelName(item)}
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
        title: t('渠道路由档位'),
        render: (_, record) =>
          record.route_tiers && record.route_tiers.length > 0 ? (
            <Space vertical align='start' spacing={2}>
              {record.route_tiers.map((tier, i) => (
                <Space key={i} spacing={4}>
                  <Tag color='blue' size='small'>
                    {tier.label || autoTierLabel(tier.conditions || []) || `Tier ${i + 1}`}
                  </Tag>
                  {tier.conditions?.length > 0 && (
                    <Text size='small' type='tertiary'>
                      {tier.conditions.map((c) => `${c.var} ${c.op} ${Number(c.value).toLocaleString()}`).join(' AND ')}
                    </Text>
                  )}
                  {!tier.conditions?.length && i === record.route_tiers.length - 1 && (
                    <Text size='small' type='tertiary' style={{ fontStyle: 'italic' }}>{t('兜底')}</Text>
                  )}
                  <Text size='small'>→</Text>
                  <Text size='small'>
                    {(tier.channel_ids || []).map((id) => getChannelName(id)).join(', ')}
                  </Text>
                </Space>
              ))}
            </Space>
          ) : (
            <Text type='tertiary'>-</Text>
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
    [t, getChannelName],
  );

  const updateRulesState = (nextRules) => {
    const normalizedRules = (nextRules || []).map((rule, index) => ({
      ...(rule || {}),
      id: index,
    }));
    const jsonString = rulesToJson(normalizedRules);
    setRules(normalizedRules);
    setInputs((prev) => ({ ...prev, [KEY_RULES]: jsonString }));
    if (refForm.current) {
      refForm.current.setValue(KEY_RULES, jsonString);
    }
  };

  const openAddModal = () => {
    const nextRule = {
      name: '', group_regex: [], model_regex: [], path_regex: [],
      channel_ids: [], strict: true,
    };
    setEditingRule(nextRule);
    setIsEdit(false);
    setEditingTiers([emptyTier()]);
    setSelectorGroupRegex('');
    setSelectorModelRegex('');
    setSelectorPathRegex('');
    setSelectorChannelIds('');
    setModalVisible(true);
  };

  const handleEditRule = (rule) => {
    const nextRule = { ...(rule || {}) };
    setEditingRule(nextRule);
    setIsEdit(true);
    setSelectorGroupRegex((nextRule.group_regex || []).join('\n'));
    setSelectorModelRegex((nextRule.model_regex || []).join('\n'));
    setSelectorPathRegex((nextRule.path_regex || []).join('\n'));
    setSelectorChannelIds((nextRule.channel_ids || []).join('\n'));
    setEditingTiers(
      nextRule.route_tiers?.length
        ? nextRule.route_tiers.map((t) => ({
            ...t,
            conditions: t.conditions || [],
            channel_ids: t.channel_ids || [],
            label: t.label || '',
          }))
        : [emptyTier()],
    );
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
      const modelRegex = normalizeStringList(selectorModelRegex);
      if (modelRegex.length === 0) {
        return showError(t('模型正则不能为空'));
      }

      // Validate tiers first
      const validTiers = editingTiers.filter((tier) => tier.channel_ids.length > 0);
      const hasTiers = validTiers.length > 0;
      if (editingTiers.length > 0 && !hasTiers) {
        return showError(t('至少一个档位必须填写渠道 ID'));
      }

      // Channel IDs are required only when no tiers are configured
      const channelIds = normalizeChannelIds(selectorChannelIds);
      if (!hasTiers && (!channelIds || channelIds.length === 0)) {
        return showError(t('渠道 ID 必须是正整数，支持换行或逗号分隔'));
      }

      // Validate tier configuration (overlaps, dead tiers, catch-all position)
      if (validTiers.length > 1) {
        const warnings = validateTiers(validTiers);
        if (warnings.length > 0) {
          return showError(warnings[0]);
        }
      }

      // Auto-generate labels for tiers without labels
      const tiersWithLabels = validTiers.map((tier) => ({
        label: tier.label || autoTierLabel(tier.conditions),
        conditions: tier.conditions,
        channel_ids: tier.channel_ids,
      }));

      const rulePayload = {
        id: isEdit ? editingRule?.id : rules.length,
        name: (values.name || '').trim(),
        group_regex: normalizeStringList(selectorGroupRegex),
        model_regex: modelRegex,
        path_regex: normalizeStringList(selectorPathRegex),
        channel_ids: channelIds || [],
        strict: !!values.strict,
      };
      if (!rulePayload.name) {
        return showError(t('名称不能为空'));
      }
      if (tiersWithLabels.length > 0) {
        rulePayload.route_tiers = tiersWithLabels;
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
    setInputs((prev) => ({ ...prev, [KEY_RULES]: jsonString }));
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
      if (item.key === KEY_RULES) value = compactRules;
      return API.put('/api/option/', { key: item.key, value: String(value) });
    });
    setLoading(true);
    Promise.all(requestQueue)
      .then((res) => {
        if (requestQueue.length === 1) {
          if (res.includes(undefined)) return;
        } else if (requestQueue.length > 1) {
          if (res.includes(undefined)) return showError(t('部分保存失败，请重试'));
        }
        showSuccess(t('保存成功'));
        props.refresh();
      })
      .catch(() => showError(t('保存失败，请重试')))
      .finally(() => setLoading(false));
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
    if (refForm.current) refForm.current.setValues(currentInputs);
  }, [props.options]);

  useEffect(() => {
    if (editMode === 'visual') setRules(parseRulesJson(inputs[KEY_RULES]));
  }, [editMode, inputs]);

  return (
    <>
      <Spin spinning={loading}>
        <Form
          values={inputs}
          getFormApi={(formAPI) => (refForm.current = formAPI)}
          style={{ marginBottom: 15 }}
        >
          <Form.Section text={t('渠道路由')}>
            <Banner
              type='info'
              fullMode={false}
              description={t(
                '根据分组、模型、请求路径和 Token 条件智能选择渠道池。支持多档位条件匹配，未配置时对现有行为无影响。',
              )}
            />
            <Divider style={{ marginTop: 12, marginBottom: 12 }} />
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Switch
                  field={KEY_ENABLED}
                  label={t('启用渠道路由')}
                  checkedText='|'
                  uncheckedText='O'
                  onChange={(value) => setInputs({ ...inputs, [KEY_ENABLED]: value })}
                  extraText={t('按分组、模型、路径和 Token 条件将请求路由到指定渠道池。')}
                />
              </Col>
            </Row>

            <Row style={{ marginTop: 12, marginBottom: 12 }}>
              <Space>
                <Button type={editMode === 'visual' ? 'primary' : 'tertiary'} onClick={switchToVisualMode}>
                  {t('可视化编辑')}
                </Button>
                <Button type={editMode === 'json' ? 'primary' : 'tertiary'} onClick={switchToJsonMode}>
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
                      {t('匹配顺序为分组、模型、路径。档位按顺序评估，首个匹配的档位生效。')}
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
                    rules={[{ validator: (rule, value) => verifyJSON(value || '[]'), message: t('不是合法的 JSON 字符串') }]}
                    extraText={t('字段支持：name、group_regex、model_regex、path_regex、channel_ids、strict、route_tiers。')}
                    onChange={(value) => setInputs({ ...inputs, [KEY_RULES]: value })}
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
        onCancel={() => { setModalVisible(false); setEditingRule(null); }}
        onOk={handleModalSave}
        width={800}
      >
        <Form
          key={isEdit ? `edit-${editingRule?.id}` : 'add'}
          initValues={
            editingRule
              ? {
                  name: editingRule.name || '',
                  group_regex_text: (editingRule.group_regex || []).join('\n'),
                  model_regex_text: (editingRule.model_regex || []).join('\n'),
                  path_regex_text: (editingRule.path_regex || []).join('\n'),
                  channel_ids_text: (editingRule.channel_ids || []).join('\n'),
                  strict: editingRule.strict ?? true,
                }
              : {}
          }
          getFormApi={(formAPI) => (modalFormRef.current = formAPI)}
          labelPosition='top'
        >
          <Form.Input
            field='name'
            label={t('规则名称')}
            placeholder={t('例如：qwen messages native')}
            rules={[{ required: true, message: t('名称不能为空') }]}
          />
          <div style={{ marginBottom: 12 }}>
            <Text size='small' strong style={{ display: 'block', marginBottom: 4 }}>{t('分组匹配')}</Text>
            <GroupSelector
              value={selectorGroupRegex}
              onChange={setSelectorGroupRegex}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <Text size='small' strong style={{ display: 'block', marginBottom: 4 }}>{t('模型匹配')} *</Text>
            <ModelNameMatcher
              value={selectorModelRegex}
              onChange={setSelectorModelRegex}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <Text size='small' strong style={{ display: 'block', marginBottom: 4 }}>{t('路径匹配')}</Text>
            <PathSelector
              value={selectorPathRegex}
              onChange={setSelectorPathRegex}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <Text size='small' strong style={{ display: 'block', marginBottom: 4 }}>{t('兜底渠道池')}</Text>
            <ChannelSelector
              value={selectorChannelIds}
              onChange={setSelectorChannelIds}
            />
          </div>

          {/* Visual Tier Editor */}
          <div style={{ marginBottom: 12 }}>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>{t('渠道路由档位（可选）')}</Text>
            <Text type='tertiary' size='small' style={{ display: 'block', marginBottom: 8 }}>
              {t('每个档位可设置 0~2 个条件（对 len/p/c，AND 关系），最后一档为兜底无需条件。档位按顺序评估，首个匹配生效。')}
            </Text>
            <RouteTierEditor tiers={editingTiers} onChange={setEditingTiers} />
          </div>

          <Form.Switch
            field='strict'
            label={t('严格模式')}
            checkedText='|'
            uncheckedText='O'
            extraText={t('开启后，规则命中但渠道池无可用渠道时直接拒绝；关闭则回退到原始选路。')}
          />
        </Form>
      </Modal>
    </>
  );
}
