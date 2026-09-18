import { apiError } from "@/lib/admin-auth";
import { clientIpFromRequest, requestVerificationCode } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/same-origin";

const noStoreHeaders = { "cache-control": "no-store" };

export async function POST(request: Request) {
  try {
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    const result = await requestVerificationCode(await request.json() as Record<string, unknown>, { ip: clientIpFromRequest(request) });
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status ?? 400, headers: noStoreHeaders });
    return Response.json(result, { headers: noStoreHeaders });
  } catch (error) {
    return apiError(error);
  }
}
