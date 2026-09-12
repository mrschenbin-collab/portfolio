/**
 * Shared persistence types.
 *
 * The original project wrote these records to storage/data/portfolio.json.
 * Vercel functions do not provide durable local storage, so runtime persistence
 * now lives in Supabase PostgreSQL. This file remains as a type contract only.
 */

export type StoredUser = {
  id: string;
  name: string;
  email: string;
  passwordSalt: string;
  passwordHash: string;
  authVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type StoredProject = {
  id: number;
  authorId: string;
  slug: string;
  title: string;
  year: string;
  category: string;
  summary: string;
  context: string;
  concept: string;
  tags: string;
  tone: string;
  status: "draft" | "published";
  featured: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StoredProjectImage = {
  id: number;
  authorId: string;
  projectId: number;
  objectKey: string;
  altText: string;
  sortOrder: number;
  createdAt: string;
};

export type StoredProjectVideo = {
  id: number;
  authorId: string;
  projectId: number;
  objectKey: string;
  altText: string;
  sortOrder: number;
  createdAt: string;
};

export type StoredProfile = {
  authorId?: string;
  roleZh: string;
  intro: string;
  focus: string[];
  education: string;
  experience: string;
  awards: string;
  imageKey: string;
  imageKeys: string[];
  awardImageKeys?: string[];
};

export type StoredContactKind = "email" | "social" | "portfolio" | "other";

export type StoredContactLink = {
  authorId?: string;
  id: string;
  kind: StoredContactKind;
  label: string;
  value: string;
  href: string;
  sortOrder: number;
};

export type StoredEmailCodePurpose = "register" | "reset";

export type StoredEmailCode = {
  id: string;
  email: string;
  purpose: StoredEmailCodePurpose;
  codeSalt: string;
  codeHash: string;
  attempts: number;
  expiresAt: string;
  createdAt: string;
  usedAt?: string | null;
};

export type StoredOtpSendAttempt = {
  id: string;
  email: string;
  ip: string;
  purpose: StoredEmailCodePurpose;
  sent: boolean;
  createdAt: string;
};

export type StoredLoginAttempt = {
  id: string;
  email: string;
  ip: string;
  success: boolean;
  createdAt: string;
};
