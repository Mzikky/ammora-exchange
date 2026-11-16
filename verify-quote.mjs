// Verify AmmoraSwapClient.prepareExactIn (quote + plan) against live GIWA Sepolia.
// READ-ONLY: prepares quotes/plans only, never executes, never signs.
import { createPublicClient, http, defineChain, formatUnits } from "viem";
import {
  giwaSepoliaAutoRouteDeployment,
  AmmoraSwapClient,
} from "@ammora-protocol/sdk";

const RPC = "https://sepolia-rpc.giwa.io";
const chain = defineChain({
  id: 91342, name: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const client = createPublicClient({ chain, transport: http(RPC, { retryCount: 1, timeout: 30000 }) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const USER = "0x7003F58d68EECA395d7Ab9E5d3946130B85eD8c5";
const WETH = giwaSepoliaAutoRouteDeployment.contracts.tokens.wrappedNative;

const swaps = await AmmoraSwapClient.create(client, {
  deploymentCatalog: { [chain.id]: giwaSepoliaAutoRouteDeployment },
});
console.log("AmmoraSwapClient created");

const cases = [
  { label: "dbc CBRL buy (ERC20 WETH in)", model: "dbc", pool: "0x3150eF2f5A654Dc723d585c99dE54235b2106131", tokenIn: WETH, inputAsset: "erc20", amountIn: 1000000000000000n, outDecimals: 9 },
  { label: "dbc CBRL buy (native ETH in)", model: "dbc", pool: "0x3150eF2f5A654Dc723d585c99dE54235b2106131", tokenIn: WETH, inputAsset: "native", amountIn: 1000000000000000n, outDecimals: 9 },
  { label: "dbc AMM buy (native ETH in)", model: "dbc", pool: "0x9a11EAaCeFA2DA3D93Daa1Bf63707c1eF085a55a", tokenIn: WETH, inputAsset: "native", amountIn: 1000000000000000n, outDecimals: 9 },
  { label: "dbc YUZU buy (native ETH in)", model: "dbc", pool: "0x7B51e128c1d06831184bCFa475472CcEEAcEad65", tokenIn: WETH, inputAsset: "native", amountIn: 1000000000000000n, outDecimals: 9 },
  { label: "AMT graduated pool, concentrated", model: "concentrated", pool: "0x1F110B9E52277A8BC6da7057f83d9b73a58054Ed", tokenIn: WETH, inputAsset: "erc20", amountIn: 1000000000000000n, outDecimals: 9 },
  { label: "AMT graduated pool, compounding", model: "compounding", pool: "0x1F110B9E52277A8BC6da7057f83d9b73a58054Ed", tokenIn: WETH, inputAsset: "erc20", amountIn: 1000000000000000n, outDecimals: 9 },
];

for (const c of cases) {
  try {
    const prepared = await swaps.prepareExactIn({
      model: c.model, pool: c.pool, tokenIn: c.tokenIn, inputAsset: c.inputAsset,
      amountIn: c.amountIn, payer: USER, recipient: USER, slippageBps: 50,
      executionMode: "direct-wallet",
    });
    const q = prepared.quote;
    console.log(`\nPASS ${c.label}`);
    console.log(`  tokenOut=${q.tokenOut} expectedOut=${formatUnits(q.expectedAmountOut, c.outDecimals)} minimumOut=${formatUnits(q.minimumAmountOut, c.outDecimals)} quoteBlock=${q.quoteBlockNumber}`);
    console.log(`  approvals: ${JSON.stringify(prepared.approvalRequirements.map((a) => ({ token: a.token, spender: a.spender, amount: a.amount.toString() })))}`);
  } catch (e) {
    console.log(`\nFAIL ${c.label}: ${String(e.message || e).slice(0, 400)}`);
  }
  await sleep(500);
}
