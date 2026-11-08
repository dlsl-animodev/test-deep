/**
 * RFID tab: vehicles, their Easytrip / Autosweep accounts, and balance checks.
 */
import { BALANCE_CHANNELS } from '../core/balance.ts';
import { newId, type Vehicle } from '../core/garage.ts';
import type { RfidSystem } from '../core/expressways.ts';
import type { VehicleClass } from '../core/types.ts';
import { ago, h, icon, ICONS, peso } from './dom.ts';

const SYSTEMS: RfidSystem[] = ['easytrip', 'autosweep'];

export interface GarageHandlers {
  save(v: Vehicle): void;
  remove(id: string): void;
}

function balanceLine(v: Vehicle, s: RfidSystem) {
  const w = v[s];
  if (!w) return null;
  return h(
    'span',
    {},
    h('span', { class: `rfid-dot ${s}` }),
    w.balance ? peso(w.balance.amount) : h('span', { class: 'none' }, 'Unknown'),
  );
}

export function renderGarage(root: HTMLElement, vehicles: Vehicle[], handlers: GarageHandlers): void {
  root.replaceChildren();
  const view = h('div', { class: 'view' }, h('h2', { class: 'large-title' }, 'RFID'));

  if (vehicles.length) {
    view.append(
      h(
        'div',
        { class: 'stack' },
        ...vehicles.map((v) =>
          h(
            'div',
            { class: 'row vehicle-row-item', role: 'button', tabindex: '0', onclick: () => openVehicle(v, handlers) },
            h(
              'div',
              { class: 'lines' },
              h('span', { class: 'name' }, v.name || v.plate || 'Vehicle'),
              h('small', {}, [v.plate, `Class ${v.vclass}`].filter(Boolean).join(' · ')),
            ),
            h('div', { class: 'balances' }, ...SYSTEMS.map((s) => balanceLine(v, s))),
            h('span', { class: 'trail' }, icon(ICONS.chevron, 14)),
          ),
        ),
      ),
    );
  } else {
    view.append(
      h('div', { class: 'platter' }, h('p', { class: 'empty' }, 'Add a vehicle and its Easytrip or Autosweep account to see if your load covers a trip.')),
    );
  }

  view.append(h('button', { type: 'button', class: 'btn prominent', onclick: () => openVehicle(null, handlers) }, 'Add Vehicle'));
  view.append(
    h(
      'p',
      { class: 'section-foot' },
      'Balance checks open the official Easytrip or Autosweep page with your account number copied, or a ready-to-send balance SMS. Account numbers stay on this device.',
    ),
  );
  root.append(view);
}

function input(props: Record<string, string>) {
  return h('input', { autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', ...props }) as HTMLInputElement;
}

function field(label: string, el: HTMLInputElement) {
  el.id ||= `f-${newId()}`;
  return h('div', { class: 'row field' }, h('label', { for: el.id }, label), el);
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard blocked: the page still opens */
  }
}

export function openVehicle(existing: Vehicle | null, handlers: GarageHandlers): void {
  const dialog = document.getElementById('vehicle-dialog') as HTMLDialogElement;
  const v: Vehicle = existing ? structuredClone(existing) : { id: newId(), name: '', plate: '', vclass: 1 };

  const name = input({ placeholder: 'Innova', value: v.name, autocapitalize: 'words' });
  const plate = input({ placeholder: 'ABC 1234', value: v.plate });
  let vclass: VehicleClass = v.vclass;
  const classSeg = h(
    'div',
    { class: 'segmented', role: 'radiogroup', 'aria-label': 'Vehicle class' },
    ...([1, 2, 3] as VehicleClass[]).map((c) =>
      h(
        'button',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': String(c === vclass),
          onclick: (e: Event) => {
            vclass = c;
            classSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget)));
          },
        },
        `Class ${c}`,
      ),
    ),
  );

  const walletInputs = {} as Record<RfidSystem, { account: HTMLInputElement; balance: HTMLInputElement }>;
  const walletSections = SYSTEMS.map((s) => {
    const ch = BALANCE_CHANNELS[s];
    const w = v[s];
    const account = input({ placeholder: s === 'easytrip' ? '12 digits' : 'Account no.', value: w?.account ?? '', inputmode: 'numeric' });
    const balance = input({ placeholder: '₱0', value: w?.balance ? String(w.balance.amount) : '', inputmode: 'decimal' });
    walletInputs[s] = { account, balance };

    const actions = h('div', { class: 'stack' });
    const paint = () => {
      const sms = ch.sms({ system: s, account: account.value, plate: plate.value });
      actions.replaceChildren(
        h(
          'a',
          {
            class: 'row link',
            href: ch.webUrl,
            target: '_blank',
            rel: 'noopener',
            onclick: () => account.value && copy(account.value.replace(/\D/g, '')),
          },
          h('span', { class: 'lines' }, ch.webLabel, h('small', {}, account.value ? `${ch.webNote}. Account number copied.` : ch.webNote)),
          h('span', { class: 'trail' }, icon(ICONS.external, 16)),
        ),
        sms
          ? h(
              'a',
              { class: 'row link', href: sms.href },
              h('span', { class: 'lines' }, 'Text balance inquiry', h('small', {}, `${sms.body} to ${sms.to}`)),
              h('span', { class: 'trail' }, icon(ICONS.message, 16)),
            )
          : h(
              'div',
              { class: 'row' },
              h('small', {}, s === 'easytrip' ? 'Add the 12-digit account number to text a balance inquiry.' : 'Add the plate number to text a balance inquiry.'),
            ),
      );
    };
    paint();
    account.addEventListener('input', paint);
    plate.addEventListener('input', paint);

    return [
      h('div', { class: 'section-title' }, ch.name),
      h('div', { class: 'stack' }, field('Account', account), field('Balance', balance)),
      w?.balance ? h('p', { class: 'section-foot' }, `Updated ${ago(w.balance.at)}`) : null,
      actions,
    ];
  });

  const done = h('button', { type: 'button', class: 'round-btn prominent', 'aria-label': 'Save' }, icon(ICONS.check, 22));
  done.addEventListener('click', () => {
    v.name = name.value.trim();
    v.plate = plate.value.trim().toUpperCase();
    v.vclass = vclass;
    for (const s of SYSTEMS) {
      const acc = walletInputs[s].account.value.trim();
      const balRaw = walletInputs[s].balance.value.replace(/[₱,\s]/g, '');
      if (!acc && !balRaw) {
        delete v[s];
        continue;
      }
      const prev = existing?.[s]?.balance;
      const amount = balRaw === '' ? undefined : Number(balRaw);
      v[s] = {
        account: acc,
        balance:
          amount == null || Number.isNaN(amount) ? undefined : prev && prev.amount === amount ? prev : { amount, at: Date.now() },
      };
    }
    handlers.save(v);
    dialog.close();
  });

  dialog.replaceChildren(
    h(
      'div',
      { class: 'modal-bar' },
      h('button', { type: 'button', class: 'round-btn', 'aria-label': 'Cancel', onclick: () => dialog.close() }, icon(ICONS.xmark, 20)),
      h('h2', { id: 'vehicle-dialog-title' }, existing ? 'Edit Vehicle' : 'New Vehicle'),
      done,
    ),
    h(
      'div',
      { class: 'modal-body' },
      h('div', { class: 'stack' }, field('Name', name), field('Plate', plate), h('div', { class: 'row' }, classSeg)),
      ...walletSections.flat(),
      existing
        ? h(
            'button',
            {
              type: 'button',
              class: 'row danger',
              'style:margin-top': '12px',
              onclick: () => {
                if (confirm(`Delete ${existing.name || existing.plate || 'this vehicle'}?`)) {
                  handlers.remove(existing.id);
                  dialog.close();
                }
              },
            },
            'Delete Vehicle',
          )
        : null,
    ),
  );
  dialog.showModal();
  if (!existing) name.focus();
}
