import {
  READ_STATE_TABLE,
  createServiceClient,
  handleOptions,
  json,
  requireAuth,
} from "../_shared/chat.ts";

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    const auth = requireAuth(body?.account, body?.password);
    if (!auth.ok) {
      return json({ error: auth.error }, 401);
    }

    const lastReadMessageId = Number(body?.last_read_message_id);
    if (!Number.isFinite(lastReadMessageId) || lastReadMessageId <= 0) {
      return json({ error: "last_read_message_id 无效" }, 400);
    }

    const sb = createServiceClient();
    const { error } = await sb.from(READ_STATE_TABLE).upsert(
      {
        account: auth.account,
        last_read_message_id: lastReadMessageId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account" },
    );

    if (error) {
      console.error(error);
      return json({ error: error.message }, 500);
    }

    return json({ ok: true });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "更新已读失败" }, 500);
  }
});
