import React, { useState } from 'react';
import { Download, Link as LinkIcon, CheckCircle2 } from 'lucide-react';

interface ExportControlsProps {
  profileId: string;
  slug: string;
}

export const ExportControls: React.FC<ExportControlsProps> = ({ profileId, slug }) => {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    const url = `http://localhost:3001/api/profile/public/${slug}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    // Open the download link directly to trigger the browser's save file prompt
    window.open(`http://localhost:3001/api/profile/${profileId}/export`, '_blank');
  };

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 glass-panel px-6 py-4 flex items-center gap-4 z-50 shadow-[0_10px_40px_rgba(59,130,246,0.15)] border border-primary/20">
      <button 
        onClick={handleCopyLink}
        className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors pr-4 border-r border-white/10"
      >
        {copied ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <LinkIcon className="w-5 h-5" />}
        {copied ? 'Link Copied!' : 'Copy Share Link'}
      </button>
      
      <button 
        onClick={handleDownload}
        className="flex items-center gap-2 text-sm font-bold text-primary hover:text-primary/80 transition-colors"
      >
        <Download className="w-5 h-5" />
        Download Resume PDF
      </button>
    </div>
  );
};
