import { mkdir, writeFile } from 'node:fs/promises';
import { Profile } from '../../src/models/Profile.js';
import { generateProfilePdf } from '../../src/services/pdfGenerator.service.js';

// Synthetic data only. No database or provider calls; run from backend/.
const profile = new Profile({
  personalInfo: { fullName: 'Zoë García', email: 'zoe@example.invalid', location: 'Pune, India', summary: 'Developer building reliable web applications. Interested in clear interfaces and useful tools.' },
  skills: ['TypeScript', 'React', 'Node.js', 'MongoDB', 'Testing'],
  experiences: [{ title: 'Software Engineering Intern', company: 'Example Studio', startDate: 'Jun 2025', endDate: 'Aug 2025', description: '• Built a resume editor with validation and save-conflict handling.\n• Added regression tests for profile ownership and PDF export.' }],
  projects: [{ title: 'Parser Portfolio', techStack: ['TypeScript', 'Node.js'], link: 'https://example.invalid/project', description: 'Built a parser and checked its output against synthetic fixtures. Added clear errors for invalid documents.' }],
  education: [{ institution: 'Example Institute', degree: 'Bachelor of Engineering', field: 'Computer Science', startDate: '2024', endDate: '2028' }],
});
await mkdir('.tmp/pdfs', { recursive: true });
await writeFile('.tmp/pdfs/editor-preview.pdf', await generateProfilePdf(profile));
console.log('Synthetic PDF: .tmp/pdfs/editor-preview.pdf');
