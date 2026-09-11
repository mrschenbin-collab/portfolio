import { apiError, requireAdminUser } from "@/lib/admin-auth";
import { deleteVideoFile, finalizeVideoUpload } from "@/lib/file-media";
import { addProjectVideos, getProjectById } from "@/lib/portfolio";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let storedKey = "";
  try {
    const user = await requireAdminUser();
    if (user instanceof Response) return user;
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "作品编号无效" }, { status: 400 });

    const project = await getProjectById(user.id, id);
    if (!project) return Response.json({ error: "作品不存在" }, { status: 404 });
    if (project.videos.length >= 4) return Response.json({ error: "每个作品最多上传四个视频" }, { status: 400 });

    const payload = await request.json() as Record<string, unknown>;
    const tempKey = typeof payload.tempKey === "string" ? payload.tempKey : "";
    if (!tempKey) return Response.json({ error: "上传凭据无效" }, { status: 400 });

    storedKey = await finalizeVideoUpload(user.id, tempKey, `${user.id}-video`);
    const videos = await addProjectVideos(user.id, id, [storedKey], project.title);
    if (!videos) {
      await deleteVideoFile(storedKey).catch(() => undefined);
      storedKey = "";
      return Response.json({ error: "作品不存在或视频数量超出限制" }, { status: 400 });
    }
    return Response.json({ videos }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (storedKey) await deleteVideoFile(storedKey).catch(() => undefined);
    if (error instanceof Error && /视频|200MB|MP4|WEBM|MOV|M4V|上传|凭据/.test(error.message)) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return apiError(error);
  }
}
