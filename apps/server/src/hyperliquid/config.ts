// Hyperliquid builder configuration

export type BuilderConfig = {
  builderAddress: string;
  defaultFeeBps: number;
  maxFeeBps: number;
};

export function getBuilderConfig(): BuilderConfig {
  // Get from environment variables
  const builderAddress = process.env.HYPERLIQUID_BUILDER_ADDRESS || '';
  const defaultFeeBps = parseInt(process.env.HYPERLIQUID_BUILDER_FEE_BPS || '10', 10);
  const maxFeeBps = parseInt(process.env.HYPERLIQUID_MAX_FEE_BPS || '10', 10);

  return {
    builderAddress,
    defaultFeeBps,
    maxFeeBps,
  };
}

