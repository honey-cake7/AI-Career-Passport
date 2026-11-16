import { useState, useEffect, useRef, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { ResumeUpload } from './components/ResumeUpload';
import { ResumeEditor } from './components/ResumeEditor';
import { AuthForm } from './components/AuthForm';
import { apiClient, setSessionToken } from './api/axios';
import type { IProfile } from './types';

function App() {
  const [profile, setProfile] = useState<IProfile | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const sessionEpoch = useRef(0);
  useEffect(() => {
    localStorage.removeItem('passport_profile');
    const expired = () => { sessionEpoch.current++; setSignedIn(false); setProfile(null); setError('Your session expired. Sign in to load your saved resume.'); setDirty(false); };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, []);
  async function load() {
    const epoch = sessionEpoch.current;
    setLoading(true); setError('');
    try {
      const response = await apiClient.get('/api/profile/me');
      if (sessionEpoch.current === epoch) setProfile(response.data.data);
    } catch { if (sessionEpoch.current === epoch) setError('Unable to load your saved resume. Please try again.'); }
    finally { if (sessionEpoch.current === epoch) setLoading(false); }
  }
  async function signIn() {
    sessionEpoch.current++; setProfile(null); setSignedIn(true); setDirty(false); await load();
  }
  async function signOut() {
    if (dirty && !window.confirm('Sign out and discard unsaved changes?')) return;
    try {
      await apiClient.post('/api/auth/logout');
      sessionEpoch.current++; setSessionToken(null); setSignedIn(false); setProfile(null); setError(''); setDirty(false);
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        sessionEpoch.current++; setSessionToken(null); setSignedIn(false); setProfile(null); setDirty(false);
      } else setError('Unable to revoke your session. Please try signing out again.');
    }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fullName = new FormData(event.currentTarget).get('fullName');
    const epoch = sessionEpoch.current;
    setLoading(true); setError('');
    try {
      const response = await apiClient.post('/api/profile', {
        personalInfo: { fullName }, experiences: [], education: [], projects: [], skills: [],
      });
      if (sessionEpoch.current === epoch) setProfile(response.data.data);
    } catch (error) {
      if (sessionEpoch.current === epoch) setError(isAxiosError(error) ? error.response?.data?.error ?? 'Unable to create your resume.' : 'Unable to create your resume.');
    } finally { if (sessionEpoch.current === epoch) setLoading(false); }
  }
  if (!signedIn) return <><AuthForm onSignIn={() => void signIn()} />{error && <p className="auth-message" role="status">{error}</p>}</>;
  const epoch = sessionEpoch.current;
  return <>
    <header className="app-header"><a href="#main" className="brand"><span className="brand-mark" aria-hidden="true">CP</span> Career Passport</a><div className="header-right"><span>Private workspace</span><button onClick={() => void signOut()}>Sign out</button></div></header>
    <main id="main" className="workspace">
      {error && <div className="error" role="alert">{error} {!profile && <button onClick={() => void load()}>Reload saved resume</button>}</div>}
      {loading ? <p role="status">Loading your resume…</p> : profile ? <ResumeEditor key={`${epoch}:${profile.profileId}`} profile={profile} onDirty={setDirty} onSaved={saved => { if (sessionEpoch.current === epoch) setProfile(saved); }} onDeleted={() => { if (sessionEpoch.current === epoch) { setProfile(null); setDirty(false); } }} /> : !error && <div className="start-layout"><div className="start-intro"><p className="eyebrow">A BETTER STARTING POINT</p><h1>Your experience.<br />Clearly expressed.</h1><p>A thoughtful place to review, edit, and prepare your resume. Start with what you have, and make every detail your own.</p><p className="editorial-caption">Built around your words and your work.</p></div><div className="start-card"><ResumeUpload onUploadSuccess={uploaded => { if (sessionEpoch.current === epoch) setProfile(uploaded); }} /><form className="manual-option" onSubmit={event => void create(event)}><p>Prefer to write it yourself?</p><label>Full name<input name="fullName" required maxLength={300} autoComplete="name" /></label><button>Start a blank resume →</button><p className="hint">No AI processing needed.</p></form></div></div>}
    </main><footer className="app-footer">Career Passport <span>Keep your experience honest. Make it clear.</span></footer>
  </>;
}
export default App;
