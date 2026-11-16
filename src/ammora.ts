// Ammora SDK setup: GIWA Sepolia chain + public/swap clients.
//
// Chain facts from the Ammora docs + the SDK deployment catalog
// (giwaSepoliaAutoRouteDeployment, slot v4-auto-route-20260917):
//   chain id 91342, RPC https://sepolia-rpc.giwa.io,
//   explorer https://sepolia-explorer.giwa.io, 1s block time.

import {
  createPublicClient,
  defineChain,
  http,
  type Address,
  type PublicClient,
} from "viem";
import {
  AmmoraSwapClient,
  giwaSepoliaAutoRouteDeployment,
} from "@ammora-protocol/sdk";

export const CHAIN_ID = 91342;
export const RPC_URL = "https://sepolia-rpc.giwa.io";
export const EXPLORER_URL = "https://sepolia-explorer.giwa.io";
export const SLIPPAGE_BPS = 50; // 0.5%, the SDK example default

export const GIWA_CHAIN = defineChain({
  id: CHAIN_ID,
  name: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: {
    default: { name: "GIWA Sepolia Explorer", url: EXPLORER_URL },
  },
});

export function explorerTx(hash: string): string {
  return `${EXPLORER_URL}/tx/${hash}`;
}

export function explorerAddress(address: Address): string {
  return `${EXPLORER_URL}/address/${address}`;
}

let publicClient: PublicClient | null = null;
let swapClient: AmmoraSwapClient | null = null;

export function getPublicClient(): PublicClient {
  if (!publicClient) {
    publicClient = createPublicClient({
      chain: GIWA_CHAIN,
      transport: http(RPC_URL),
    });
  }
  return publicClient;
}

/** The documented wallet-facing swap client (swap:safe flow). */
export async function getSwapClient(): Promise<AmmoraSwapClient> {
  if (!swapClient) {
    swapClient = await AmmoraSwapClient.create(getPublicClient(), {
      deploymentCatalog: { [CHAIN_ID]: giwaSepoliaAutoRouteDeployment },
    });
  }
  return swapClient;
}
