import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

dotenvConfig();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8080),
  APP_BASE_URL: z.string().url(),
  DEEPGRAM_API_KEY: z.string().min(1),
  DEEPGRAM_AGENT_WS_URL: z
    .string()
    .url()
    .default('wss://agent.deepgram.com/v1/agent/converse'),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  LOG_LEVEL: z.string().default('info')
});

export const env = envSchema.parse(process.env);
