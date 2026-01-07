import { type WalletClient } from 'viem';
import { CHAIN_ID, VERIFYING_CONTRACT } from './constants';
import type {
  HyperliquidAction,
  Signature,
  OrderAction,
  CancelOrderAction,
  ApproveBuilderFeeAction,
} from './types';

// EIP-712 Domain
export function getEIP712Domain() {
  return {
    name: 'Exchange',
    version: '1',
    chainId: CHAIN_ID,
    verifyingContract: VERIFYING_CONTRACT as `0x${string}`,
  };
}

// EIP-712 Types for different actions
const AGENT_TYPES = {
  Agent: [
    { name: 'source', type: 'string' },
    { name: 'connectionId', type: 'bytes32' },
  ],
};

const ORDER_TYPES = {
  ...AGENT_TYPES,
  Order: [
    { name: 'a', type: 'uint32' },
    { name: 'b', type: 'bool' },
    { name: 'p', type: 'uint64' },
    { name: 's', type: 'uint64' },
    { name: 'r', type: 'bool' },
    { name: 't', type: 'uint8' },
  ],
  Grouping: [
    { name: 'type', type: 'string' },
  ],
  Builder: [
    { name: 'b', type: 'address' },
    { name: 'f', type: 'uint64' },
  ],
};

const CANCEL_TYPES = {
  ...AGENT_TYPES,
  Cancel: [
    { name: 'a', type: 'uint32' },
    { name: 'o', type: 'uint64' },
  ],
};

const APPROVE_BUILDER_FEE_TYPES = {
  ...AGENT_TYPES,
  ApproveBuilderFee: [
    { name: 'maxFeeRate', type: 'string' },
    { name: 'builder', type: 'address' },
  ],
};

// Convert action to EIP-712 message
function actionToTypedData(
  action: HyperliquidAction,
  userAddress: string,
  nonce: number
) {
  const connectionId = `0x${nonce.toString(16).padStart(64, '0')}` as `0x${string}`;

  if (action.type === 'order') {
    return {
      domain: getEIP712Domain(),
      types: ORDER_TYPES,
      primaryType: 'Agent' as const,
      message: {
        source: userAddress.toLowerCase(),
        connectionId,
      },
    };
  }

  if (action.type === 'cancel') {
    return {
      domain: getEIP712Domain(),
      types: CANCEL_TYPES,
      primaryType: 'Agent' as const,
      message: {
        source: userAddress.toLowerCase(),
        connectionId,
      },
    };
  }

  if (action.type === 'approveBuilderFee') {
    return {
      domain: getEIP712Domain(),
      types: APPROVE_BUILDER_FEE_TYPES,
      primaryType: 'Agent' as const,
      message: {
        source: userAddress.toLowerCase(),
        connectionId,
      },
    };
  }

  throw new Error(`Unknown action type: ${(action as any).type}`);
}

// Sign action with wallet
export async function signAction(
  walletClient: WalletClient,
  action: HyperliquidAction,
  nonce: number
): Promise<Signature> {
  const address = walletClient.account?.address;
  if (!address) {
    throw new Error('Wallet not connected');
  }

  const typedData = actionToTypedData(action, address, nonce);

  try {
    // Sign typed data using viem - cast to any to bypass type complexity
    const signature = await (walletClient.signTypedData as any)({
      account: address,
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
    });

    // Parse signature into r, s, v components
    const r = signature.slice(0, 66) as `0x${string}`;
    const s = `0x${signature.slice(66, 130)}` as `0x${string}`;
    const v = parseInt(signature.slice(130, 132), 16);

    return { r, s, v };
  } catch (error) {
    console.error('Error signing action:', error);
    throw new Error('Failed to sign action. User may have rejected the signature request.');
  }
}

// Helper to build limit order action
export function buildLimitOrderAction(params: {
  asset: number;
  isBuy: boolean;
  price: string;
  size: string;
  reduceOnly?: boolean;
  builder?: { address: string; feeBps: number };
}): OrderAction {
  const { asset, isBuy, price, size, reduceOnly = false, builder } = params;

  return {
    type: 'order',
    orders: [
      {
        a: asset,
        b: isBuy,
        p: price,
        s: size,
        r: reduceOnly,
        t: { limit: { tif: 'Gtc' } },
      },
    ],
    grouping: 'na',
    builder: builder
      ? {
          b: builder.address,
          f: builder.feeBps,
        }
      : undefined,
  };
}

// Helper to build market order action
export function buildMarketOrderAction(params: {
  asset: number;
  isBuy: boolean;
  size: string;
  reduceOnly?: boolean;
  builder?: { address: string; feeBps: number };
}): OrderAction {
  const { asset, isBuy, size, reduceOnly = false, builder } = params;

  return {
    type: 'order',
    orders: [
      {
        a: asset,
        b: isBuy,
        p: '0', // Market orders use price 0
        s: size,
        r: reduceOnly,
        t: { limit: { tif: 'Ioc' } }, // Immediate or cancel for market orders
      },
    ],
    grouping: 'na',
    builder: builder
      ? {
          b: builder.address,
          f: builder.feeBps,
        }
      : undefined,
  };
}

// Helper to build cancel order action
export function buildCancelOrderAction(params: {
  asset: number;
  orderId: number;
}): CancelOrderAction {
  return {
    type: 'cancel',
    cancels: [{ a: params.asset, o: params.orderId }],
  };
}

// Helper to build approve builder fee action
export function buildApproveBuilderFeeAction(params: {
  builderAddress: string;
  maxFeeRateBps: number; // in basis points (e.g., 10 = 0.1%)
}): ApproveBuilderFeeAction {
  // Convert basis points to decimal string (10 bps = 0.001)
  const maxFeeRate = (params.maxFeeRateBps / 10000).toString();

  return {
    type: 'approveBuilderFee',
    maxFeeRate,
    builder: params.builderAddress,
  };
}

