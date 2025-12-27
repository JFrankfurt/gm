export function isMarketEntitled(args: { viewerId: string; symbol: string }): boolean {
  // PoC entitlement matrix:
  // - userA: BTC only
  // - userB: ETH only
  // - anon: none
  if (args.viewerId === 'userA') return args.symbol === 'BTC-USD';
  if (args.viewerId === 'userB') return args.symbol === 'ETH-USD';
  return false;
}


