// Scan LaunchCreated events on GIWA Sepolia (read-only), chunked to the RPC's
// 10,000-block eth_getLogs limit. Enriches each launch with token metadata.
import { createPublicClient, http, defineChain, decodeEventLog, erc20Abi } from "viem";
import { giwaSepoliaAutoRouteDeployment, ammoraLaunchFactoryV4Abi } from "@ammora-protocol/sdk";

const RPC = "https://sepolia-rpc.giwa.io";
const chain = defineChain({
  id: 91342, name: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const client = createPublicClient({ chain, transport: http(RPC, { retryCount: 1, timeout: 30000 }) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const factory = giwaSepoliaAutoRouteDeployment.contracts.launch.factory;
const event = ammoraLaunchFactoryV4Abi.find((e) => e.type === "event" && e.name === "LaunchCreated");
const head = await client.getBlockNumber();
console.log("head:", head.toString(), "factory:", factory);

const WINDOW = BigInt(process.env.WINDOW ?? "1500000");
const from = head - WINDOW;
const CHUNK = 9500n;
const launches = [];
let errors = 0;
for (let start = from; start <= head; start += CHUNK) {
  const end = start + CHUNK - 1n > head ? head : start + CHUNK - 1n;
  try {
    const logs = await client.getLogs({ address: factory, event, fromBlock: start, toBlock: end });
    if (logs.length) console.log(`blocks ${start}-${end}: ${logs.length} launches`);
    for (const log of logs) {
      const d = decodeEventLog({ abi: ammoraLaunchFactoryV4Abi, data: log.data, topics: log.topics });
      launches.push({ blockNumber: log.blockNumber.toString(), tx: log.transactionHash, token: d.args.token, curve: d.args.curve, creator: d.args.creator, configId: d.args.configId.toString(), protocolVersion: d.args.protocolVersion, metadataURI: d.args.metadataURI });
    }
  } catch (e) {
    errors++;
    console.log(`blocks ${start}-${end}: ERROR ${String(e.message || e).slice(0, 120)}`);
  }
  await sleep(120);
}
console.log(`scan done: ${launches.length} launches, ${errors} chunk errors`);

for (const l of launches) {
  try {
    const [name, symbol, decimals] = await Promise.all([
      client.readContract({ address: l.token, abi: erc20Abi, functionName: "name" }).catch(() => "?"),
      client.readContract({ address: l.token, abi: erc20Abi, functionName: "symbol" }).catch(() => "?"),
      client.readContract({ address: l.token, abi: erc20Abi, functionName: "decimals" }).catch(() => "?"),
    ]);
    l.name = name; l.symbol = symbol; l.decimals = String(decimals);
  } catch { l.name = "?"; l.symbol = "?"; l.decimals = "?"; }
  await sleep(100);
}
console.log(JSON.stringify(launches, null, 2));
