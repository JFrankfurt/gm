import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { arbitrum, arbitrumSepolia } from 'wagmi/chains';

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'demo-project-id';

// Hyperliquid runs on Arbitrum
export const config = getDefaultConfig({
  appName: 'GM Workspace',
  projectId,
  chains: [arbitrum, arbitrumSepolia],
  ssr: false,
});

