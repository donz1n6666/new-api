import { z } from 'zod'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'
import { quotaUnitsToDollars } from '@/lib/format'
import { QuotaAmountFieldPair } from '../components/quota-amount-field-pair'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const schema = z.object({
  enabled: z.boolean(),
  minQuota: z.coerce.number().int().min(0),
  minQuotaAmount: z.coerce.number().min(0),
  maxQuota: z.coerce.number().int().min(0),
  maxQuotaAmount: z.coerce.number().min(0),
})

type Values = z.infer<typeof schema>

export function CheckinSettingsSection({
  defaultValues,
}: {
  defaultValues: {
    enabled: boolean
    minQuota: number
    maxQuota: number
  }
}) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const form = useForm<Values>({
    resolver: zodResolver(schema) as unknown as Resolver<Values>,
    defaultValues: {
      enabled: defaultValues.enabled,
      minQuota: defaultValues.minQuota,
      minQuotaAmount: Number(
        quotaUnitsToDollars(defaultValues.minQuota).toFixed(6)
      ),
      maxQuota: defaultValues.maxQuota,
      maxQuotaAmount: Number(
        quotaUnitsToDollars(defaultValues.maxQuota).toFixed(6)
      ),
    },
  })

  const { isDirty, isSubmitting } = form.formState
  const enabled = form.watch('enabled')

  async function onSubmit(values: Values) {
    const updates: Array<{ key: string; value: string }> = []

    if (values.enabled !== defaultValues.enabled) {
      updates.push({
        key: 'checkin_setting.enabled',
        value: String(values.enabled),
      })
    }

    if (values.minQuota !== defaultValues.minQuota) {
      updates.push({
        key: 'checkin_setting.min_quota',
        value: String(values.minQuota),
      })
    }

    if (values.maxQuota !== defaultValues.maxQuota) {
      updates.push({
        key: 'checkin_setting.max_quota',
        value: String(values.maxQuota),
      })
    }

    if (updates.length === 0) {
      toast.info(t('No changes to save'))
      return
    }

    for (const update of updates) {
      await updateOption.mutateAsync(update)
    }

    form.reset(values)
  }

  return (
    <SettingsSection
      title={t('Check-in Settings')}
      description={t('Configure daily check-in rewards for users')}
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          autoComplete='off'
          className='space-y-6'
        >
          <FormField
            control={form.control}
            name='enabled'
            render={({ field }) => (
              <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                <div className='space-y-0.5'>
                  <FormLabel className='text-base'>
                    {t('Enable check-in feature')}
                  </FormLabel>
                  <FormDescription>
                    {t(
                      'Allow users to check in daily for random quota rewards'
                    )}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={updateOption.isPending || isSubmitting}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          {enabled && (
            <div className='space-y-6'>
              <QuotaAmountFieldPair
                form={form}
                amountName='minQuotaAmount'
                quotaName='minQuota'
                amountLabel={t('Minimum check-in amount')}
                quotaLabel={t('Minimum check-in quota')}
                amountDescription={t('Minimum balance awarded for check-in')}
                quotaDescription={t('Minimum quota amount awarded for check-in')}
                amountPlaceholder='0'
                quotaPlaceholder='0'
              />

              <QuotaAmountFieldPair
                form={form}
                amountName='maxQuotaAmount'
                quotaName='maxQuota'
                amountLabel={t('Maximum check-in amount')}
                quotaLabel={t('Maximum check-in quota')}
                amountDescription={t('Maximum balance awarded for check-in')}
                quotaDescription={t('Maximum quota amount awarded for check-in')}
                amountPlaceholder='0'
                quotaPlaceholder='0'
              />
            </div>
          )}

          <Button
            type='submit'
            disabled={!isDirty || updateOption.isPending || isSubmitting}
          >
            {updateOption.isPending || isSubmitting
              ? t('Saving...')
              : t('Save check-in settings')}
          </Button>
        </form>
      </Form>
    </SettingsSection>
  )
}
