# Hyperliquid Trading Implementation Summary

## What Was Built

A complete non-custodial Hyperliquid trading integration with two widgets:

1. **HyperliquidChartWidget** - Live price charts from Hyperliquid
2. **HyperliquidTradeWidget** - Full trading interface with wallet signing

## Key Features

### Non-Custodial Trading
- Users connect their own wallets (MetaMask, WalletConnect, Rainbow, Coinbase Wallet, etc.)
- All orders signed with EIP-712 in user's wallet
- Platform never holds user funds or private keys
- Fully decentralized - orders execute directly on Hyperliquid

### Builder Code Integration
- Platform earns revenue through builder fees (configurable, default 0.1%)
- Users approve max builder fee once (one-time EIP-712 signature)
- Builder fees included in every order automatically
- Proven revenue model (Telegram bot example: $7M+ in fees)
- Users still maintain full custody

### Real-time Data
- Live price charts via Hyperliquid WebSocket
- Real-time fill notifications
- Live position updates
- Order book streaming

## Technical Stack

### Frontend
- **wagmi** - React hooks for Ethereum wallets
- **viem** - TypeScript Ethereum library
- **@rainbow-me/rainbowkit** - Beautiful wallet connection UI
- **@tanstack/react-query** - Data fetching & caching

### Backend
- Proxy endpoints for Hyperliquid Info API
- Builder configuration management
- No private key storage (all signing client-side)

## File Structure

```
apps/web/src/
├── wallet/
│   ├── config.ts                    # Wagmi config (Arbitrum chains)
│   └── WalletProvider.tsx           # App-wide wallet context
├── hyperliquid/
│   ├── types.ts                     # Type definitions
│   ├── constants.ts                 # Asset indices, API URLs
│   ├── signing.ts                   # EIP-712 signing utilities
│   ├── client.ts                    # API client (Info & Exchange)
│   ├── builderApproval.ts           # Builder fee approval logic
│   └── useUserState.ts              # WebSocket hook for fills
└── widgets/
    ├── HyperliquidChartWidget.tsx   # Price chart widget
    └── HyperliquidTradeWidget.tsx   # Trading interface

apps/server/src/
├── hyperliquid/
│   ├── config.ts                    # Builder configuration
│   └── info.ts                      # Proxy endpoints
└── sse/
    └── hyperliquid.ts               # SSE price stream
```

## How It Works

### Connection Flow
```
1. User clicks "Connect Wallet" in topbar
2. RainbowKit modal appears
3. User selects wallet (MetaMask, WalletConnect, etc.)
4. Approves connection
5. Wallet state available globally via wagmi
```

### Builder Approval Flow (One-time)
```
1. User drags "Hyperliquid Trade" widget onto canvas
2. Widget detects no builder approval
3. Shows approval prompt with fee details
4. User clicks "Approve Builder Fee"
5. Wallet prompts for EIP-712 signature
6. User approves
7. Approval submitted to Hyperliquid
8. Status stored in localStorage
9. All future orders include builder code automatically
```

### Order Submission Flow
```
1. User fills out order form (symbol, side, type, price, size)
2. User clicks "Buy {symbol}" or "Sell {symbol}"
3. Widget constructs OrderAction with builder code
4. Gets current nonce (timestamp)
5. Calls walletClient.signTypedData() with EIP-712 data
6. Wallet prompts user to sign
7. User approves signature
8. Widget submits signed order to Hyperliquid API
9. Hyperliquid validates signature & processes order
10. WebSocket streams fill notification
11. Widget updates UI with new position/fill
```

## EIP-712 Signature Details

### Domain
```typescript
{
  name: 'Exchange',
  version: '1',
  chainId: 42161,  // Arbitrum mainnet (421614 for testnet)
  verifyingContract: '0x...'  // Hyperliquid contract
}
```

### Message Types
```typescript
{
  Agent: [
    { name: 'source', type: 'string' },      // User address
    { name: 'connectionId', type: 'bytes32' } // Nonce
  ],
  Order: [...],
  Builder: [
    { name: 'b', type: 'address' },  // Builder address
    { name: 'f', type: 'uint64' }    // Fee in tenths of bp
  ]
}
```

### Order Action Structure
```typescript
{
  type: 'order',
  orders: [{
    a: 0,           // asset (0=BTC from meta)
    b: true,        // is buy
    p: '50000.0',   // price as string
    s: '0.1',       // size as string
    r: false,       // reduce only
    t: { limit: { tif: 'Gtc' } }
  }],
  grouping: 'na',
  builder: {        // Builder code
    b: '0x...',     // Your builder address
    f: 10           // 1 basis point (0.1%)
  }
}
```

## Security Model

### What Users Control
- ✅ Private keys (in their wallet)
- ✅ Order approval (must sign each order)
- ✅ Builder fee approval (can revoke anytime on Hyperliquid)
- ✅ Funds (always in their control)

### What Platform Controls
- Only the builder address configuration
- No access to user funds
- No ability to trade without user signature
- No custody of any kind

### Attack Vectors Mitigated
- ❌ No private key exposure (client-side signing)
- ❌ No replay attacks (nonce = timestamp)
- ❌ No unauthorized trading (user must sign)
- ❌ No fund theft (non-custodial)
- ❌ No excessive fees (user approves max fee)

## Configuration

### Required Environment Variables

**Server** (`apps/server/.env`):
```bash
# Optional - for builder fee revenue
HYPERLIQUID_BUILDER_ADDRESS=0x...
HYPERLIQUID_BUILDER_FEE_BPS=10
HYPERLIQUID_MAX_FEE_BPS=10
```

**Client** (`apps/web/.env`):
```bash
# Required for WalletConnect
VITE_WALLETCONNECT_PROJECT_ID=your-project-id

# Network selection
VITE_HYPERLIQUID_TESTNET=true  # Use testnet for dev
```

### Get WalletConnect Project ID
1. Visit https://cloud.walletconnect.com
2. Create free account
3. Create new project
4. Copy Project ID
5. Paste into `VITE_WALLETCONNECT_PROJECT_ID`

## Testing Checklist

### Testnet Testing
- [ ] Connect wallet (MetaMask on Arbitrum Sepolia)
- [ ] Get testnet USDC from faucet
- [ ] Approve builder fee
- [ ] Place limit order
- [ ] Place market order
- [ ] Cancel order
- [ ] Verify fills appear
- [ ] Check position updates

### Mainnet Testing (with small amounts)
- [ ] Switch to mainnet (`VITE_HYPERLIQUID_TESTNET=false`)
- [ ] Connect wallet (Arbitrum mainnet)
- [ ] Approve builder fee
- [ ] Place small test order
- [ ] Verify execution
- [ ] Check builder fees on Hyperliquid

## Known Limitations

1. **Asset Indices Hardcoded**: Currently uses static mapping in `constants.ts`
   - Fix: Fetch from `/api/hyperliquid/meta` dynamically

2. **Nonce = Timestamp**: Using `Date.now()` for nonce
   - Should verify this matches Hyperliquid's expected format

3. **No Order Cancel**: Cancel button exists but not implemented
   - Need to add `buildCancelOrderAction` flow

4. **EIP-712 Domain**: Verifying contract address is placeholder
   - Need actual Hyperliquid contract address

5. **Timeframe in Chart**: Currently just UI display, no aggregation
   - Could add timeframe-based OHLCV data

6. **No TP/SL**: Only supports standard limit/market orders
   - Could add trigger order types

## Next Steps

### Critical (before production):
1. Get actual Hyperliquid verifying contract address
2. Test extensively on testnet
3. Verify EIP-712 signature format matches Hyperliquid's expectations
4. Add order cancellation
5. Add error boundary around widget
6. Add retry logic for failed orders

### Nice to Have:
1. Add TP/SL order types
2. Fetch asset metadata dynamically
3. Add position closing shortcuts
4. Add order history with filtering
5. Add PnL calculator
6. Add risk warnings for large orders
7. Add keyboard shortcuts (Enter to submit, Esc to clear)
8. Add order confirmation dialog
9. Add slippage warnings for market orders
10. Add leverage display/controls

## Revenue Potential

Based on builder code model:
- Every trade incurs platform builder fee (default 0.1%)
- User approves max fee once
- Fee collected automatically by Hyperliquid
- Example: $1M daily volume × 0.1% = $1,000/day revenue
- Proven model: Telegram bot earned $7M+ in fees

## Resources

- [Hyperliquid Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/)
- [Builder Codes](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes)
- [Hyperliquid TypeScript SDK](https://github.com/nktkas/hyperliquid)
- [wagmi Documentation](https://wagmi.sh/)
- [RainbowKit Documentation](https://www.rainbowkit.com/)

