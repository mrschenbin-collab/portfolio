import { apiError, requireAdminUser } from "@/lib/admin-auth";
import { parseProjectVisibilityInput } from "@/lib/project-input";
import { setProjectStatus } from "@/lib/portfolio";
import { assertSameOrigin } from "@/lib/same-origin";

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    const user = await requireAdminUser();
    if (user instanceof Response) return user;
    const id = parseId((await params).id);
    if (!id) return Response.json({ error: "作品编号无效" }, { status: 400 });
    const input = parseProjectVisibilityInput(await request.json() as Record<string, unknown>);
    if ("error" in input) return Response.json({ error: input.error }, { status: 400 });
    const project = await setProjectStatus(user.id, id, input.status);
    if (!project) return Response.json({ error: "作品不存在" }, { status: 404 });
    return Response.json({ project });
  } catch (error) {
    return apiError(error);
  }
}
