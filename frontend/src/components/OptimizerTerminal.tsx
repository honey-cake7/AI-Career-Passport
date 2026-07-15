import React, { useState } from 'react';
import { Terminal, Cpu, Target, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import type { IOptimizationResult } from '../types';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

interface OptimizerTerminalProps {
  profileId: string;
}

export const OptimizerTerminal: React.FC<OptimizerTerminalProps> = ({ profileId }) => {
  const [jobDescription, setJobDescription] = useState('');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [result, setResult] = useState<IOptimizationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleOptimize = async () => {
    if (!jobDescription.trim()) return;
    setIsOptimizing(true);
    setError(null);
    setResult(null);

    try {
      const response = await axios.post(`http://localhost:3001/api/profile/${profileId}/optimize`, {
        jobDescription
      });
      if (response.data.success) {
        setResult(response.data.data);
      } else {
        setError('Optimization failed.');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'An error occurred during optimization.');
    } finally {
      setIsOptimizing(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400 stroke-emerald-400';
    if (score >= 50) return 'text-yellow-400 stroke-yellow-400';
    return 'text-red-400 stroke-red-400';
  };

  return (
    <div className="w-full max-w-6xl mx-auto mt-10 mb-20 space-y-6">
      <div className="glass-panel overflow-hidden border border-white/10">
        <div className="bg-surface/80 border-b border-white/10 p-4 flex items-center gap-3">
          <Terminal className="w-5 h-5 text-secondary" />
          <h3 className="text-lg font-semibold text-white">AI Profile Optimizer Terminal</h3>
        </div>
        
        <div className="p-6">
          <p className="text-slate-400 mb-4">Paste a Job Description below to analyze your fit and generate an optimized resume tailored to this exact role.</p>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the job description here..."
            className="input-field min-h-[150px] font-mono text-sm resize-y"
          />
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleOptimize}
              disabled={isOptimizing || !jobDescription.trim()}
              className="btn-primary flex items-center gap-2"
            >
              {isOptimizing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Cpu className="w-5 h-5" />}
              Analyze Fit & Optimize
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-center">
          {error}
        </div>
      )}

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Match Score & Badges */}
            <div className="lg:col-span-1 space-y-6">
              <div className="glass-panel p-8 flex flex-col items-center justify-center text-center">
                <div className="relative w-40 h-40 flex items-center justify-center mb-4">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="stroke-surface"
                      strokeWidth="3"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className={`${getScoreColor(result.matchScore)} transition-all duration-1000 ease-out`}
                      strokeWidth="3"
                      strokeDasharray={`${result.matchScore}, 100`}
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-bold text-white">{result.matchScore}</span>
                    <span className="text-xs text-slate-400 uppercase tracking-widest">Match</span>
                  </div>
                </div>
                <h4 className="text-lg font-medium text-white">Overall Compatibility</h4>
              </div>

              <div className="glass-panel p-6">
                <h4 className="text-white font-medium mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" /> Missing Hard Skills
                </h4>
                <div className="flex flex-wrap gap-2">
                  {result.missingHardSkills.length > 0 ? result.missingHardSkills.map((skill, i) => (
                    <span key={i} className="px-2.5 py-1 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
                      {skill}
                    </span>
                  )) : <span className="text-sm text-emerald-400">None! You hit all requirements.</span>}
                </div>
              </div>

              <div className="glass-panel p-6">
                <h4 className="text-white font-medium mb-4 flex items-center gap-2">
                  <Target className="w-4 h-4 text-blue-400" /> Missing Soft Skills
                </h4>
                <div className="flex flex-wrap gap-2">
                  {result.missingSoftSkills.length > 0 ? result.missingSoftSkills.map((skill, i) => (
                    <span key={i} className="px-2.5 py-1 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs font-medium">
                      {skill}
                    </span>
                  )) : <span className="text-sm text-emerald-400">None missing!</span>}
                </div>
              </div>
            </div>

            {/* Optimized Bullets */}
            <div className="lg:col-span-2 glass-panel p-6">
              <h3 className="text-xl font-semibold text-white mb-6 border-b border-white/10 pb-4">
                AI-Optimized Resume Bullets
              </h3>
              <div className="space-y-6">
                {result.optimizedBullets.map((bullet, i) => (
                  <div key={i} className="bg-surface/50 rounded-xl p-5 border border-white/5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <span className="text-xs text-slate-500 uppercase tracking-wider font-bold mb-2 block">Original</span>
                        <p className="text-sm text-slate-400 line-through decoration-red-500/50">{bullet.original}</p>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-emerald-500 uppercase tracking-wider font-bold mb-2 block flex items-center gap-1">
                          <ArrowRight className="w-3 h-3" /> Optimized for JD
                        </span>
                        <p className="text-sm text-white font-medium">{bullet.optimized}</p>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-white/5">
                      <span className="text-xs text-primary font-medium">AI Rationale: </span>
                      <span className="text-xs text-slate-400">{bullet.explanation}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
