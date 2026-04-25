import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

dotenvConfig();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8080),
  APP_BASE_URL: z.string().url(),
  DEEPGRAM_API_KEY: z.string().min(1).optional(),
  DEEPGRAM_AGENT_WS_URL: z
    .string()
    .url()
    .default('wss://agent.deepgram.com/v1/agent/converse'),
  ELEVENLABS_AGENT_ID: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_WEBHOOK_SECRET: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  LOG_LEVEL: z.string().default('info')
});

export type Env = z.infer<typeof envSchema>;

const result = envSchema.safeParse(process.env);

export const missingVars: string[] = result.success
  ? []
  : result.error.issues.map((i) => String(i.path[0]));

export const env: Env = result.success
  ? result.data
  : ({
      NODE_ENV: (process.env.NODE_ENV as 'development') ?? 'development',
      PORT: Number(process.env.PORT) || 8080,
      APP_BASE_URL: process.env.APP_BASE_URL ?? '',
      DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
      DEEPGRAM_AGENT_WS_URL:
        process.env.DEEPGRAM_AGENT_WS_URL ?? 'wss://agent.deepgram.com/v1/agent/converse',
      ELEVENLABS_AGENT_ID: process.env.ELEVENLABS_AGENT_ID,
      ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
      ELEVENLABS_WEBHOOK_SECRET: process.env.ELEVENLABS_WEBHOOK_SECRET,
      TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
      SUPABASE_URL: process.env.SUPABASE_URL ?? '',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      LOG_LEVEL: process.env.LOG_LEVEL ?? 'info'
    } as Env);
