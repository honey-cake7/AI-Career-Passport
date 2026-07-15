import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.GROQ_API_KEY) {
  console.warn('⚠️  GROQ_API_KEY is not set. LLM features will fail at runtime.');
}

/**
 * Singleton Groq client instance.
 */
export const groqClient = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

/** The default Groq model for inference. */
export const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
