export const allCapabilities = [
  'marketData.subscribe',
  'orders.submit',
  'wallet.requestTransaction',
] as const;

export type Capability = (typeof allCapabilities)[number];


