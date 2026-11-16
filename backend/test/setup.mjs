// Tests must never inherit live provider/database credentials from a local .env.
process.env.NODE_ENV = 'test';
process.env.GROQ_API_KEY = 'test-not-a-real-key';
process.env.GROQ_MODEL = 'openai/gpt-oss-20b';
process.env.QDRANT_URL = 'http://127.0.0.1:1';
process.env.QDRANT_API_KEY = '';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/not-used-by-tests';
