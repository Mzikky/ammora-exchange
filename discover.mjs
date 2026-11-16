// Discover live Ammora pools + launched tokens on GIWA Sepolia (read-only).
// Scans factory events in chunks and prints a JSON summary.
import { createPublicClient, http, defineChain, decodeEventLog, erc20Abi } from "viem";
import {
  giwaSepoliaAutoRouteDeployment,
  ammoraLaunchFactoryV4Abi,
  almmFactoryAbi,
  ammConcentratedFactoryV3Abi,
  ammCompoundingFactoryV3Abi,
} from "@ammora-protocol/sdk";

const RPC = "https://sepolia-rpc.giwa.io";
const chain = defineChain({
  id: 91342,
  name: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const client = createPublicClient({ chain, transport: http(RPC, { retryCount: 1, timeout: 30000 }) });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SOURCES = [
  { label: "launch", address: giwaSepoliaAutoRouteDeployment.contracts.launch.factory, abi: ammoraLaunchFactoryV4Abi, event: "LaunchCreated" },
  { label: "almm", address: giwaSepoliaAutoRouteDeployment.contracts.liquidityMarketMaker.factory, abi: almmFactoryAbi, event: "PoolCreated" },
  { label: "concentrated", address: giwaSepoliaAutoRouteDeployment.contracts.launch.concentratedFactory, abi: ammConcentratedFactoryV3Abi, event: "PoolCreated" },
  { label: "compounding", address: giwaSepoliaAutoRouteDeployment.contracts.launch.compoundingFactory, abi: ammCompoundingFactoryV3Abi, event: "PoolCreated" },
];

const head = await client.getBlockNumber();
console.log("head:", head.toString());
const WINDOW = 2_000_000n; // ~23 days at 1s blocks
const from = head - WINDOW;
const CHUNK = 100_000n;

const found = { launches: [], almmPools: [], concentratedPools: [], compoundingPools: [] };

for (const src of SOURCES) {
  console.log(`\n--- scanning ${src.label} ${src.address} ---`);
  for (let start = from; start <= head; start += CHUNK) {
    const end = start + CHUNK - 1n > head ? head : start + CHUNK - 1n;
    try {
      const logs = await client.getLogs({ address: src.address, event: src.abi.find((e) => e.type === "event" && e.name === src.event), fromBlock: start, toBlock: end });
      if (logs.length) console.log(`  blocks ${start}-${end}: ${logs.length} logs`);
      for (const log of logs) {
        const d = decodeEventLog({ abi: src.abi, data: log.data, topics: log.topics });
        const entry = { blockNumber: log.blockNumber.toString(), tx: log.transactionHash, args: {} };
        for (const [k, v] of Object.entries(d.args)) entry.args[k] = typeof v === "bigint" ? v.toString() : v;
        if (src.label === "launch") found.launches.push(entry);
        else if (src.label === "almm") found.almmPools.push(entry);
        else if (src.label === "concentrated") found.concentratedPools.push(entry);
        else found.compoundingPools.push(entry);
      }
    } catch (e) {
      console.log(`  blocks ${start}-${end}: ERROR ${String(e.message || e).slice(0, 200)}`);
    }
    await sleep(300);
  }
}

// Enrich launches with token metadata
for (const l of found.launches) {
  const token = l.args.token;
  try {
    const [name, symbol, decimals] = await Promise.all([
      client.readContract({ address: token, abi: erc20Abi, functionName: "name" }).catch(() => "?"),
      client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }).catch(() => "?"),
      client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }).catch(() => "?"),
    ]);
    l.token = { name, symbol, decimals: String(decimals) };
  } catch { l.token = null; }
  await sleep(200);
}

// Enrich pools with token metadata + balances (liquidity gauge)
const enrichPool = async (p, baseKey, quoteKey) => {
  const pool = p.args.pool;
  const base = p.args[baseKey];
  const quote = p.args[quoteKey];
  try {
    const [bSym, bDec, qSym, qDec, bBal, qBal] = await Promise.all([
      client.readContract({ address: base, abi: erc20Abi, functionName: "symbol" }).catch(() => "?"),
      client.readContract({ address: base, abi: erc20Abi, functionName: "decimals" }).catch(() => "?"),
      client.readContract({ address: quote, abi: erc20Abi, functionName: "symbol" }).catch(() => "?"),
      client.readContract({ address: quote, abi: erc20Abi, functionName: "decimals" }).catch(() => "?"),
      client.readContract({ address: base, abi: erc20Abi, functionName: "balanceOf", args: [pool] }).catch(() => null),
      client.readContract({ address: quote, abi: erc20Abi, functionName: "balanceOf", args: [pool] }).catch(() => null),
    ]);
    p.tokens = { base: { address: base, symbol: bSym, decimals: String(bDec), poolBalance: bBal === null ? null : bBal.toString() }, quote: { address: quote, symbol: qSym, decimals: String(qDec), poolBalance: qBal === null ? null : qBal.toString() } };
  } catch { p.tokens = null; }
  await sleep(200);
};
for (const p of found.almmPools) await enrichPool(p, "baseToken", "quoteToken");
for (const p of found.concentratedPools) await enrichPool(p, "baseToken", "quoteToken");
for (const p of found.compoundingPools) await enrichPool(p, "baseToken", "quoteToken");

console.log("\n===== SUMMARY =====");
console.log(JSON.stringify(found, null, 2));
