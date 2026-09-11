import { apiError } from "@/lib/admin-auth";
import { resetPassword } from "@/lib/auth";

const noStoreHeaders = { "cache-control": "no-store" };

export async function POST(request: Request) {
  try {
    const result = await resetPassword(await request.json() as Record<string, unknown>);
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status ?? 400, headers: noStoreHeaders });
    return Response.json({ ok: true, message: "密码已重置，请重新登录。" }, { headers: noStoreHeaders });
  } catch (error) {
    return apiError(error);
  }
}
