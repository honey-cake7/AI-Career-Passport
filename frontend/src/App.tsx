import { useState, useEffect, useRef } from 'react';
import { isAxiosError } from 'axios';
import { Navbar } from './components/Navbar';
import { ResumeUpload } from './components/ResumeUpload';
import { ProfileViewer } from './components/ProfileViewer';
import { OptimizerTerminal } from './components/OptimizerTerminal';
import { ExportControls } from './components/ExportControls';
import type { IProfile } from './types';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthForm } from './components/AuthForm';
import { apiClient, setSessionToken } from './api/axios';

function App() {
  const [profile, setProfile] = useState<IProfile | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sessionEpoch = useRef(0);

  useEffect(() => {
    localStorage.removeItem('passport_profile');
    const expired = () => { sessionEpoch.current++; setSignedIn(false); setProfile(null); setError(''); };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, []);

  async function signIn() {
    const epoch = ++sessionEpoch.current;
    setProfile(null); setSignedIn(true); setLoading(true); setError('');
    try {
      const response = await apiClient.get('/api/profile/me');
      if (sessionEpoch.current === epoch) setProfile(response.data.data);
    } catch {
      if (sessionEpoch.current === epoch) setError('Unable to load your saved profile. Sign out and try again.');
    } finally { if (sessionEpoch.current === epoch) setLoading(false); }
  }
  async function signOut() {
    sessionEpoch.current++;
    try {
      await apiClient.post('/api/auth/logout');
      setSessionToken(null); setSignedIn(false); setProfile(null); setError('');
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        setSessionToken(null); setSignedIn(false); setProfile(null); setError('');
      } else setError('Unable to revoke your session. Please try signing out again.');
    } finally { setLoading(false); }
  }
  if (!signedIn) return <AuthForm onSignIn={() => { void signIn(); }} />;
  const renderEpoch = sessionEpoch.current;

  return (
    <div className="min-h-screen pb-32">
      {/* Background gradients */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-[-1]">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/20 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-secondary/20 blur-[120px]"></div>
      </div>

      <Navbar onClearProfile={() => { void signOut(); }} />

      <main className="pt-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {error && <p role="alert" className="text-red-300">{error}</p>}
        {loading ? <p role="status">Loading your profile…</p> : error ? null :
        <AnimatePresence mode="wait">
          {!profile ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.4 }}
              className="flex items-center justify-center min-h-[70vh]"
            >
              <ResumeUpload onUploadSuccess={uploaded => {
                if (sessionEpoch.current === renderEpoch) setProfile(uploaded);
              }} />
            </motion.div>
          ) : (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col gap-10"
            >
              <ProfileViewer profile={profile} />
              
              <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-4"></div>
              
              <OptimizerTerminal profileId={profile.profileId} />
              
              <ExportControls profileId={profile.profileId} onDeleted={() => {
                if (sessionEpoch.current === renderEpoch) setProfile(null);
              }} />
            </motion.div>
          )}
        </AnimatePresence>}
      </main>
    </div>
  );
}

export default App;
