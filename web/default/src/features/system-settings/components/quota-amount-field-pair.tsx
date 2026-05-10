import type { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { getCurrencyLabel } from '@/lib/currency'
import { parseQuotaFromDollars, quotaUnitsToDollars } from '@/lib/format'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

type QuotaAmountFieldPairProps<T extends FieldValues> = {
  form: UseFormReturn<T>
  amountName: FieldPath<T>
  quotaName: FieldPath<T>
  amountLabel: string
  quotaLabel: string
  amountDescription: string
  quotaDescription: string
  amountPlaceholder?: string
  quotaPlaceholder?: string
}

function normalizeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0
}

export function QuotaAmountFieldPair<T extends FieldValues>({
  form,
  amountName,
  quotaName,
  amountLabel,
  quotaLabel,
  amountDescription,
  quotaDescription,
  amountPlaceholder,
  quotaPlaceholder,
}: QuotaAmountFieldPairProps<T>) {
  const { t } = useTranslation()
  const currencyLabel = getCurrencyLabel()

  return (
    <div className='grid gap-4 sm:grid-cols-2'>
      <FormField
        control={form.control}
        name={amountName}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{amountLabel}</FormLabel>
            <FormControl>
              <Input
                type='number'
                step={0.000001}
                min={0}
                value={normalizeNumber(Number(field.value))}
                onChange={(e) => {
                  const amount = normalizeNumber(e.target.valueAsNumber)
                  field.onChange(amount)
                  form.setValue(
                    quotaName,
                    parseQuotaFromDollars(amount) as T[typeof quotaName],
                    {
                      shouldDirty: true,
                      shouldValidate: true,
                    }
                  )
                }}
                name={field.name}
                onBlur={field.onBlur}
                ref={field.ref}
                placeholder={amountPlaceholder}
              />
            </FormControl>
            <FormDescription>
              {amountDescription}{' '}
              {t('Current display currency: {{currency}}', {
                currency: currencyLabel,
              })}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={quotaName}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{quotaLabel}</FormLabel>
            <FormControl>
              <Input
                type='number'
                step={1}
                min={0}
                value={normalizeNumber(Number(field.value))}
                onChange={(e) => {
                  const quota = Math.round(normalizeNumber(e.target.valueAsNumber))
                  field.onChange(quota)
                  form.setValue(
                    amountName,
                    Number(quotaUnitsToDollars(quota).toFixed(6)) as T[typeof amountName],
                    {
                      shouldDirty: true,
                      shouldValidate: true,
                    }
                  )
                }}
                name={field.name}
                onBlur={field.onBlur}
                ref={field.ref}
                placeholder={quotaPlaceholder}
              />
            </FormControl>
            <FormDescription>{quotaDescription}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}
