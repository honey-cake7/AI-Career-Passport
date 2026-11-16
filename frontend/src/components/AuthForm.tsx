import { useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { apiClient, setSessionToken } from '../api/axios';

export function AuthForm({ onSignIn }: { onSignIn: () => void }) {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      const response = await apiClient.post(`/api/auth/${register ? 'register' : 'login'}`, {
        email: data.get('email'), password: data.get('password'),
      });
      setSessionToken(response.data.data.token);
      onSignIn();
    } catch (error) {
      setError(isAxiosError(error) ? error.response?.data?.error ?? 'Unable to connect. Please try again.' : 'Sign-in failed');
    } finally { setBusy(false); }
  }
  return <main className="max-w-md mx-auto px-6 py-20">
    <h1 className="text-3xl font-semibold mb-4">AI Career Passport</h1>
    <p className="text-slate-300 mb-8">Understand what your resume shows—and what the job requires.</p>
    <form onSubmit={submit} className="space-y-5">
      <h2 className="text-xl">{register ? 'Create your account' : 'Sign in'}</h2>
      <label className="block">Email<input name="email" type="email" autoComplete="email" required disabled={busy} maxLength={254} className="input-field mt-2" /></label>
      <label className="block">Password<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required disabled={busy} minLength={12} maxLength={128} className="input-field mt-2" /></label>
      <p className="text-sm text-slate-400">Use 12–128 characters. Sessions last one hour; refreshing requires signing in again.</p>
      {error && <p role="alert" className="text-red-300">{error}</p>}
      <button disabled={busy} className="btn-primary w-full">{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
      <button type="button" disabled={busy} className="underline" onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Already have an account? Sign in' : 'Create an account'}</button>
    </form>
  </main>;
}
