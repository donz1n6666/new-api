import { useEffect, useMemo, useState } from 'react'
import * as z from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Check, Code, Pencil, Plus, Table2, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { validateJsonString } from './utils'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

type ChannelRouteRule = {
  id: number
  name: string
  group_regex: string[]
  model_regex: string[]
  path_regex: string[]
  channel_ids: number[]
  strict: boolean
}

type ChannelRouteSettingsCardProps = {
  defaultValues: {
    enabled: boolean
    rules: string
  }
}

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
  channel_ids_text: z.string().min(1),
  strict: z.boolean(),
})

type ChannelRouteFormValues = z.infer<typeof routeSchema>
type RuleEditorValues = z.infer<typeof ruleEditorSchema>

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
  2
)

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
    if (!Number.isInteger(num) || num <= 0) {
      return null
    }
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

function parseRulesJson(value: string) {
  try {
    const parsed = JSON.parse(value || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.map((rule, index) => ({
      id: index,
      ...(rule || {}),
    })) as ChannelRouteRule[]
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
    setDialogOpen(true)
  }

  const openEditDialog = (rule: ChannelRouteRule) => {
    setEditingRule(rule)
    editorForm.reset(buildRuleEditorValues(rule))
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
    const channelIds = normalizeChannelIds(payload.channel_ids_text)
    if (!channelIds || channelIds.length === 0) {
      toast.error(t('Channel IDs must be positive integers'))
      return
    }

    const modelRegex = normalizeStringList(payload.model_regex_text)
    if (modelRegex.length === 0) {
      toast.error(t('Model regex is required'))
      return
    }

    const nextRule: ChannelRouteRule = {
      id: editingRule?.id ?? rules.length,
      name: payload.name.trim(),
      group_regex: normalizeStringList(payload.group_regex_text),
      model_regex: modelRegex,
      path_regex: normalizeStringList(payload.path_regex_text),
      channel_ids: channelIds,
      strict: payload.strict,
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
        title={t('Static Channel Route')}
        description={t(
          'Restrict candidate channels by group, model, and request path before normal weighted selection.'
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
                      {t('Enable Static Channel Route')}
                    </FormLabel>
                    <FormDescription>
                      {t(
                        'Useful when one model has multiple native-format channels and you want to constrain selection by request path.'
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
                      'Match order is group, model, then path. After a rule is hit, the system only selects channels from the configured pool.'
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
                                  {t('Channel Pool')}:
                                </span>{' '}
                                {(rule.channel_ids || [])
                                  .map((id) => `#${id}`)
                                  .join(', ') || '-'}
                              </div>
                            </div>
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
                        'Supported fields: name, group_regex, model_regex, path_regex, channel_ids, strict.'
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
          if (!open) {
            setEditingRule(null)
          }
        }}
      >
        <DialogContent className='max-w-3xl'>
          <DialogHeader>
            <DialogTitle>
              {editingRule ? t('Edit Rule') : t('Add Rule')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'Use regex patterns to match group, model, and request path, then constrain selection to the specified channel pool.'
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
                        <Textarea
                          rows={5}
                          placeholder='^default$'
                          {...field}
                        />
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
                    <FormLabel>{t('Channel Pool')}</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={4}
                        placeholder={'12\n34\n56'}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Enter channel IDs separated by new lines or commas.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
