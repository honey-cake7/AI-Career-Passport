import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import type { ResumeContent } from '../validation/resume.js';

function safeLink(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? value : undefined;
  } catch { return undefined; }
}

/**
 * Generates a standard resume PDF from the profile data.
 * @param profile The profile document from MongoDB
 * @returns A Promise that resolves to a Buffer containing the binary PDF data
 */
export async function generateProfilePdf(profile: ResumeContent): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      // Bundled OFL fonts keep common Unicode names and bullets readable offline.
      for (const [name, file] of [['ResumeSans', 'Regular'], ['ResumeSans-Bold', 'Bold'], ['ResumeSans-Oblique', 'Italic']]) {
        doc.registerFont(name!, fileURLToPath(new URL(`../../assets/fonts/NotoSans-${file}.ttf`, import.meta.url)));
      }
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const { personalInfo, experiences, projects, education, skills } = profile;

      // ─── Header: Personal Info ──────────────────────────
      doc.font('ResumeSans-Bold').fontSize(24).text(personalInfo.fullName, { align: 'center' });
      
      const contactLines = [];
      if (personalInfo.email) contactLines.push(personalInfo.email);
      if (personalInfo.phone) contactLines.push(personalInfo.phone);
      if (personalInfo.location) contactLines.push(personalInfo.location);
      if (personalInfo.linkedIn) contactLines.push(personalInfo.linkedIn);
      
      doc.font('ResumeSans').fontSize(10).text(contactLines.join(' | '), { align: 'center' });
      doc.moveDown(1.5);

      if (personalInfo.summary) {
        doc.font('ResumeSans-Bold').fontSize(14).text('Summary');
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.5);
        doc.font('ResumeSans').fontSize(10).text(personalInfo.summary);
        doc.moveDown(1.5);
      }

      // ─── Skills ─────────────────────────────────────────
      if (skills && skills.length > 0) {
        doc.font('ResumeSans-Bold').fontSize(14).text('Skills');
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.5);
        
        doc.font('ResumeSans').fontSize(10).text(skills.join(', '));
        doc.moveDown(1.5);
      }

      // ─── Experience ─────────────────────────────────────
      if (experiences && experiences.length > 0) {
        doc.font('ResumeSans-Bold').fontSize(14).text('Experience');
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.5);

        experiences.forEach(exp => {
          doc.font('ResumeSans-Bold').fontSize(12).text(exp.title, { continued: true });
          doc.font('ResumeSans-Oblique').fontSize(12).text(` at ${exp.company}`);
          
          const metaLines = [];
          if (exp.location) metaLines.push(exp.location);
          if (exp.startDate || exp.endDate) {
            metaLines.push([exp.startDate, exp.endDate].filter(Boolean).join(' - '));
          }
          
          if (metaLines.length > 0) {
            doc.font('ResumeSans').fontSize(10).fillColor('gray').text(metaLines.join(' | '));
          }
          doc.fillColor('black'); // Reset color
          
          if (exp.description) {
            doc.moveDown(0.25);
            doc.font('ResumeSans').fontSize(10).text(exp.description);
          }
          doc.moveDown(1);
        });
      }

      // ─── Projects ───────────────────────────────────────
      if (projects && projects.length > 0) {
        doc.font('ResumeSans-Bold').fontSize(14).text('Projects');
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.5);

        projects.forEach(proj => {
          doc.font('ResumeSans-Bold').fontSize(12).text(proj.title);
          if (proj.link) {
            doc.font('ResumeSans').fontSize(10).fillColor('blue')
               .text(proj.link, { link: safeLink(proj.link), underline: true });
            doc.fillColor('black'); // Reset
          }

          if (proj.techStack && proj.techStack.length > 0) {
            doc.font('ResumeSans-Oblique').fontSize(10).fillColor('gray').text(proj.techStack.join(', '));
            doc.fillColor('black'); // Reset
          }

          if (proj.description) {
            doc.moveDown(0.25);
            doc.font('ResumeSans').fontSize(10).text(proj.description);
          }
          doc.moveDown(1);
        });
      }

      // ─── Education ──────────────────────────────────────
      if (education && education.length > 0) {
        doc.font('ResumeSans-Bold').fontSize(14).text('Education');
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.5);

        education.forEach(edu => {
          doc.font('ResumeSans-Bold').fontSize(12).text(edu.degree, { continued: true });
          doc.font('ResumeSans').fontSize(12).text(edu.field ? ` in ${edu.field}` : '');
          doc.font('ResumeSans-Oblique').fontSize(11).text(edu.institution);

          const metaLines = [];
          if (edu.startDate || edu.endDate) {
            metaLines.push([edu.startDate, edu.endDate].filter(Boolean).join(' - '));
          }
          if (edu.gpa) metaLines.push(`GPA: ${edu.gpa}`);

          if (metaLines.length > 0) {
            doc.font('ResumeSans').fontSize(10).fillColor('gray').text(metaLines.join(' | '));
          }
          doc.fillColor('black'); // Reset color
          doc.moveDown(1);
        });
      }

      // Finalize PDF file
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
