import { apiError, requireAdminUser } from "@/lib/admin-auth";
import { getContactLinks, parseContactLinksInput, saveContactLinks } from "@/lib/contact-links";

export async function GET() {
  try {
    const user = await requireAdminUser();
    if (user instanceof Response) return user;
    return Response.json({ links: await getContactLinks(user.id) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireAdminUser();
    if (user instanceof Response) return user;
    const parsed = parseContactLinksInput(await request.json() as Record<string, unknown>);
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
    return Response.json({ links: await saveContactLinks(user.id, parsed) });
  } catch (error) {
    return apiError(error);
  }
}
