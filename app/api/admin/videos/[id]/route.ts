import { apiError, requireAdminUser } from "@/lib/admin-auth";
import { deleteProjectVideo } from "@/lib/portfolio";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdminUser();
    if (user instanceof Response) return user;
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "视频编号无效" }, { status: 400 });
    const deleted = await deleteProjectVideo(user.id, id);
    if (!deleted) return Response.json({ error: "视频不存在" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
