import { apiError, requireAdminUser } from "@/lib/admin-auth";
import { deleteImageFile, finalizeImageUpload } from "@/lib/file-media";
import { addProjectImages, getProjectById } from "@/lib/portfolio";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let storedKey = "";
  try {
    const user = await requireAdminUser();
    if (user instanceof Response) return user;
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "作品编号无效" }, { status: 400 });

    const project = await getProjectById(user.id, id);
    if (!project) return Response.json({ error: "作品不存在" }, { status: 404 });
    if (project.images.length >= 12) return Response.json({ error: "每个作品最多上传十二张图片" }, { status: 400 });
    if (project.images.length + project.videos.length >= 12) return Response.json({ error: "每个作品最多上传十二个媒体文件" }, { status: 400 });

    const payload = await request.json() as Record<string, unknown>;
    const tempKey = typeof payload.tempKey === "string" ? payload.tempKey : "";
    if (!tempKey) return Response.json({ error: "上传凭据无效" }, { status: 400 });

    storedKey = await finalizeImageUpload(user.id, tempKey, user.id);
    const images = await addProjectImages(user.id, id, [storedKey], project.title);
    if (!images) {
      await deleteImageFile(storedKey).catch(() => undefined);
      storedKey = "";
      return Response.json({ error: "作品不存在或媒体数量超出限制" }, { status: 400 });
    }
    return Response.json({ images }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (storedKey) await deleteImageFile(storedKey).catch(() => undefined);
    if (error instanceof Error && /图片|十五兆|像素|JPG|PNG|WEBP|GIF|上传|凭据/.test(error.message)) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return apiError(error);
  }
}
