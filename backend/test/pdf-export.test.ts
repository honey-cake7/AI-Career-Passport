import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Profile } from '../src/models/Profile.js';
import { generateProfilePdf } from '../src/services/pdfGenerator.service.js';
import { extractTextFromPdf } from '../src/services/pdfParser.service.js';

test('PDF preserves accented names, bullets and explicit dates without inventing Present', async () => {
  const profile = new Profile({ personalInfo: { fullName: 'Zoë García', summary: 'Résumé review — factual editing.' },
    experiences: [{ title: 'Developer', company: 'Example', startDate: '2024', description: '• Built a parser.' }],
    projects: [{ title: 'Portfolio', description: 'Tested output.', techStack: ['TypeScript'] }], education: [], skills: ['C++'] });
  const text = await extractTextFromPdf(await generateProfilePdf(profile));
  for (const expected of ['Zoë García', 'Résumé', 'Built a parser.', 'C++', '2024', 'Portfolio']) assert.ok(text.includes(expected), expected);
  assert.ok(!text.includes('Present'));
});
