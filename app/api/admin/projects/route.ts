import { apiError, requireAdminUser } from "@/lib/admin-auth";
import { createProject, getAllProjects } from "@/lib/portfolio";
import { parseProjectInput } from "@/lib/project-input";
import { assertSameOrigin } from "@/lib/same-origin";

export async function GET() {
  try {
    const user = await requireAdminUser();
    if (user instanceof Response) return user;
    return Response.json({ projects: await getAllProjects(user.id) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    const user = await requireAdminUser();
    if (user instanceof Response) return user;
    const payload = await request.json() as Record<string, unknown>;
    const input = parseProjectInput(payload);
    if ("error" in input) return Response.json({ error: input.error }, { status: 400 });
    const project = await createProject(user.id, input);
    return Response.json({ project }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
