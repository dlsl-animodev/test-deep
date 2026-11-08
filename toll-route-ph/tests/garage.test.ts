import { describe, expect, it } from 'vitest';
import { deductTrip, loadGarage, saveGarage, tripCoverage, type Vehicle } from '../src/core/garage.ts';
import { BALANCE_CHANNELS, smsHref } from '../src/core/balance.ts';

const innova: Vehicle = {
  id: 'v1',
  name: 'Innova',
  plate: 'ABC 1234',
  vclass: 1,
  easytrip: { account: '520123456789', balance: { amount: 500, at: 1_000 } },
  autosweep: { account: '', balance: { amount: 1200, at: 1_000 } },
};

describe('tripCoverage', () => {
  it('flags a wallet that needs a reload and one that covers the trip', () => {
    const rows = tripCoverage({ easytrip: 670, autosweep: 311 }, innova);
    expect(rows).toEqual([
      { system: 'easytrip', needed: 670, balance: { amount: 500, at: 1_000 }, after: -170, noAccount: false },
      { system: 'autosweep', needed: 311, balance: { amount: 1200, at: 1_000 }, after: 889, noAccount: false },
    ]);
  });

  it('reports a missing account and an unknown balance', () => {
    const v: Vehicle = { id: 'v2', name: 'Van', plate: 'XYZ 987', vclass: 2, easytrip: { account: '520000000000' } };
    expect(tripCoverage({ easytrip: 100, autosweep: 50 }, v)).toEqual([
      { system: 'easytrip', needed: 100, balance: undefined, after: undefined, noAccount: false },
      { system: 'autosweep', needed: 50, balance: undefined, after: undefined, noAccount: true },
    ]);
  });

  it('ignores wallets the trip does not charge', () => {
    expect(tripCoverage({ easytrip: 0, autosweep: 86 }, innova).map((r) => r.system)).toEqual(['autosweep']);
  });
});

describe('deductTrip', () => {
  it('subtracts each wallet and stamps the time, without mutating the input', () => {
    const after = deductTrip(innova, { easytrip: 411, autosweep: 0 }, 5_000);
    expect(after.easytrip?.balance).toEqual({ amount: 89, at: 5_000 });
    expect(after.autosweep?.balance).toEqual({ amount: 1200, at: 1_000 });
    expect(innova.easytrip?.balance?.amount).toBe(500);
  });
});

describe('garage storage', () => {
  it('round-trips and survives bad data', () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    saveGarage([innova], store);
    expect(loadGarage(store)).toEqual([innova]);
    mem.set('garage:v1', '{not json');
    expect(loadGarage(store)).toEqual([]);
    expect(loadGarage(undefined)).toEqual([]);
  });
});

describe('balance channels', () => {
  it('builds the Easytrip SMS from a 12-digit account number', () => {
    const sms = BALANCE_CHANNELS.easytrip.sms({ system: 'easytrip', account: '5201-2345-6789' });
    expect(sms?.to).toBe('09191601553');
    expect(sms?.body).toBe('BAL 520123456789');
    expect(sms?.href).toBe('sms:09191601553?&body=BAL%20520123456789');
    expect(BALANCE_CHANNELS.easytrip.sms({ system: 'easytrip', account: '123' })).toBeNull();
  });

  it('builds the Autosweep SMS from the plate number', () => {
    const sms = BALANCE_CHANNELS.autosweep.sms({ system: 'autosweep', plate: 'abc 1234' });
    expect(sms?.body).toBe('Autosweep BALINQ ABC1234');
    expect(BALANCE_CHANNELS.autosweep.sms({ system: 'autosweep' })).toBeNull();
  });

  it('points Autosweep at its mobile balance page', () => {
    expect(BALANCE_CHANNELS.autosweep.webUrl).toBe('https://autosweeprfid.com/v4/web/balancemobile');
    expect(smsHref('1', 'a b')).toBe('sms:1?&body=a%20b');
  });
});
