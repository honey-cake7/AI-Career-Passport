import React, { useState } from 'react';
import { UploadCloud, FileText, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import type { IProfile } from '../types';

interface ResumeUploadProps {
  onUploadSuccess: (profile: IProfile) => void;
}

export const ResumeUpload: React.FC<ResumeUploadProps> = ({ onUploadSuccess }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragging(true);
    } else if (e.type === "dragleave") {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === 'application/pdf') {
        setFile(droppedFile);
        setError(null);
      } else {
        setError('Please upload a valid PDF file.');
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('resume', file);
    formData.append('userId', '507f1f77bcf86cd799439011'); // Dummy user ID

    try {
      const response = await axios.post('http://localhost:3001/api/profile/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      if (response.data.success) {
        onUploadSuccess(response.data.data);
      } else {
        setError('Upload failed. Please try again.');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'An error occurred during upload.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto w-full mt-10">
      <div className="text-center mb-10">
        <h2 className="text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-300 to-slate-500">
          Initialize Your Passport
        </h2>
        <p className="text-slate-400 text-lg">
          Upload your resume PDF. Our RAG-powered engine will extract, normalize, and vectorize your skills instantly.
        </p>
      </div>

      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={`glass-panel p-10 relative overflow-hidden transition-all duration-500 border-2 border-dashed ${
          isDragging 
            ? 'border-primary bg-primary/10 shadow-[0_0_40px_rgba(59,130,246,0.3)] backdrop-blur-2xl' 
            : 'border-white/10 hover:border-primary/50 hover:bg-surface/60 hover:shadow-2xl'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <AnimatePresence mode="wait">
          {!file && !isUploading && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center justify-center pointer-events-none"
            >
              <motion.div 
                animate={{ y: [0, -10, 0] }} 
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="w-20 h-20 bg-surface/80 rounded-full flex items-center justify-center mb-6 shadow-[0_10px_30px_rgba(0,0,0,0.5)] border border-white/10 relative"
              >
                <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full"></div>
                <UploadCloud className="w-10 h-10 text-primary relative z-10" />
              </motion.div>
              <h3 className="text-xl font-semibold mb-2">Drag & drop your PDF</h3>
              <p className="text-slate-500 mb-6">or click to browse from your computer</p>
              
              <label className="btn-secondary pointer-events-auto cursor-pointer group hover:bg-white hover:text-black hover:border-white transition-all">
                Browse Files
                <input type="file" className="hidden" accept=".pdf" onChange={handleFileInput} />
              </label>
            </motion.div>
          )}

          {file && !isUploading && (
            <motion.div
              key="file"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="flex flex-col items-center justify-center"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-primary to-secondary rounded-2xl flex items-center justify-center mb-4 shadow-[0_10px_30px_rgba(59,130,246,0.3)]">
                <FileText className="w-8 h-8 text-white" />
              </div>
              <p className="text-lg font-medium text-white mb-1">{file.name}</p>
              <p className="text-sm text-slate-400 mb-8">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              
              <div className="flex gap-4">
                <button className="btn-secondary" onClick={() => setFile(null)}>Cancel</button>
                <button className="btn-primary flex items-center gap-2 group" onClick={handleUpload}>
                  <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                  Extract & Normalize
                </button>
              </div>
            </motion.div>
          )}

          {isUploading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-4 w-full max-w-lg mx-auto"
            >
              <h3 className="text-xl font-semibold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary animate-pulse text-center">
                Engaging AI Engine
              </h3>
              
              {/* Skeleton UI */}
              <div className="w-full space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 animate-pulse shrink-0"></div>
                  <div className="space-y-3 flex-1">
                    <div className="h-4 bg-white/5 rounded-full w-3/4 animate-pulse"></div>
                    <div className="h-3 bg-white/5 rounded-full w-1/2 animate-pulse delay-75"></div>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="h-8 bg-white/5 rounded-xl w-1/3 animate-pulse delay-100"></div>
                  <div className="flex gap-2">
                    <div className="h-6 bg-white/5 rounded-lg w-20 animate-pulse delay-150"></div>
                    <div className="h-6 bg-white/5 rounded-lg w-24 animate-pulse delay-200"></div>
                    <div className="h-6 bg-white/5 rounded-lg w-16 animate-pulse delay-300"></div>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-white/5">
                  <div className="h-3 bg-white/5 rounded-full w-full animate-pulse delay-300"></div>
                  <div className="h-3 bg-white/5 rounded-full w-5/6 animate-pulse delay-[400ms]"></div>
                  <div className="h-3 bg-white/5 rounded-full w-4/6 animate-pulse delay-[500ms]"></div>
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-8 text-sm text-slate-400">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div> Parsing PDF structure...</div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" style={{ animationDelay: '0.5s' }}></div> Extracting experiences & education...</div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" style={{ animationDelay: '1s' }}></div> Vectorizing skills against Qdrant taxonomy...</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      
      {error && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-center">
          {error}
        </motion.div>
      )}
    </div>
  );
};
