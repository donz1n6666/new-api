import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { resetModelRatios } from '../api'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import { GroupRatioForm } from './group-ratio-form'
import { ModelRatioForm } from './model-ratio-form'
import { ToolPriceSettings } from './tool-price-settings'
import { UpstreamRatioSync } from './upstream-ratio-sync'
import {
  formatJsonForTextarea,
  normalizeJsonString,
  validateJsonString,
} from './utils'

type GroupModelDefaults = {
  GroupModelPrice: string
  GroupModelRatio: string
  GroupCompletionRatio: string
  GroupCacheRatio: string
  GroupCreateCacheRatio: string
  GroupImageRatio: string
  GroupAudioRatio: string
  GroupAudioCompletionRatio: string
  GroupBillingMode: string
  GroupBillingExpr: string
}

const GROUP_MODEL_FIELD_MAP = {
  ModelPrice: 'GroupModelPrice',
  ModelRatio: 'GroupModelRatio',
  CacheRatio: 'GroupCacheRatio',
  CreateCacheRatio: 'GroupCreateCacheRatio',
  CompletionRatio: 'GroupCompletionRatio',
  ImageRatio: 'GroupImageRatio',
  AudioRatio: 'GroupAudioRatio',
  AudioCompletionRatio: 'GroupAudioCompletionRatio',
  BillingMode: 'GroupBillingMode',
  BillingExpr: 'GroupBillingExpr',
} as const

type GroupModelField = keyof typeof GROUP_MODEL_FIELD_MAP
type GroupModelOptionKey = (typeof GROUP_MODEL_FIELD_MAP)[GroupModelField]

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseFlatMap<T = unknown>(value: string): Record<string, T> {
  if (!value || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return isPlainObject(parsed) ? (parsed as Record<string, T>) : {}
  } catch {
    return {}
  }
}

function parseNestedMap<T = unknown>(
  value: string
): Record<string, Record<string, T>> {
  if (!value || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    if (!isPlainObject(parsed)) return {}
    const result: Record<string, Record<string, T>> = {}
    for (const [group, groupValue] of Object.entries(parsed)) {
      if (isPlainObject(groupValue)) {
        result[group] = groupValue as Record<string, T>
      }
    }
    return result
  } catch {
    return {}
  }
}

function stringifyLeafMap(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2)
}

function extractGroupEditorValue(
  rawValue: string,
  selectedGroup: string
): string {
  const groupMap = parseNestedMap(rawValue)
  return stringifyLeafMap(groupMap[selectedGroup] || {})
}

function buildModelFormDefaults(
  modelDefaults: ModelFormValues,
  groupModelDefaults: GroupModelDefaults,
  selectedGroup: string
): ModelFormValues {
  if (selectedGroup === 'global') {
    return {
      ...modelDefaults,
      ModelPrice: formatJsonForTextarea(modelDefaults.ModelPrice),
      ModelRatio: formatJsonForTextarea(modelDefaults.ModelRatio),
      CacheRatio: formatJsonForTextarea(modelDefaults.CacheRatio),
      CreateCacheRatio: formatJsonForTextarea(modelDefaults.CreateCacheRatio),
      CompletionRatio: formatJsonForTextarea(modelDefaults.CompletionRatio),
      ImageRatio: formatJsonForTextarea(modelDefaults.ImageRatio),
      AudioRatio: formatJsonForTextarea(modelDefaults.AudioRatio),
      AudioCompletionRatio: formatJsonForTextarea(
        modelDefaults.AudioCompletionRatio
      ),
      BillingMode: formatJsonForTextarea(modelDefaults.BillingMode),
      BillingExpr: formatJsonForTextarea(modelDefaults.BillingExpr),
    }
  }

  return {
    ModelPrice: formatJsonForTextarea(
      extractGroupEditorValue(groupModelDefaults.GroupModelPrice, selectedGroup)
    ),
    ModelRatio: formatJsonForTextarea(
      extractGroupEditorValue(groupModelDefaults.GroupModelRatio, selectedGroup)
    ),
    CacheRatio: formatJsonForTextarea(
      extractGroupEditorValue(groupModelDefaults.GroupCacheRatio, selectedGroup)
    ),
    CreateCacheRatio: formatJsonForTextarea(
      extractGroupEditorValue(
        groupModelDefaults.GroupCreateCacheRatio,
        selectedGroup
      )
    ),
    CompletionRatio: formatJsonForTextarea(
      extractGroupEditorValue(
        groupModelDefaults.GroupCompletionRatio,
        selectedGroup
      )
    ),
    ImageRatio: formatJsonForTextarea(
      extractGroupEditorValue(groupModelDefaults.GroupImageRatio, selectedGroup)
    ),
    AudioRatio: formatJsonForTextarea(
      extractGroupEditorValue(groupModelDefaults.GroupAudioRatio, selectedGroup)
    ),
    AudioCompletionRatio: formatJsonForTextarea(
      extractGroupEditorValue(
        groupModelDefaults.GroupAudioCompletionRatio,
        selectedGroup
      )
    ),
    ExposeRatioEnabled: modelDefaults.ExposeRatioEnabled,
    BillingMode: formatJsonForTextarea(
      extractGroupEditorValue(groupModelDefaults.GroupBillingMode, selectedGroup)
    ),
    BillingExpr: formatJsonForTextarea(
      extractGroupEditorValue(groupModelDefaults.GroupBillingExpr, selectedGroup)
    ),
  }
}

function buildDerivedGroupBillingMode(
  values: ModelFormValues
): Record<string, string> {
  const explicitModeMap = parseFlatMap<string>(values.BillingMode)
  const billingExprMap = parseFlatMap<string>(values.BillingExpr)
  const priceMap = parseFlatMap<number>(values.ModelPrice)
  const ratioMaps = [
    parseFlatMap<number>(values.ModelRatio),
    parseFlatMap<number>(values.CacheRatio),
    parseFlatMap<number>(values.CreateCacheRatio),
    parseFlatMap<number>(values.CompletionRatio),
    parseFlatMap<number>(values.ImageRatio),
    parseFlatMap<number>(values.AudioRatio),
    parseFlatMap<number>(values.AudioCompletionRatio),
  ]

  const modelNames = new Set<string>([
    ...Object.keys(explicitModeMap),
    ...Object.keys(billingExprMap),
    ...Object.keys(priceMap),
    ...ratioMaps.flatMap((item) => Object.keys(item)),
  ])

  const result: Record<string, string> = {}
  for (const modelName of modelNames) {
    if (billingExprMap[modelName]) {
      result[modelName] = 'tiered_expr'
      continue
    }
    const explicitMode = explicitModeMap[modelName]
    if (explicitMode === 'per-request' || explicitMode === 'per-token') {
      result[modelName] = explicitMode
      continue
    }
    if (modelName in priceMap) {
      result[modelName] = 'per-request'
      continue
    }
    result[modelName] = 'per-token'
  }
  return result
}

function mergeGroupModelDefaults(
  values: ModelFormValues,
  groupModelDefaults: GroupModelDefaults,
  selectedGroup: string
): GroupModelDefaults {
  const leafValues: Record<GroupModelOptionKey, Record<string, unknown>> = {
    GroupModelPrice: parseFlatMap(values.ModelPrice),
    GroupModelRatio: parseFlatMap(values.ModelRatio),
    GroupCacheRatio: parseFlatMap(values.CacheRatio),
    GroupCreateCacheRatio: parseFlatMap(values.CreateCacheRatio),
    GroupCompletionRatio: parseFlatMap(values.CompletionRatio),
    GroupImageRatio: parseFlatMap(values.ImageRatio),
    GroupAudioRatio: parseFlatMap(values.AudioRatio),
    GroupAudioCompletionRatio: parseFlatMap(values.AudioCompletionRatio),
    GroupBillingMode: buildDerivedGroupBillingMode(values),
    GroupBillingExpr: parseFlatMap(values.BillingExpr),
  }

  const result = {} as GroupModelDefaults

  for (const optionKey of Object.values(GROUP_MODEL_FIELD_MAP)) {
    const merged = parseNestedMap(groupModelDefaults[optionKey])
    const groupLeaf = leafValues[optionKey]
    if (Object.keys(groupLeaf).length === 0) {
      delete merged[selectedGroup]
    } else {
      merged[selectedGroup] = groupLeaf
    }
    result[optionKey] = JSON.stringify(merged, null, 2)
  }

  return result
}

const modelSchema = z.object({
  ModelPrice: z.string().superRefine((value, ctx) => {
    const result = validateJsonString(value)
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message || 'Invalid JSON',
      })
    }
  }),
  ModelRatio: z.string().superRefine((value, ctx) => {
    const result = validateJsonString(value)
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message || 'Invalid JSON',
      })
    }
  }),
  CacheRatio: z.string().superRefine((value, ctx) => {
    const result = validateJsonString(value)
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message || 'Invalid JSON',
      })
    }
  }),
  CreateCacheRatio: z.string().superRefine((value, ctx) => {
    const result = validateJsonString(value)
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message || 'Invalid JSON',
      })
    }
  }),
  CompletionRatio: z.string().superRefine((value, ctx) => {
    const result = validateJsonString(value)
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message || 'Invalid JSON',
      })
    }
  }),
  ImageRatio: z.string().superRefine((value, ctx) => {
    const result = validateJsonString(value)
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message || 'Invalid JSON',
      })
    }
  }),
  AudioRatio: z.string().superRefine((value, ctx) => {
    const result = validateJsonString(value)
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message || 'Invalid JSON',
      })
    }
  }),
  AudioCompletionRatio: z.string().superRefine((value, ctx) => {
    const result = validateJsonString(value)
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message || 'Invalid JSON',
      })
    }
  }),
  ExposeRatioEnabled: z.boolean(),
  BillingMode: z.string().superRefine((value, ctx) => {
    const result = validateJsonString(value)
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message || 'Invalid JSON',
      })
    }
  }),
  BillingExpr: z.string().superRefine((value, ctx) => {
    const result = validateJsonString(value)
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message || 'Invalid JSON',
      })
    }
  }),
})

const groupSchema = z.object({
  GroupRatio: z.string().superRefine((value, ctx) => {
    const result = validateJsonString(value)
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message || 'Invalid JSON',
      })
    }
  }),
  TopupGroupRatio: z.string().superRefine((value, ctx) => {
    const result = validateJsonString(value)
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message || 'Invalid JSON',
      })
    }
  }),
  UserUsableGroups: z.string().superRefine((value, ctx) => {
    const result = validateJsonString(value)
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message || 'Invalid JSON',
      })
    }
  }),
  GroupGroupRatio: z.string().superRefine((value, ctx) => {
    const result = validateJsonString(value)
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message || 'Invalid JSON',
      })
    }
  }),
  AutoGroups: z.string().superRefine((value, ctx) => {
    const result = validateJsonString(value, {
      predicate: (parsed) =>
        Array.isArray(parsed) &&
        parsed.every((item) => typeof item === 'string'),
      predicateMessage: 'Expected a JSON array of group identifiers',
    })
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message || 'Invalid JSON array',
      })
    }
  }),
  DefaultUseAutoGroup: z.boolean(),
  GroupSpecialUsableGroup: z.string().superRefine((value, ctx) => {
    const result = validateJsonString(value)
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message || 'Invalid JSON',
      })
    }
  }),
})

type ModelFormValues = z.infer<typeof modelSchema>
type GroupFormValues = z.infer<typeof groupSchema>

type RatioSettingsCardProps = {
  modelDefaults: ModelFormValues
  groupModelDefaults: GroupModelDefaults
  groupDefaults: GroupFormValues
  toolPricesDefault: string
}

export function RatioSettingsCard({
  modelDefaults,
  groupModelDefaults,
  groupDefaults,
  toolPricesDefault,
}: RatioSettingsCardProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState('global')

  // 从 GroupRatio 中提取可用的分组列表
  const availableGroups = useMemo(() => {
    try {
      const groupRatio = JSON.parse(groupDefaults.GroupRatio || '{}')
      return ['global', ...Object.keys(groupRatio)]
    } catch {
      return ['global']
    }
  }, [groupDefaults.GroupRatio])

  const resetMutation = useMutation({
    mutationFn: resetModelRatios,
    onSuccess: (data) => {
      if (data.success) {
        toast.success(t('Model ratios reset successfully'))
        queryClient.invalidateQueries({ queryKey: ['system-options'] })
        setConfirmOpen(false)
      } else {
        toast.error(data.message || t('Failed to reset model ratios'))
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || t('Failed to reset model ratios'))
    },
  })

  const groupNormalizedDefaults = useRef({
    GroupRatio: normalizeJsonString(groupDefaults.GroupRatio),
    TopupGroupRatio: normalizeJsonString(groupDefaults.TopupGroupRatio),
    UserUsableGroups: normalizeJsonString(groupDefaults.UserUsableGroups),
    GroupGroupRatio: normalizeJsonString(groupDefaults.GroupGroupRatio),
    AutoGroups: normalizeJsonString(groupDefaults.AutoGroups),
    DefaultUseAutoGroup: groupDefaults.DefaultUseAutoGroup,
    GroupSpecialUsableGroup: normalizeJsonString(
      groupDefaults.GroupSpecialUsableGroup
    ),
  })

  const modelForm = useForm<ModelFormValues>({
    resolver: zodResolver(modelSchema),
    mode: 'onChange',
    defaultValues: buildModelFormDefaults(
      modelDefaults,
      groupModelDefaults,
      selectedGroup
    ),
  })

  const groupForm = useForm<GroupFormValues>({
    resolver: zodResolver(groupSchema),
    mode: 'onChange',
    defaultValues: {
      ...groupDefaults,
      GroupRatio: formatJsonForTextarea(groupDefaults.GroupRatio),
      TopupGroupRatio: formatJsonForTextarea(groupDefaults.TopupGroupRatio),
      UserUsableGroups: formatJsonForTextarea(groupDefaults.UserUsableGroups),
      GroupGroupRatio: formatJsonForTextarea(groupDefaults.GroupGroupRatio),
      AutoGroups: formatJsonForTextarea(groupDefaults.AutoGroups),
      GroupSpecialUsableGroup: formatJsonForTextarea(
        groupDefaults.GroupSpecialUsableGroup
      ),
    },
  })

  useEffect(() => {
    modelForm.reset(
      buildModelFormDefaults(modelDefaults, groupModelDefaults, selectedGroup)
    )
  }, [modelDefaults, groupModelDefaults, modelForm, selectedGroup])

  useEffect(() => {
    groupNormalizedDefaults.current = {
      GroupRatio: normalizeJsonString(groupDefaults.GroupRatio),
      TopupGroupRatio: normalizeJsonString(groupDefaults.TopupGroupRatio),
      UserUsableGroups: normalizeJsonString(groupDefaults.UserUsableGroups),
      GroupGroupRatio: normalizeJsonString(groupDefaults.GroupGroupRatio),
      AutoGroups: normalizeJsonString(groupDefaults.AutoGroups),
      DefaultUseAutoGroup: groupDefaults.DefaultUseAutoGroup,
      GroupSpecialUsableGroup: normalizeJsonString(
        groupDefaults.GroupSpecialUsableGroup
      ),
    }

    groupForm.reset({
      ...groupDefaults,
      GroupRatio: formatJsonForTextarea(groupDefaults.GroupRatio),
      TopupGroupRatio: formatJsonForTextarea(groupDefaults.TopupGroupRatio),
      UserUsableGroups: formatJsonForTextarea(groupDefaults.UserUsableGroups),
      GroupGroupRatio: formatJsonForTextarea(groupDefaults.GroupGroupRatio),
      AutoGroups: formatJsonForTextarea(groupDefaults.AutoGroups),
      GroupSpecialUsableGroup: formatJsonForTextarea(
        groupDefaults.GroupSpecialUsableGroup
      ),
    })
  }, [groupDefaults, groupForm])

  const saveModelRatios = useCallback(
    async (values: ModelFormValues) => {
      if (selectedGroup === 'global') {
        const normalized = {
          ModelPrice: normalizeJsonString(values.ModelPrice),
          ModelRatio: normalizeJsonString(values.ModelRatio),
          CacheRatio: normalizeJsonString(values.CacheRatio),
          CreateCacheRatio: normalizeJsonString(values.CreateCacheRatio),
          CompletionRatio: normalizeJsonString(values.CompletionRatio),
          ImageRatio: normalizeJsonString(values.ImageRatio),
          AudioRatio: normalizeJsonString(values.AudioRatio),
          AudioCompletionRatio: normalizeJsonString(
            values.AudioCompletionRatio
          ),
          ExposeRatioEnabled: values.ExposeRatioEnabled,
          BillingMode: normalizeJsonString(values.BillingMode),
          BillingExpr: normalizeJsonString(values.BillingExpr),
        }

        const currentGlobal = {
          ModelPrice: normalizeJsonString(modelDefaults.ModelPrice),
          ModelRatio: normalizeJsonString(modelDefaults.ModelRatio),
          CacheRatio: normalizeJsonString(modelDefaults.CacheRatio),
          CreateCacheRatio: normalizeJsonString(modelDefaults.CreateCacheRatio),
          CompletionRatio: normalizeJsonString(modelDefaults.CompletionRatio),
          ImageRatio: normalizeJsonString(modelDefaults.ImageRatio),
          AudioRatio: normalizeJsonString(modelDefaults.AudioRatio),
          AudioCompletionRatio: normalizeJsonString(
            modelDefaults.AudioCompletionRatio
          ),
          ExposeRatioEnabled: modelDefaults.ExposeRatioEnabled,
          BillingMode: normalizeJsonString(modelDefaults.BillingMode),
          BillingExpr: normalizeJsonString(modelDefaults.BillingExpr),
        }

        const apiKeyMap: Record<string, string> = {
          BillingMode: 'billing_setting.billing_mode',
          BillingExpr: 'billing_setting.billing_expr',
        }

        const updates = (
          Object.keys(normalized) as Array<keyof ModelFormValues>
        ).filter((key) => normalized[key] !== currentGlobal[key])

        for (const key of updates) {
          const apiKey = apiKeyMap[key as string] || (key as string)
          await updateOption.mutateAsync({
            key: apiKey,
            value: normalized[key],
          })
        }
        return
      }

      const mergedGroupDefaults = mergeGroupModelDefaults(
        values,
        groupModelDefaults,
        selectedGroup
      )
      const currentGroupDefaults = {
        GroupModelPrice: normalizeJsonString(groupModelDefaults.GroupModelPrice),
        GroupModelRatio: normalizeJsonString(groupModelDefaults.GroupModelRatio),
        GroupCompletionRatio: normalizeJsonString(
          groupModelDefaults.GroupCompletionRatio
        ),
        GroupCacheRatio: normalizeJsonString(groupModelDefaults.GroupCacheRatio),
        GroupCreateCacheRatio: normalizeJsonString(
          groupModelDefaults.GroupCreateCacheRatio
        ),
        GroupImageRatio: normalizeJsonString(groupModelDefaults.GroupImageRatio),
        GroupAudioRatio: normalizeJsonString(groupModelDefaults.GroupAudioRatio),
        GroupAudioCompletionRatio: normalizeJsonString(
          groupModelDefaults.GroupAudioCompletionRatio
        ),
        GroupBillingMode: normalizeJsonString(
          groupModelDefaults.GroupBillingMode
        ),
        GroupBillingExpr: normalizeJsonString(
          groupModelDefaults.GroupBillingExpr
        ),
      }
      const nextGroupDefaults = {
        GroupModelPrice: normalizeJsonString(mergedGroupDefaults.GroupModelPrice),
        GroupModelRatio: normalizeJsonString(mergedGroupDefaults.GroupModelRatio),
        GroupCompletionRatio: normalizeJsonString(
          mergedGroupDefaults.GroupCompletionRatio
        ),
        GroupCacheRatio: normalizeJsonString(mergedGroupDefaults.GroupCacheRatio),
        GroupCreateCacheRatio: normalizeJsonString(
          mergedGroupDefaults.GroupCreateCacheRatio
        ),
        GroupImageRatio: normalizeJsonString(mergedGroupDefaults.GroupImageRatio),
        GroupAudioRatio: normalizeJsonString(mergedGroupDefaults.GroupAudioRatio),
        GroupAudioCompletionRatio: normalizeJsonString(
          mergedGroupDefaults.GroupAudioCompletionRatio
        ),
        GroupBillingMode: normalizeJsonString(
          mergedGroupDefaults.GroupBillingMode
        ),
        GroupBillingExpr: normalizeJsonString(
          mergedGroupDefaults.GroupBillingExpr
        ),
      }

      const groupUpdates = (
        Object.keys(nextGroupDefaults) as Array<keyof GroupModelDefaults>
      ).filter(
        (key) => nextGroupDefaults[key] !== currentGroupDefaults[key]
      )

      for (const key of groupUpdates) {
        await updateOption.mutateAsync({
          key,
          value: nextGroupDefaults[key],
        })
      }

      if (values.ExposeRatioEnabled !== modelDefaults.ExposeRatioEnabled) {
        await updateOption.mutateAsync({
          key: 'ExposeRatioEnabled',
          value: values.ExposeRatioEnabled,
        })
      }
    },
    [groupModelDefaults, modelDefaults, selectedGroup, updateOption]
  )

  const saveGroupRatios = useCallback(
    async (values: GroupFormValues) => {
      const normalized = {
        GroupRatio: normalizeJsonString(values.GroupRatio),
        TopupGroupRatio: normalizeJsonString(values.TopupGroupRatio),
        UserUsableGroups: normalizeJsonString(values.UserUsableGroups),
        GroupGroupRatio: normalizeJsonString(values.GroupGroupRatio),
        AutoGroups: normalizeJsonString(values.AutoGroups),
        DefaultUseAutoGroup: values.DefaultUseAutoGroup,
        GroupSpecialUsableGroup: normalizeJsonString(
          values.GroupSpecialUsableGroup
        ),
      }

      // Map form field names to API keys (most are 1:1, except GroupSpecialUsableGroup)
      const apiKeyMap: Record<string, string> = {
        GroupSpecialUsableGroup:
          'group_ratio_setting.group_special_usable_group',
      }

      const updates = (
        Object.keys(normalized) as Array<keyof typeof normalized>
      ).filter(
        (key) => normalized[key] !== groupNormalizedDefaults.current[key]
      )

      for (const key of updates) {
        const apiKey = apiKeyMap[key] || key
        await updateOption.mutateAsync({ key: apiKey, value: normalized[key] })
      }
    },
    [updateOption]
  )

  const handleResetRatios = useCallback(() => {
    setConfirmOpen(true)
  }, [])

  const { mutate: resetMutate } = resetMutation
  const handleConfirmReset = useCallback(() => {
    resetMutate()
  }, [resetMutate])

  return (
    <SettingsSection
      title={t('Pricing Ratios')}
      description={t(
        'Configure model, caching, and group ratios used for billing'
      )}
    >
      <Tabs defaultValue='models' className='space-y-6'>
        <TabsList className='grid w-full grid-cols-4'>
          <TabsTrigger value='models'>{t('Model ratios')}</TabsTrigger>
          <TabsTrigger value='groups'>{t('Group ratios')}</TabsTrigger>
          <TabsTrigger value='tool-prices'>{t('Tool prices')}</TabsTrigger>
          <TabsTrigger value='upstream-sync'>
            {t('Upstream price sync')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value='models'>
          <ModelRatioForm
            form={modelForm}
            onSave={saveModelRatios}
            onReset={handleResetRatios}
            isSaving={updateOption.isPending}
            isResetting={resetMutation.isPending}
            selectedGroup={selectedGroup}
            onGroupChange={setSelectedGroup}
            availableGroups={availableGroups}
            onSyncComplete={() => {
              queryClient.invalidateQueries({ queryKey: ['system-options'] })
            }}
          />
        </TabsContent>

        <TabsContent value='groups'>
          <GroupRatioForm
            form={groupForm}
            onSave={saveGroupRatios}
            isSaving={updateOption.isPending}
          />
        </TabsContent>

        <TabsContent value='tool-prices'>
          <ToolPriceSettings defaultValue={toolPricesDefault} />
        </TabsContent>

        <TabsContent value='upstream-sync'>
          <UpstreamRatioSync
            modelRatios={{
              ModelPrice: modelDefaults.ModelPrice,
              ModelRatio: modelDefaults.ModelRatio,
              CompletionRatio: modelDefaults.CompletionRatio,
              CacheRatio: modelDefaults.CacheRatio,
              CreateCacheRatio: modelDefaults.CreateCacheRatio,
              ImageRatio: modelDefaults.ImageRatio,
              AudioRatio: modelDefaults.AudioRatio,
              AudioCompletionRatio: modelDefaults.AudioCompletionRatio,
              'billing_setting.billing_mode': modelDefaults.BillingMode,
              'billing_setting.billing_expr': modelDefaults.BillingExpr,
            }}
          />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('Reset all model ratios?')}
        desc={t(
          'This will clear custom pricing ratios and revert to upstream defaults.'
        )}
        destructive
        isLoading={resetMutation.isPending}
        handleConfirm={handleConfirmReset}
        confirmText={t('Reset')}
      />
    </SettingsSection>
  )
}
