// Check DBC curve state + a small buy quote for selected launches (read-only).
// Token/curve addresses come from launches.log (on-chain LaunchCreated scan).
import { readFileSync } from "node:fs";
import { createPublicClient, http, defineChain, formatUnits } from "viem";
import {
  giwaSepoliaAutoRouteDeployment,
  AmmoraV4LaunchCurveClient,
  resolveAmmoraFinalizedHead,
  giwaSepoliaAutoRoute,
} from "@ammora-protocol/sdk";

const RPC = "https://sepolia-rpc.giwa.io";
const chain = defineChain({
  id: 91342, name: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const client = createPublicClient({ chain, transport: http(RPC, { retryCount: 1, timeout: 30000 }) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const core = {
  configRegistry: giwaSepoliaAutoRouteDeployment.contracts.launch.configRegistry,
  launchFactory: giwaSepoliaAutoRouteDeployment.contracts.launch.factory,
  graduationAdapter: giwaSepoliaAutoRouteDeployment.contracts.launch.graduationAdapter,
  feePolicy: giwaSepoliaAutoRouteDeployment.contracts.launch.feePolicy,
};

const text = readFileSync("launches.log", "utf8");
const launches = JSON.parse(text.slice(text.indexOf("[")));
const WANT = ["AMM", "AMMORA", "AROMMA", "YUZU", "APAD", "MIMO", "CBRL", "GCAT", "AMT", "FBD"];
const seen = new Set();
const candidates = [];
for (const l of launches) {
  if (WANT.includes(l.symbol) && !seen.has(l.symbol)) { seen.add(l.symbol); candidates.push(l); }
}
// Also include the most recent 3 launches regardless of symbol
for (const l of launches.slice(-3)) {
  if (!candidates.some((c) => c.curve === l.curve)) candidates.push(l);
}
console.log("checking", candidates.length, "curves");

const block = await resolveAmmoraFinalizedHead([client], giwaSepoliaAutoRoute.finality);
console.log("finalized head:", block.toString());

for (const c of candidates) {
  try {
    const sdk = new AmmoraV4LaunchCurveClient(client, c.curve, core);
    const state = await sdk.getStateAtBlock(block);
    const flat = {};
    for (const [k, v] of Object.entries(state)) flat[k] = typeof v === "bigint" ? v.toString() : v;
    console.log(JSON.stringify({ symbol: c.symbol, token: c.token, curve: c.curve, decimals: c.decimals, ...flat }));
    if (state.status === 1) {
      const quote = await sdk.quoteExactInputAtBlock(1000000000000000n, false, block);
      console.log(`  BUY 0.001 WETH -> ${formatUnits(quote.amountOut, Number(c.decimals))} ${c.symbol} (raw ${quote.amountOut})`);
    }
  } catch (e) {
    console.log(`${c.symbol} ${c.curve}: ERROR ${String(e.message || e).slice(0, 300)}`);
  }
  await sleep(400);
}
