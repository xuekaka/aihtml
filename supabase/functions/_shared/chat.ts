import { createClient } from "jsr:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ACCOUNT_PASSWORD_ENV: Record<string, string> = {
  白白: "CHAT_PASSWORD_BAIBAI",
  飞飞: "CHAT_PASSWORD_FEIFEI",
};

const ACCOUNT_DIR: Record<string, string> = {
  白白: "baibai",
  飞飞: "feifei",
};

export const TABLE_NAME = "chat_messages";
export const READ_STATE_TABLE = "chat_read_state";
export const IMAGE_BUCKET = "chat-images";
export const AUDIO_BUCKET = "chat-audios";

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export function handleOptions(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

export function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export function normalizeAccount(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function validateAccountPassword(account: string, password: string) {
  const envName = ACCOUNT_PASSWORD_ENV[account];
  if (!envName) {
    return false;
  }
  const expected = Deno.env.get(envName);
  if (!expected) {
    throw new Error(`Missing required env: ${envName}`);
  }
  return password === expected;
}

export function requireAuth(account: unknown, password: unknown) {
  const normalizedAccount = normalizeAccount(account);
  const normalizedPassword = typeof password === "string" ? password : "";
  if (!normalizedAccount || !normalizedPassword) {
    return { ok: false as const, error: "请检查输入" };
  }
  if (!ACCOUNT_PASSWORD_ENV[normalizedAccount]) {
    return { ok: false as const, error: "请检查输入" };
  }
  if (!validateAccountPassword(normalizedAccount, normalizedPassword)) {
    return { ok: false as const, error: "请检查输入" };
  }
  return { ok: true as const, account: normalizedAccount };
}

export function createServiceClient() {
  return createClient(requireEnv("CHAT_SUPABASE_URL"), requireEnv("CHAT_SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function safeAccountDir(account: string) {
  return ACCOUNT_DIR[account] || "user";
}

export function randomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}

export function extFromMime(mimeType: string, fallback = "bin") {
  const clean = (mimeType || "").toLowerCase();
  if (clean === "image/png") return "png";
  if (clean === "image/webp") return "webp";
  if (clean === "image/gif") return "gif";
  if (clean.includes("jpeg") || clean.includes("jpg")) return "jpg";
  if (clean.includes("mp4")) return "m4a";
  if (clean.includes("ogg")) return "ogg";
  if (clean.includes("wav")) return "wav";
  if (clean.includes("mpeg")) return "mp3";
  if (clean.includes("webm")) return "webm";
  return fallback;
}

export function buildReplyPayload(input: {
  reply_to_message_id?: unknown;
  reply_to_sender?: unknown;
  reply_to_type?: unknown;
  reply_to_preview?: unknown;
}) {
  return {
    reply_to_message_id:
      input.reply_to_message_id == null || input.reply_to_message_id === ""
        ? null
        : Number(input.reply_to_message_id),
    reply_to_sender:
      typeof input.reply_to_sender === "string" && input.reply_to_sender.trim()
        ? input.reply_to_sender.trim()
        : null,
    reply_to_type:
      typeof input.reply_to_type === "string" && input.reply_to_type.trim()
        ? input.reply_to_type.trim()
        : null,
    reply_to_preview:
      typeof input.reply_to_preview === "string" && input.reply_to_preview.trim()
        ? input.reply_to_preview.trim()
        : null,
  };
}
