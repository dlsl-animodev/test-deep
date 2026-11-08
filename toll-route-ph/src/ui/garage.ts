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
    w.balance ? peso(w.balance.amount) : h('span', { class: 'none' }, 'No balance'),
  );
}

export function renderGarage(root: HTMLElement, vehicles: Vehicle[], handlers: GarageHandlers): void {
  root.replaceChildren();
  root.append(h('h2', { class: 'large-title' }, 'RFID'));

  if (vehicles.length) {
    const group = h('div', { class: 'group' });
    for (const v of vehicles) {
      group.append(
        h(
          'div',
          { class: 'cell vehicle-cell', role: 'button', tabindex: '0', onclick: () => openVehicle(v, handlers) },
          h('div', { class: 'text' }, h('div', { class: 'name' }, v.name || v.plate || 'Vehicle'), h('div', { class: 'plate' }, [v.plate, `Class ${v.vclass}`].filter(Boolean).join(' · '))),
          h('div', { class: 'balances' }, ...SYSTEMS.map((s) => balanceLine(v, s))),
          h('span', { class: 'chev' }, icon(ICONS.chevron, 14)),
        ),
      );
    }
    root.append(group);
  } else {
    root.append(
      h('div', { class: 'group' }, h('p', { class: 'empty' }, 'Add your vehicles and their Easytrip or Autosweep accounts to see if your load covers a trip.')),
    );
  }

  root.append(h('button', { type: 'button', class: 'btn', onclick: () => openVehicle(null, handlers) }, 'Add Vehicle'));
  root.append(
    h(
      'p',
      { class: 'section-foot' },
      'Easytrip and Autosweep have no public balance API, so checks open the official page or a pre-filled balance SMS. Enter the balance you get back and the app keeps it up to date as you log trips. Account numbers stay on this device.',
    ),
  );
}

function field(label: string, input: HTMLInputElement) {
  input.id ||= `f-${newId()}`;
  return h('div', { class: 'cell field-cell' }, h('label', { for: input.id }, label), input);
}

function input(props: Record<string, string>) {
  return h('input', { autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', ...props }) as HTMLInputElement;
}

export function openVehicle(existing: Vehicle | null, handlers: GarageHandlers): void {
  const dialog = document.getElementById('vehicle-dialog') as HTMLDialogElement;
  const v: Vehicle = existing ? structuredClone(existing) : { id: newId(), name: '', plate: '', vclass: 1 };

  const name = input({ placeholder: 'e.g. Innova', value: v.name, autocapitalize: 'words' });
  const plate = input({ placeholder: 'ABC 1234', value: v.plate });
  let vclass: VehicleClass = v.vclass;
  const classSeg = h(
    'div',
    { class: 'segmented small', role: 'radiogroup', 'aria-label': 'Vehicle class', 'style:flex': '1' },
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
    const account = input({ placeholder: s === 'easytrip' ? '12-digit account no.' : 'Account no.', value: w?.account ?? '', inputmode: 'numeric' });
    const balance = input({ placeholder: '₱0', value: w?.balance ? String(w.balance.amount) : '', inputmode: 'decimal' });
    walletInputs[s] = { account, balance };

    const sms = ch.sms({ system: s, account: account.value, plate: plate.value });
    const actions = h('div', { class: 'group' });
    const paintActions = () => {
      const smsNow = ch.sms({ system: s, account: account.value, plate: plate.value });
      actions.replaceChildren(
        h(
          'a',
          { class: 'cell-link', href: ch.webUrl, target: '_blank', rel: 'noopener' },
          h('span', { class: 'lines' }, `Check on ${ch.webLabel}`, h('small', {}, s === 'easytrip' ? 'Log in to MyEasytrip Web' : 'Official balance page')),
          icon(ICONS.external, 16),
        ),
        smsNow
          ? h(
              'a',
              { class: 'cell-link', href: smsNow.href },
              h('span', { class: 'lines' }, 'Text balance inquiry', h('small', {}, `${smsNow.body} to ${smsNow.to}`)),
              icon(ICONS.message, 16),
            )
          : h(
              'div',
              { class: 'cell', 'style:color': 'var(--label2)', 'style:font-size': '15px' },
              s === 'easytrip' ? 'Add the 12-digit account number to text a balance inquiry.' : 'Add the plate number to text a balance inquiry.',
            ),
      );
    };
    paintActions();
    account.addEventListener('input', paintActions);
    plate.addEventListener('input', paintActions);

    return [
      h('div', { class: 'section-title' }, ch.name),
      h(
        'div',
        { class: 'group' },
        field('Account', account),
        field('Balance', balance),
      ),
      h(
        'p',
        { class: 'section-foot' },
        w?.balance ? `Balance updated ${ago(w.balance.at)}.` : 'Leave the account empty if this vehicle has no ' + ch.name + '.',
        sms?.note ? ` ${sms.note}` : '',
      ),
      actions,
    ];
  });

  const done = h('button', { type: 'button', class: 'bar-btn right' }, 'Done');
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
          amount == null || Number.isNaN(amount)
            ? undefined
            : prev && prev.amount === amount
              ? prev
              : { amount, at: Date.now() },
      };
    }
    handlers.save(v);
    dialog.close();
  });

  dialog.replaceChildren(
    h(
      'div',
      { class: 'modal-bar' },
      h('button', { type: 'button', class: 'bar-btn left', onclick: () => dialog.close() }, 'Cancel'),
      h('h2', { id: 'vehicle-dialog-title' }, existing ? 'Edit Vehicle' : 'New Vehicle'),
      done,
    ),
    h(
      'div',
      { class: 'modal-body' },
      h('div', { class: 'section-title' }, 'Vehicle'),
      h('div', { class: 'group' }, field('Name', name), field('Plate', plate), h('div', { class: 'cell' }, classSeg)),
      ...walletSections.flat(),
      existing
        ? h(
            'div',
            { class: 'group', 'style:margin-top': '12px' },
            h(
              'button',
              {
                type: 'button',
                class: 'cell-link danger',
                onclick: () => {
                  if (confirm(`Delete ${existing.name || existing.plate || 'this vehicle'}?`)) {
                    handlers.remove(existing.id);
                    dialog.close();
                  }
                },
              },
              'Delete Vehicle',
            ),
          )
        : null,
    ),
  );
  dialog.showModal();
  if (!existing) name.focus();
}
