import { apiError, requireAdminUser } from "@/lib/admin-auth";
import { createImageUploadTicket } from "@/lib/file-media";

export async function POST(request: Request) {
  try {
    const user = await requireAdminUser();
    if (user instanceof Response) return user;
    const payload = await request.json() as Record<string, unknown>;
    const ticket = await createImageUploadTicket(user.id, {
      name: payload.name,
      type: payload.type,
      size: payload.size,
    });
    return Response.json(ticket, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Error && /图片|十五兆|JPG|PNG|WEBP|GIF|上传/.test(error.message)) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return apiError(error);
  }
}
