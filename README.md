# Voice Calling Assistant

Twilio is used only as phone number + PSTN transport. Deepgram handles voice intelligence.

## Monorepo

- `apps/backend`: Twilio webhook + Media Stream bridge + Deepgram realtime + Supabase writes
- `apps/frontend`: Next.js dashboard for calls, orders, reservations
- `supabase/schema.sql`: database schema

## Prerequisites

- Node.js 20+
- Twilio phone number (voice enabled)
- Deepgram API key
- Supabase project

## 1) Install

```bash
cd /Users/adnan/Documents/voice-calling-assistant
npm install
```

## 2) Database

Run `supabase/schema.sql` in Supabase SQL editor.
Then run `supabase/seed_new_delhi_restaurant.sql` to load New Delhi Restaurant menu items.

## 3) Backend env

```bash
cd /Users/adnan/Documents/voice-calling-assistant/apps/backend
cp .env.example .env
```

Required:

- `DEEPGRAM_API_KEY`
- `APP_BASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `TWILIO_AUTH_TOKEN` (for webhook signature validation)
- `ELEVENLABS_AGENT_ID` (the ElevenLabs agent this backend should accept webhooks from)
- `ELEVENLABS_API_KEY` (placeholder for future ElevenLabs API calls or management tasks)
- `ELEVENLABS_WEBHOOK_SECRET` (for ElevenLabs webhook signature validation)

## 4) Frontend env

```bash
cd /Users/adnan/Documents/voice-calling-assistant/apps/frontend
cp .env.local.example .env.local
```

Set Supabase anon URL/key.

## 5) Run locally

```bash
cd /Users/adnan/Documents/voice-calling-assistant
npm run dev:backend
# in another terminal
npm run dev:frontend
```

## 6) Twilio setup

For your Twilio number voice webhook:

- URL: `https://<backend-domain>/twilio/voice`
- Method: `POST`

Twilio then streams audio to backend websocket `/twilio/media` via TwiML.

## 7) ElevenLabs setup

For ElevenLabs post-call webhooks:

- URL: `https://<backend-domain>/elevenlabs/voice`
- Method: `POST`
- Agent ID: set `ELEVENLABS_AGENT_ID` to the agent you created in ElevenLabs

ElevenLabs can send post-call transcription and call-initiation-failure webhooks to this route. The backend stores those calls in the same Supabase tables as Deepgram-backed calls, marks the call provider as `elevenlabs`, and can reject webhook payloads that do not belong to the configured ElevenLabs agent.

## Notes

- This version is inbound-focused.
- Order/reservation business logic is driven by Deepgram agent behavior and persisted in Supabase tables.

## Deploy on Render

1. Push this repo to GitHub.
2. In Render, choose **New +** -> **Blueprint** and select the repo.
3. Render will detect `/Users/adnan/Documents/voice-calling-assistant/render.yaml` and create:
   - `voice-assistant-backend`
   - `voice-assistant-frontend`
4. Set required backend env vars in Render:
   - `APP_BASE_URL` (must be the backend Render URL, e.g. `https://voice-assistant-backend.onrender.com`)
   - `DEEPGRAM_API_KEY`
   - `ELEVENLABS_AGENT_ID` (if using ElevenLabs)
   - `ELEVENLABS_API_KEY` (placeholder for future ElevenLabs API usage)
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `TWILIO_AUTH_TOKEN` (recommended)
   - `ELEVENLABS_WEBHOOK_SECRET` (recommended if using ElevenLabs webhooks)
5. Set required frontend env vars in Render:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
6. After deploy, set Twilio number webhook:
   - `POST https://<your-backend-domain>/twilio/voice`
