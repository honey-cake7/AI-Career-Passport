import React from 'react';
import { Cpu, Wifi, LogOut } from 'lucide-react';

interface NavbarProps {
  onClearProfile?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onClearProfile }) => {
  return (
    <nav className="fixed top-0 left-0 right-0 h-20 glass-panel border-x-0 border-t-0 rounded-none z-50 px-8 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
          <Cpu className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            ProfileEngine
          </h1>
          <p className="text-xs text-primary font-medium tracking-widest uppercase">AI Data Normalizer</p>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-surface/50 px-4 py-2 rounded-full border border-white/5">
          <div className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </div>
          <span className="text-sm font-medium text-slate-300">System Online</span>
        </div>
        
        {onClearProfile && (
          <button 
            onClick={onClearProfile}
            className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2 rounded-full border border-red-500/20 transition-colors text-sm font-medium ml-2"
          >
            <LogOut className="w-4 h-4" />
            Reset
          </button>
        )}
        
        <Wifi className="w-5 h-5 text-slate-500 hidden sm:block" />
      </div>
    </nav>
  );
};
