import { apiError, requireAdminUser } from "@/lib/admin-auth";
import { getProfile, parseProfileInput, saveProfile } from "@/lib/profile";
import { assertSameOrigin } from "@/lib/same-origin";

export async function GET() {
  try {
    const user = await requireAdminUser();
    if (user instanceof Response) return user;
    return Response.json({ profile: await getProfile(user.id) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    const user = await requireAdminUser();
    if (user instanceof Response) return user;
    const parsed = parseProfileInput(await request.json() as Record<string, unknown>);
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
    return Response.json({ profile: await saveProfile(user.id, parsed) });
  } catch (error) {
    return apiError(error);
  }
}
