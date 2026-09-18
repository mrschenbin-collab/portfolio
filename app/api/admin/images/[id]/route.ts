import { apiError, requireAdminUser } from "@/lib/admin-auth";
import { deleteProjectImage } from "@/lib/portfolio";
import { assertSameOrigin } from "@/lib/same-origin";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    const user = await requireAdminUser();
    if (user instanceof Response) return user;
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "图片编号无效" }, { status: 400 });
    const deleted = await deleteProjectImage(user.id, id);
    if (!deleted) return Response.json({ error: "图片不存在" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
