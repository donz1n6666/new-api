import { useEffect, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import {
  formatJsonForEditor,
  getJsonError,
  normalizeJsonForComparison,
} from './utils'

export interface EthereumSettingsValues {
  EthereumEnabled: boolean
  EthereumChainId: number
  EthereumContractAddress: string
  EthereumAlchemyWebhookSigningKey: string
  EthereumMinTopUp: number
  EthereumSupportedTokens: string
}

export function EthereumSettingsSection({
  defaultValues,
}: {
  defaultValues: EthereumSettingsValues
}) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const initialRef = useRef(defaultValues)
  const defaultsSignature = useMemo(
    () => JSON.stringify(defaultValues),
    [defaultValues]
  )

  const form = useForm<EthereumSettingsValues>({
    defaultValues: {
      ...defaultValues,
      EthereumSupportedTokens: formatJsonForEditor(
        defaultValues.EthereumSupportedTokens
      ),
    },
  })

  useEffect(() => {
    const nextDefaults = JSON.parse(defaultsSignature) as EthereumSettingsValues
    initialRef.current = nextDefaults
    form.reset({
      ...nextDefaults,
      EthereumSupportedTokens: formatJsonForEditor(
        nextDefaults.EthereumSupportedTokens
      ),
    })
  }, [defaultsSignature, form])

  const handleSave = async () => {
    const values = form.getValues()
    const tokensValue = values.EthereumSupportedTokens.trim()
    const tokensError = getJsonError(tokensValue, (parsed) => Array.isArray(parsed))
    if (tokensError) {
      toast.error(tokensError)
      return
    }

    const updates: Array<{ key: string; value: string | boolean | number }> = []

    if (values.EthereumEnabled !== initialRef.current.EthereumEnabled) {
      updates.push({ key: 'EthereumEnabled', value: values.EthereumEnabled })
    }
    if (values.EthereumChainId !== initialRef.current.EthereumChainId) {
      updates.push({ key: 'EthereumChainId', value: values.EthereumChainId })
    }
    if (
      values.EthereumContractAddress !==
      initialRef.current.EthereumContractAddress
    ) {
      updates.push({
        key: 'EthereumContractAddress',
        value: values.EthereumContractAddress.trim(),
      })
    }
    if (
      values.EthereumAlchemyWebhookSigningKey &&
      values.EthereumAlchemyWebhookSigningKey !==
        initialRef.current.EthereumAlchemyWebhookSigningKey
    ) {
      updates.push({
        key: 'EthereumAlchemyWebhookSigningKey',
        value: values.EthereumAlchemyWebhookSigningKey.trim(),
      })
    }
    if (values.EthereumMinTopUp !== initialRef.current.EthereumMinTopUp) {
      updates.push({ key: 'EthereumMinTopUp', value: values.EthereumMinTopUp })
    }
    if (
      normalizeJsonForComparison(tokensValue) !==
      normalizeJsonForComparison(initialRef.current.EthereumSupportedTokens)
    ) {
      updates.push({
        key: 'EthereumSupportedTokens',
        value: tokensValue,
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

  return (
    <SettingsSection
      title={t('Ethereum Gateway')}
      description={t('Configure Ethereum and ERC-20 wallet payments')}
    >
      <Alert>
        <AlertDescription className='text-xs'>
          {t(
            'Use your deployed NewApiPayment contract together with an Alchemy webhook. Set the webhook URL to {{url}}.',
            {
              url:
                typeof window === 'undefined'
                  ? '/api/ethereum/webhook'
                  : `${window.location.origin}/api/ethereum/webhook`,
            }
          )}
        </AlertDescription>
      </Alert>

      <div className='grid gap-4'>
        <div className='flex items-center gap-2'>
          <Switch
            checked={form.watch('EthereumEnabled')}
            onCheckedChange={(value) => form.setValue('EthereumEnabled', value)}
          />
          <Label>{t('Enable Ethereum payments')}</Label>
        </div>

        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='grid gap-2'>
            <Label>{t('Chain ID')}</Label>
            <Input
              type='number'
              value={form.watch('EthereumChainId')}
              onChange={(e) =>
                form.setValue(
                  'EthereumChainId',
                  Number.isFinite(e.target.valueAsNumber)
                    ? e.target.valueAsNumber
                    : 11155111
                )
              }
            />
          </div>
          <div className='grid gap-2'>
            <Label>{t('Minimum topup amount')}</Label>
            <Input
              type='number'
              min={1}
              value={form.watch('EthereumMinTopUp')}
              onChange={(e) =>
                form.setValue(
                  'EthereumMinTopUp',
                  Number.isFinite(e.target.valueAsNumber)
                    ? e.target.valueAsNumber
                    : 1
                )
              }
            />
          </div>
        </div>

        <div className='grid gap-2'>
          <Label>{t('Contract Address')}</Label>
          <Input
            value={form.watch('EthereumContractAddress')}
            onChange={(e) =>
              form.setValue('EthereumContractAddress', e.target.value)
            }
            placeholder='0x...'
          />
        </div>

        <div className='grid gap-2'>
          <Label>{t('Alchemy Webhook Signing Key')}</Label>
          <Input
            type='password'
            value={form.watch('EthereumAlchemyWebhookSigningKey')}
            onChange={(e) =>
              form.setValue('EthereumAlchemyWebhookSigningKey', e.target.value)
            }
            placeholder={t('Leave blank unless updating')}
          />
        </div>

        <div className='grid gap-2'>
          <Label>{t('Supported Tokens (JSON)')}</Label>
          <Textarea
            rows={10}
            value={form.watch('EthereumSupportedTokens')}
            onChange={(e) =>
              form.setValue('EthereumSupportedTokens', e.target.value)
            }
            placeholder='[{"symbol":"ETH","address":"0x0000000000000000000000000000000000000000","decimals":18,"price":"0.001"}]'
          />
          <p className='text-xs text-muted-foreground'>
            {t(
              'Use the zero address for native ETH. Each item must include symbol, address, decimals, and price.'
            )}
          </p>
        </div>

        <Button onClick={handleSave} disabled={updateOption.isPending}>
          {updateOption.isPending ? t('Saving...') : t('Save Ethereum settings')}
        </Button>
      </div>
    </SettingsSection>
  )
}
