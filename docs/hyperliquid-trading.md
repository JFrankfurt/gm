# Hyperliquid Trading Widget

## Overview

The Hyperliquid Trading Widget provides non-custodial trading on Hyperliquid directly from the GM canvas. Users connect their own wallets (MetaMask, WalletConnect, etc.) and sign orders with EIP-712, maintaining full control of their funds.

## Features

- **Non-custodial**: All orders signed by user's wallet
- **Builder code integration**: Platform earns fees on user trades (with user approval)
- **Real-time data**: Live positions, fills, and order book via WebSocket
- **Multi-asset**: Trade BTC, ETH, SOL, and more
- **Limit & Market orders**: Full order type support

## Setup

### 1. Environment Variables

#### Server (`apps/server/.env`)
```bash
HYPERLIQUID_BUILDER_ADDRESS=0x...  # Your builder address
HYPERLIQUID_BUILDER_FEE_BPS=10     # 1 basis point (0.1%)
HYPERLIQUID_MAX_FEE_BPS=10
```

#### Client (`apps/web/.env`)
```bash
VITE_WALLETCONNECT_PROJECT_ID=your-project-id
VITE_HYPERLIQUID_TESTNET=true  # Use testnet for development
```

### 2. Get WalletConnect Project ID

1. Go to https://cloud.walletconnect.com
2. Create a free project
3. Copy the Project ID
4. Add to `apps/web/.env`

### 3. Set Up Builder Code (Optional)

1. Create a Hyperliquid account with >100 USDC
2. Get your builder address from Hyperliquid platform
3. Add to `apps/server/.env`
4. Users will approve your builder fee on first trade

## Usage

### Connect Wallet

1. Click "Connect Wallet" in the top bar
2. Select your wallet (MetaMask, WalletConnect, etc.)
3. Approve the connection
4. Ensure you're on Arbitrum network

### Approve Builder Fee (One-time)

1. Drag "Hyperliquid Trade" widget onto canvas
2. Widget prompts for builder fee approval
3. Click "Approve Builder Fee"
4. Sign the approval transaction in your wallet
5. Approval is stored locally and on-chain

### Place an Order

1. Select symbol (BTC, ETH, SOL, etc.)
2. Choose Buy or Sell
3. Select order type (Limit or Market)
4. Enter price (for limit orders) and size
5. Click "Buy {symbol}" or "Sell {symbol}"
6. Sign the order in your wallet
7. Order executes on Hyperliquid

### Monitor Positions

- Current position size shown below account balance
- Open orders displayed with cancel buttons
- Recent fills shown at bottom of widget

## Architecture

### Data Flow

```
User → Connect Wallet (MetaMask/WC)
     ↓
Widget → Fetch account data from backend proxy
     ↓
User → Submit order
     ↓
Widget → Build order action + builder code
     ↓
Wallet → Sign EIP-712 typed data
     ↓
Widget → Submit signed order to Hyperliquid API
     ↓
Hyperliquid → Process order, deduct fees
     ↓
WebSocket → Real-time fill notification
     ↓
Widget → Update UI
```

### Security

- ✅ Private keys never leave user's wallet
- ✅ All orders signed by user (EIP-712)
- ✅ No custody - platform never holds funds
- ✅ Builder fees require explicit user approval
- ✅ Orders validated before signing

## Testing

### Testnet

1. Set `VITE_HYPERLIQUID_TESTNET=true`
2. Get testnet USDC from faucet
3. Connect wallet to Arbitrum Sepolia
4. Test full order flow

### Mainnet

1. Set `VITE_HYPERLIQUID_TESTNET=false`
2. Use real funds (start small!)
3. Ensure builder address is configured
4. Monitor for any errors

## Troubleshooting

### "Wallet not connected"
- Click "Connect Wallet" in topbar
- Approve connection in wallet popup

### "Wrong network"
- Widget shows this error if not on Arbitrum
- Switch network in your wallet to Arbitrum (mainnet) or Arbitrum Sepolia (testnet)

### "Builder config not loaded"
- Check server environment variables
- Restart server after adding builder address

### "Failed to sign action"
- User rejected signature in wallet
- Try again and approve the signature

### Orders not appearing
- Check Arbitrum network (must match API - mainnet vs testnet)
- Verify wallet has sufficient balance
- Check browser console for errors

## Builder Code Revenue

- Earn fees on every user trade (default 0.1%)
- Fees are collected on-chain by Hyperliquid
- Claim via Hyperliquid's referral rewards system
- Track fills at: `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{address}/{YYYYMMDD}.csv.lz4`

## API Endpoints

### Backend Proxy
- `GET /api/hyperliquid/meta` - Asset metadata
- `GET /api/hyperliquid/account/:address` - Account state
- `GET /api/hyperliquid/builder` - Builder configuration
- `GET /api/hyperliquid/orders/:address` - Open orders
- `GET /api/hyperliquid/fills/:address` - User fills

### Direct to Hyperliquid
- Orders submitted directly from browser to `https://api.hyperliquid.xyz/exchange`
- Real-time data from `wss://api.hyperliquid.xyz/ws`

## Limitations

- Currently supports perpetuals only (not spot)
- No TP/SL orders yet (only standard limit/market)
- No batch orders (one order at a time)
- Timeframe selection in chart is UI-only (data is tick-based)

## Future Enhancements

- Add TP/SL order types
- Support spot trading
- Add advanced order types
- Position management (close all, reduce only)
- Order history with filtering
- PnL tracking and analytics
- Keyboard shortcuts for quick trading

