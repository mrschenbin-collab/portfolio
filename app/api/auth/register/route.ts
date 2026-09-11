import { registerUser } from "@/lib/auth";
import { apiError } from "@/lib/admin-auth";

const noStoreHeaders = { "cache-control": "no-store" };

export async function POST(request: Request) {
  try {
    const result = await registerUser(await request.json() as Record<string, unknown>);
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status ?? 400, headers: noStoreHeaders });
    return Response.json(
      { user: result, message: "注册成功，请登录。" },
      { status: 201, headers: noStoreHeaders },
    );
  } catch (error) {
    return apiError(error);
  }
}
