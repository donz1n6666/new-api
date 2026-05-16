const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const EIP6963_ANNOUNCE_EVENT = 'eip6963:announceProvider';
const EIP6963_REQUEST_EVENT = 'eip6963:requestProvider';

function getWindowEthereum() {
  if (typeof window === 'undefined') return undefined;
  return window.ethereum;
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
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

  return wallets.sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name),
  );
}

function buildWalletConnectMetadata(config = {}) {
  const fallbackName =
    (typeof document !== 'undefined' && document.title) ||
    (typeof window !== 'undefined' && window.location?.hostname) ||
    'new-api';
  const fallbackURL =
    (typeof window !== 'undefined' && window.location?.origin) ||
    'http://localhost';
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

function getWalletConnectRelayUrls(config = {}) {
  if (config?.relayProxyEnabled) {
    const proxyUrl = normalizeWalletConnectRelayUrl(
      config?.relayProxyUrl || '/api/walletconnect/relay',
    );
    return proxyUrl ? [proxyUrl] : [];
  }
  const urls = [
    String(config?.primaryRelayUrl || '').trim(),
    String(config?.backupRelayUrl || '').trim(),
  ].filter(Boolean);
  return [...new Set(urls)];
}

function normalizeWalletConnectRelayUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^wss?:\/\//i.test(raw)) return raw;
  if (typeof window === 'undefined' || !window.location?.origin) return raw;
  const url = new URL(raw, window.location.origin);
  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function attachWalletConnectLifecycle(provider, lifecycle = {}) {
  if (typeof provider?.on !== 'function') return;
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

async function connectWalletConnectProvider(
  chainId,
  walletConnectConfig,
  relayUrl = '',
  relayIndex = 0,
) {
  const { EthereumProvider } = await import('@walletconnect/ethereum-provider');
  const initOptions = {
    projectId: String(walletConnectConfig.projectId).trim(),
    showQrModal: true,
    chains: [Number(chainId)],
    optionalChains: [Number(chainId)],
    metadata: buildWalletConnectMetadata(walletConnectConfig),
  };
  if (relayUrl) {
    initOptions.relayUrl = relayUrl;
  }
  const provider = await EthereumProvider.init(initOptions);

  return {
    mode: 'walletconnect',
    walletName: 'WalletConnect',
    relayUrl,
    relayIndex,
    provider,
  };
}

async function connectWalletConnectProviderWithFallback(
  chainId,
  walletConnectConfig,
  lifecycle = {},
  startIndex = 0,
) {
  const relayUrls = getWalletConnectRelayUrls(walletConnectConfig);
  const candidates = relayUrls.length > 0 ? relayUrls : [''];
  let lastError;
  for (let i = startIndex; i < candidates.length; i += 1) {
    try {
      const connection = await connectWalletConnectProvider(
        chainId,
        walletConnectConfig,
        candidates[i],
        i,
      );
      connection.relayUrls = candidates;
      attachWalletConnectLifecycle(connection.provider, lifecycle);
      return connection;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('WalletConnect provider init failed');
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
    const connection = await connectWalletConnectProviderWithFallback(
      chainId,
      walletConnectConfig,
      lifecycle,
    );

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

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForWalletConnectAccounts(
  rawProvider,
  browserProvider,
  chainId,
  attempts = 10,
  intervalMs = 300,
) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await getWalletConnectAccount(
        rawProvider,
        browserProvider,
        chainId,
      );
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await sleep(intervalMs);
      }
    }
  }
  throw lastError || new Error('WalletConnect 未返回可用账户信息');
}

async function waitForExpectedNetwork(
  rawProvider,
  expectedChainId,
  attempts = 10,
  intervalMs = 300,
) {
  let lastChainId = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const chainIdHex = await rawProvider.request({
        method: 'eth_chainId',
      });
      lastChainId = BigInt(chainIdHex);
    } catch {
      lastChainId = null;
    }
    if (lastChainId === expectedChainId) {
      return;
    }
    if (i < attempts - 1) {
      await sleep(intervalMs);
    }
  }
  throw new Error(
    `请在钱包中切换到正确的网络，Chain ID: ${String(lastChainId)}`,
  );
}

function normalizeWalletConnectAddress(value) {
  const parts = String(value || '').split(':');
  const address = (parts[parts.length - 1] || '').trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return '';
  }
  return address;
}

async function getWalletConnectAccount(rawProvider, browserProvider, chainId) {
  let accounts = Array.isArray(rawProvider?.accounts)
    ? rawProvider.accounts
    : [];
  if (accounts.length === 0 && typeof rawProvider?.request === 'function') {
    try {
      const requestedAccounts = await rawProvider.request({
        method: 'eth_accounts',
      });
      if (Array.isArray(requestedAccounts)) {
        accounts = requestedAccounts;
      }
    } catch {
      // 某些 WalletConnect provider 不支持直接从 request 读取账户，后续继续尝试 signer
    }
  }

  const expectedPrefix = `eip155:${Number(chainId)}:`;
  const matched =
    accounts.find((item) => String(item || '').startsWith(expectedPrefix)) ||
    accounts.find((item) =>
      /^0x[a-fA-F0-9]{40}$/.test(String(item || '').trim()),
    );
  const address = normalizeWalletConnectAddress(matched || accounts[0]);
  if (address) {
    return address;
  }

  try {
    const signer = await browserProvider.getSigner();
    const signerAddress = await signer.getAddress();
    if (/^0x[a-fA-F0-9]{40}$/.test(String(signerAddress || '').trim())) {
      return String(signerAddress).trim();
    }
  } catch {
    // ignore
  }

  throw new Error(
    'WalletConnect 未返回可用账户信息，请在钱包中确认授权当前账户',
  );
}

export async function executeEthereumOrderWithAutoWallet(
  order,
  walletConnectConfig = {},
  lifecycle = {},
) {
  const orderChainId = Number(order?.chain_id || 0);
  let connection = await connectEthereumWallet(
    orderChainId,
    walletConnectConfig,
    lifecycle,
  );
  let rawProvider = connection.provider;
  const { ethers } = await import('ethers');
  let browserProvider;
  try {
    if (connection.mode === 'walletconnect') {
      try {
        await connectWalletSession(rawProvider);
      } catch (error) {
        const nextRelayIndex = Number(connection.relayIndex || 0) + 1;
        if (
          Array.isArray(connection.relayUrls) &&
          nextRelayIndex < connection.relayUrls.length
        ) {
          lifecycle?.onWalletConnectPending?.();
          connection = await connectWalletConnectProviderWithFallback(
            orderChainId,
            walletConnectConfig,
            lifecycle,
            nextRelayIndex,
          );
          rawProvider = connection.provider;
          await connectWalletSession(rawProvider);
        } else {
          throw error;
        }
      }
      browserProvider = new ethers.BrowserProvider(rawProvider);
      lifecycle?.onWalletConnectSessionEstablished?.();
    } else {
      browserProvider = new ethers.BrowserProvider(rawProvider);
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
    lifecycle?.onWalletConnectSwitchNetworkPending?.();
    try {
      await rawProvider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${Number(order.chain_id).toString(16)}` }],
      });
    } catch {
      throw new Error(
        `请在钱包中切换到正确的网络，Chain ID: ${order.chain_id}`,
      );
    }
    await waitForExpectedNetwork(rawProvider, expectedChainId);
    browserProvider = new ethers.BrowserProvider(rawProvider);
  }

  let signer;
  if (connection.mode === 'walletconnect') {
    const account = await waitForWalletConnectAccounts(
      rawProvider,
      browserProvider,
      order.chain_id,
    );
    lifecycle?.onWalletConnectReadyToSign?.();
    signer = await browserProvider.getSigner(account);
  } else {
    signer = await browserProvider.getSigner();
  }
  const isNativeToken =
    String(order.token_address || '').toLowerCase() ===
    ZERO_ADDRESS.toLowerCase();

  const contractAbi = isNativeToken
    ? ['function payWithETH(bytes32 orderId) payable']
    : ['function payWithToken(bytes32 orderId, address token, uint256 amount)'];
  const contract = new ethers.Contract(
    order.contract_address,
    contractAbi,
    signer,
  );

  let tx;
  if (isNativeToken) {
    lifecycle?.onWalletConnectTransactionPending?.();
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
      lifecycle?.onWalletConnectApprovePending?.();
      const approveTx = await tokenContract.approve(
        order.contract_address,
        BigInt(order.pay_amount),
      );
      await approveTx.wait();
    }

    lifecycle?.onWalletConnectTransactionPending?.();
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
