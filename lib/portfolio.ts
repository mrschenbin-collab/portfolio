import { randomUUID } from "node:crypto";
import type { StoredProject, StoredProjectImage, StoredProjectVideo, StoredProfile, StoredUser } from "@/lib/file-store";
import { cleanMediaKey, createMediaReadUrlMap, deleteImageFile, deleteVideoFile, mediaUrl } from "@/lib/file-media";
import type { ProjectInput } from "@/lib/project-input";
import { dbDelete, dbInsert, dbSelect, dbUpdate } from "@/lib/supabase";

export type PortfolioImage = {
  id: number;
  objectKey: string;
  url: string;
  altText: string;
  sortOrder: number;
};

export type PortfolioVideo = {
  id: number;
  objectKey: string;
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

export type PortfolioProjectSummary = Pick<
  PortfolioProject,
  "id" | "authorId" | "slug" | "title" | "year" | "category" | "summary" | "tags" | "tone" | "featured" | "images" | "videos"
>;

export type CommunityProjectSummary = PortfolioProjectSummary & {
  authorName: string;
};

export type ArchiveProject = Pick<
  PortfolioProject,
  "id" | "slug" | "title" | "year" | "category" | "summary" | "tags" | "createdAt"
>;

export type NextProject = Pick<PortfolioProject, "id" | "slug" | "title">;

type StoredCoverImage = Pick<StoredProjectImage, "id" | "projectId" | "objectKey" | "altText" | "sortOrder">;
type StoredCoverVideo = Pick<StoredProjectVideo, "id" | "projectId" | "objectKey" | "altText" | "sortOrder">;
type StoredProjectSummary = Pick<
  StoredProject,
  "id" | "authorId" | "slug" | "title" | "year" | "category" | "summary" | "tags" | "tone" | "featured"
> & {
  project_images?: StoredCoverImage[];
  project_videos?: StoredCoverVideo[];
};

const maxProjectImages = 12;
const maxProjectVideos = 4;
const maxProjectMedia = 12;
const projectSummarySelect = [
  "id",
  "authorId",
  "slug",
  "title",
  "year",
  "category",
  "summary",
  "tags",
  "tone",
  "featured",
  "project_images(id,projectId,objectKey,altText,sortOrder)",
  "project_videos(id,projectId,objectKey,altText,sortOrder)",
].join(",");

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
        objectKey: image.objectKey,
        url: mediaUrl(image.objectKey),
        altText: image.altText,
        sortOrder: image.sortOrder,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    videos: videos
      .filter((video) => video.projectId === row.id)
      .map((video) => ({
        id: Number(video.id),
        objectKey: video.objectKey,
        url: mediaUrl(video.objectKey),
        altText: video.altText,
        sortOrder: video.sortOrder,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
  };
}

async function withSignedMediaUrls(projects: PortfolioProject[]): Promise<PortfolioProject[]> {
  const keys = projects.flatMap((project) => [
    ...project.images.map((image) => image.objectKey),
    ...project.videos.map((video) => video.objectKey),
  ]);
  if (!keys.length) return projects;

  try {
    const signedUrls = await createMediaReadUrlMap(keys);
    if (!signedUrls.size) return projects;
    return projects.map((project) => ({
      ...project,
      images: project.images.map((image) => ({ ...image, url: signedUrls.get(image.objectKey) ?? image.url })),
      videos: project.videos.map((video) => ({ ...video, url: signedUrls.get(video.objectKey) ?? video.url })),
    }));
  } catch (error) {
    console.error("[media] Batch signed URL generation failed; falling back to /api/media compatibility route.", error);
    return projects;
  }
}

async function attachMedia(rows: StoredProject[], images: StoredProjectImage[], videos: StoredProjectVideo[] = []): Promise<PortfolioProject[]> {
  return withSignedMediaUrls(rows.map((row) => toProject(row, images, videos)));
}

async function attachSingleMedia(row: StoredProject, images: StoredProjectImage[], videos: StoredProjectVideo[] = []): Promise<PortfolioProject> {
  return (await withSignedMediaUrls([toProject(row, images, videos)]))[0] ?? toProject(row, images, videos);
}

function getAuthorName(users: Pick<StoredUser, "id" | "name" | "email">[], authorId: string): string {
  const user = users.find((item) => item.id === authorId);
  return user?.name || user?.email || "同学作者";
}

function toProjectSummary(row: StoredProjectSummary): PortfolioProjectSummary {
  const image = row.project_images?.[0];
  const video = image ? undefined : row.project_videos?.[0];
  return {
    id: Number(row.id),
    authorId: row.authorId,
    slug: row.slug,
    title: row.title,
    year: row.year,
    category: row.category,
    summary: row.summary,
    tags: parseTags(row.tags),
    tone: row.tone,
    featured: row.featured,
    images: image ? [{
      id: Number(image.id),
      objectKey: image.objectKey,
      url: mediaUrl(image.objectKey),
      altText: image.altText,
      sortOrder: image.sortOrder,
    }] : [],
    videos: video ? [{
      id: Number(video.id),
      objectKey: video.objectKey,
      url: mediaUrl(video.objectKey),
      altText: video.altText,
      sortOrder: video.sortOrder,
    }] : [],
  };
}

async function withSignedSummaryCoverUrls(projects: PortfolioProjectSummary[]): Promise<PortfolioProjectSummary[]> {
  const keys = projects.flatMap((project) => [
    ...project.images.map((image) => image.objectKey),
    ...project.videos.map((video) => video.objectKey),
  ]);
  if (!keys.length) return projects;
  try {
    const signedUrls = await createMediaReadUrlMap(keys);
    return projects.map((project) => ({
      ...project,
      images: project.images.map((image) => ({ ...image, url: signedUrls.get(image.objectKey) ?? image.url })),
      videos: project.videos.map((video) => ({ ...video, url: signedUrls.get(video.objectKey) ?? video.url })),
    }));
  } catch (error) {
    console.error("[media] Summary cover signing failed; falling back to /api/media compatibility route.", error);
    return projects;
  }
}

function projectSummaryParams(filters: Record<string, string>, order: string): URLSearchParams {
  return new URLSearchParams({
    select: projectSummarySelect,
    ...filters,
    order,
    "project_images.order": "sortOrder.asc,id.asc",
    "project_images.limit": "1",
    "project_videos.order": "sortOrder.asc,id.asc",
    "project_videos.limit": "1",
  });
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

export async function getPublishedProjectSummaries(authorId: string): Promise<PortfolioProjectSummary[]> {
  const rows = await dbSelect<StoredProjectSummary>("projects", projectSummaryParams({
    authorId: `eq.${authorId}`,
    status: "eq.published",
  }, "year.desc,id.desc"));
  return withSignedSummaryCoverUrls(rows.map(toProjectSummary));
}

export async function getCommunityProjectSummaries(viewerId: string): Promise<CommunityProjectSummary[]> {
  const [rows, users] = await Promise.all([
    dbSelect<StoredProjectSummary>("projects", projectSummaryParams({
      authorId: `neq.${viewerId}`,
      status: "eq.published",
    }, "updatedAt.desc,year.desc,id.desc")),
    dbSelect<StoredUser>("users", { select: "id,name,email" }),
  ]);
  const signedProjects = await withSignedSummaryCoverUrls(rows.map(toProjectSummary));
  return signedProjects.map((project) => ({
    ...project,
    authorName: getAuthorName(users, project.authorId),
  }));
}

export async function getArchiveProjects(authorId: string): Promise<ArchiveProject[]> {
  const rows = await dbSelect<Pick<StoredProject, "id" | "slug" | "title" | "year" | "category" | "summary" | "tags" | "createdAt">>(
    "projects",
    new URLSearchParams({
      select: "id,slug,title,year,category,summary,tags,createdAt",
      authorId: `eq.${authorId}`,
      status: "eq.published",
      order: "year.desc,id.desc",
    }),
  );
  return rows.map((row) => ({ ...row, id: Number(row.id), tags: parseTags(row.tags) }));
}

export async function getNextPublishedProject(authorId: string, currentSlug: string): Promise<NextProject | null> {
  const rows = await dbSelect<NextProject>("projects", new URLSearchParams({
    select: "id,slug,title",
    authorId: `eq.${authorId}`,
    status: "eq.published",
    order: "year.desc,id.desc",
  }));
  if (rows.length < 2) return null;
  const currentIndex = rows.findIndex((item) => item.slug === currentSlug);
  return rows[(currentIndex + 1) % rows.length] ?? null;
}

export async function getNextCommunityProject(viewerId: string, currentId: number): Promise<NextProject | null> {
  const rows = await dbSelect<NextProject>("projects", new URLSearchParams({
    select: "id,slug,title",
    authorId: `neq.${viewerId}`,
    status: "eq.published",
    order: "updatedAt.desc,year.desc,id.desc",
  }));
  if (rows.length < 2) return null;
  const currentIndex = rows.findIndex((item) => Number(item.id) === currentId);
  return rows[(currentIndex + 1) % rows.length] ?? null;
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
    ...await attachSingleMedia(project, images, videos),
    authorName: getAuthorName(users, project.authorId),
  };
}

export async function getCommunityProjectMetadata(viewerId: string, id: number): Promise<Pick<StoredProject, "title" | "summary"> | null> {
  const rows = await dbSelect<Pick<StoredProject, "title" | "summary">>("projects", new URLSearchParams({
    select: "title,summary",
    id: `eq.${id}`,
    authorId: `neq.${viewerId}`,
    status: "eq.published",
    limit: "1",
  }));
  return rows[0] ?? null;
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
  const [images, videos] = await Promise.all([
    dbSelect<StoredProjectImage>("project_images", new URLSearchParams({
      select: "*",
      projectId: `eq.${project.id}`,
      authorId: `eq.${authorId}`,
      order: "sortOrder.asc,id.asc",
    })),
    dbSelect<StoredProjectVideo>("project_videos", new URLSearchParams({
      select: "*",
      projectId: `eq.${project.id}`,
      authorId: `eq.${authorId}`,
      order: "sortOrder.asc,id.asc",
    })),
  ]);
  return attachSingleMedia(project, images, videos);
}

export async function getPublishedProjectMetadata(authorId: string, slug: string): Promise<Pick<StoredProject, "title" | "summary"> | null> {
  const rows = await dbSelect<Pick<StoredProject, "title" | "summary">>("projects", new URLSearchParams({
    select: "title,summary",
    authorId: `eq.${authorId}`,
    slug: `eq.${slug}`,
    status: "eq.published",
    limit: "1",
  }));
  return rows[0] ?? null;
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
  const [images, videos] = await Promise.all([
    dbSelect<StoredProjectImage>("project_images", new URLSearchParams({
      select: "*",
      projectId: `eq.${project.id}`,
      authorId: `eq.${authorId}`,
      order: "sortOrder.asc,id.asc",
    })),
    dbSelect<StoredProjectVideo>("project_videos", new URLSearchParams({
      select: "*",
      projectId: `eq.${project.id}`,
      authorId: `eq.${authorId}`,
      order: "sortOrder.asc,id.asc",
    })),
  ]);
  return attachSingleMedia(project, images, videos);
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
  const [images, videos] = await Promise.all([
    dbSelect<StoredProjectImage>("project_images", new URLSearchParams({
      select: "*",
      authorId: `eq.${authorId}`,
      projectId: `eq.${id}`,
      order: "sortOrder.asc,id.asc",
    })),
    dbSelect<StoredProjectVideo>("project_videos", new URLSearchParams({
      select: "*",
      authorId: `eq.${authorId}`,
      projectId: `eq.${id}`,
      order: "sortOrder.asc,id.asc",
    })),
  ]);
  return attachSingleMedia(project, images, videos);
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
  const [images, videos] = await Promise.all([
    dbSelect<StoredProjectImage>("project_images", new URLSearchParams({
      select: "*",
      authorId: `eq.${authorId}`,
      projectId: `eq.${id}`,
      order: "sortOrder.asc,id.asc",
    })),
    dbSelect<StoredProjectVideo>("project_videos", new URLSearchParams({
      select: "*",
      authorId: `eq.${authorId}`,
      projectId: `eq.${id}`,
      order: "sortOrder.asc,id.asc",
    })),
  ]);
  return attachSingleMedia(updated[0], images, videos);
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
  const [images, videos] = await Promise.all([
    dbSelect<StoredProjectImage>("project_images", new URLSearchParams({
      select: "*",
      authorId: `eq.${authorId}`,
      projectId: `eq.${id}`,
      order: "sortOrder.asc,id.asc",
    })),
    dbSelect<StoredProjectVideo>("project_videos", new URLSearchParams({
      select: "*",
      authorId: `eq.${authorId}`,
      projectId: `eq.${id}`,
      order: "sortOrder.asc,id.asc",
    })),
  ]);
  return attachSingleMedia(updated[0], images, videos);
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
  const existingVideos = await dbSelect<StoredProjectVideo>("project_videos", new URLSearchParams({
    select: "id",
    authorId: `eq.${authorId}`,
    projectId: `eq.${projectId}`,
  }));
  if (existing.length + keys.length > maxProjectImages) return null;
  if (existing.length + existingVideos.length + keys.length > maxProjectMedia) return null;
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
  const existingImages = await dbSelect<StoredProjectImage>("project_images", new URLSearchParams({
    select: "id",
    authorId: `eq.${authorId}`,
    projectId: `eq.${projectId}`,
  }));
  if (existing.length + keys.length > maxProjectVideos) return null;
  if (existingImages.length + existing.length + keys.length > maxProjectMedia) return null;
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
    select: "*",
  }));
  const profile = profiles.find((row) => (
    new Set([row.imageKey, ...(row.imageKeys ?? []), ...(row.awardImageKeys ?? [])].filter(Boolean)).has(safeKey)
  ));
  if (!profile) return false;
  if (profile.authorId === viewerId) return true;
  if (!profile.authorId) return false;

  const projects = await dbSelect<StoredProject>("projects", new URLSearchParams({
    select: "id",
    authorId: `eq.${profile.authorId}`,
    status: "eq.published",
    limit: "1",
  }));
  return projects.length > 0;
}
