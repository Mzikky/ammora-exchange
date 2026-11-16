// Token + market registry for the Ammora Swap exchange.
//
// All addresses come from on-chain discovery on GIWA Sepolia (chain 91342),
// NOT from memory:
//  - LaunchCreated events were scanned from the DBC launch factory
//    0x35353a2Dab7426EcCAe6f5FB267702a542ab68fA (blocks 37,724,988-41,494,988).
//  - Each curve below was checked live 2026-11-16 (block ~41,494,976) via
//    AmmoraV4LaunchCurveClient.getStateAtBlock: status 1 (active), quote token
//    WETH, and a working buy quote for 0.001 WETH.
//  - WETH is the wrapped-native address from giwaSepoliaAutoRouteDeployment
//    (contracts.tokens.wrappedNative).
// Every launched token on this factory uses 9 decimals; WETH uses 18.

import type { Address } from "viem";

export interface MarketToken {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
}

export interface Market {
  /** Stable id for the <select> value. */
  id: string;
  /** Launched token (base) traded against WETH (quote) on its DBC curve. */
  base: MarketToken;
  /** DBC bonding-curve pool address (the "pool" for model "dbc"). */
  curve: Address;
  /** Launch config id, for reference. */
  configId: string;
  note: string;
}

export const WETH: MarketToken = {
  symbol: "WETH",
  name: "Wrapped Ether",
  address: "0x4200000000000000000000000000000000000006",
  decimals: 18,
};

export const MARKETS: Market[] = [
  {
    id: "cbrl",
    base: {
      symbol: "CBRL",
      name: "Ciburial Eco Token",
      address: "0x0503D6E81429df3F518a64Cc4b05c4618DbE7708",
      decimals: 9,
    },
    curve: "0x3150eF2f5A654Dc723d585c99dE54235b2106131",
    configId: "39",
    note: "Most traded curve of the six (0.000495 WETH in the curve at check time).",
  },
  {
    id: "yuzu",
    base: {
      symbol: "YUZU",
      name: "YuzuPad",
      address: "0x8817F338A376d9f842a4DFb8a5ba012d59c16a51",
      decimals: 9,
    },
    curve: "0x7B51e128c1d06831184bCFa475472CcEEAcEad65",
    configId: "34",
    note: "YuzuPad launchpad demo token.",
  },
  {
    id: "mimo",
    base: {
      symbol: "MIMO",
      name: "MIMO",
      address: "0xce3ff7Ac8BAaEEAb4D9c09F81a0504e2dcbF3B71",
      decimals: 9,
    },
    curve: "0xa7973A92a96fDA5e3b8e429dF220fcEcB67c9c81",
    configId: "36",
    note: "Active curve with early trading.",
  },
  {
    id: "amm",
    base: {
      symbol: "AMM",
      name: "Ammora",
      address: "0xDcE944e71d4509E4D20cEFf49bF33daF8b103653",
      decimals: 9,
    },
    curve: "0x9a11EAaCeFA2DA3D93Daa1Bf63707c1eF085a55a",
    configId: "6",
    note: "Community 'Ammora' token, fresh curve at check time.",
  },
  {
    id: "apad",
    base: {
      symbol: "APAD",
      name: "AmmoraPad Demo",
      address: "0xA6C55a6b7905E2dcAaf9320e2E1b03038521eDf8",
      decimals: 9,
    },
    curve: "0x53c5aAEedbD4A29885e097a097292D0281a82F80",
    configId: "38",
    note: "AmmoraPad demo token.",
  },
  {
    id: "aromma",
    base: {
      symbol: "AROMMA",
      name: "AROMMA",
      address: "0x0418e7daC2b295e01Ba995C1034Cfc4E4151e344",
      decimals: 9,
    },
    curve: "0xc46787f478Cb6ceA5871A7E4A2220D9FC8400ec5",
    configId: "6",
    note: "Active curve, fresh at check time.",
  },
];
