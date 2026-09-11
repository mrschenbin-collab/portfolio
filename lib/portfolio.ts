import { randomUUID } from "node:crypto";
import type { StoredProject, StoredProjectImage, StoredProjectVideo, StoredProfile, StoredUser } from "@/lib/file-store";
import { cleanMediaKey, deleteImageFile, deleteVideoFile, mediaUrl } from "@/lib/file-media";
import type { ProjectInput } from "@/lib/project-input";
import { dbDelete, dbInsert, dbSelect, dbUpdate } from "@/lib/supabase";

export type PortfolioImage = {
  id: number;
  url: string;
  altText: string;
  sortOrder: number;
};

export type PortfolioVideo = {
  id: number;
  url: string;
  altText: string;
  sortOrder: number;
};

export type PortfolioProject = {
  id: number;
  authorId: string;
  slug: string;
  title: string;
  year: string;
  category: string;
  summary: string;
  context: string;
  concept: string;
  tags: string[];
  tone: string;
  status: "draft" | "published";
  featured: boolean;
  createdAt: string;
  updatedAt: string;
  images: PortfolioImage[];
  videos: PortfolioVideo[];
};

export type CommunityProject = PortfolioProject & {
  authorName: string;
};

function parseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

function toProject(row: StoredProject, images: StoredProjectImage[], videos: StoredProjectVideo[] = []): PortfolioProject {
  return {
    ...row,
    tags: parseTags(row.tags),
    status: row.status as "draft" | "published",
    images: images
      .filter((image) => image.projectId === row.id)
      .map((image) => ({
        id: Number(image.id),
        url: mediaUrl(image.objectKey),
        altText: image.altText,
        sortOrder: image.sortOrder,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    videos: videos
      .filter((video) => video.projectId === row.id)
      .map((video) => ({
        id: Number(video.id),
        url: mediaUrl(video.objectKey),
        altText: video.altText,
        sortOrder: video.sortOrder,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
  };
}

function attachMedia(rows: StoredProject[], images: StoredProjectImage[], videos: StoredProjectVideo[] = []): PortfolioProject[] {
  return rows.map((row) => toProject(row, images, videos));
}

function getAuthorName(users: Pick<StoredUser, "id" | "name" | "email">[], authorId: string): string {
  const user = users.find((item) => item.id === authorId);
  return user?.name || user?.email || "同学作者";
}

async function projectImagesForAuthor(authorId: string): Promise<StoredProjectImage[]> {
  return dbSelect<StoredProjectImage>("project_images", new URLSearchParams({
    select: "*",
    authorId: `eq.${authorId}`,
    order: "sortOrder.asc,id.asc",
  }));
}

async function projectVideosForAuthor(authorId: string): Promise<StoredProjectVideo[]> {
  return dbSelect<StoredProjectVideo>("project_videos", new URLSearchParams({
    select: "*",
    authorId: `eq.${authorId}`,
    order: "sortOrder.asc,id.asc",
  }));
}

export async function getPublishedProjects(authorId: string): Promise<PortfolioProject[]> {
  const [rows, images, videos] = await Promise.all([
    dbSelect<StoredProject>("projects", new URLSearchParams({
      select: "*",
      authorId: `eq.${authorId}`,
      status: "eq.published",
      order: "year.desc,id.desc",
    })),
    projectImagesForAuthor(authorId),
    projectVideosForAuthor(authorId),
  ]);
  return attachMedia(rows, images, videos);
}

export async function getCommunityProjects(viewerId: string): Promise<CommunityProject[]> {
  const [rows, images, videos, users] = await Promise.all([
    dbSelect<StoredProject>("projects", new URLSearchParams({
      select: "*",
      authorId: `neq.${viewerId}`,
      status: "eq.published",
      order: "updatedAt.desc,year.desc,id.desc",
    })),
    dbSelect<StoredProjectImage>("project_images", new URLSearchParams({
      select: "*",
      authorId: `neq.${viewerId}`,
      order: "sortOrder.asc,id.asc",
    })),
    dbSelect<StoredProjectVideo>("project_videos", new URLSearchParams({
      select: "*",
      authorId: `neq.${viewerId}`,
      order: "sortOrder.asc,id.asc",
    })),
    dbSelect<StoredUser>("users", { select: "id,name,email" }),
  ]);
  return rows.map((project) => ({
    ...toProject(project, images, videos),
    authorName: getAuthorName(users, project.authorId),
  }));
}

export async function getCommunityProject(viewerId: string, id: number): Promise<CommunityProject | null> {
  const rows = await dbSelect<StoredProject>("projects", new URLSearchParams({
    select: "*",
    id: `eq.${id}`,
    authorId: `neq.${viewerId}`,
    status: "eq.published",
    limit: "1",
  }));
  const project = rows[0];
  if (!project) return null;
  const [images, videos, users] = await Promise.all([
    dbSelect<StoredProjectImage>("project_images", new URLSearchParams({
      select: "*",
      projectId: `eq.${id}`,
      authorId: `eq.${project.authorId}`,
      order: "sortOrder.asc,id.asc",
    })),
    dbSelect<StoredProjectVideo>("project_videos", new URLSearchParams({
      select: "*",
      projectId: `eq.${id}`,
      authorId: `eq.${project.authorId}`,
      order: "sortOrder.asc,id.asc",
    })),
    dbSelect<StoredUser>("users", new URLSearchParams({
      select: "id,name,email",
      id: `eq.${project.authorId}`,
      limit: "1",
    })),
  ]);
  return {
    ...toProject(project, images, videos),
    authorName: getAuthorName(users, project.authorId),
  };
}

export async function getPublishedProject(authorId: string, slug: string): Promise<PortfolioProject | null> {
  const rows = await dbSelect<StoredProject>("projects", new URLSearchParams({
    select: "*",
    authorId: `eq.${authorId}`,
    slug: `eq.${slug}`,
    status: "eq.published",
    limit: "1",
  }));
  const project = rows[0];
  if (!project) return null;
  const images = await dbSelect<StoredProjectImage>("project_images", new URLSearchParams({
    select: "*",
    projectId: `eq.${project.id}`,
    authorId: `eq.${authorId}`,
    order: "sortOrder.asc,id.asc",
  }));
  const videos = await dbSelect<StoredProjectVideo>("project_videos", new URLSearchParams({
    select: "*",
    projectId: `eq.${project.id}`,
    authorId: `eq.${authorId}`,
    order: "sortOrder.asc,id.asc",
  }));
  return toProject(project, images, videos);
}

export async function getAuthorProject(authorId: string, slug: string): Promise<PortfolioProject | null> {
  const rows = await dbSelect<StoredProject>("projects", new URLSearchParams({
    select: "*",
    authorId: `eq.${authorId}`,
    slug: `eq.${slug}`,
    limit: "1",
  }));
  const project = rows[0];
  if (!project) return null;
  const images = await dbSelect<StoredProjectImage>("project_images", new URLSearchParams({
    select: "*",
    projectId: `eq.${project.id}`,
    authorId: `eq.${authorId}`,
    order: "sortOrder.asc,id.asc",
  }));
  const videos = await dbSelect<StoredProjectVideo>("project_videos", new URLSearchParams({
    select: "*",
    projectId: `eq.${project.id}`,
    authorId: `eq.${authorId}`,
    order: "sortOrder.asc,id.asc",
  }));
  return toProject(project, images, videos);
}

export async function getAllProjects(authorId: string): Promise<PortfolioProject[]> {
  const [rows, images, videos] = await Promise.all([
    dbSelect<StoredProject>("projects", new URLSearchParams({
      select: "*",
      authorId: `eq.${authorId}`,
      order: "updatedAt.desc,id.desc",
    })),
    projectImagesForAuthor(authorId),
    projectVideosForAuthor(authorId),
  ]);
  return attachMedia(rows, images, videos);
}

export async function getProjectById(authorId: string, id: number): Promise<PortfolioProject | null> {
  const rows = await dbSelect<StoredProject>("projects", new URLSearchParams({
    select: "*",
    authorId: `eq.${authorId}`,
    id: `eq.${id}`,
    limit: "1",
  }));
  const project = rows[0];
  if (!project) return null;
  const images = await dbSelect<StoredProjectImage>("project_images", new URLSearchParams({
    select: "*",
    authorId: `eq.${authorId}`,
    projectId: `eq.${id}`,
    order: "sortOrder.asc,id.asc",
  }));
  const videos = await dbSelect<StoredProjectVideo>("project_videos", new URLSearchParams({
    select: "*",
    authorId: `eq.${authorId}`,
    projectId: `eq.${id}`,
    order: "sortOrder.asc,id.asc",
  }));
  return toProject(project, images, videos);
}

async function uniqueSlug(authorId: string, requested: string, excludeId?: number): Promise<string> {
  const params = new URLSearchParams({
    select: "id",
    authorId: `eq.${authorId}`,
    slug: `eq.${requested}`,
    limit: "1",
  });
  if (excludeId) params.set("id", `neq.${excludeId}`);
  const conflict = await dbSelect<Pick<StoredProject, "id">>("projects", params);
  return conflict.length ? `${requested}-${randomUUID().slice(0, 6)}` : requested;
}

export async function createProject(authorId: string, input: ProjectInput): Promise<PortfolioProject> {
  const now = new Date().toISOString();
  const slug = await uniqueSlug(authorId, input.slug);
  const inserted = await dbInsert<StoredProject>("projects", {
    ...input,
    authorId,
    slug,
    createdAt: now,
    updatedAt: now,
  });
  const project = inserted[0];
  if (!project) throw new Error("Supabase did not return the created project.");
  return toProject(project, []);
}

export async function updateProject(authorId: string, id: number, input: ProjectInput): Promise<PortfolioProject | null> {
  const existing = await getProjectById(authorId, id);
  if (!existing) return null;
  const slug = await uniqueSlug(authorId, input.slug, id);
  const updated = await dbUpdate<StoredProject>("projects", {
    ...input,
    slug,
    updatedAt: new Date().toISOString(),
  }, new URLSearchParams({
    authorId: `eq.${authorId}`,
    id: `eq.${id}`,
  }));
  if (!updated[0]) return null;
  const images = await dbSelect<StoredProjectImage>("project_images", new URLSearchParams({
    select: "*",
    authorId: `eq.${authorId}`,
    projectId: `eq.${id}`,
    order: "sortOrder.asc,id.asc",
  }));
  const videos = await dbSelect<StoredProjectVideo>("project_videos", new URLSearchParams({
    select: "*",
    authorId: `eq.${authorId}`,
    projectId: `eq.${id}`,
    order: "sortOrder.asc,id.asc",
  }));
  return toProject(updated[0], images, videos);
}

export async function setProjectStatus(authorId: string, id: number, status: "draft" | "published"): Promise<PortfolioProject | null> {
  const updated = await dbUpdate<StoredProject>("projects", {
    status,
    updatedAt: new Date().toISOString(),
  }, new URLSearchParams({
    authorId: `eq.${authorId}`,
    id: `eq.${id}`,
  }));
  if (!updated[0]) return null;
  const images = await dbSelect<StoredProjectImage>("project_images", new URLSearchParams({
    select: "*",
    authorId: `eq.${authorId}`,
    projectId: `eq.${id}`,
    order: "sortOrder.asc,id.asc",
  }));
  const videos = await dbSelect<StoredProjectVideo>("project_videos", new URLSearchParams({
    select: "*",
    authorId: `eq.${authorId}`,
    projectId: `eq.${id}`,
    order: "sortOrder.asc,id.asc",
  }));
  return toProject(updated[0], images, videos);
}

export async function deleteProject(authorId: string, id: number): Promise<string[] | null> {
  const project = await getProjectById(authorId, id);
  if (!project) return null;
  const [images, videos] = await Promise.all([
    dbSelect<StoredProjectImage>("project_images", new URLSearchParams({
    select: "objectKey",
    authorId: `eq.${authorId}`,
    projectId: `eq.${id}`,
    })),
    dbSelect<StoredProjectVideo>("project_videos", new URLSearchParams({
      select: "objectKey",
      authorId: `eq.${authorId}`,
      projectId: `eq.${id}`,
    })),
  ]);
  const deleted = await dbDelete<StoredProject>("projects", new URLSearchParams({
    authorId: `eq.${authorId}`,
    id: `eq.${id}`,
  }));
  if (!deleted.length) return null;
  const imageKeys = images.map((image) => image.objectKey);
  const videoKeys = videos.map((video) => video.objectKey);
  await Promise.all([
    ...imageKeys.map((key) => deleteImageFile(key).catch(() => undefined)),
    ...videoKeys.map((key) => deleteVideoFile(key).catch(() => undefined)),
  ]);
  const keys = [...imageKeys, ...videoKeys];
  return keys;
}

export async function addProjectImages(authorId: string, projectId: number, keys: string[], title: string): Promise<StoredProjectImage[] | null> {
  const project = await getProjectById(authorId, projectId);
  if (!project) return null;
  const existing = await dbSelect<StoredProjectImage>("project_images", new URLSearchParams({
    select: "id",
    authorId: `eq.${authorId}`,
    projectId: `eq.${projectId}`,
    order: "sortOrder.asc,id.asc",
  }));
  if (existing.length + keys.length > 12) return null;
  const now = new Date().toISOString();
  const rows = keys.map((key, index) => ({
    authorId,
    projectId,
    objectKey: cleanMediaKey(key),
    altText: `${title}作品图 ${existing.length + index + 1}`,
    sortOrder: existing.length + index,
    createdAt: now,
  }));
  const inserted = await dbInsert<StoredProjectImage>("project_images", rows);
  await dbUpdate("projects", { updatedAt: now }, { authorId: `eq.${authorId}`, id: `eq.${projectId}` });
  return inserted;
}

export async function addProjectVideos(authorId: string, projectId: number, keys: string[], title: string): Promise<StoredProjectVideo[] | null> {
  const project = await getProjectById(authorId, projectId);
  if (!project) return null;
  const existing = await dbSelect<StoredProjectVideo>("project_videos", new URLSearchParams({
    select: "id",
    authorId: `eq.${authorId}`,
    projectId: `eq.${projectId}`,
    order: "sortOrder.asc,id.asc",
  }));
  if (existing.length + keys.length > 4) return null;
  const now = new Date().toISOString();
  const rows = keys.map((key, index) => ({
    authorId,
    projectId,
    objectKey: cleanMediaKey(key),
    altText: `${title}视频 ${existing.length + index + 1}`,
    sortOrder: existing.length + index,
    createdAt: now,
  }));
  const inserted = await dbInsert<StoredProjectVideo>("project_videos", rows);
  await dbUpdate("projects", { updatedAt: now }, { authorId: `eq.${authorId}`, id: `eq.${projectId}` });
  return inserted;
}

export async function deleteProjectImage(authorId: string, imageId: number): Promise<string | null> {
  const rows = await dbSelect<StoredProjectImage>("project_images", new URLSearchParams({
    select: "*",
    authorId: `eq.${authorId}`,
    id: `eq.${imageId}`,
    limit: "1",
  }));
  const image = rows[0];
  if (!image) return null;
  const deleted = await dbDelete<StoredProjectImage>("project_images", new URLSearchParams({
    authorId: `eq.${authorId}`,
    id: `eq.${imageId}`,
  }));
  if (!deleted.length) return null;

  const siblings = await dbSelect<StoredProjectImage>("project_images", new URLSearchParams({
    select: "id,sortOrder",
    authorId: `eq.${authorId}`,
    projectId: `eq.${image.projectId}`,
    order: "sortOrder.asc,id.asc",
  }));
  await Promise.all(siblings.map((item, index) => (
    item.sortOrder === index
      ? Promise.resolve([])
      : dbUpdate("project_images", { sortOrder: index }, { id: `eq.${item.id}`, authorId: `eq.${authorId}` })
  )));
  await deleteImageFile(image.objectKey).catch(() => undefined);
  return image.objectKey;
}

export async function deleteProjectVideo(authorId: string, videoId: number): Promise<string | null> {
  const rows = await dbSelect<StoredProjectVideo>("project_videos", new URLSearchParams({
    select: "*",
    authorId: `eq.${authorId}`,
    id: `eq.${videoId}`,
    limit: "1",
  }));
  const video = rows[0];
  if (!video) return null;
  const deleted = await dbDelete<StoredProjectVideo>("project_videos", new URLSearchParams({
    authorId: `eq.${authorId}`,
    id: `eq.${videoId}`,
  }));
  if (!deleted.length) return null;

  const siblings = await dbSelect<StoredProjectVideo>("project_videos", new URLSearchParams({
    select: "id,sortOrder",
    authorId: `eq.${authorId}`,
    projectId: `eq.${video.projectId}`,
    order: "sortOrder.asc,id.asc",
  }));
  await Promise.all(siblings.map((item, index) => (
    item.sortOrder === index
      ? Promise.resolve([])
      : dbUpdate("project_videos", { sortOrder: index }, { id: `eq.${item.id}`, authorId: `eq.${authorId}` })
  )));
  await deleteVideoFile(video.objectKey).catch(() => undefined);
  return video.objectKey;
}

export async function canReadMediaKey(viewerId: string, key: string): Promise<boolean> {
  const safeKey = cleanMediaKey(key);
  if (!safeKey) return false;
  const images = await dbSelect<StoredProjectImage>("project_images", new URLSearchParams({
    select: "*",
    objectKey: `eq.${safeKey}`,
    limit: "1",
  }));
  const projectImage = images[0];
  if (projectImage) {
    if (projectImage.authorId === viewerId) return true;
    const projects = await dbSelect<StoredProject>("projects", new URLSearchParams({
      select: "id",
      id: `eq.${projectImage.projectId}`,
      authorId: `eq.${projectImage.authorId}`,
      status: "eq.published",
      limit: "1",
    }));
    return projects.length > 0;
  }

  const videos = await dbSelect<StoredProjectVideo>("project_videos", new URLSearchParams({
    select: "*",
    objectKey: `eq.${safeKey}`,
    limit: "1",
  }));
  const projectVideo = videos[0];
  if (projectVideo) {
    if (projectVideo.authorId === viewerId) return true;
    const projects = await dbSelect<StoredProject>("projects", new URLSearchParams({
      select: "id",
      id: `eq.${projectVideo.projectId}`,
      authorId: `eq.${projectVideo.authorId}`,
      status: "eq.published",
      limit: "1",
    }));
    return projects.length > 0;
  }

  const profiles = await dbSelect<StoredProfile>("profiles", new URLSearchParams({
    select: "imageKey,imageKeys",
    authorId: `eq.${viewerId}`,
    limit: "1",
  }));
  const profile = profiles[0];
  if (!profile) return false;
  return new Set([profile.imageKey, ...(profile.imageKeys ?? [])].filter(Boolean)).has(safeKey);
}
