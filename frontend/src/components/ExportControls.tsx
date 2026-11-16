import { useState } from 'react';
import { apiClient } from '../api/axios';

export function ExportControls({ profileId, onDeleted }: { profileId: string; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function download() {
    setBusy(true); setError('');
    try {
      const response = await apiClient.get(`/api/profile/${profileId}/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url; link.download = 'resume.pdf'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError('Unable to download PDF. Please try again.'); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm('Delete your saved profile? This cannot be undone.')) return;
    setBusy(true); setError('');
    try { await apiClient.delete(`/api/profile/${profileId}`); onDeleted(); }
    catch { setError('Unable to delete profile. Please try again.'); }
    finally { setBusy(false); }
  }
  return <section className="p-6 border border-white/10 rounded-xl space-y-4">
    <p className="text-sm text-slate-300">Your profile is private. Public sharing is unavailable while consent and revocation controls are being built. PDF export uses the saved profile; preview edits are not saved yet.</p>
    <div className="flex flex-wrap gap-4">
      <button disabled={busy} onClick={() => { void download(); }} className="btn-primary">Export saved PDF</button>
      <button disabled={busy} onClick={() => { void remove(); }} className="btn-secondary">Delete saved profile</button>
    </div>
    {error && <p role="alert" className="text-red-300">{error}</p>}
  </section>;
}
