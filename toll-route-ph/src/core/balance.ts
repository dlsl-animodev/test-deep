/**
 * RFID balance checks.
 *
 * Neither SMC Tollways (Autosweep) nor MPTC (Easytrip) publishes a balance
 * API. The official channels are a web page, the operator's app, and SMS.
 * A BalanceChannel describes those channels for one RFID system so the UI can
 * open them with the account details filled in where the channel allows it.
 *
 * If you later get partner/fleet API access (or run a server-side lookup you
 * are permitted to run), implement `fetchBalance` and the UI will use it.
 */
import type { RfidSystem } from './expressways.ts';

export interface RfidAccount {
  system: RfidSystem;
  /** Account number (Easytrip: 12 digits). */
  account?: string;
  /** Plate number registered to the account (Autosweep SMS uses this). */
  plate?: string;
}

export interface BalanceChannel {
  system: RfidSystem;
  name: string;
  /** Official page where a balance can be checked. */
  webUrl: string;
  webLabel: string;
  /** Official app, if any. */
  app?: { name: string; ios?: string; android?: string };
  /** Pre-filled SMS for a balance inquiry, or null if the account lacks the needed field. */
  sms(acc: RfidAccount): { to: string; body: string; href: string; note: string } | null;
  /** Programmatic lookup, when you have a permitted source for it. */
  fetchBalance?(acc: RfidAccount): Promise<number>;
}

const digits = (s = '') => s.replace(/\D/g, '');
const plateKey = (s = '') => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** sms: link that works on iOS and Android. */
export function smsHref(to: string, body: string): string {
  return `sms:${to}?&body=${encodeURIComponent(body)}`;
}

export const BALANCE_CHANNELS: Record<RfidSystem, BalanceChannel> = {
  autosweep: {
    system: 'autosweep',
    name: 'Autosweep',
    webUrl: 'https://autosweeprfid.com/v4/web/balancemobile',
    webLabel: 'autosweeprfid.com',
    app: { name: 'Autosweep RFID' },
    sms(acc) {
      const plate = plateKey(acc.plate);
      if (!plate) return null;
      const to = '09178608655';
      const body = `Autosweep BALINQ ${plate}`;
      return {
        to,
        body,
        href: smsHref(to, body),
        note: 'Send from the mobile number registered to the account. For Autosweep To-Go cards, use the card number in place of the plate.',
      };
    },
  },
  easytrip: {
    system: 'easytrip',
    name: 'Easytrip',
    webUrl: 'https://www.easytrip.ph/',
    webLabel: 'easytrip.ph',
    app: { name: 'MPT DriveHub' },
    sms(acc) {
      const account = digits(acc.account);
      if (account.length !== 12) return null;
      const to = '09191601553';
      const body = `BAL ${account}`;
      return { to, body, href: smsHref(to, body), note: '₱1 per inquiry on all networks.' };
    },
  },
};
