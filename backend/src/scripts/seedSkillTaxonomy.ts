/**
 * Skill Taxonomy Seed Script
 *
 * Initializes the Qdrant vector database with a comprehensive set of canonical
 * tech skills. Each skill is embedded using fastembed and upserted into the
 * `skill_taxonomy` collection.
 *
 * Usage: npm run seed:skills  (or: npx tsx src/scripts/seedSkillTaxonomy.ts)
 */

import dotenv from 'dotenv';
dotenv.config();

import { qdrantClient, SKILL_COLLECTION_NAME, VECTOR_DIMENSION } from '../config/qdrant.js';
import { embeddingService } from '../services/embedding.service.js';

// ─── Canonical Skill Taxonomy ─────────────────────────────────

const SKILL_TAXONOMY: Record<string, string[]> = {
  'Programming Languages': [
    'JavaScript',
    'TypeScript',
    'Python',
    'Java',
    'C++',
    'C#',
    'Go',
    'Rust',
    'Ruby',
    'PHP',
    'Swift',
    'Kotlin',
    'Scala',
    'R',
  ],
  'Frontend Frameworks': [
    'React.js',
    'Angular',
    'Vue.js',
    'Next.js',
    'Svelte',
    'Nuxt.js',
    'Gatsby',
  ],
  'Backend Frameworks': [
    'Node.js',
    'Express.js',
    'Django',
    'Flask',
    'Spring Boot',
    'FastAPI',
    'Ruby on Rails',
    'NestJS',
    'ASP.NET',
  ],
  'Databases': [
    'MongoDB',
    'PostgreSQL',
    'MySQL',
    'Redis',
    'Elasticsearch',
    'SQLite',
    'Cassandra',
    'DynamoDB',
    'Firebase',
  ],
  'Cloud & DevOps': [
    'AWS',
    'Google Cloud Platform',
    'Microsoft Azure',
    'Docker',
    'Kubernetes',
    'Terraform',
    'CI/CD',
    'Jenkins',
    'GitHub Actions',
  ],
  'AI & Data': [
    'Machine Learning',
    'Deep Learning',
    'TensorFlow',
    'PyTorch',
    'Natural Language Processing',
    'Computer Vision',
    'Data Science',
    'Pandas',
    'NumPy',
  ],
  'CSS & Styling': [
    'CSS3',
    'Tailwind CSS',
    'Sass/SCSS',
    'Bootstrap',
    'Material UI',
    'Styled Components',
  ],
  'Tools & Platforms': [
    'Git',
    'Linux',
    'GraphQL',
    'REST API',
    'Webpack',
    'Vite',
    'Nginx',
    'Apache Kafka',
    'RabbitMQ',
  ],
  'Methodologies & Soft Skills': [
    'Agile',
    'Scrum',
    'Leadership',
    'Project Management',
    'Communication',
    'Problem Solving',
    'Team Collaboration',
  ],
};

// ─── Seed Logic ───────────────────────────────────────────────

async function seedSkillTaxonomy(): Promise<void> {
  // Flatten all skills
  const allSkills = Object.values(SKILL_TAXONOMY).flat();
  console.log(`📦 Seeding ${allSkills.length} canonical skills into Qdrant...`);

  // 1. Delete existing collection if present, then recreate
  try {
    const collections = await qdrantClient.getCollections();
    const exists = collections.collections.some((c) => c.name === SKILL_COLLECTION_NAME);
    if (exists) {
      console.log(`   Deleting existing collection "${SKILL_COLLECTION_NAME}"...`);
      await qdrantClient.deleteCollection(SKILL_COLLECTION_NAME);
    }
  } catch {
    // Collection doesn't exist — fine
  }

  console.log(`   Creating collection "${SKILL_COLLECTION_NAME}" (dim=${VECTOR_DIMENSION}, cosine)...`);
  await qdrantClient.createCollection(SKILL_COLLECTION_NAME, {
    vectors: {
      size: VECTOR_DIMENSION,
      distance: 'Cosine',
    },
  });

  // 2. Generate embeddings for all skills
  console.log('   Generating embeddings for all skills...');
  const embeddings = await embeddingService.generateEmbeddings(allSkills);

  // 3. Build points and upsert
  const points = allSkills.map((skill, index) => ({
    id: index + 1,
    vector: embeddings[index],
    payload: {
      skill_name: skill,
      category: Object.entries(SKILL_TAXONOMY).find(([, skills]) =>
        skills.includes(skill)
      )?.[0] || 'Uncategorized',
    },
  }));

  console.log(`   Upserting ${points.length} points into Qdrant...`);
  await qdrantClient.upsert(SKILL_COLLECTION_NAME, {
    wait: true,
    points,
  });

  // 4. Verify
  const collectionInfo = await qdrantClient.getCollection(SKILL_COLLECTION_NAME);
  console.log(`✅ Seed complete! Collection "${SKILL_COLLECTION_NAME}" has ${collectionInfo.points_count} points.`);
}

// ─── Run ──────────────────────────────────────────────────────

seedSkillTaxonomy()
  .then(() => {
    console.log('🎉 Skill taxonomy seed finished successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  });
