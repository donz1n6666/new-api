import { useEffect, useMemo, useState } from 'react'
import * as z from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Check, Code, Pencil, Plus, Table2, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { validateJsonString } from './utils'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RouteTierCondition = {
  var: 'len' | 'p' | 'c'
  op: '<' | '<=' | '>' | '>='
  value: number
}

type RouteTier = {
  conditions: RouteTierCondition[]
  channel_ids: number[]
  label: string
}

type ChannelRouteRule = {
  id: number
  name: string
  group_regex: string[]
  model_regex: string[]
  path_regex: string[]
  channel_ids: number[]
  strict: boolean
  route_tiers?: RouteTier[]
}

type ChannelRouteSettingsCardProps = {
  defaultValues: {
    enabled: boolean
    rules: string
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VAR_OPTIONS: { value: RouteTierCondition['var']; label: string }[] = [
  { value: 'len', label: 'len (input length)' },
  { value: 'p', label: 'p (prompt tokens)' },
  { value: 'c', label: 'c (completion)' },
]
const OPS: RouteTierCondition['op'][] = ['<', '<=', '>', '>=']

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const routeSchema = z.object({
  enabled: z.boolean(),
  rules: z.string().superRefine((value, ctx) => {
    const result = validateJsonString(value, {
      predicate: (parsed) => Array.isArray(parsed),
      predicateMessage: 'Rules JSON must be an array',
    })
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message || 'Invalid JSON',
      })
    }
  }),
})

const ruleEditorSchema = z.object({
  name: z.string().min(1),
  group_regex_text: z.string().optional(),
  model_regex_text: z.string().min(1),
  path_regex_text: z.string().optional(),
  channel_ids_text: z.string().optional(),
  strict: z.boolean(),
})

type ChannelRouteFormValues = z.infer<typeof routeSchema>
type RuleEditorValues = z.infer<typeof ruleEditorSchema>

// ---------------------------------------------------------------------------
// Examples
// ---------------------------------------------------------------------------

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
      name: 'GPT-4o tiered routing',
      model_regex: ['^gpt-4o$'],
      channel_ids: [5, 6, 7, 8],
      route_tiers: [
        {
          label: 'short',
          conditions: [{ var: 'len', op: '<', value: 17000 }],
          channel_ids: [5, 6],
        },
        { label: 'long', conditions: [], channel_ids: [7, 8] },
      ],
      strict: false,
    },
  ],
  null,
  2
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTokenHint(value: number): string {
  if (!value || value <= 0) return ''
  if (value >= 1_000_000) return `= ${(value / 1_000_000).toFixed(1)}M tokens`
  if (value >= 1_000) return `= ${(value / 1_000).toFixed(0)}K tokens`
  return `= ${value} tokens`
}

function normalizeStringList(text?: string) {
  return (text || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeChannelIds(text?: string) {
  const tokens = (text || '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
  const values: number[] = []
  for (const token of tokens) {
    const num = Number(token)
    if (!Number.isInteger(num) || num <= 0) return null
    values.push(num)
  }
  return [...new Set(values)]
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function normalizeJson(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return '[]'
  try {
    return JSON.stringify(JSON.parse(trimmed))
  } catch {
    return trimmed
  }
}

function migrateOldFormat(rule: Record<string, unknown>): Record<string, unknown> {
  if (rule.route_tiers) return rule
  const threshold = rule.token_threshold as number | undefined
  const shortIds = rule.short_channel_ids as number[] | undefined
  const longIds = rule.long_channel_ids as number[] | undefined
  if (threshold && threshold > 0) {
    const tiers: RouteTier[] = []
    if (shortIds && shortIds.length > 0) {
      tiers.push({
        label: 'short',
        conditions: [{ var: 'len', op: '<', value: threshold }],
        channel_ids: shortIds,
      })
    }
    if (longIds && longIds.length > 0) {
      tiers.push({ label: 'long', conditions: [], channel_ids: longIds })
    }
    if (tiers.length > 0) rule.route_tiers = tiers
  }
  delete rule.token_threshold
  delete rule.short_channel_ids
  delete rule.long_channel_ids
  return rule
}

function parseRulesJson(value: string) {
  try {
    const parsed = JSON.parse(value || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.map((rule, index) => {
      const migrated = migrateOldFormat(rule || {})
      return { id: index, ...migrated }
    }) as ChannelRouteRule[]
  } catch {
    return []
  }
}

function rulesToJson(rules: ChannelRouteRule[]) {
  return formatJson(
    rules.map((rule) => {
      const { id, ...rest } = rule
      return rest
    })
  )
}

function emptyTier(): RouteTier {
  return { label: '', conditions: [], channel_ids: [] }
}

function buildRuleEditorValues(rule?: ChannelRouteRule): RuleEditorValues {
  return {
    name: rule?.name || '',
    group_regex_text: (rule?.group_regex || []).join('\n'),
    model_regex_text: (rule?.model_regex || []).join('\n'),
    path_regex_text: (rule?.path_regex || []).join('\n'),
    channel_ids_text: (rule?.channel_ids || []).join('\n'),
    strict: rule?.strict ?? true,
  }
}

// ---------------------------------------------------------------------------
// ConditionRow — reuses the same pattern as tiered-pricing-editor
// ---------------------------------------------------------------------------

function ConditionRow({
  condition,
  onChange,
  onRemove,
}: {
  condition: RouteTierCondition
  onChange: (next: RouteTierCondition) => void
  onRemove: () => void
}) {
  return (
    <div className='flex items-center gap-2'>
      <Select
        value={condition.var}
        onValueChange={(value) =>
          onChange({ ...condition, var: value as RouteTierCondition['var'] })
        }
      >
        <SelectTrigger className='w-32' size='sm'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VAR_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={condition.op}
        onValueChange={(value) =>
          onChange({ ...condition, op: value as RouteTierCondition['op'] })
        }
      >
        <SelectTrigger className='w-20' size='sm'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPS.map((op) => (
            <SelectItem key={op} value={op}>
              {op}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type='number'
        min={0}
        value={condition.value || ''}
        onChange={(e) =>
          onChange({ ...condition, value: Number(e.target.value) || 0 })
        }
        placeholder='tokens'
        className='h-8 w-32'
      />
      <span className='text-muted-foreground text-xs'>
        {formatTokenHint(condition.value)}
      </span>
      <Button
        variant='ghost'
        size='icon'
        onClick={onRemove}
        aria-label='remove'
        className='ml-auto'
      >
        <Trash2 className='text-destructive h-4 w-4' />
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// RouteTierCard — single tier with conditions + channel pool
// ---------------------------------------------------------------------------

function RouteTierCard({
  tier,
  index,
  total,
  onChange,
  onRemove,
  onAddCondition,
}: {
  tier: RouteTier
  index: number
  total: number
  onChange: (next: RouteTier) => void
  onRemove: () => void
  onAddCondition: () => void
}) {
  const { t } = useTranslation()
  const isCatchAll = tier.conditions.length === 0 && index === total - 1

  const handleConditionChange = (ci: number, next: RouteTierCondition) => {
    const conditions = [...tier.conditions]
    conditions[ci] = next
    onChange({ ...tier, conditions })
  }

  const handleConditionRemove = (ci: number) => {
    onChange({ ...tier, conditions: tier.conditions.filter((_, i) => i !== ci) })
  }

  const handleChannelIdsChange = (text: string) => {
    const ids = normalizeChannelIds(text)
    onChange({ ...tier, channel_ids: ids || [] })
  }

  return (
    <div className='bg-muted/30 space-y-3 rounded-md border p-3'>
      <div className='flex items-center justify-between gap-2'>
        <div className='flex items-center gap-2'>
          <Badge variant='outline'>
            {t('Tier')} {index + 1} / {total}
          </Badge>
          <Input
            value={tier.label}
            onChange={(e) => onChange({ ...tier, label: e.target.value })}
            placeholder={t('Tier name')}
            className='h-8 w-40'
          />
          {isCatchAll && (
            <Badge variant='secondary' className='text-xs'>
              {t('catch-all')}
            </Badge>
          )}
        </div>
        <Button
          variant='ghost'
          size='icon'
          onClick={onRemove}
          disabled={total <= 1}
          aria-label={t('Remove tier')}
        >
          <Trash2 className='text-destructive h-4 w-4' />
        </Button>
      </div>

      {!isCatchAll && (
        <div className='space-y-2'>
          <div className='flex items-center justify-between'>
            <Label className='text-xs'>{t('Conditions (AND)')}</Label>
            <Button
              variant='ghost'
              size='sm'
              onClick={onAddCondition}
              disabled={tier.conditions.length >= 2}
              className='h-7 px-2 text-xs'
            >
              <Plus className='mr-1 h-3 w-3' />
              {t('Add condition')}
            </Button>
          </div>
          {tier.conditions.length === 0 ? (
            <p className='text-muted-foreground text-xs'>
              {t('Always matches (default tier).')}
            </p>
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

      <div className='space-y-1'>
        <Label className='text-xs'>{t('Channel Pool')}</Label>
        <Textarea
          rows={2}
          value={(tier.channel_ids || []).join('\n')}
          onChange={(e) => handleChannelIdsChange(e.target.value)}
          placeholder='12\n34'
          className='text-sm'
        />
        <p className='text-muted-foreground text-xs'>
          {t('Channel IDs, one per line or comma-separated.')}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// RouteTierEditor — manages list of tier cards
// ---------------------------------------------------------------------------

function RouteTierEditor({
  tiers,
  onChange,
}: {
  tiers: RouteTier[]
  onChange: (next: RouteTier[]) => void
}) {
  const { t } = useTranslation()

  const handleTierChange = (index: number, next: RouteTier) => {
    const nextTiers = [...tiers]
    nextTiers[index] = next
    onChange(nextTiers)
  }

  const handleAddTier = () => {
    const nextTiers = [...tiers]
    // Give the previous catch-all a default condition when adding a new tier
    const lastIndex = nextTiers.length - 1
    if (lastIndex >= 0 && nextTiers[lastIndex].conditions.length === 0) {
      nextTiers[lastIndex] = {
        ...nextTiers[lastIndex],
        conditions: [{ var: 'len', op: '<', value: 200000 }],
      }
    }
    nextTiers.push(emptyTier())
    onChange(nextTiers)
  }

  const handleRemoveTier = (index: number) => {
    const nextTiers = tiers.filter((_, i) => i !== index)
    onChange(nextTiers.length > 0 ? nextTiers : [emptyTier()])
  }

  const handleAddCondition = (index: number) => {
    if (tiers[index].conditions.length >= 2) return
    const usedVars = new Set(tiers[index].conditions.map((c) => c.var))
    const nextVar: RouteTierCondition['var'] = usedVars.has('len') ? 'c' : 'len'
    const nextTiers = tiers.map((tier, i) =>
      i === index
        ? {
            ...tier,
            conditions: [...tier.conditions, { var: nextVar, op: '<', value: 200000 }],
          }
        : tier
    )
    onChange(nextTiers)
  }

  return (
    <div className='space-y-3'>
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
      <Button variant='outline' size='sm' onClick={handleAddTier}>
        <Plus className='mr-2 h-3 w-3' />
        {t('Add tier')}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ChannelRouteSettingsCard({
  defaultValues,
}: ChannelRouteSettingsCardProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [mode, setMode] = useState<'visual' | 'json'>('visual')
  const [rules, setRules] = useState<ChannelRouteRule[]>(() =>
    parseRulesJson(defaultValues.rules)
  )
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<ChannelRouteRule | null>(null)

  // Tier editor state (managed separately from the form)
  const [editingTiers, setEditingTiers] = useState<RouteTier[]>([])

  const form = useForm<ChannelRouteFormValues>({
    resolver: zodResolver(routeSchema),
    defaultValues: {
      enabled: defaultValues.enabled,
      rules: rulesToJson(parseRulesJson(defaultValues.rules)),
    },
  })

  const editorForm = useForm<RuleEditorValues>({
    resolver: zodResolver(ruleEditorSchema),
    defaultValues: buildRuleEditorValues(),
  })

  useEffect(() => {
    const parsed = parseRulesJson(defaultValues.rules)
    setRules(parsed)
    form.reset({
      enabled: defaultValues.enabled,
      rules: rulesToJson(parsed),
    })
  }, [defaultValues, form])

  const updateRulesState = (nextRules: ChannelRouteRule[]) => {
    const normalized = nextRules.map((rule, index) => ({
      ...rule,
      id: index,
    }))
    setRules(normalized)
    form.setValue('rules', rulesToJson(normalized), {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  const handleSwitchToVisual = () => {
    const validation = validateJsonString(form.getValues('rules'), {
      predicate: (parsed) => Array.isArray(parsed),
      predicateMessage: 'Rules JSON must be an array',
    })
    if (!validation.valid) {
      toast.error(t(validation.message || 'Rules JSON is invalid'))
      return
    }
    setRules(parseRulesJson(form.getValues('rules')))
    setMode('visual')
  }

  const handleSwitchToJson = () => {
    form.setValue('rules', rulesToJson(rules), {
      shouldDirty: true,
      shouldValidate: true,
    })
    setMode('json')
  }

  const openCreateDialog = () => {
    setEditingRule(null)
    editorForm.reset(buildRuleEditorValues())
    setEditingTiers([emptyTier()])
    setDialogOpen(true)
  }

  const openEditDialog = (rule: ChannelRouteRule) => {
    setEditingRule(rule)
    editorForm.reset(buildRuleEditorValues(rule))
    setEditingTiers(
      rule.route_tiers?.length
        ? rule.route_tiers.map((t) => ({
            ...t,
            conditions: t.conditions || [],
            channel_ids: t.channel_ids || [],
            label: t.label || '',
          }))
        : [emptyTier()]
    )
    setDialogOpen(true)
  }

  const handleDeleteRule = (id: number) => {
    updateRulesState(rules.filter((rule) => rule.id !== id))
    toast.success(t('Deleted successfully'))
  }

  const handleSaveRule = async () => {
    const values = await editorForm.trigger()
    if (!values) return

    const payload = editorForm.getValues()

    // Validate tiers first
    const validTiers = editingTiers.filter(
      (tier) => tier.channel_ids.length > 0
    )
    const hasTiers = validTiers.length > 0

    // Channel IDs are required only when no tiers are configured
    const channelIds = normalizeChannelIds(payload.channel_ids_text)
    if (!hasTiers && (!channelIds || channelIds.length === 0)) {
      toast.error(t('Channel IDs must be positive integers'))
      return
    }

    const modelRegex = normalizeStringList(payload.model_regex_text)
    if (modelRegex.length === 0) {
      toast.error(t('Model regex is required'))
      return
    }

    // Validate tiers
    const validTiers = editingTiers.filter(
      (tier) => tier.channel_ids.length > 0
    )
    // Check that at least one tier has a non-empty pool if tiers are configured
    if (editingTiers.length > 0 && validTiers.length === 0) {
      toast.error(t('At least one tier must have channel IDs'))
      return
    }

    const nextRule: ChannelRouteRule = {
      id: editingRule?.id ?? rules.length,
      name: payload.name.trim(),
      group_regex: normalizeStringList(payload.group_regex_text),
      model_regex: modelRegex,
      path_regex: normalizeStringList(payload.path_regex_text),
      channel_ids: channelIds || [],
      strict: payload.strict,
    }

    // Only include tiers if there are valid ones
    if (validTiers.length > 0) {
      nextRule.route_tiers = validTiers.map((tier) => ({
        label: tier.label,
        conditions: tier.conditions,
        channel_ids: tier.channel_ids,
      }))
    }

    if (editingRule) {
      updateRulesState(
        rules.map((rule) => (rule.id === editingRule.id ? nextRule : rule))
      )
    } else {
      updateRulesState([...rules, nextRule])
    }

    setDialogOpen(false)
    setEditingRule(null)
    toast.success(t('Saved successfully'))
  }

  const onSubmit = async (values: ChannelRouteFormValues) => {
    const normalizedRules = normalizeJson(values.rules)
    const normalizedDefaultRules = normalizeJson(defaultValues.rules || '[]')
    const updates: Array<{ key: string; value: string | boolean }> = []

    if (values.enabled !== defaultValues.enabled) {
      updates.push({
        key: 'channel_route_setting.enabled',
        value: values.enabled,
      })
    }

    if (normalizedRules !== normalizedDefaultRules) {
      updates.push({
        key: 'channel_route_setting.rules',
        value: normalizedRules,
      })
    }

    if (updates.length === 0) {
      toast.info(t('No changes to save'))
      return
    }

    for (const update of updates) {
      await updateOption.mutateAsync(update)
    }
  }

  const tableRows = useMemo(() => rules, [rules])

  return (
    <>
      <SettingsSection
        title={t('Channel Route')}
        description={t(
          'Route requests to specific channel pools based on group, model, path, and token conditions.'
        )}
      >
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className='space-y-6'
          >
            <FormField
              control={form.control}
              name='enabled'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                  <div className='space-y-0.5'>
                    <FormLabel className='text-base'>
                      {t('Enable Channel Route')}
                    </FormLabel>
                    <FormDescription>
                      {t(
                        'Route to specific channels by group, model, path, and optional token-based tiered conditions.'
                      )}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className='flex flex-wrap items-center gap-2'>
              <Button
                type='button'
                variant={mode === 'visual' ? 'default' : 'outline'}
                onClick={handleSwitchToVisual}
              >
                <Table2 className='mr-2 h-4 w-4' />
                {t('Visual Editor')}
              </Button>
              <Button
                type='button'
                variant={mode === 'json' ? 'default' : 'outline'}
                onClick={handleSwitchToJson}
              >
                <Code className='mr-2 h-4 w-4' />
                JSON
              </Button>
            </div>

            {mode === 'visual' ? (
              <div className='space-y-4'>
                <div className='flex flex-wrap items-center gap-3'>
                  <Button type='button' onClick={openCreateDialog}>
                    <Plus className='mr-2 h-4 w-4' />
                    {t('Add Rule')}
                  </Button>
                  <p className='text-sm text-muted-foreground'>
                    {t(
                      'Match order: group, model, path. Tiers are evaluated in order; first match wins.'
                    )}
                  </p>
                </div>

                {tableRows.length === 0 ? (
                  <div className='rounded-lg border border-dashed p-6 text-sm text-muted-foreground'>
                    {t('No rules configured')}
                  </div>
                ) : (
                  <div className='space-y-3 rounded-lg border'>
                    {tableRows.map((rule) => (
                      <div
                        key={rule.id}
                        className='border-b p-4 last:border-b-0'
                      >
                        <div className='flex items-start justify-between gap-4'>
                          <div className='space-y-2'>
                            <div className='flex items-center gap-2'>
                              <div className='font-medium'>
                                {rule.name || '-'}
                              </div>
                              <span className='rounded-full border px-2 py-0.5 text-xs text-muted-foreground'>
                                {rule.strict ? t('Strict') : t('Fallback Allowed')}
                              </span>
                            </div>
                            <div className='grid gap-2 text-sm text-muted-foreground md:grid-cols-2'>
                              <div>
                                <span className='font-medium text-foreground'>
                                  {t('Group Regex')}:
                                </span>{' '}
                                {(rule.group_regex || []).join(', ') || '-'}
                              </div>
                              <div>
                                <span className='font-medium text-foreground'>
                                  {t('Model Regex')}:
                                </span>{' '}
                                {(rule.model_regex || []).join(', ') || '-'}
                              </div>
                              <div>
                                <span className='font-medium text-foreground'>
                                  {t('Path Regex')}:
                                </span>{' '}
                                {(rule.path_regex || []).join(', ') || '-'}
                              </div>
                              <div>
                                <span className='font-medium text-foreground'>
                                  {t('Fallback Pool')}:
                                </span>{' '}
                                {(rule.channel_ids || [])
                                  .map((id) => `#${id}`)
                                  .join(', ') || '-'}
                              </div>
                            </div>
                            {rule.route_tiers && rule.route_tiers.length > 0 && (
                              <div className='mt-2 space-y-1'>
                                <div className='text-sm font-medium text-foreground'>
                                  {t('Route Tiers')}:
                                </div>
                                {rule.route_tiers.map((tier, i) => (
                                  <div
                                    key={i}
                                    className='flex items-center gap-2 text-sm text-muted-foreground'
                                  >
                                    <span className='rounded bg-muted px-1.5 py-0.5 text-xs font-medium'>
                                      {tier.label || `Tier ${i + 1}`}
                                    </span>
                                    {tier.conditions && tier.conditions.length > 0 && (
                                      <span>
                                        {tier.conditions
                                          .map(
                                            (c) =>
                                              `${c.var} ${c.op} ${c.value.toLocaleString()}`
                                          )
                                          .join(' AND ')}
                                      </span>
                                    )}
                                    {!tier.conditions?.length &&
                                      i === rule.route_tiers!.length - 1 && (
                                        <span className='text-xs italic'>
                                          {t('catch-all')}
                                        </span>
                                      )}
                                    <span className='text-muted-foreground'>
                                      →
                                    </span>
                                    <span>
                                      {tier.channel_ids
                                        .map((id) => `#${id}`)
                                        .join(', ')}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className='flex gap-2'>
                            <Button
                              type='button'
                              variant='outline'
                              size='icon'
                              onClick={() => openEditDialog(rule)}
                            >
                              <Pencil className='h-4 w-4' />
                            </Button>
                            <Button
                              type='button'
                              variant='outline'
                              size='icon'
                              onClick={() => handleDeleteRule(rule.id)}
                            >
                              <Trash2 className='h-4 w-4' />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <FormField
                control={form.control}
                name='rules'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Route Rules')}</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={18}
                        placeholder={rulesExample}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Fields: name, group_regex, model_regex, path_regex, channel_ids, strict, route_tiers.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <Button type='submit' disabled={updateOption.isPending}>
              {updateOption.isPending
                ? t('Saving...')
                : t('Save channel route settings')}
            </Button>
          </form>
        </Form>
      </SettingsSection>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditingRule(null)
        }}
      >
        <DialogContent className='max-w-3xl'>
          <DialogHeader>
            <DialogTitle>
              {editingRule ? t('Edit Rule') : t('Add Rule')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'Configure routing rules with optional tiered conditions based on token count.'
              )}
            </DialogDescription>
          </DialogHeader>

          <Form {...editorForm}>
            <div className='space-y-4'>
              <FormField
                control={editorForm.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Rule Name')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('e.g. qwen messages native')}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className='grid gap-4 md:grid-cols-3'>
                <FormField
                  control={editorForm.control}
                  name='group_regex_text'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Group Regex')}</FormLabel>
                      <FormControl>
                        <Textarea rows={5} placeholder='^default$' {...field} />
                      </FormControl>
                      <FormDescription>
                        {t('Optional. Leave empty to ignore user group.')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editorForm.control}
                  name='model_regex_text'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Model Regex')}</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={5}
                          placeholder='^Qwen3\\.5-35B-A3B$'
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        {t('Required. One regex per line.')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editorForm.control}
                  name='path_regex_text'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Path Regex')}</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={5}
                          placeholder='^/v1/messages$'
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        {t('Optional. Leave empty to ignore request path.')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={editorForm.control}
                name='channel_ids_text'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Fallback Channel Pool')}</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder={'12\n34\n56'}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Default pool used when no tier matches. Required when route tiers are not configured, optional otherwise.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Visual tier editor */}
              <div className='space-y-2'>
                <Label className='text-sm font-medium'>
                  {t('Route Tiers (Optional)')}
                </Label>
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'Each tier supports 0~2 conditions on len/p/c (AND logic). The last tier is the catch-all without conditions.'
                  )}
                </p>
                <RouteTierEditor
                  tiers={editingTiers}
                  onChange={setEditingTiers}
                />
              </div>

              <FormField
                control={editorForm.control}
                name='strict'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                    <div className='space-y-0.5'>
                      <FormLabel className='text-base'>
                        {t('Strict Mode')}
                      </FormLabel>
                      <FormDescription>
                        {t(
                          'When enabled, if a rule matches but all channels in the pool are unavailable, the request fails directly instead of falling back.'
                        )}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </Form>

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setDialogOpen(false)}
            >
              {t('Cancel')}
            </Button>
            <Button type='button' onClick={handleSaveRule}>
              <Check className='mr-2 h-4 w-4' />
              {t('Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
