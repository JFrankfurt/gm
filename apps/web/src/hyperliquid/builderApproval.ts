import type { WalletClient } from 'viem';
import { getHyperliquidExchange } from './client';
import { signAction, buildApproveBuilderFeeAction } from './signing';

// LocalStorage key for builder approval status
const APPROVAL_KEY = 'gm.hyperliquid.builderApproval';

type ApprovalRecord = {
  userAddress: string;
  builderAddress: string;
  maxFeeBps: number;
  approvedAt: string;
};

// Check if user has approved builder
export function isBuilderApproved(userAddress: string, builderAddress: string): boolean {
  try {
    const stored = localStorage.getItem(APPROVAL_KEY);
    if (!stored) return false;

    const records: ApprovalRecord[] = JSON.parse(stored);
    return records.some(
      (r) =>
        r.userAddress.toLowerCase() === userAddress.toLowerCase() &&
        r.builderAddress.toLowerCase() === builderAddress.toLowerCase()
    );
  } catch {
    return false;
  }
}

// Store builder approval in localStorage
function storeApproval(record: ApprovalRecord) {
  try {
    const stored = localStorage.getItem(APPROVAL_KEY);
    const records: ApprovalRecord[] = stored ? JSON.parse(stored) : [];

    // Remove any existing approval for this user+builder combo
    const filtered = records.filter(
      (r) =>
        !(
          r.userAddress.toLowerCase() === record.userAddress.toLowerCase() &&
          r.builderAddress.toLowerCase() === record.builderAddress.toLowerCase()
        )
    );

    filtered.push(record);
    localStorage.setItem(APPROVAL_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error('Failed to store builder approval:', err);
  }
}

// Approve builder fee (one-time action)
export async function approveBuilderFee(
  walletClient: WalletClient,
  builderAddress: string,
  maxFeeBps: number
): Promise<void> {
  const userAddress = walletClient.account?.address;
  if (!userAddress) {
    throw new Error('Wallet not connected');
  }

  if (!builderAddress || builderAddress === '0x0000000000000000000000000000000000000000') {
    throw new Error('Invalid builder address');
  }

  // Build approval action
  const action = buildApproveBuilderFeeAction({
    builderAddress,
    maxFeeRateBps: maxFeeBps,
  });

  // Get nonce (timestamp)
  const nonce = Date.now();

  // Sign with wallet
  const signature = await signAction(walletClient, action, nonce);

  // Submit to Hyperliquid
  const exchange = getHyperliquidExchange();
  const response = await exchange.submitAction(action, signature, nonce);

  if (response.status !== 'ok') {
    throw new Error(`Builder approval failed: ${JSON.stringify(response.response)}`);
  }

  // Store approval in localStorage
  storeApproval({
    userAddress,
    builderAddress,
    maxFeeBps,
    approvedAt: new Date().toISOString(),
  });
}

