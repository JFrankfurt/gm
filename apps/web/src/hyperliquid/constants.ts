// Hyperliquid API URLs
export const HYPERLIQUID_API_URL = 'https://api.hyperliquid.xyz';
export const HYPERLIQUID_TESTNET_API_URL = 'https://api.hyperliquid-testnet.xyz';

// Use testnet by default for development
export const isTestnet = import.meta.env.VITE_HYPERLIQUID_TESTNET !== 'false';
export const API_URL = isTestnet ? HYPERLIQUID_TESTNET_API_URL : HYPERLIQUID_API_URL;

// Hyperliquid contract addresses (for EIP-712 signing)
// Mainnet
export const HYPERLIQUID_CHAIN_ID = 42161; // Arbitrum
export const HYPERLIQUID_MAINNET_CONTRACT = '0x0000000000000000000000000000000000000000'; // TODO: Get actual address

// Testnet
export const HYPERLIQUID_TESTNET_CHAIN_ID = 421614; // Arbitrum Sepolia
export const HYPERLIQUID_TESTNET_CONTRACT = '0x0000000000000000000000000000000000000000'; // TODO: Get actual address

export const CHAIN_ID = isTestnet ? HYPERLIQUID_TESTNET_CHAIN_ID : HYPERLIQUID_CHAIN_ID;
export const VERIFYING_CONTRACT = isTestnet ? HYPERLIQUID_TESTNET_CONTRACT : HYPERLIQUID_MAINNET_CONTRACT;

// Asset indices (mainnet)
export const ASSET_INDEX: Record<string, number> = {
  BTC: 0,
  ETH: 1,
  SOL: 2,
  DOGE: 3,
  ARB: 4,
  MATIC: 5,
  AVAX: 6,
  LINK: 7,
  UNI: 8,
  AAVE: 9,
};

