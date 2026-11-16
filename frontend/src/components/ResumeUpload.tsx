import { useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { apiClient } from '../api/axios';
import type { IProfile } from '../types';

export function ResumeUpload({ onUploadSuccess }: { onUploadSuccess: (profile: IProfile) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get('resume');
    if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024) { setError('Choose a PDF up to 10 MB.'); return; }
    setBusy(true); setError('');
    const form = new FormData(); form.append('resume', file);
    try {
      const response = await apiClient.post('/api/profile/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      onUploadSuccess(response.data.data);
    } catch (error) {
      setError(isAxiosError(error) ? error.response?.data?.error ?? 'Import failed. Please try again, or start with a blank resume.' : 'Import failed.');
    } finally { setBusy(false); }
  }
  return <form className="import-form" onSubmit={submit}>
    <h2>Start with your resume</h2><p>Import a text-based PDF, then check the extracted details before editing.</p>
    <label>Resume PDF · up to 10 MB<input required type="file" name="resume" accept="application/pdf,.pdf" disabled={busy} /></label>
    <p className="hint">Import sends your resume text to Groq for processing. Your structured resume is saved privately. The exported PDF uses our document layout.</p>
    {error && <p role="alert" className="error">{error}</p>}
    <button className="primary" disabled={busy}>{busy ? 'Importing resume…' : 'Import PDF'}</button>
    {busy && <p role="status">Extracting your details and normalizing skills. This can take a moment.</p>}
  </form>;
}
