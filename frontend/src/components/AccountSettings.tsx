import { useEffect, useRef, useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { apiClient } from '../api/axios';

export function AccountSettings({ onDeleted, onCancel, onBusy }: { onDeleted: (pending: boolean) => void; onCancel: () => void; onBusy: (busy: boolean) => void }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; onBusy(false); }; }, [onBusy]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  async function remove(event: FormEvent) {
    event.preventDefault();
    if (busy || confirmation !== 'DELETE') return;
    setBusy(true); onBusy(true); setError('');
    const currentPassword = password; setPassword('');
    try {
      const response = await apiClient.delete('/api/auth/account', { data: { password: currentPassword, confirmation } });
      if (response.status !== 204 && !(response.status === 202 && response.data?.success === true && response.data?.data?.status === 'pending')) throw new Error('Unexpected deletion response');
      if (alive.current) onDeleted(response.status === 202);
    } catch (error) {
      if (alive.current) setError(isAxiosError(error) && [400, 403, 429].includes(error.response?.status ?? 0) && typeof error.response?.data?.error === 'string' ? error.response.data.error : 'Deletion could not be confirmed. Sign in again before retrying; do not assume your data was removed.');
    } finally { if (alive.current) { setBusy(false); onBusy(false); } }
  }
  return <section className="account-settings"><p className="eyebrow">YOUR ACCOUNT</p><h1>Control what stays here.</h1>
    <p>Deleting your account permanently removes your saved resume, job versions, reviews, gap plans and sign-in sessions. You cannot undo this.</p>
    <p className="hint">Downloaded PDFs and external links are outside this account. Deletion here does not erase provider records or backups; their retention is separate. If cleanup is interrupted, account access closes and the server retries deletion automatically.</p>
    <form className="account-delete-form" onSubmit={event => void remove(event)}><h2>Delete your account</h2>
      <fieldset disabled={busy}><label htmlFor="delete-password">Current password</label><input id="delete-password" type="password" autoComplete="current-password" minLength={12} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} />
        <label htmlFor="delete-confirmation">Type DELETE to confirm</label><input id="delete-confirmation" autoComplete="off" spellCheck={false} required pattern="DELETE" value={confirmation} maxLength={6} onChange={e => setConfirmation(e.target.value)} />
        <div className="actions wrap"><button className="danger-button" disabled={busy || confirmation !== 'DELETE' || password.length < 12}>{busy ? 'Deleting account…' : 'Permanently delete my account'}</button><button type="button" disabled={busy} onClick={onCancel}>Keep my account</button></div>
      </fieldset>{error && <p className="error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
    </form>
  </section>;
}
