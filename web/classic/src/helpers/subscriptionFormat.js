export function formatSubscriptionDuration(plan, t) {
  const unit = plan?.duration_unit || 'month';
  const value = plan?.duration_value || 1;
  const unitLabels = {
    year: t('年'),
    month: t('个月'),
    day: t('天'),
    hour: t('小时'),
    custom: t('自定义'),
  };
  if (unit === 'custom') {
    const seconds = plan?.custom_seconds || 0;
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)} ${t('天')}`;
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)} ${t('小时')}`;
    return `${seconds} ${t('秒')}`;
  }
  return `${value} ${unitLabels[unit] || unit}`;
}

export function formatSubscriptionResetPeriod(plan, t) {
  const period = plan?.quota_reset_period || 'never';
  if (period === 'never') return t('不重置');
  if (period === 'daily') return t('每天');
  if (period === 'weekly') return t('每周');
  if (period === 'monthly') return t('每月');
  if (period === 'custom') {
    const seconds = Number(plan?.quota_reset_custom_seconds || 0);
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)} ${t('天')}`;
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)} ${t('小时')}`;
    if (seconds >= 60) return `${Math.floor(seconds / 60)} ${t('分钟')}`;
    return `${seconds} ${t('秒')}`;
  }
  return t('不重置');
}

const TIER_PERIOD_LABELS = {
  monthly: '每月',
  weekly: '每周',
  daily: '每天',
  hourly: '每小时',
  custom: '自定义',
  none: '不重置',
};

export function formatQuotaTierPeriod(tier, t) {
  const label = TIER_PERIOD_LABELS[tier.period] || tier.period;
  if (tier.period === 'custom' && tier.custom_seconds > 0) {
    const seconds = tier.custom_seconds;
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)}${t('天')}`;
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)}${t('小时')}`;
    if (seconds >= 60) return `${Math.floor(seconds / 60)}${t('分钟')}`;
    return `${seconds}${t('秒')}`;
  }
  return t(label);
}

export function formatQuotaTierLimit(limit) {
  if (limit <= 0) return '∞';
  if (limit >= 1000000) return `${(limit / 1000000).toFixed(1)}M`;
  if (limit >= 1000) return `${(limit / 1000).toFixed(0)}k`;
  return String(limit);
}

export function formatTiersSummary(quotaTiers, t) {
  if (!quotaTiers || quotaTiers === '[]') return '';
  try {
    const tiers = JSON.parse(quotaTiers);
    if (!Array.isArray(tiers) || tiers.length === 0) return '';
    return tiers
      .filter((tier) => tier.limit > 0)
      .map((tier) => `${formatQuotaTierPeriod(tier, t)}: ${formatQuotaTierLimit(tier.limit)}`)
      .join(' | ');
  } catch {
    return '';
  }
}
