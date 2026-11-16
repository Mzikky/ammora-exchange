// Ammora Swap — minimal exchange UI logic.
//
// Flow (all signing happens in the user's own wallet; this page never sees
// keys, seeds, or key files):
//   1. Connect wallet (window.ethereum) -> switch/add GIWA Sepolia (91342).
//   2. Pick a market (WETH <-> launched token on its DBC bonding curve).
//   3. Get quote -> AmmoraSwapClient.prepareExactIn (read-only).
//   4. Swap -> prepared.execute(wallet) handles the exact approval + swap +
//      receipt verification, with status updates along the way.
// WETH note: native ETH input is NOT enabled for these DBC pools in this
// deployment (verified live: "not enabled by the reviewed native execution
// registry"), so buys pay in WETH (ERC-20). The Wrap box converts ETH -> WETH.

import {
  createWalletClient,
  custom,
  erc20Abi,
  formatUnits,
  parseUnits,
  type Address,
  type WalletClient,
} from "viem";
import type {
  PreparedExactInputSwap,
  SafeSwapStatus,
} from "@ammora-protocol/sdk";
import {
  CHAIN_ID,
  EXPLORER_URL,
  GIWA_CHAIN,
  RPC_URL,
  SLIPPAGE_BPS,
  explorerAddress,
  explorerTx,
  getPublicClient,
  getSwapClient,
} from "./ammora";
import { MARKETS, WETH, type Market, type MarketToken } from "./tokens";

// Minimal WETH interface (deposit only — wrap ETH -> WETH).
const wethAbi = [
  {
    type: "function",
    name: "deposit",
    inputs: [],
    outputs: [],
    stateMutability: "payable",
  },
] as const;

type EthProvider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
};

function getEthereum(): EthProvider | null {
  const eth = (window as unknown as { ethereum?: EthProvider }).ethereum;
  return eth ?? null;
}

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmt(amount: bigint, decimals: number): string {
  const s = formatUnits(amount, decimals);
  const [whole, frac = ""] = s.split(".");
  const trimmed = frac.slice(0, 6).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) {
    const m = e.message.split("\n")[0];
    return m.length > 220 ? `${m.slice(0, 220)}…` : m;
  }
  return String(e);
}

// --- DOM ---

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const connectBtn = $("connectBtn") as HTMLButtonElement;
const pairSelect = $("pairSelect") as HTMLSelectElement;
const pairInfo = $("pairInfo");
const tokenInSelect = $("tokenInSelect") as HTMLSelectElement;
const tokenOutSelect = $("tokenOutSelect") as HTMLSelectElement;
const amountInEl = $("amountIn") as HTMLInputElement;
const amountOutEl = $("amountOut");
const balanceLine = $("balanceLine");
const flipBtn = $("flipBtn") as HTMLButtonElement;
const quoteBox = $("quoteBox");
const qExpected = $("qExpected");
const qMinimum = $("qMinimum");
const qRoute = $("qRoute");
const qBlock = $("qBlock");
const qApproval = $("qApproval");
const quoteBtn = $("quoteBtn") as HTMLButtonElement;
const swapBtn = $("swapBtn") as HTMLButtonElement;
const statusLine = $("statusLine");
const txLine = $("txLine");
const wrapAmountEl = $("wrapAmount") as HTMLInputElement;
const wrapBtn = $("wrapBtn") as HTMLButtonElement;
const wrapStatus = $("wrapStatus");
const wrapTx = $("wrapTx");

// --- State ---

let account: Address | null = null;
let walletClient: WalletClient | null = null;
let market: Market = MARKETS[0];
let buyDirection = true; // true: WETH -> base token; false: base token -> WETH
let prepared: PreparedExactInputSwap | null = null;
let balances: { eth: bigint; weth: bigint; base: bigint } = {
  eth: 0n,
  weth: 0n,
  base: 0n,
};

function tokenIn(): MarketToken {
  return buyDirection ? WETH : market.base;
}
function tokenOut(): MarketToken {
  return buyDirection ? market.base : WETH;
}

function setStatus(msg: string, kind: "" | "error" | "ok" = "") {
  statusLine.textContent = msg;
  statusLine.className = `status${kind ? ` ${kind}` : ""}`;
}

function setWrapStatus(msg: string, kind: "" | "error" | "ok" = "") {
  wrapStatus.textContent = msg;
  wrapStatus.className = `status${kind ? ` ${kind}` : ""}`;
}

function clearQuote() {
  prepared = null;
  quoteBox.hidden = true;
  amountOutEl.textContent = "–";
  swapBtn.disabled = true;
}

function renderPair() {
  pairInfo.innerHTML =
    `${market.base.name} · DBC bonding curve ` +
    `<a href="${explorerAddress(market.curve)}" target="_blank" rel="noreferrer">${short(market.curve)}</a>` +
    ` · ${market.note}`;
  tokenInSelect.innerHTML = "";
  for (const t of [WETH, market.base]) {
    const opt = document.createElement("option");
    opt.value = t.address;
    opt.textContent = `${t.symbol} — ${t.name}`;
    tokenInSelect.appendChild(opt);
  }
  tokenInSelect.value = tokenIn().address;
  tokenOutSelect.innerHTML = "";
  const outOpt = document.createElement("option");
  outOpt.textContent = `${tokenOut().symbol} — ${tokenOut().name}`;
  tokenOutSelect.appendChild(outOpt);
  renderBalances();
}

function renderBalances() {
  balanceLine.textContent = account
    ? `Balance: ${fmt(balances.eth, 18)} ETH · ${fmt(balances.weth, 18)} WETH · ${fmt(balances.base, market.base.decimals)} ${market.base.symbol}`
    : "Connect your wallet to see balances.";
}

async function refreshBalances() {
  if (!account) return;
  const pc = getPublicClient();
  const [eth, weth, base] = await Promise.all([
    pc.getBalance({ address: account }),
    pc.readContract({
      address: WETH.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    }),
    pc.readContract({
      address: market.base.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    }),
  ]);
  balances = { eth, weth, base };
  renderBalances();
}

// --- Wallet ---

async function connect() {
  const eth = getEthereum();
  if (!eth) {
    setStatus(
      "No wallet found. Open this page in a wallet browser (e.g. MetaMask / Binance Wallet) with an injected provider.",
      "error",
    );
    return;
  }
  try {
    setStatus("Requesting wallet connection…");
    const wc = createWalletClient({
      chain: GIWA_CHAIN,
      transport: custom(eth as never),
    });
    const addresses = await wc.requestAddresses();
    if (addresses.length === 0) throw new Error("No account returned by wallet.");
    walletClient = wc;
    account = addresses[0];

    // Make sure we are on GIWA Sepolia (91342).
    const chainId = await wc.getChainId();
    if (chainId !== CHAIN_ID) {
      try {
        await wc.switchChain({ id: CHAIN_ID });
      } catch {
        // Chain not added yet — add it, then switch.
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: `0x${CHAIN_ID.toString(16)}`,
              chainName: "GIWA Sepolia",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: [RPC_URL],
              blockExplorerUrls: [EXPLORER_URL],
            },
          ],
        });
        await wc.switchChain({ id: CHAIN_ID });
      }
    }

    connectBtn.textContent = short(account);
    setStatus(`Connected: ${account}`, "ok");
    await refreshBalances();
  } catch (e) {
    setStatus(`Connection failed: ${errorMessage(e)}`, "error");
  }
}

// --- Wrap ETH -> WETH ---

async function wrap() {
  if (!account || !walletClient) {
    setWrapStatus("Connect your wallet first.", "error");
    return;
  }
  let value: bigint;
  try {
    value = parseUnits(wrapAmountEl.value.trim(), 18);
    if (value <= 0n) throw new Error("Amount must be greater than 0.");
  } catch (e) {
    setWrapStatus(`Invalid amount: ${errorMessage(e)}`, "error");
    return;
  }
  if (value > balances.eth) {
    setWrapStatus("Not enough ETH (keep some for gas).", "error");
    return;
  }
  try {
    wrapBtn.disabled = true;
    setWrapStatus("Confirm the wrap in your wallet…");
    const hash = await walletClient.writeContract({
      account,
      address: WETH.address,
      abi: wethAbi,
      functionName: "deposit",
      value,
      chain: GIWA_CHAIN,
    });
    wrapTx.innerHTML = `Wrap tx: <a href="${explorerTx(hash)}" target="_blank" rel="noreferrer">${hash}</a>`;
    setWrapStatus("Waiting for confirmation…");
    await getPublicClient().waitForTransactionReceipt({ hash });
    setWrapStatus(`Wrapped ${fmt(value, 18)} ETH → WETH.`, "ok");
    await refreshBalances();
  } catch (e) {
    setWrapStatus(`Wrap failed: ${errorMessage(e)}`, "error");
  } finally {
    wrapBtn.disabled = false;
  }
}

// --- Quote ---

async function quote() {
  if (!account) {
    setStatus("Connect your wallet first.", "error");
    return;
  }
  let amountIn: bigint;
  const tIn = tokenIn();
  try {
    amountIn = parseUnits(amountInEl.value.trim(), tIn.decimals);
    if (amountIn <= 0n) throw new Error("Amount must be greater than 0.");
  } catch (e) {
    setStatus(`Invalid amount: ${errorMessage(e)}`, "error");
    return;
  }
  const bal = buyDirection ? balances.weth : balances.base;
  if (amountIn > bal) {
    setStatus(
      `Not enough ${tIn.symbol} balance (${fmt(bal, tIn.decimals)}). ` +
        (buyDirection ? "Wrap ETH first, above." : `Buy some ${market.base.symbol} first.`),
      "error",
    );
    return;
  }
  try {
    quoteBtn.disabled = true;
    setStatus("Fetching quote from the curve…");
    const swaps = await getSwapClient();
    prepared = await swaps.prepareExactIn({
      model: "dbc",
      pool: market.curve,
      tokenIn: tIn.address,
      inputAsset: "erc20",
      amountIn,
      payer: account,
      recipient: account,
      slippageBps: SLIPPAGE_BPS,
      executionMode: "direct-wallet",
    });
    const q = prepared.quote;
    const tOut = tokenOut();
    amountOutEl.textContent = `${fmt(q.expectedAmountOut, tOut.decimals)} ${tOut.symbol}`;
    qExpected.textContent = `${fmt(q.expectedAmountOut, tOut.decimals)} ${tOut.symbol}`;
    qMinimum.textContent = `${fmt(q.minimumAmountOut, tOut.decimals)} ${tOut.symbol}`;
    qRoute.textContent = `${tIn.symbol} → ${tOut.symbol} · DBC curve ${short(market.curve)}`;
    qBlock.textContent = q.quoteBlockNumber.toString();
    qApproval.textContent =
      prepared.approvalRequirements.length === 0
        ? "None needed"
        : prepared.approvalRequirements
            .map(
              (a) =>
                `${fmt(a.amount, tIn.decimals)} ${tIn.symbol} → ${short(a.spender)}`,
            )
            .join(", ");
    quoteBox.hidden = false;
    swapBtn.disabled = false;
    setStatus("Quote ready — valid ~30s. Tap Swap to execute.", "ok");
  } catch (e) {
    clearQuote();
    setStatus(`Quote failed: ${errorMessage(e)}`, "error");
  } finally {
    quoteBtn.disabled = false;
  }
}

// --- Swap ---

function onSwapStatus(status: SafeSwapStatus) {
  const tIn = tokenIn();
  const tOut = tokenOut();
  switch (status.type) {
    case "quote-refreshed":
      setStatus("Quote refreshed (old one expired)…");
      break;
    case "approval-requested":
      setStatus(`Approve ${fmt(status.amount, tIn.decimals)} ${tIn.symbol} spend in your wallet…`);
      break;
    case "approval-submitted":
      txLine.innerHTML = `Approval tx: <a href="${explorerTx(status.hash)}" target="_blank" rel="noreferrer">${status.hash}</a>`;
      setStatus("Approval sent, waiting for confirmation…");
      break;
    case "approval-confirmed":
      setStatus(`Approval confirmed (block ${status.blockNumber}).`);
      break;
    case "swap-requested":
      setStatus("Confirm the swap in your wallet…");
      break;
    case "swap-submitted":
      txLine.innerHTML = `Swap tx: <a href="${explorerTx(status.hash)}" target="_blank" rel="noreferrer">${status.hash}</a>`;
      setStatus("Swap sent, waiting for confirmation…");
      break;
    case "swap-confirmed": {
      const received =
        status.amountReceived !== null
          ? ` Received ${fmt(status.amountReceived, tOut.decimals)} ${tOut.symbol}.`
          : "";
      setStatus(`Swap confirmed (block ${status.blockNumber}).${received}`, "ok");
      break;
    }
  }
}

async function swap() {
  if (!account || !walletClient || !prepared) return;
  try {
    swapBtn.disabled = true;
    quoteBtn.disabled = true;
    setStatus("Executing swap…");
    const result = await prepared.execute(walletClient, {
      autoRefresh: true,
      onStatus: onSwapStatus,
    });
    const tOut = tokenOut();
    const links = [
      `Swap: <a href="${explorerTx(result.hash)}" target="_blank" rel="noreferrer">${result.hash}</a>`,
    ];
    if (result.approvalHashes.length > 0) {
      links.push(
        `Approval: <a href="${explorerTx(result.approvalHashes[0])}" target="_blank" rel="noreferrer">${result.approvalHashes[0]}</a>`,
      );
    }
    txLine.innerHTML = links.join("<br />");
    const received =
      result.amountReceived !== null
        ? ` You received ${fmt(result.amountReceived, tOut.decimals)} ${tOut.symbol}.`
        : "";
    setStatus(`Swap complete.${received}`, "ok");
    clearQuote();
    await refreshBalances();
  } catch (e) {
    setStatus(`Swap failed: ${errorMessage(e)}`, "error");
  } finally {
    swapBtn.disabled = !prepared;
    quoteBtn.disabled = false;
  }
}

// --- Wiring ---

for (const m of MARKETS) {
  const opt = document.createElement("option");
  opt.value = m.id;
  opt.textContent = `WETH ⇄ ${m.base.symbol} — ${m.base.name}`;
  pairSelect.appendChild(opt);
}

pairSelect.addEventListener("change", () => {
  market = MARKETS.find((m) => m.id === pairSelect.value) ?? MARKETS[0];
  clearQuote();
  renderPair();
  void refreshBalances();
});

tokenInSelect.addEventListener("change", () => {
  buyDirection = tokenInSelect.value === WETH.address;
  clearQuote();
  renderPair();
});

flipBtn.addEventListener("click", () => {
  buyDirection = !buyDirection;
  clearQuote();
  renderPair();
});

amountInEl.addEventListener("input", () => {
  if (prepared) clearQuote();
});

connectBtn.addEventListener("click", () => void connect());
wrapBtn.addEventListener("click", () => void wrap());
quoteBtn.addEventListener("click", () => void quote());
swapBtn.addEventListener("click", () => void swap());

renderPair();
setStatus("Connect your wallet to start. GIWA Sepolia testnet — no real funds.");
