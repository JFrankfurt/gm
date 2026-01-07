// Hyperliquid API Types

export type AssetInfo = {
  name: string;
  szDecimals: number;
};

export type AssetMeta = {
  universe: AssetInfo[];
};

// Order types
export type OrderType =
  | { limit: { tif: 'Gtc' | 'Alo' | 'Ioc' } }
  | { trigger: { isMarket: boolean; triggerPx: string; tpsl: 'tp' | 'sl' } };

export type OrderRequest = {
  a: number;        // asset index (0 = BTC, 1 = ETH, etc.)
  b: boolean;       // is buy
  p: string;        // price (as string)
  s: string;        // size (as string)
  r: boolean;       // reduce only
  t: OrderType;     // order type
  c?: string;       // client order id (optional)
};

export type BuilderFee = {
  b: string;        // builder address
  f: number;        // fee in tenths of basis points (10 = 1 bp)
};

// Action types
export type OrderAction = {
  type: 'order';
  orders: OrderRequest[];
  grouping: 'na' | 'normalTpsl' | 'positionTpsl';
  builder?: BuilderFee;
};

export type CancelOrderAction = {
  type: 'cancel';
  cancels: Array<{ a: number; o: number }>;  // asset, order id
};

export type ApproveBuilderFeeAction = {
  type: 'approveBuilderFee';
  maxFeeRate: string;  // e.g., "0.001" for 0.1%
  builder: string;      // builder address
};

export type HyperliquidAction = OrderAction | CancelOrderAction | ApproveBuilderFeeAction;

// EIP-712 Signature
export type Signature = {
  r: string;
  s: string;
  v: number;
};

// Exchange API request
export type ExchangeRequest = {
  action: HyperliquidAction;
  nonce: number;
  signature: Signature;
  vaultAddress?: string;
};

// Exchange API response
export type ExchangeResponse = {
  status: 'ok' | 'err';
  response?: {
    type: 'order' | 'cancel';
    data?: {
      statuses: Array<{
        resting?: { oid: number };
        filled?: { totalSz: string; avgPx: string; oid: number };
        error?: string;
      }>;
    };
  };
};

// Account info
export type AccountInfo = {
  user: string;
  clearinghouseState: {
    assetPositions: Array<{
      position: {
        coin: string;
        szi: string;        // signed size
        entryPx: string;
        leverage: { type: string; value: number };
        liquidationPx: string | null;
        unrealizedPnl: string;
        returnOnEquity: string;
      };
    }>;
    marginSummary: {
      accountValue: string;
      totalMarginUsed: string;
    };
    crossMarginSummary: {
      accountValue: string;
      totalMarginUsed: string;
    };
  };
};

// Open orders
export type OpenOrder = {
  coin: string;
  oid: number;
  side: 'B' | 'A';  // Buy | Ask
  sz: string;
  limitPx: string;
  timestamp: number;
};

// User fill
export type UserFill = {
  coin: string;
  px: string;
  sz: string;
  side: 'B' | 'A';
  time: number;
  oid: number;
  crossed: boolean;
  fee: string;
  tid: number;
};

// Builder config (from backend)
export type BuilderConfig = {
  builderAddress: string;
  defaultFeeBps: number;  // in basis points
  maxFeeBps: number;
};

