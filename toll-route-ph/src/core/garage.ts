/**
 * Your vehicles and their RFID wallets, kept on this device only.
 */
import type { RfidSystem } from './expressways.ts';
import type { VehicleClass } from './types.ts';
import type { KeyValueStore } from './fares.ts';

export interface WalletBalance {
  amount: number;
  /** When the balance was last checked or adjusted (epoch ms). */
  at: number;
}

export interface Vehicle {
  id: string;
  name: string;
  plate: string;
  vclass: VehicleClass;
  easytrip?: { account: string; balance?: WalletBalance };
  autosweep?: { account: string; balance?: WalletBalance };
}

const KEY = 'garage:v1';

export function loadGarage(store?: KeyValueStore): Vehicle[] {
  try {
    const raw = store?.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveGarage(vehicles: Vehicle[], store?: KeyValueStore): void {
  try {
    store?.setItem(KEY, JSON.stringify(vehicles));
  } catch {
    /* storage unavailable */
  }
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export interface WalletCoverage {
  system: RfidSystem;
  /** Toll this trip charges to the wallet. */
  needed: number;
  /** Last known balance, if any. */
  balance?: WalletBalance;
  /** Balance left after the trip. Negative means you need to reload. */
  after?: number;
  /** True if the vehicle has no account on this RFID system. */
  noAccount: boolean;
}

/** For each RFID wallet the trip charges, does the vehicle have enough load? */
export function tripCoverage(byRfid: Record<string, number>, vehicle: Vehicle): WalletCoverage[] {
  return (Object.entries(byRfid) as [RfidSystem, number][])
    .filter(([, needed]) => needed > 0)
    .map(([system, needed]) => {
      const wallet = vehicle[system];
      const balance = wallet?.balance;
      return {
        system,
        needed,
        balance,
        after: balance ? balance.amount - needed : undefined,
        noAccount: !wallet,
      };
    });
}

/** Deduct a trip's tolls from the stored balances (after you have driven it). */
export function deductTrip(vehicle: Vehicle, byRfid: Record<string, number>, now = Date.now()): Vehicle {
  const v: Vehicle = structuredClone(vehicle);
  for (const system of ['easytrip', 'autosweep'] as const) {
    const fee = byRfid[system];
    const bal = v[system]?.balance;
    if (fee && bal) v[system]!.balance = { amount: bal.amount - fee, at: now };
  }
  return v;
}
