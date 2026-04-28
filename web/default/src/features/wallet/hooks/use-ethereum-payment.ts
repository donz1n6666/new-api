import { useState } from 'react'
import i18next from 'i18next'
import { toast } from 'sonner'
import { isApiSuccess, requestEthereumPayment } from '../api'
import { executeEthereumOrder, isEthereumUserRejected } from '../lib/ethereum'

export function useEthereumPayment() {
  const [processing, setProcessing] = useState(false)

  const processEthereumPayment = async (
    amount: number,
    tokenAddress: string
  ) => {
    try {
      setProcessing(true)
      const response = await requestEthereumPayment({
        amount: Math.floor(amount),
        token_address: tokenAddress,
      })

      if (!isApiSuccess(response) || !response.data) {
        toast.error(response.message || i18next.t('Failed to create order'))
        return false
      }

      toast.info(i18next.t('Please confirm the transaction in your wallet'))
      const receipt = await executeEthereumOrder(response.data)
      toast.success(
        i18next.t(
          'Transaction confirmed. Balance will be credited after webhook confirmation.'
        )
      )
      return receipt.hash
    } catch (error) {
      if (isEthereumUserRejected(error)) {
        toast.error(i18next.t('You rejected the wallet request'))
      } else {
        toast.error(
          error instanceof Error ? error.message : i18next.t('Payment failed')
        )
      }
      return false
    } finally {
      setProcessing(false)
    }
  }

  return {
    processing,
    processEthereumPayment,
  }
}
