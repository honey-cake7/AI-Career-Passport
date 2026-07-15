import React, { useState } from 'react';
import { Mail, Phone, MapPin, Briefcase, GraduationCap, CheckCircle2, Wand2, FolderGit2, Link as LinkIcon } from 'lucide-react';
import type { IProfile } from '../types';
import { motion } from 'framer-motion';

interface ProfileViewerProps {
  profile: IProfile;
}

export const ProfileViewer: React.FC<ProfileViewerProps> = ({ profile: initialProfile }) => {
  const [profile, setProfile] = useState<IProfile>(initialProfile);

  const handleUpdate = (field: string, value: string | string[], category?: 'personalInfo' | 'experiences' | 'projects' | 'education', index?: number, subfield?: string) => {
    setProfile(prev => {
      const updated = { ...prev };
      if (!category) {
        (updated as any)[field] = value;
      } else if (category === 'personalInfo') {
        (updated.personalInfo as any)[field] = value;
      } else if (index !== undefined && subfield) {
        (updated[category][index] as any)[subfield] = value;
      }
      return updated;
    });
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 mt-8">
      {/* Header Card */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-8 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 transition-all duration-700 group-hover:bg-primary/20"></div>
        <div className="relative z-10 flex flex-col md:flex-row gap-8 items-start md:items-center">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary to-secondary p-1 shadow-lg shadow-primary/20 flex-shrink-0">
            <div className="w-full h-full bg-surface rounded-xl flex items-center justify-center text-3xl font-bold text-white">
              {profile.personalInfo.fullName.charAt(0)}
            </div>
          </div>
          <div className="flex-1 w-full">
            <input
              type="text"
              value={profile.personalInfo.fullName}
              onChange={(e) => handleUpdate('fullName', e.target.value, 'personalInfo')}
              className="text-3xl font-bold text-white mb-2 bg-transparent border border-transparent hover:border-white/20 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary rounded px-2 -ml-2 w-full transition-all"
            />
            <div className="flex flex-wrap gap-4 text-sm text-slate-300">
              {profile.personalInfo.email && (
                <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /> {profile.personalInfo.email}</div>
              )}
              {profile.personalInfo.phone && (
                <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-primary" /> {profile.personalInfo.phone}</div>
              )}
              {profile.personalInfo.location !== null && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" /> 
                  <input
                    type="text"
                    value={profile.personalInfo.location || ''}
                    placeholder="Location"
                    onChange={(e) => handleUpdate('location', e.target.value, 'personalInfo')}
                    className="bg-transparent border border-transparent hover:border-white/20 focus:border-primary focus:outline-none rounded px-1 -ml-1 transition-all text-slate-300 w-32"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (Skills) */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="lg:col-span-1 space-y-6">
          <div className="glass-panel p-6 overflow-hidden">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2 border-b border-white/10 pb-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              Skills Normalization
            </h3>
            
            <div className="space-y-3">
              <div className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-wider px-2">
                <span>Extracted</span>
                <span>RAG Target</span>
              </div>
              
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {profile.skills.map((skill, index) => {
                  const isVerified = skill.length > 5; // Deterministic logic for demo
                  return (
                    <div key={index} className="flex items-center justify-between p-2 rounded-lg bg-surface/50 border border-white/5 hover:border-white/20 transition-all group">
                      <span className="text-sm text-slate-400 truncate w-[45%] line-through opacity-70 group-hover:opacity-100 transition-opacity" title={skill}>{skill}</span>
                      
                      <div className="w-4 h-px bg-white/20"></div>
                      
                      <div className="flex items-center gap-2 w-[45%] justify-end">
                        <span className="text-sm font-medium text-white truncate text-right" title={skill}>{skill}</span>
                        {isVerified ? (
                          <div title="Fast-Path Verified">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          </div>
                        ) : (
                          <div title="AI Refined">
                            <Wand2 className="w-3.5 h-3.5 text-secondary" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
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
                <div key={index} className="relative pl-6 border-l-2 border-white/10 last:pb-0 group">
                  <div className="absolute w-3 h-3 bg-primary rounded-full -left-[7.5px] top-2 shadow-[0_0_10px_rgba(59,130,246,0.5)] group-hover:scale-125 transition-transform"></div>
                  
                  <input
                    type="text"
                    value={exp.title}
                    onChange={(e) => handleUpdate('title', e.target.value, 'experiences', index, 'title')}
                    className="text-white font-medium bg-transparent border border-transparent hover:border-white/20 focus:border-primary focus:outline-none rounded px-2 -ml-2 w-full transition-all"
                  />
                  
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-sm text-slate-400 mb-2 gap-1 mt-1">
                    <input
                      type="text"
                      value={exp.company}
                      onChange={(e) => handleUpdate('company', e.target.value, 'experiences', index, 'company')}
                      className="text-primary font-medium bg-transparent border border-transparent hover:border-white/20 focus:border-primary focus:outline-none rounded px-2 -ml-2 transition-all w-full sm:w-auto"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={exp.startDate || ''}
                        onChange={(e) => handleUpdate('startDate', e.target.value, 'experiences', index, 'startDate')}
                        className="bg-transparent border border-transparent hover:border-white/20 focus:border-primary focus:outline-none rounded px-1 transition-all w-20 text-right text-slate-400"
                        placeholder="Start"
                      />
                      <span>-</span>
                      <input
                        type="text"
                        value={exp.endDate || ''}
                        onChange={(e) => handleUpdate('endDate', e.target.value, 'experiences', index, 'endDate')}
                        className="bg-transparent border border-transparent hover:border-white/20 focus:border-primary focus:outline-none rounded px-1 transition-all w-20 text-left text-slate-400"
                        placeholder="End"
                      />
                    </div>
                  </div>
                  
                  {exp.description !== undefined && (
                    <textarea
                      value={exp.description}
                      onChange={(e) => handleUpdate('description', e.target.value, 'experiences', index, 'description')}
                      className="text-sm text-slate-300 leading-relaxed bg-transparent border border-transparent hover:border-white/20 focus:border-primary focus:outline-none rounded px-2 -ml-2 w-full transition-all min-h-[80px] resize-y"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Projects Section */}
          <div className="glass-panel p-6">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2 border-b border-white/10 pb-3">
              <FolderGit2 className="w-5 h-5 text-emerald-400" />
              Projects
            </h3>
            <div className="space-y-6">
              {profile.projects?.map((proj, index) => (
                <div key={index} className="relative pl-6 border-l-2 border-white/10 last:pb-0 group">
                  <div className="absolute w-3 h-3 bg-emerald-400 rounded-full -left-[7.5px] top-2 shadow-[0_0_10px_rgba(52,211,153,0.5)] group-hover:scale-125 transition-transform"></div>
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <input
                      type="text"
                      value={proj.title}
                      onChange={(e) => handleUpdate('title', e.target.value, 'projects', index, 'title')}
                      className="text-white font-medium bg-transparent border border-transparent hover:border-white/20 focus:border-emerald-400 focus:outline-none rounded px-2 -ml-2 transition-all w-full sm:flex-1"
                    />
                    <div className="flex items-center gap-1 group/link">
                      <LinkIcon className="w-4 h-4 text-slate-500 group-hover/link:text-emerald-400 transition-colors" />
                      <input
                        type="text"
                        value={proj.link || ''}
                        onChange={(e) => handleUpdate('link', e.target.value, 'projects', index, 'link')}
                        placeholder="Project URL"
                        className="text-sm text-slate-400 bg-transparent border border-transparent hover:border-white/20 focus:border-emerald-400 focus:outline-none rounded px-1 transition-all w-32"
                      />
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-1.5 mt-2 mb-3 pl-0.5">
                    {proj.techStack.map((tech, techIndex) => (
                      <input
                        key={techIndex}
                        type="text"
                        value={tech}
                        onChange={(e) => {
                          const newStack = [...proj.techStack];
                          newStack[techIndex] = e.target.value;
                          handleUpdate('techStack', newStack, 'projects', index, 'techStack');
                        }}
                        className="text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded px-2 py-0.5 w-auto max-w-[120px] focus:outline-none focus:border-emerald-500 focus:bg-emerald-500/20 hover:border-emerald-500/50 transition-colors"
                      />
                    ))}
                    <button 
                      onClick={() => {
                        const newStack = [...proj.techStack, "New Tech"];
                        handleUpdate('techStack', newStack, 'projects', index, 'techStack');
                      }}
                      className="text-xs bg-white/5 border border-white/10 text-slate-400 rounded px-2 py-0.5 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      + Add Tech
                    </button>
                  </div>
                  
                  {proj.description !== undefined && (
                    <textarea
                      value={proj.description}
                      onChange={(e) => handleUpdate('description', e.target.value, 'projects', index, 'description')}
                      className="text-sm text-slate-300 leading-relaxed bg-transparent border border-transparent hover:border-white/20 focus:border-emerald-400 focus:outline-none rounded px-2 -ml-2 w-full transition-all min-h-[60px] resize-y"
                    />
                  )}
                </div>
              ))}
              
              {(!profile.projects || profile.projects.length === 0) && (
                <p className="text-slate-500 text-sm italic">No projects found. You can add one below.</p>
              )}
              
              <button 
                onClick={() => {
                  const newProject = { title: "New Project", description: "", techStack: ["Tech"] };
                  const newProjects = [...(profile.projects || []), newProject];
                  setProfile(prev => ({ ...prev, projects: newProjects }));
                }}
                className="text-sm font-medium text-emerald-400 hover:text-emerald-300 flex items-center gap-1 mt-4"
              >
                + Add Project
              </button>
            </div>
          </div>

          <div className="glass-panel p-6">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2 border-b border-white/10 pb-3">
              <GraduationCap className="w-5 h-5 text-secondary" />
              Education
            </h3>
            <div className="space-y-4">
              {profile.education.map((edu, index) => (
                <div key={index} className="bg-surface/30 p-4 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={edu.degree}
                      onChange={(e) => handleUpdate('degree', e.target.value, 'education', index, 'degree')}
                      className="text-white font-medium bg-transparent border border-transparent hover:border-white/20 focus:border-secondary focus:outline-none rounded px-2 -ml-2 transition-all w-full"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-sm text-slate-400 mt-2 gap-1">
                    <input
                      type="text"
                      value={edu.institution}
                      onChange={(e) => handleUpdate('institution', e.target.value, 'education', index, 'institution')}
                      className="text-secondary font-medium bg-transparent border border-transparent hover:border-white/20 focus:border-secondary focus:outline-none rounded px-2 -ml-2 transition-all w-full sm:w-auto"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={edu.startDate || ''}
                        onChange={(e) => handleUpdate('startDate', e.target.value, 'education', index, 'startDate')}
                        className="bg-transparent border border-transparent hover:border-white/20 focus:border-secondary focus:outline-none rounded px-1 transition-all w-20 text-right text-slate-400"
                      />
                      <span>-</span>
                      <input
                        type="text"
                        value={edu.endDate || ''}
                        onChange={(e) => handleUpdate('endDate', e.target.value, 'education', index, 'endDate')}
                        className="bg-transparent border border-transparent hover:border-white/20 focus:border-secondary focus:outline-none rounded px-1 transition-all w-20 text-left text-slate-400"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </motion.div>
      </div>
    </div>
  );
};
