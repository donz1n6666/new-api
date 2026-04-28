import i18next from 'i18next'
import type { EthereumOrderData } from '../types'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

type EthereumWindow = Window & {
  ethereum?: {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  }
}

function getEthereumProvider() {
  return (window as EthereumWindow).ethereum
}

export function isEthereumUserRejected(error: unknown): boolean {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? Number((error as { code?: unknown }).code)
      : undefined
  const nestedCode =
    error &&
    typeof error === 'object' &&
    'info' in error &&
    (error as { info?: { error?: { code?: number } } }).info?.error?.code

  return code === 4001 || code === -32000 || nestedCode === 4001
}

export async function executeEthereumOrder(order: EthereumOrderData) {
  const injected = getEthereumProvider()
  if (!injected) {
    throw new Error(i18next.t('Please install MetaMask or another EVM wallet'))
  }

  const { ethers } = await import('ethers')
  const provider = new ethers.BrowserProvider(injected)
  await provider.send('eth_requestAccounts', [])

  const currentNetwork = await provider.getNetwork()
  const expectedChainId = BigInt(order.chain_id)

  if (currentNetwork.chainId !== expectedChainId) {
    try {
      await injected.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${order.chain_id.toString(16)}` }],
      })
    } catch {
      throw new Error(
        i18next.t('Please switch your wallet to chain {{chainId}}', {
          chainId: order.chain_id,
        })
      )
    }
  }

  const signer = await provider.getSigner()
  const isNativeToken =
    order.token_address.toLowerCase() === ZERO_ADDRESS.toLowerCase()

  const contractAbi = isNativeToken
    ? ['function payWithETH(bytes32 orderId) payable']
    : ['function payWithToken(bytes32 orderId, address token, uint256 amount)']

  const contract = new ethers.Contract(order.contract_address, contractAbi, signer)
  let tx

  if (isNativeToken) {
    tx = await contract.payWithETH(order.order_id, {
      value: BigInt(order.pay_amount),
    })
  } else {
    const erc20Abi = [
      'function approve(address spender, uint256 amount) returns (bool)',
      'function allowance(address owner, address spender) view returns (uint256)',
    ]
    const tokenContract = new ethers.Contract(
      order.token_address,
      erc20Abi,
      signer
    )
    const signerAddress = await signer.getAddress()
    const currentAllowance = await tokenContract.allowance(
      signerAddress,
      order.contract_address
    )

    if (currentAllowance < BigInt(order.pay_amount)) {
      const approveTx = await tokenContract.approve(
        order.contract_address,
        BigInt(order.pay_amount)
      )
      await approveTx.wait()
    }

    tx = await contract.payWithToken(
      order.order_id,
      order.token_address,
      BigInt(order.pay_amount)
    )
  }

  const receipt = await tx.wait()
  if (receipt?.status !== 1) {
    throw new Error(i18next.t('Ethereum transaction failed'))
  }

  return { hash: tx.hash as string }
}
