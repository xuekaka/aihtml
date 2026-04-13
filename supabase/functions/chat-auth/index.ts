import { handleOptions, json, requireAuth } from "../_shared/chat.ts";

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

    return json({ ok: true, account: auth.account });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "认证失败" }, 500);
  }
});
