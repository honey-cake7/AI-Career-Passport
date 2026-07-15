import React from 'react';
import { Mail, Phone, MapPin, Briefcase, GraduationCap, CheckCircle2 } from 'lucide-react';
import type { IProfile } from '../types';
import { motion } from 'framer-motion';

interface ProfileViewerProps {
  profile: IProfile;
}

export const ProfileViewer: React.FC<ProfileViewerProps> = ({ profile }) => {
  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 mt-8">
      {/* Header Card */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
        <div className="relative z-10 flex flex-col md:flex-row gap-8 items-start md:items-center">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary to-secondary p-1 shadow-lg shadow-primary/20 flex-shrink-0">
            <div className="w-full h-full bg-surface rounded-xl flex items-center justify-center text-3xl font-bold text-white">
              {profile.personalInfo.fullName.charAt(0)}
            </div>
          </div>
          <div className="flex-1">
            <h2 className="text-3xl font-bold text-white mb-2">{profile.personalInfo.fullName}</h2>
            <div className="flex flex-wrap gap-4 text-sm text-slate-300">
              {profile.personalInfo.email && (
                <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /> {profile.personalInfo.email}</div>
              )}
              {profile.personalInfo.phone && (
                <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-primary" /> {profile.personalInfo.phone}</div>
              )}
              {profile.personalInfo.location && (
                <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> {profile.personalInfo.location}</div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (Skills) */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="lg:col-span-1 space-y-6">
          <div className="glass-panel p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2 border-b border-white/10 pb-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              RAG-Normalized Skills
            </h3>
            <div className="flex flex-wrap gap-2">
              {profile.skills.map((skill, index) => (
                <span key={index} className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm font-medium hover:bg-emerald-500/20 transition-colors">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Right Column (Experience & Education) */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="lg:col-span-2 space-y-6">
          
          <div className="glass-panel p-6">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2 border-b border-white/10 pb-3">
              <Briefcase className="w-5 h-5 text-primary" />
              Experience
            </h3>
            <div className="space-y-6">
              {profile.experiences.map((exp, index) => (
                <div key={index} className="relative pl-6 border-l-2 border-white/10 last:pb-0">
                  <div className="absolute w-3 h-3 bg-primary rounded-full -left-[7px] top-1.5 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                  <h4 className="text-white font-medium">{exp.title}</h4>
                  <div className="flex justify-between items-center text-sm text-slate-400 mb-2">
                    <span className="text-primary font-medium">{exp.company}</span>
                    <span>{exp.startDate} - {exp.endDate}</span>
                  </div>
                  {exp.description && <p className="text-sm text-slate-300 leading-relaxed">{exp.description}</p>}
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel p-6">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2 border-b border-white/10 pb-3">
              <GraduationCap className="w-5 h-5 text-secondary" />
              Education
            </h3>
            <div className="space-y-4">
              {profile.education.map((edu, index) => (
                <div key={index} className="bg-surface/30 p-4 rounded-xl border border-white/5">
                  <h4 className="text-white font-medium">{edu.degree} {edu.field ? `in ${edu.field}` : ''}</h4>
                  <div className="flex justify-between items-center text-sm text-slate-400 mt-1">
                    <span className="text-secondary font-medium">{edu.institution}</span>
                    <span>{edu.startDate} - {edu.endDate}</span>
                  </div>
                  {edu.gpa && <p className="text-sm text-slate-300 mt-2">GPA: {edu.gpa}</p>}
                </div>
              ))}
            </div>
          </div>

        </motion.div>
      </div>
    </div>
  );
};
