const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const EIP6963_ANNOUNCE_EVENT = 'eip6963:announceProvider';
const EIP6963_REQUEST_EVENT = 'eip6963:requestProvider';

function getWindowEthereum() {
  if (typeof window === 'undefined') return undefined;
  return window.ethereum;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function buildWalletName(provider, info) {
  if (info?.name) return info.name;
  if (provider?.isRabby) return 'Rabby Wallet';
  if (provider?.isMetaMask) return 'MetaMask';
  if (provider?.isCoinbaseWallet) return 'Coinbase Wallet';
  return 'Browser Wallet';
}

function getWalletScore(provider, info) {
  const name = normalizeText(info?.name);
  const rdns = normalizeText(info?.rdns);
  if (provider?.isRabby || name.includes('rabby') || rdns.includes('rabby')) {
    return 300;
  }
  if (
    provider?.isMetaMask ||
    name.includes('metamask') ||
    rdns.includes('metamask')
  ) {
    return 200;
  }
  if (
    provider?.isCoinbaseWallet ||
    name.includes('coinbase') ||
    rdns.includes('coinbase')
  ) {
    return 150;
  }
  return 50;
}

function makeWalletEntry(provider, info = {}) {
  return {
    id:
      info?.uuid ||
      info?.rdns ||
      `${buildWalletName(provider, info)}-${Math.random().toString(36).slice(2)}`,
    name: buildWalletName(provider, info),
    icon: info?.icon || '',
    rdns: info?.rdns || '',
    provider,
    score: getWalletScore(provider, info),
  };
}

function appendUniqueWallet(target, seen, provider, info = {}) {
  if (!provider || seen.has(provider)) return;
  seen.add(provider);
  target.push(makeWalletEntry(provider, info));
}

function getLegacyInjectedWallets() {
  const wallets = [];
  const seen = new Set();
  const injected = getWindowEthereum();
  if (!injected) return wallets;

  if (Array.isArray(injected.providers) && injected.providers.length > 0) {
    injected.providers.forEach((provider) => {
      appendUniqueWallet(wallets, seen, provider);
    });
    return wallets;
  }

  appendUniqueWallet(wallets, seen, injected);
  return wallets;
}

export async function discoverInjectedWallets(timeoutMs = 250) {
  if (typeof window === 'undefined') return [];

  const wallets = [];
  const seen = new Set();
  const handler = (event) => {
    const detail = event?.detail || {};
    appendUniqueWallet(wallets, seen, detail.provider, detail.info || {});
  };

  window.addEventListener(EIP6963_ANNOUNCE_EVENT, handler);
  try {
    window.dispatchEvent(new Event(EIP6963_REQUEST_EVENT));
    await new Promise((resolve) => window.setTimeout(resolve, timeoutMs));
  } finally {
    window.removeEventListener(EIP6963_ANNOUNCE_EVENT, handler);
  }

  getLegacyInjectedWallets().forEach((wallet) => {
    appendUniqueWallet(wallets, seen, wallet.provider, wallet);
  });

  return wallets.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function buildWalletConnectMetadata(config = {}) {
  const fallbackName =
    (typeof document !== 'undefined' && document.title) ||
    (typeof window !== 'undefined' && window.location?.hostname) ||
    'new-api';
  const fallbackURL =
    (typeof window !== 'undefined' && window.location?.origin) || 'http://localhost';
  const icon = String(config?.icon || '').trim();

  return {
    name: String(config?.appName || '').trim() || fallbackName,
    description:
      String(config?.description || '').trim() ||
      String(config?.appName || '').trim() ||
      fallbackName,
    url: String(config?.url || '').trim() || fallbackURL,
    icons: icon ? [icon] : [],
  };
}

function hasWalletConnectProjectId(config = {}) {
  return String(config?.projectId || '').trim() !== '';
}

async function connectWalletConnectProvider(chainId, walletConnectConfig) {
  const { EthereumProvider } = await import('@walletconnect/ethereum-provider');
  const provider = await EthereumProvider.init({
    projectId: String(walletConnectConfig.projectId).trim(),
    showQrModal: false,
    chains: [Number(chainId)],
    optionalChains: [Number(chainId)],
    metadata: buildWalletConnectMetadata(walletConnectConfig),
  });

  return {
    mode: 'walletconnect',
    walletName: 'WalletConnect',
    provider,
  };
}

export async function connectEthereumWallet(
  chainId,
  walletConnectConfig = {},
  lifecycle = {},
) {
  const injectedWallets = await discoverInjectedWallets();
  if (injectedWallets.length > 0) {
    const preferred = injectedWallets[0];
    return {
      mode: 'injected',
      walletName: preferred.name,
      provider: preferred.provider,
    };
  }

  if (hasWalletConnectProjectId(walletConnectConfig)) {
    lifecycle?.onWalletConnectPending?.();
    const connection = await connectWalletConnectProvider(
      chainId,
      walletConnectConfig,
    );
    const provider = connection.provider;

    if (typeof provider?.on === 'function') {
      provider.on('display_uri', (uri) => {
        lifecycle?.onWalletConnectUri?.(uri);
      });
      provider.on('connect', () => {
        lifecycle?.onWalletConnectConnected?.();
      });
      provider.on('disconnect', () => {
        lifecycle?.onWalletConnectDisconnected?.();
      });
    }

    return connection;
  }

  throw new Error(
    '请安装 Rabby、MetaMask 等 EVM 钱包，或联系管理员配置 WalletConnect 二维码连接',
  );
}

export function isEthereumUserRejected(error) {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? error.code
      : undefined;
  const nestedCode =
    error &&
    typeof error === 'object' &&
    'info' in error &&
    error.info?.error?.code;

  return (
    code === 4001 ||
    code === -32000 ||
    code === 'ACTION_REJECTED' ||
    nestedCode === 4001
  );
}

async function requestEthereumAccounts(browserProvider, rawProvider) {
  try {
    await browserProvider.send('eth_requestAccounts', []);
  } catch (error) {
    if (typeof rawProvider?.enable === 'function') {
      await rawProvider.enable();
      return;
    }
    throw error;
  }
}

async function connectWalletSession(rawProvider) {
  if (typeof rawProvider?.connect === 'function') {
    await rawProvider.connect();
    return;
  }
  if (typeof rawProvider?.enable === 'function') {
    await rawProvider.enable();
    return;
  }
  throw new Error('WalletConnect provider does not support connect/enable');
}

export async function executeEthereumOrderWithAutoWallet(
  order,
  walletConnectConfig = {},
  lifecycle = {},
) {
  const connection = await connectEthereumWallet(
    Number(order?.chain_id || 0),
    walletConnectConfig,
    lifecycle,
  );
  const rawProvider = connection.provider;

  const { ethers } = await import('ethers');
  const browserProvider = new ethers.BrowserProvider(rawProvider);
  try {
    if (connection.mode === 'walletconnect') {
      await connectWalletSession(rawProvider);
    } else {
      await requestEthereumAccounts(browserProvider, rawProvider);
    }
    lifecycle?.onWalletConnectConnected?.();
  } catch (error) {
    lifecycle?.onWalletConnectError?.(error);
    throw error;
  }

  const expectedChainId = BigInt(order.chain_id);
  const currentNetwork = await browserProvider.getNetwork();
  if (currentNetwork.chainId !== expectedChainId) {
    try {
      await rawProvider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${Number(order.chain_id).toString(16)}` }],
      });
    } catch {
      throw new Error(`请在钱包中切换到正确的网络，Chain ID: ${order.chain_id}`);
    }
  }

  const signer = await browserProvider.getSigner();
  const isNativeToken =
    String(order.token_address || '').toLowerCase() === ZERO_ADDRESS.toLowerCase();

  const contractAbi = isNativeToken
    ? ['function payWithETH(bytes32 orderId) payable']
    : ['function payWithToken(bytes32 orderId, address token, uint256 amount)'];
  const contract = new ethers.Contract(order.contract_address, contractAbi, signer);

  let tx;
  if (isNativeToken) {
    tx = await contract.payWithETH(order.order_id, {
      value: BigInt(order.pay_amount),
    });
  } else {
    const erc20Abi = [
      'function approve(address spender, uint256 amount) returns (bool)',
      'function allowance(address owner, address spender) view returns (uint256)',
    ];
    const tokenContract = new ethers.Contract(
      order.token_address,
      erc20Abi,
      signer,
    );
    const signerAddress = await signer.getAddress();
    const currentAllowance = await tokenContract.allowance(
      signerAddress,
      order.contract_address,
    );

    if (currentAllowance < BigInt(order.pay_amount)) {
      const approveTx = await tokenContract.approve(
        order.contract_address,
        BigInt(order.pay_amount),
      );
      await approveTx.wait();
    }

    tx = await contract.payWithToken(
      order.order_id,
      order.token_address,
      BigInt(order.pay_amount),
    );
  }

  const receipt = await tx.wait();
  if (receipt?.status !== 1) {
    throw new Error('Ethereum 交易失败');
  }

  return {
    hash: tx.hash,
    walletName: connection.walletName,
    mode: connection.mode,
  };
}
