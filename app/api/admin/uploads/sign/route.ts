import { apiError, requireAdminUser } from "@/lib/admin-auth";
import { createImageUploadTicket, createVideoUploadTicket } from "@/lib/file-media";

export async function POST(request: Request) {
  try {
    const user = await requireAdminUser();
    if (user instanceof Response) return user;
    const payload = await request.json() as Record<string, unknown>;
    const ticketFactory = payload.kind === "video" ? createVideoUploadTicket : createImageUploadTicket;
    const ticket = await ticketFactory(user.id, {
      name: payload.name,
      type: payload.type,
      size: payload.size,
    });
    return Response.json(ticket, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Error && /图片|视频|十五兆|200MB|JPG|PNG|WEBP|GIF|MP4|WEBM|MOV|M4V|上传/.test(error.message)) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return apiError(error);
  }
}
