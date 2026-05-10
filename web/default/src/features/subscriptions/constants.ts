import { type TFunction } from 'i18next'

// ============================================================================
// Duration Unit Options
// ============================================================================

export const DURATION_UNITS = [
  { value: 'year', labelKey: 'years' },
  { value: 'month', labelKey: 'months' },
  { value: 'day', labelKey: 'days' },
  { value: 'hour', labelKey: 'hours' },
  { value: 'custom', labelKey: 'Custom (seconds)' },
] as const

export const RESET_PERIODS = [
  { value: 'never', labelKey: 'No Reset' },
  { value: 'daily', labelKey: 'Daily' },
  { value: 'weekly', labelKey: 'Weekly' },
  { value: 'monthly', labelKey: 'Monthly' },
  { value: 'custom', labelKey: 'Custom (seconds)' },
] as const

// ============================================================================
// Tier Period Options
// ============================================================================

export const TIER_PERIODS = [
  { value: 'monthly', labelKey: 'Monthly' },
  { value: 'weekly', labelKey: 'Weekly' },
  { value: 'daily', labelKey: 'Daily' },
  { value: 'hourly', labelKey: 'Hourly' },
  { value: 'custom', labelKey: 'Custom (seconds)' },
  { value: 'none', labelKey: 'No Reset (total cap)' },
] as const

export function getDurationUnitOptions(t: TFunction) {
  return DURATION_UNITS.map((u) => ({ value: u.value, label: t(u.labelKey) }))
}

export function getResetPeriodOptions(t: TFunction) {
  return RESET_PERIODS.map((p) => ({ value: p.value, label: t(p.labelKey) }))
}

export function getTierPeriodOptions(t: TFunction) {
  return TIER_PERIODS.map((p) => ({ value: p.value, label: t(p.labelKey) }))
}
