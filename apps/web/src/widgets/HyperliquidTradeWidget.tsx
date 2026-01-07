import { useEffect, useMemo, useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import type { WorkspaceAction } from '@gm/shared';
import { getHyperliquidExchange } from '../hyperliquid/client';
import { signAction, buildLimitOrderAction, buildMarketOrderAction } from '../hyperliquid/signing';
import { ASSET_INDEX } from '../hyperliquid/constants';
import type { OpenOrder, BuilderConfig } from '../hyperliquid/types';
import { isBuilderApproved, approveBuilderFee } from '../hyperliquid/builderApproval';
import { useHyperliquidUserState } from '../hyperliquid/useUserState';

const AVAILABLE_SYMBOLS = ['BTC', 'ETH', 'SOL', 'DOGE', 'ARB'] as const;

export function HyperliquidTradeWidget(props: {
  nodeId: string;
  symbol?: string;
  dispatch: (action: WorkspaceAction) => void;
}) {
  const { address, isConnected, chain } = useAccount();
  const { data: walletClient } = useWalletClient();

  // Widget settings (persisted in workspace)
  const [symbol, setSymbol] = useState(props.symbol ?? 'BTC');

  // Order form state
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'limit' | 'market'>('limit');
  const [price, setPrice] = useState('');
  const [size, setSize] = useState('');

  // UI state
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Account data
  const [balance, setBalance] = useState<string | null>(null);
  const [position, setPosition] = useState<string | null>(null);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);

  // Real-time user state via WebSocket
  const userState = useHyperliquidUserState(address);

  // Builder config
  const [builderConfig, setBuilderConfig] = useState<BuilderConfig | null>(null);
  const [builderApproved, setBuilderApproved] = useState(false);
  const [approvingBuilder, setApprovingBuilder] = useState(false);

  // Update widget symbol in workspace when changed
  const updateSymbol = (newSymbol: string) => {
    setSymbol(newSymbol);
    props.dispatch({
      type: 'updateNodeProps',
      nodeId: props.nodeId,
      props: { symbol: newSymbol },
      now: new Date().toISOString(),
    });
  };

  // Fetch builder config on mount
  useEffect(() => {
    fetch('/api/hyperliquid/builder')
      .then((res) => res.json())
      .then(setBuilderConfig)
      .catch(() => setBuilderConfig(null));
  }, []);

  // Check builder approval status when wallet connects
  useEffect(() => {
    if (!address || !builderConfig?.builderAddress) {
      setBuilderApproved(false);
      return;
    }

    const approved = isBuilderApproved(address, builderConfig.builderAddress);
    setBuilderApproved(approved);
  }, [address, builderConfig]);

  // Handle builder approval
  const handleApproveBuilder = async () => {
    if (!walletClient || !builderConfig?.builderAddress) return;

    setApprovingBuilder(true);
    setError(null);

    try {
      await approveBuilderFee(walletClient, builderConfig.builderAddress, builderConfig.maxFeeBps);
      setBuilderApproved(true);
      setSuccess('Builder fee approved! You can now trade and support the platform.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve builder fee');
    } finally {
      setApprovingBuilder(false);
    }
  };

  // Fetch account info when connected
  useEffect(() => {
    if (!address || !isConnected) {
      setBalance(null);
      setPosition(null);
      return;
    }

    const fetchAccountData = async () => {
      try {
        // Get account state (includes nonce indirectly via clearinghouse state)
        const res = await fetch(`/api/hyperliquid/account/${address}`);
        if (!res.ok) return;

        const data = await res.json();

        // Extract balance
        const accountValue = data.marginSummary?.accountValue || data.crossMarginSummary?.accountValue || '0';
        setBalance(accountValue);

        // Extract position for current symbol
        const assetPositions = data.assetPositions || [];
        const symbolPosition = assetPositions.find((p: any) => p.position?.coin === symbol);
        if (symbolPosition) {
          setPosition(symbolPosition.position.szi);
        } else {
          setPosition('0');
        }
      } catch (err) {
        console.error('Failed to fetch account data:', err);
      }
    };

    fetchAccountData();
    const interval = setInterval(fetchAccountData, 5000); // Poll every 5s

    return () => clearInterval(interval);
  }, [address, isConnected, symbol]);

  // Fetch open orders
  useEffect(() => {
    if (!address || !isConnected) {
      setOpenOrders([]);
      return;
    }

    const fetchOrders = async () => {
      try {
        const res = await fetch(`/api/hyperliquid/orders/${address}`);
        if (!res.ok) return;
        const orders = await res.json();
        setOpenOrders(orders.filter((o: OpenOrder) => o.coin === symbol));
      } catch (err) {
        console.error('Failed to fetch orders:', err);
      }
    };

    fetchOrders();
    const interval = setInterval(fetchOrders, 3000); // Poll every 3s

    return () => clearInterval(interval);
  }, [address, isConnected, symbol]);

  // Filter fills for current symbol
  const fills = useMemo(() => {
    return userState.fills.filter((f) => f.coin === symbol).slice(0, 10);
  }, [userState.fills, symbol]);

  const handleSubmitOrder = async () => {
    if (!walletClient || !address || !isConnected) {
      setError('Wallet not connected');
      return;
    }

    if (!builderConfig?.builderAddress) {
      setError('Builder config not loaded');
      return;
    }

    const assetIndex = ASSET_INDEX[symbol];
    if (assetIndex === undefined) {
      setError(`Unknown symbol: ${symbol}`);
      return;
    }

    if (!size || parseFloat(size) <= 0) {
      setError('Invalid size');
      return;
    }

    if (orderType === 'limit' && (!price || parseFloat(price) <= 0)) {
      setError('Invalid price for limit order');
      return;
    }

    setError(null);
    setSuccess(null);
    setPending(true);

    try {
      // Build action
      const action =
        orderType === 'limit'
          ? buildLimitOrderAction({
              asset: assetIndex,
              isBuy: side === 'buy',
              price,
              size,
              builder: {
                address: builderConfig.builderAddress,
                feeBps: builderConfig.defaultFeeBps,
              },
            })
          : buildMarketOrderAction({
              asset: assetIndex,
              isBuy: side === 'buy',
              size,
              builder: {
                address: builderConfig.builderAddress,
                feeBps: builderConfig.defaultFeeBps,
              },
            });

      // Get current nonce (timestamp in milliseconds)
      const currentNonce = Date.now();

      // Sign with wallet
      const signature = await signAction(walletClient, action, currentNonce);

      // Submit to Hyperliquid
      const exchange = getHyperliquidExchange();
      const response = await exchange.submitAction(action, signature, currentNonce);

      if (response.status === 'ok') {
        setSuccess(`Order submitted successfully!`);
        setPrice('');
        setSize('');
      } else {
        setError(`Order failed: ${JSON.stringify(response.response)}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit order');
    } finally {
      setPending(false);
    }
  };

  const isWrongNetwork = isConnected && chain?.id !== 42161 && chain?.id !== 421614;

  return (
    <div style={{ padding: 12, display: 'grid', gap: 10, height: '100%', overflow: 'auto' }}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>Hyperliquid Trade</div>

      {!isConnected && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: 'rgba(255,200,100,0.1)',
            border: '1px solid rgba(255,200,100,0.3)',
            fontSize: 12,
          }}
        >
          Connect your wallet to trade
        </div>
      )}

      {isWrongNetwork && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: 'rgba(255,100,100,0.1)',
            border: '1px solid rgba(255,100,100,0.3)',
            fontSize: 12,
          }}
        >
          Wrong network. Switch to Arbitrum to trade on Hyperliquid.
        </div>
      )}

      {isConnected && !isWrongNetwork && (
        <>
          {/* Builder Approval Notice */}
          {builderConfig && builderConfig.builderAddress && !builderApproved && (
            <div
              style={{
                padding: 10,
                borderRadius: 8,
                background: 'rgba(120,190,255,0.08)',
                border: '1px solid rgba(120,190,255,0.2)',
                fontSize: 11,
              }}
            >
              <div style={{ marginBottom: 8, fontWeight: 600 }}>Builder Fee Approval Required</div>
              <div style={{ marginBottom: 8, opacity: 0.85 }}>
                Approve a {(builderConfig.defaultFeeBps / 100).toFixed(2)}% builder fee to trade and support the platform.
              </div>
              <button
                className="btn"
                onClick={handleApproveBuilder}
                disabled={approvingBuilder}
                style={{ fontSize: 11, padding: '6px 12px' }}
              >
                {approvingBuilder ? 'Approving...' : 'Approve Builder Fee'}
              </button>
            </div>
          )}

          {/* Account Info */}
          {balance && (
            <div style={{ fontSize: 11, opacity: 0.8 }}>
              Balance: ${parseFloat(balance).toFixed(2)}
              {position && position !== '0' && (
                <span style={{ marginLeft: 8 }}>
                  Position: {parseFloat(position) > 0 ? '+' : ''}
                  {parseFloat(position).toFixed(4)} {symbol}
                </span>
              )}
            </div>
          )}

          {/* Symbol Selector */}
          <label style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 11, opacity: 0.75 }}>Symbol</div>
            <select
              className="input"
              value={symbol}
              onChange={(e) => updateSymbol(e.target.value)}
              style={{ padding: '6px 10px', fontSize: 13 }}
            >
              {AVAILABLE_SYMBOLS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          {/* Buy/Sell Toggle */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn"
              onClick={() => setSide('buy')}
              style={{
                flex: 1,
                background: side === 'buy' ? 'rgba(70, 200, 140, 0.25)' : undefined,
                border: side === 'buy' ? '1px solid rgba(70, 200, 140, 0.5)' : undefined,
              }}
            >
              Buy
            </button>
            <button
              className="btn"
              onClick={() => setSide('sell')}
              style={{
                flex: 1,
                background: side === 'sell' ? 'rgba(255, 80, 120, 0.22)' : undefined,
                border: side === 'sell' ? '1px solid rgba(255, 80, 120, 0.5)' : undefined,
              }}
            >
              Sell
            </button>
          </div>

          {/* Order Type Toggle */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn"
              onClick={() => setOrderType('limit')}
              style={{
                flex: 1,
                background: orderType === 'limit' ? 'rgba(255,255,255,0.1)' : undefined,
              }}
            >
              Limit
            </button>
            <button
              className="btn"
              onClick={() => setOrderType('market')}
              style={{
                flex: 1,
                background: orderType === 'market' ? 'rgba(255,255,255,0.1)' : undefined,
              }}
            >
              Market
            </button>
          </div>

          {/* Price Input (for limit orders) */}
          {orderType === 'limit' && (
            <label style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 11, opacity: 0.75 }}>Price (USD)</div>
              <input
                className="input"
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                style={{ padding: '6px 10px', fontSize: 13 }}
              />
            </label>
          )}

          {/* Size Input */}
          <label style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 11, opacity: 0.75 }}>Size ({symbol})</div>
            <input
              className="input"
              type="number"
              step="0.001"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="0.000"
              style={{ padding: '6px 10px', fontSize: 13 }}
            />
          </label>

          {/* Submit Button */}
          <button
            className="btn"
            onClick={handleSubmitOrder}
            disabled={pending || !size || (orderType === 'limit' && !price)}
            style={{
              background: side === 'buy' ? 'rgba(70, 200, 140, 0.2)' : 'rgba(255, 80, 120, 0.18)',
              fontWeight: 600,
            }}
          >
            {pending
              ? 'Submitting...'
              : `${side === 'buy' ? 'Buy' : 'Sell'} ${symbol}`}
          </button>

          {/* Error/Success Messages */}
          {error && (
            <div
              style={{
                padding: 8,
                borderRadius: 6,
                background: 'rgba(255,100,100,0.1)',
                border: '1px solid rgba(255,100,100,0.3)',
                fontSize: 11,
                color: 'rgba(255,150,150,0.95)',
              }}
            >
              {error}
            </div>
          )}

          {success && (
            <div
              style={{
                padding: 8,
                borderRadius: 6,
                background: 'rgba(100,255,150,0.1)',
                border: '1px solid rgba(100,255,150,0.3)',
                fontSize: 11,
                color: 'rgba(150,255,180,0.95)',
              }}
            >
              {success}
            </div>
          )}

          {/* Open Orders */}
          {openOrders.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, opacity: 0.75 }}>
                Open Orders ({openOrders.length})
              </div>
              <div style={{ display: 'grid', gap: 4, maxHeight: 120, overflow: 'auto' }}>
                {openOrders.map((order) => (
                  <div
                    key={order.oid}
                    style={{
                      padding: '6px 8px',
                      borderRadius: 6,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      fontSize: 11,
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 8,
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <span style={{ color: order.side === 'B' ? 'rgba(120,255,190,0.9)' : 'rgba(255,140,170,0.9)' }}>
                        {order.side === 'B' ? 'Buy' : 'Sell'}
                      </span>
                      {' '}
                      {order.sz} @ ${order.limitPx}
                    </div>
                    <button
                      className="btn"
                      style={{ padding: '2px 8px', fontSize: 10 }}
                      onClick={async () => {
                        // TODO: Implement cancel
                        console.log('Cancel order', order.oid);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Fills */}
          {fills.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, opacity: 0.75 }}>
                Recent Fills
              </div>
              <div style={{ display: 'grid', gap: 3, maxHeight: 100, overflow: 'auto' }}>
                {fills.map((fill, i) => (
                  <div
                    key={`${fill.tid}-${i}`}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 4,
                      background: 'rgba(255,255,255,0.02)',
                      fontSize: 10,
                      fontFamily: 'monospace',
                    }}
                  >
                    <span style={{ color: fill.side === 'B' ? 'rgba(120,255,190,0.9)' : 'rgba(255,140,170,0.9)' }}>
                      {fill.side === 'B' ? 'Buy' : 'Sell'}
                    </span>
                    {' '}
                    {fill.sz} @ ${fill.px}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

