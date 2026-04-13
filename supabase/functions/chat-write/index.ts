import {
  AUDIO_BUCKET,
  IMAGE_BUCKET,
  TABLE_NAME,
  buildReplyPayload,
  createServiceClient,
  extFromMime,
  handleOptions,
  json,
  randomSuffix,
  requireAuth,
  safeAccountDir,
} from "../_shared/chat.ts";

async function insertTextMessage(body: any) {
  const auth = requireAuth(body?.account, body?.password);
  if (!auth.ok) {
    return json({ error: auth.error }, 401);
  }

  const content = String(body?.content || "").trim();
  if (!content) {
    return json({ error: "消息内容不能为空" }, 400);
  }

  const sb = createServiceClient();
  const payload = {
    sender: auth.account,
    type: "text",
    content,
    ...buildReplyPayload(body || {}),
  };

  const { data, error } = await sb
    .from(TABLE_NAME)
    .insert(payload)
    .select("id,sender,type,content,reply_to_message_id,reply_to_sender,reply_to_type,reply_to_preview,created_at")
    .single();

  if (error) {
    console.error(error);
    return json({ error: error.message }, 500);
  }

  return json({ ok: true, message: data });
}

async function insertMediaMessage(form: FormData) {
  const auth = requireAuth(form.get("account"), form.get("password"));
  if (!auth.ok) {
    return json({ error: auth.error }, 401);
  }

  const type = String(form.get("type") || "").trim();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return json({ error: "缺少文件" }, 400);
  }
  if (type !== "image" && type !== "audio") {
    return json({ error: "不支持的消息类型" }, 400);
  }

  const mimeType = file.type || "";
  if (type === "image" && !mimeType.startsWith("image/")) {
    return json({ error: "图片类型无效" }, 400);
  }
  if (type === "audio" && !mimeType.startsWith("audio/")) {
    return json({ error: "语音类型无效" }, 400);
  }

  const bucket = type === "image" ? IMAGE_BUCKET : AUDIO_BUCKET;
  const ext = extFromMime(mimeType, type === "image" ? "jpg" : "webm");
  const path = `${safeAccountDir(auth.account)}/${Date.now()}_${randomSuffix()}.${ext}`;

  const sb = createServiceClient();
  const upload = await sb.storage.from(bucket).upload(path, file, {
    contentType: mimeType || undefined,
    upsert: false,
  });
  if (upload.error) {
    console.error(upload.error);
    return json({ error: upload.error.message }, 500);
  }

  const { data: publicUrlData } = sb.storage.from(bucket).getPublicUrl(path);
  const mediaUrl = publicUrlData?.publicUrl || "";

  const replyPayload = buildReplyPayload({
    reply_to_message_id: form.get("reply_to_message_id"),
    reply_to_sender: form.get("reply_to_sender"),
    reply_to_type: form.get("reply_to_type"),
    reply_to_preview: form.get("reply_to_preview"),
  });

  const payload: Record<string, unknown> = {
    sender: auth.account,
    type,
    content: type === "image" ? "图片" : "语音",
    ...replyPayload,
  };

  if (type === "image") {
    payload.image_url = mediaUrl;
  } else {
    payload.audio_url = mediaUrl;
    payload.audio_mime = mimeType || null;
    const duration = Number(form.get("audio_duration_ms"));
    payload.audio_duration_ms = Number.isFinite(duration) ? Math.max(1000, Math.round(duration)) : 1000;
  }

  const { data, error } = await sb
    .from(TABLE_NAME)
    .insert(payload)
    .select(
      "id,sender,type,content,image_url,audio_url,audio_mime,audio_duration_ms,reply_to_message_id,reply_to_sender,reply_to_type,reply_to_preview,created_at",
    )
    .single();

  if (error) {
    console.error(error);
    return json({ error: error.message }, 500);
  }

  return json({ ok: true, message: data });
}

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json();
      return await insertTextMessage(body);
    }
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      return await insertMediaMessage(form);
    }
    return json({ error: "不支持的请求格式" }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "写入失败" }, 500);
  }
});
