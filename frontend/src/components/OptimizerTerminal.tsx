import React, { useState, useEffect } from 'react';
import { Terminal, Cpu, Target, AlertTriangle, ArrowRight, Loader2, ChevronDown } from 'lucide-react';
import type { IOptimizationResult } from '../types';
import { apiClient } from '../api/axios';
import { motion, AnimatePresence } from 'framer-motion';

interface OptimizerTerminalProps {
  profileId: string;
}

const AnimatedScore: React.FC<{ score: number }> = ({ score }) => {
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = score;
    const duration = 1500;
    const increment = end / (duration / 16);
    
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setDisplayScore(end);
        clearInterval(timer);
      } else {
        setDisplayScore(Math.floor(start));
      }
    }, 16);

    return () => clearInterval(timer);
  }, [score]);

  const getScoreColor = (s: number) => {
    if (s >= 75) return 'text-emerald-400 stroke-emerald-400';
    if (s >= 50) return 'text-yellow-400 stroke-yellow-400';
    return 'text-red-400 stroke-red-400';
  };

  const circumference = 31.831 * 2 * Math.PI; // r=31.831
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="relative w-40 h-40 flex items-center justify-center mb-4">
      <svg className="w-full h-full -rotate-90 drop-shadow-xl" viewBox="0 0 100 100">
        <circle
          className="stroke-surface"
          strokeWidth="6"
          fill="none"
          cx="50" cy="50" r="31.831"
        />
        <motion.circle
          className={getScoreColor(score)}
          strokeWidth="6"
          fill="none"
          cx="50" cy="50" r="31.831"
          strokeLinecap="round"
          initial={{ strokeDasharray: circumference, strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.5, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold text-white tabular-nums">{displayScore}</span>
        <span className="text-[10px] text-slate-400 uppercase tracking-widest mt-1 font-semibold">Match</span>
      </div>
    </div>
  );
};

export const OptimizerTerminal: React.FC<OptimizerTerminalProps> = ({ profileId }) => {
  const [jobDescription, setJobDescription] = useState('');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [result, setResult] = useState<IOptimizationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedBullet, setExpandedBullet] = useState<number | null>(null);

  const handleOptimize = async () => {
    if (!jobDescription.trim()) return;
    setIsOptimizing(true);
    setError(null);
    setResult(null);

    try {
      const response = await apiClient.post(`/api/profile/${profileId}/optimize`, {
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

  return (
    <div className="w-full max-w-6xl mx-auto mt-10 mb-20 space-y-6">
      <div className="glass-panel overflow-hidden border border-white/10 group focus-within:border-primary/30 transition-colors">
        <div className="bg-surface/80 border-b border-white/10 p-4 flex items-center gap-3">
          <Terminal className="w-5 h-5 text-secondary" />
          <h3 className="text-lg font-semibold text-white">Advanced Recruiter Terminal</h3>
        </div>
        
        <div className="p-6">
          <p className="text-slate-400 mb-4 text-sm">Paste a Job Description below to analyze your fit and generate an optimized resume tailored to this exact role.</p>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="e.g. Seeking a Senior Frontend Engineer with React, TypeScript, and Framer Motion expertise..."
            className="input-field min-h-[120px] font-mono text-sm resize-y"
          />
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleOptimize}
              disabled={isOptimizing || !jobDescription.trim()}
              className="btn-primary flex items-center gap-2 group/btn"
            >
              {isOptimizing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Cpu className="w-5 h-5 group-hover/btn:rotate-180 transition-transform duration-500" />}
              {isOptimizing ? 'Running Heuristics...' : 'Analyze Fit & Optimize'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-center">
          {error}
        </motion.div>
      )}

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Match Score & Badges */}
            <div className="lg:col-span-1 space-y-6">
              <div className="glass-panel p-8 flex flex-col items-center justify-center text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-surface/50 pointer-events-none"></div>
                <AnimatedScore score={result.matchScore} />
                <h4 className="text-lg font-medium text-white relative z-10">Overall Compatibility</h4>
                <p className="text-xs text-slate-400 mt-2 relative z-10">Compared against target Job Description</p>
              </div>

              <div className="glass-panel p-6">
                <h4 className="text-white font-medium mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" /> Missing Hard Skills
                </h4>
                <div className="flex flex-wrap gap-2">
                  {result.missingHardSkills.length > 0 ? result.missingHardSkills.map((skill, i) => (
                    <span key={i} className="px-2.5 py-1.5 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold tracking-wide">
                      {skill}
                    </span>
                  )) : <span className="text-sm text-emerald-400 font-medium">None! You hit all requirements.</span>}
                </div>
              </div>

              <div className="glass-panel p-6">
                <h4 className="text-white font-medium mb-4 flex items-center gap-2">
                  <Target className="w-4 h-4 text-blue-400" /> Missing Soft Skills
                </h4>
                <div className="flex flex-wrap gap-2">
                  {result.missingSoftSkills.length > 0 ? result.missingSoftSkills.map((skill, i) => (
                    <span key={i} className="px-2.5 py-1.5 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs font-semibold tracking-wide">
                      {skill}
                    </span>
                  )) : <span className="text-sm text-emerald-400 font-medium">None missing!</span>}
                </div>
              </div>
            </div>

            {/* Optimized Bullets */}
            <div className="lg:col-span-2 glass-panel p-6 flex flex-col h-full">
              <h3 className="text-xl font-semibold text-white mb-6 border-b border-white/10 pb-4 sticky top-0 bg-surface/50 backdrop-blur-sm z-10">
                AI-Optimized Resume Bullets
              </h3>
              <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar flex-1">
                {result.optimizedBullets.map((bullet, i) => {
                  const isExpanded = expandedBullet === i;
                  return (
                    <motion.div layout key={i} className="bg-surface/50 rounded-xl border border-white/5 hover:border-white/10 transition-colors overflow-hidden">
                      <div 
                        className="p-5 cursor-pointer flex flex-col"
                        onClick={() => setExpandedBullet(isExpanded ? null : i)}
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                          <div>
                            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2 block">Original Context</span>
                            <p className="text-sm text-slate-400 line-through decoration-red-500/40 opacity-70 leading-relaxed">{bullet.original}</p>
                          </div>
                          <div>
                            <span className="text-[10px] text-emerald-500 uppercase tracking-widest font-bold mb-2 flex items-center gap-1">
                              <ArrowRight className="w-3 h-3" /> ATS Optimized
                            </span>
                            <p className="text-sm text-white font-medium leading-relaxed">{bullet.optimized}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-center mt-4">
                          <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </div>
                      
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="bg-primary/5 border-t border-primary/10 px-5 py-4"
                          >
                            <span className="text-[10px] text-primary uppercase tracking-widest font-bold mb-1 block">AI Rationale</span>
                            <p className="text-sm text-slate-300 italic">"{bullet.explanation}"</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
