# Chat Room Functions

These functions keep the existing chat-room UI unchanged while moving write access off the public browser client.

## Functions

- `chat-auth`
  - Validates the single-field login input against backend secrets.
- `chat-write`
  - Sends text, image, and audio messages using the service role key.
- `chat-read-state`
  - Updates read receipts using the service role key.

## Required secrets

Set these in Supabase Edge Functions secrets:

- `CHAT_SUPABASE_URL`
- `CHAT_SUPABASE_SERVICE_ROLE_KEY`
- `CHAT_PASSWORD_BAIBAI`
- `CHAT_PASSWORD_FEIFEI`

For the current lightweight setup, set:

- `CHAT_PASSWORD_BAIBAI=白白`
- `CHAT_PASSWORD_FEIFEI=飞飞`
- `CHAT_SUPABASE_URL=https://hdzeqsijrntnbdqdqyai.supabase.co`
- `CHAT_SUPABASE_SERVICE_ROLE_KEY=<your service role key>`

## Deploy

```bash
supabase functions deploy chat-auth
supabase functions deploy chat-write
supabase functions deploy chat-read-state
```

## After deploy

Run:

- [`supabase-chat-lockdown.sql`](/Users/a1/Documents/GitHub/aihtml/supabase-chat-lockdown.sql)

This removes anonymous browser write access while keeping anonymous read access for the chat UI and archive viewer.
