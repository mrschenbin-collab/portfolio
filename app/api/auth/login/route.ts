import { clientIpFromRequest, createSessionCookie, loginUser } from "@/lib/auth";
import { apiError } from "@/lib/admin-auth";

const noStoreHeaders = { "cache-control": "no-store" };

export async function POST(request: Request) {
  try {
    const result = await loginUser(await request.json() as Record<string, unknown>, { ip: clientIpFromRequest(request) });
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status ?? 401, headers: noStoreHeaders });
    return Response.json(
      { user: result },
      { headers: { ...noStoreHeaders, "set-cookie": createSessionCookie(result, request) } },
    );
  } catch (error) {
    return apiError(error);
  }
}
