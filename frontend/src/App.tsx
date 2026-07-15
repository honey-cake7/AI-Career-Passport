import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { ResumeUpload } from './components/ResumeUpload';
import { ProfileViewer } from './components/ProfileViewer';
import { OptimizerTerminal } from './components/OptimizerTerminal';
import { ExportControls } from './components/ExportControls';
import type { IProfile } from './types';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [profile, setProfile] = useState<IProfile | null>(() => {
    const cached = localStorage.getItem('passport_profile');
    return cached ? JSON.parse(cached) : null;
  });

  useEffect(() => {
    if (profile) {
      localStorage.setItem('passport_profile', JSON.stringify(profile));
    }
  }, [profile]);

  return (
    <div className="min-h-screen pb-32">
      {/* Background gradients */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-[-1]">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/20 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-secondary/20 blur-[120px]"></div>
      </div>

      <Navbar />

      <main className="pt-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
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
              <ResumeUpload onUploadSuccess={setProfile} />
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
              
              {/* @ts-ignore */}
              <OptimizerTerminal profileId={profile.profileId || profile._id} />
              
              {/* @ts-ignore */}
              <ExportControls profileId={profile.profileId || profile._id} slug={profile.slug} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default App;
