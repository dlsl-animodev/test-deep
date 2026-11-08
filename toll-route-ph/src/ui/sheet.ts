/**
 * iOS-style bottom sheet with three detents (peek, half, full).
 * On wide screens the sheet is a fixed floating card and dragging is off.
 */
export type Snap = 'peek' | 'half' | 'full';

const PEEK_PX = 132;
const HALF = 0.52;
const FULL = 0.92;

export interface Sheet {
  setSnap(s: Snap): void;
  snap(): Snap;
  /** Pixels of map covered by the sheet: { bottom } on phones, { left } on wide screens. */
  coverage(): { left: number; bottom: number };
  onChange(fn: () => void): void;
}

export function isWide() {
  return window.matchMedia('(min-width: 900px)').matches;
}

export function createSheet(el: HTMLElement, handle: HTMLElement): Sheet {
  const listeners: (() => void)[] = [];
  const vh = () => window.innerHeight;
  const visible = (s: Snap) => (s === 'peek' ? PEEK_PX : s === 'half' ? vh() * HALF : vh() * FULL);
  const current = () => (el.dataset.snap as Snap) ?? 'half';

  function setSnap(s: Snap) {
    el.dataset.snap = s;
    el.style.removeProperty('transform');
    listeners.forEach((fn) => fn());
  }

  let startY = 0;
  let startVisible = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;
  let dragging = false;
  let pointerId: number | null = null;

  handle.addEventListener('pointerdown', (e) => {
    if (isWide()) return;
    pointerId = e.pointerId;
    startY = lastY = e.clientY;
    lastT = performance.now();
    startVisible = visible(current());
    dragging = false;
  });

  handle.addEventListener('pointermove', (e) => {
    if (pointerId !== e.pointerId) return;
    const dy = e.clientY - startY;
    if (!dragging && Math.abs(dy) < 6) return;
    if (!dragging) {
      dragging = true;
      el.classList.add('dragging');
      handle.setPointerCapture(e.pointerId);
    }
    const now = performance.now();
    velocity = (e.clientY - lastY) / Math.max(1, now - lastT);
    lastY = e.clientY;
    lastT = now;
    const vis = Math.min(vh() * FULL, Math.max(PEEK_PX * 0.8, startVisible - dy));
    el.style.transform = `translateY(${vh() * FULL - vis}px)`;
  });

  const end = (e: PointerEvent) => {
    if (pointerId !== e.pointerId) return;
    pointerId = null;
    if (!dragging) return;
    dragging = false;
    el.classList.remove('dragging');
    const vis = startVisible - (e.clientY - startY);
    const snaps: Snap[] = ['peek', 'half', 'full'];
    let target: Snap;
    if (Math.abs(velocity) > 0.6) {
      // A flick moves one detent in the flick direction.
      const i = snaps.indexOf(current());
      target = snaps[Math.max(0, Math.min(2, i + (velocity < 0 ? 1 : -1)))];
    } else {
      target = snaps.reduce((a, b) => (Math.abs(visible(b) - vis) < Math.abs(visible(a) - vis) ? b : a));
    }
    setSnap(target);
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);

  return {
    setSnap,
    snap: current,
    coverage: () => {
      if (isWide()) {
        const r = el.getBoundingClientRect();
        return { left: r.right, bottom: 0 };
      }
      return { left: 0, bottom: visible(current()) };
    },
    onChange: (fn) => listeners.push(fn),
  };
}
