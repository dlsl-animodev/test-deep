// Quick balance lookup via the server-side proxy at /api/quickbalance.
// The Autosweep auth key lives in Vercel env vars; the browser only sends the account number.

const ENDPOINT = '/api/quickbalance';

let mounted = false;

export function mountQuickBalance(): void {
  if (mounted) return;
  const form = document.querySelector<HTMLFormElement>('#qb-form');
  const input = document.querySelector<HTMLInputElement>('#qb-account');
  const submit = document.querySelector<HTMLButtonElement>('#qb-submit');
  const statusEl = document.querySelector<HTMLElement>('#qb-status');
  const resultEl = document.querySelector<HTMLElement>('#qb-result');
  if (!form || !input || !submit || !statusEl || !resultEl) return;
  mounted = true;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const account = input.value.trim();
    if (!account) {
      statusEl.textContent = 'Enter a card or account number.';
      statusEl.className = 'status error';
      return;
    }

    submit.disabled = true;
    statusEl.textContent = 'Checking balance…';
    statusEl.className = 'status busy';
    resultEl.hidden = true;

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ account }),
      });
      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // Not JSON; show the raw text.
      }
      statusEl.textContent = res.ok ? 'Response received.' : `Request failed (HTTP ${res.status}).`;
      statusEl.className = res.ok ? 'status info' : 'status error';
      resultEl.textContent = pretty || '(empty response)';
      resultEl.hidden = false;
    } catch (err) {
      statusEl.textContent = 'Could not reach the balance service. Check your connection and try again.';
      statusEl.className = 'status error';
      resultEl.textContent = String(err);
      resultEl.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });
}
