import { API_URL } from './constants';
import type {
  AssetMeta,
  AccountInfo,
  OpenOrder,
  UserFill,
  ExchangeRequest,
  ExchangeResponse,
  HyperliquidAction,
  Signature,
} from './types';

// Info API (read-only, no signature required)
export class HyperliquidInfo {
  constructor(private apiUrl: string = API_URL) {}

  async getAssetMeta(): Promise<AssetMeta> {
    const res = await fetch(`${this.apiUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'meta' }),
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch asset meta: ${res.status}`);
    }

    return res.json();
  }

  async getAccountInfo(address: string): Promise<AccountInfo> {
    const res = await fetch(`${this.apiUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'clearinghouseState',
        user: address,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch account info: ${res.status}`);
    }

    const data = await res.json();
    return {
      user: address,
      clearinghouseState: data,
    };
  }

  async getOpenOrders(address: string): Promise<OpenOrder[]> {
    const res = await fetch(`${this.apiUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'openOrders',
        user: address,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch open orders: ${res.status}`);
    }

    return res.json();
  }

  async getUserFills(address: string): Promise<UserFill[]> {
    const res = await fetch(`${this.apiUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'userFills',
        user: address,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch user fills: ${res.status}`);
    }

    return res.json();
  }

  async getL2Book(coin: string): Promise<{ levels: [[string, string][], [string, string][]] }> {
    const res = await fetch(`${this.apiUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'l2Book',
        coin,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch l2 book: ${res.status}`);
    }

    return res.json();
  }
}

// Exchange API (requires signatures)
export class HyperliquidExchange {
  constructor(private apiUrl: string = API_URL) {}

  async submitAction(
    action: HyperliquidAction,
    signature: Signature,
    nonce: number,
    vaultAddress?: string
  ): Promise<ExchangeResponse> {
    const request: ExchangeRequest = {
      action,
      nonce,
      signature,
      vaultAddress,
    };

    const res = await fetch(`${this.apiUrl}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Exchange request failed: ${res.status} - ${errorText}`);
    }

    const response: ExchangeResponse = await res.json();

    if (response.status === 'err') {
      throw new Error(`Exchange error: ${JSON.stringify(response.response)}`);
    }

    return response;
  }
}

// Singleton instances
let infoClient: HyperliquidInfo | null = null;
let exchangeClient: HyperliquidExchange | null = null;

export function getHyperliquidInfo(): HyperliquidInfo {
  if (!infoClient) {
    infoClient = new HyperliquidInfo();
  }
  return infoClient;
}

export function getHyperliquidExchange(): HyperliquidExchange {
  if (!exchangeClient) {
    exchangeClient = new HyperliquidExchange();
  }
  return exchangeClient;
}

