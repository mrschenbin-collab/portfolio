"use client";

import { useState, type FormEvent } from "react";
import type { ContactKind, ContactLink } from "@/lib/contact-links";
import type { ProfileContent } from "@/lib/profile";
import type { PortfolioProject } from "@/lib/portfolio";
import { readApiResponse } from "@/lib/api-response";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_PROJECT_IMAGES = 12;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const MAX_PROJECT_VIDEOS = 4;
const MAX_PROFILE_IMAGES = 3;

type FormState = {
  slug: string;
  title: string;
  year: string;
  category: string;
  summary: string;
  context: string;
  concept: string;
  tags: string;
  featured: boolean;
};

type ContactFormState = {
  kind: ContactKind;
  label: string;
  value: string;
  href: string;
};

type ProfileFormState = {
  roleZh: string;
  intro: string;
  focus: string;
  education: string;
  experience: string;
  awards: string;
};

const contactKindOptions: { value: ContactKind; label: string }[] = [
  { value: "email", label: "邮箱" },
  { value: "social", label: "社交平台" },
  { value: "portfolio", label: "作品平台" },
  { value: "other", label: "其他" },
];

const emptyForm = (): FormState => ({
  slug: "",
  title: "",
  year: String(new Date().getFullYear()),
  category: "海报设计",
  summary: "",
  context: "",
  concept: "",
  tags: "",
  featured: false,
});

const emptyContactForm = (): ContactFormState => ({
  kind: "email",
  label: "电子邮箱",
  value: "",
  href: "",
});

function toForm(project: PortfolioProject): FormState {
  return {
    slug: project.slug,
    title: project.title,
    year: project.year,
    category: project.category,
    summary: project.summary,
    context: project.context,
    concept: project.concept,
    tags: project.tags.join("，"),
    featured: project.featured,
  };
}

function toContactForm(link: ContactLink): ContactFormState {
  return {
    kind: link.kind,
    label: link.label,
    value: link.value,
    href: link.href,
  };
}

function toProfileForm(profile: ProfileContent): ProfileFormState {
  return {
    roleZh: profile.roleZh,
    intro: profile.intro,
    focus: profile.focus.join("，"),
    education: profile.education,
    experience: profile.experience,
    awards: profile.awards,
  };
}

export function AdminManager({
  initialProjects,
  initialContactLinks,
  initialProfile,
}: {
  initialProjects: PortfolioProject[];
  initialContactLinks: ContactLink[];
  initialProfile: ProfileContent;
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [contactLinks, setContactLinks] = useState(initialContactLinks);
  const [profile, setProfile] = useState(initialProfile);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [contactForm, setContactForm] = useState<ContactFormState>(emptyContactForm);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(() => toProfileForm(initialProfile));
  const [files, setFiles] = useState<File[]>([]);
  const [videoFiles, setVideoFiles] = useState<File[]>([]);
  const [profileFiles, setProfileFiles] = useState<File[]>([]);
  const [fileKey, setFileKey] = useState(0);
  const [videoFileKey, setVideoFileKey] = useState(0);
  const [profileFileKey, setProfileFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactError, setContactError] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");

  async function refresh() {
    const response = await fetch("/api/admin/projects", { cache: "no-store" });
    const result = await readApiResponse<{ projects?: PortfolioProject[]; error?: string }>(response);
    if (!response.ok) throw new Error(result.error ?? "读取作品失败");
    setProjects(result.projects ?? []);
  }

  function startNew() {
    setEditingId(null);
    setForm(emptyForm());
    setFiles([]);
    setVideoFiles([]);
    setFileKey((value) => value + 1);
    setVideoFileKey((value) => value + 1);
    setMessage("");
    setError("");
    document.getElementById("project-form")?.scrollIntoView({ behavior: "smooth" });
  }

  function startEdit(project: PortfolioProject) {
    setEditingId(project.id);
    setForm(toForm(project));
    setFiles([]);
    setVideoFiles([]);
    setFileKey((value) => value + 1);
    setVideoFileKey((value) => value + 1);
    setMessage("");
    setError("");
    document.getElementById("project-form")?.scrollIntoView({ behavior: "smooth" });
  }

  async function request<T extends { error?: string }>(url: string, init: RequestInit) {
    const response = await fetch(url, init);
    const result = await readApiResponse<T>(response);
    if (!response.ok) throw new Error(result.error ?? "操作失败");
    return result;
  }

  async function stageImageUpload(file: File): Promise<string> {
    const ticket = await request<{ error?: string; tempKey?: string; signedUrl?: string }>("/api/admin/uploads/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
    });
    if (!ticket.tempKey || !ticket.signedUrl) throw new Error("无法创建图片上传凭据");

    const upload = await fetch(ticket.signedUrl, {
      method: "PUT",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "cache-control": "max-age=0",
        "x-upsert": "false",
      },
      body: file,
    });
    if (!upload.ok) throw new Error(`“${file.name}”上传到图片存储失败，请重试。`);
    return ticket.tempKey;
  }

  async function stageVideoUpload(file: File): Promise<string> {
    const ticket = await request<{ error?: string; tempKey?: string; signedUrl?: string }>("/api/admin/uploads/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "video", name: file.name, type: file.type, size: file.size }),
    });
    if (!ticket.tempKey || !ticket.signedUrl) throw new Error("无法创建视频上传凭据");

    const upload = await fetch(ticket.signedUrl, {
      method: "PUT",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "cache-control": "max-age=0",
        "x-upsert": "false",
      },
      body: file,
    });
    if (!upload.ok) throw new Error(`“${file.name}”上传到视频存储失败，请重试。`);
    return ticket.tempKey;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    let createdProjectId: number | null = null;
    try {
      if (files.length > MAX_PROJECT_IMAGES) {
        throw new Error("每个作品最多上传十二张图片。");
      }
      const currentProject = projects.find((project) => project.id === editingId);
      if ((currentProject?.images.length ?? 0) + files.length > MAX_PROJECT_IMAGES) {
        throw new Error("当前已有图片加上新上传图片不能超过十二张。");
      }
      const oversizedFile = files.find((file) => file.size > MAX_IMAGE_BYTES);
      if (oversizedFile) {
        throw new Error(`“${oversizedFile.name}”超过十五兆，请压缩后重试。`);
      }
      if (videoFiles.length > MAX_PROJECT_VIDEOS) {
        throw new Error("每个作品最多上传四个视频。");
      }
      if ((currentProject?.videos.length ?? 0) + videoFiles.length > MAX_PROJECT_VIDEOS) {
        throw new Error("当前已有视频加上新上传视频不能超过四个。");
      }
      const oversizedVideoFile = videoFiles.find((file) => file.size > MAX_VIDEO_BYTES);
      if (oversizedVideoFile) {
        throw new Error(`“${oversizedVideoFile.name}”超过 200MB，请压缩后重试。`);
      }

      let projectId = editingId;
      if (!projectId) {
        const createPayload = { ...form, status: "published" as const, tone: "tone-ink" };
        const result = await request<{ error?: string; project?: { id: number } }>("/api/admin/projects", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(createPayload),
        });
        projectId = result.project?.id ?? null;
        createdProjectId = projectId;
      }

      if (projectId && files.length) {
        for (const file of files) {
          const tempKey = await stageImageUpload(file);
          await request(`/api/admin/projects/${projectId}/images`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ tempKey }),
          });
        }
      }

      if (projectId && videoFiles.length) {
        for (const file of videoFiles) {
          const tempKey = await stageVideoUpload(file);
          await request(`/api/admin/projects/${projectId}/videos`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ tempKey }),
          });
        }
      }

      if (projectId && editingId) {
        await request(`/api/admin/projects/${projectId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...form, status: currentProject?.status ?? "published", tone: currentProject?.tone ?? "tone-ink" }),
        });
      }
      await refresh();
      setMessage(editingId ? "作品已更新" : "作品已创建");
      setEditingId(null);
      setForm(emptyForm());
      setFiles([]);
      setVideoFiles([]);
      setFileKey((value) => value + 1);
      setVideoFileKey((value) => value + 1);
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : "保存失败";
      if (createdProjectId) {
        await refresh().catch(() => undefined);
        setEditingId(createdProjectId);
        setError(`作品资料已保存，但媒体上传失败：${detail} 请直接重试，无需重新创建。`);
      } else {
        setError(detail);
      }
    } finally {
      setBusy(false);
    }
  }

  async function restoreProject(project: PortfolioProject) {
    setBusy(true);
    setError("");
    try {
      await request(`/api/admin/projects/${project.id}/visibility`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "published" }) });
      await refresh();
      setMessage("作品已重新展示");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function removeProject(project: PortfolioProject) {
    if (!window.confirm(`确定永久删除“${project.title}”吗？相关图片和视频也会删除。`)) return;
    setBusy(true);
    setError("");
    try {
      await request(`/api/admin/projects/${project.id}`, { method: "DELETE" });
      await refresh();
      if (editingId === project.id) startNew();
      setMessage("作品已删除");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  async function removeImage(imageId: number) {
    if (!window.confirm("确定删除这张图片吗？")) return;
    setBusy(true);
    try {
      await request(`/api/admin/images/${imageId}`, { method: "DELETE" });
      await refresh();
      setMessage("图片已删除");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  async function removeVideo(videoId: number) {
    if (!window.confirm("确定删除这个视频吗？")) return;
    setBusy(true);
    try {
      await request(`/api/admin/videos/${videoId}`, { method: "DELETE" });
      await refresh();
      setMessage("视频已删除");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileBusy(true);
    setProfileError("");
    setProfileMessage("");
    try {
      if (profile.imageKeys.length + profileFiles.length > MAX_PROFILE_IMAGES) {
        throw new Error("本人介绍最多上传三张图片。");
      }
      const oversizedProfileFile = profileFiles.find((file) => file.size > MAX_IMAGE_BYTES);
      if (oversizedProfileFile) {
        throw new Error(`“${oversizedProfileFile.name}”超过十五兆，请压缩后重试。`);
      }
      let result = await request<{ error?: string; profile?: ProfileContent }>("/api/admin/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...profileForm, imageKeys: profile.imageKeys }),
      });
      let nextProfile = result.profile ?? profile;
      if (profileFiles.length) {
        for (const file of profileFiles) {
          const tempKey = await stageImageUpload(file);
          result = await request<{ error?: string; profile?: ProfileContent }>("/api/admin/profile/image", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ tempKey }),
          });
          nextProfile = result.profile ?? nextProfile;
        }
      }
      setProfile(nextProfile);
      setProfileForm(toProfileForm(nextProfile));
      setProfileFiles([]);
      setProfileFileKey((value) => value + 1);
      setProfileMessage("本人介绍已保存");
    } catch (caught) {
      setProfileError(caught instanceof Error ? caught.message : "保存本人介绍失败");
    } finally {
      setProfileBusy(false);
    }
  }

  async function removeProfileImage(imageKey: string) {
    if (!window.confirm("确定删除这张本人图片吗？")) return;
    setProfileBusy(true);
    setProfileError("");
    setProfileMessage("");
    try {
      const result = await request<{ error?: string; profile?: ProfileContent }>(`/api/admin/profile/image?key=${encodeURIComponent(imageKey)}`, {
        method: "DELETE",
      });
      const nextProfile = result.profile ?? {
        ...profile,
        imageKey: profile.imageKeys.filter((key) => key !== imageKey)[0] ?? "",
        imageKeys: profile.imageKeys.filter((key) => key !== imageKey),
        imageUrl: profile.imageUrls.filter((_, index) => profile.imageKeys[index] !== imageKey)[0] ?? "",
        imageUrls: profile.imageUrls.filter((_, index) => profile.imageKeys[index] !== imageKey),
      };
      setProfile(nextProfile);
      setProfileForm(toProfileForm(nextProfile));
      setProfileMessage("本人图片已删除");
    } catch (caught) {
      setProfileError(caught instanceof Error ? caught.message : "删除本人图片失败");
    } finally {
      setProfileBusy(false);
    }
  }

  function startNewContact() {
    setEditingContactId(null);
    setContactForm(emptyContactForm());
    setContactMessage("");
    setContactError("");
  }

  function startEditContact(link: ContactLink) {
    setEditingContactId(link.id);
    setContactForm(toContactForm(link));
    setContactMessage("");
    setContactError("");
  }

  async function persistContactLinks(nextLinks: ContactLink[]) {
    const normalized = nextLinks.map((link, index) => ({ ...link, sortOrder: index }));
    const result = await request<{ error?: string; links?: ContactLink[] }>("/api/admin/contact-links", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ links: normalized }),
    });
    setContactLinks(result.links ?? normalized);
  }

  async function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setContactBusy(true);
    setContactError("");
    setContactMessage("");
    try {
      const label = contactForm.label.trim();
      const value = contactForm.value.trim();
      if (!label || !value) throw new Error("请填写名称和显示内容。");
      const existingIndex = editingContactId ? contactLinks.findIndex((link) => link.id === editingContactId) : -1;
      const nextLink: ContactLink = {
        id: editingContactId ?? crypto.randomUUID(),
        kind: contactForm.kind,
        label,
        value,
        href: contactForm.href.trim(),
        sortOrder: existingIndex >= 0 ? existingIndex : contactLinks.length,
      };
      const nextLinks = existingIndex >= 0
        ? contactLinks.map((link) => link.id === editingContactId ? nextLink : link)
        : [...contactLinks, nextLink];
      await persistContactLinks(nextLinks);
      const successMessage = editingContactId ? "联系信息已更新" : "联系信息已新增";
      startNewContact();
      setContactMessage(successMessage);
    } catch (caught) {
      setContactError(caught instanceof Error ? caught.message : "保存联系信息失败");
    } finally {
      setContactBusy(false);
    }
  }

  async function removeContact(link: ContactLink) {
    if (!window.confirm(`确定删除“${link.label}”吗？`)) return;
    setContactBusy(true);
    setContactError("");
    setContactMessage("");
    try {
      await persistContactLinks(contactLinks.filter((item) => item.id !== link.id));
      if (editingContactId === link.id) startNewContact();
      setContactMessage("联系信息已删除");
    } catch (caught) {
      setContactError(caught instanceof Error ? caught.message : "删除联系信息失败");
    } finally {
      setContactBusy(false);
    }
  }

  const editingProject = projects.find((project) => project.id === editingId);

  return <div className="admin-accordion">
    <details className="admin-panel">
      <summary><span>作品提交</span><small>新增作品、修改内容、上传图片或视频，作品详情页可下架</small></summary>
      <div className="admin-workspace">
        <section className="admin-list" aria-labelledby="project-list-title">
          <div className="admin-section-head"><div><p className="eyebrow">作品提交</p><h2 id="project-list-title">我的项目</h2></div><button type="button" onClick={startNew}>新增作品</button></div>
          {projects.length ? <div className="admin-projects">{projects.map((project) => <article key={project.id} className="admin-project-row">
            <div className={`admin-thumb ${project.tone}`}>
              {project.images[0]
                ? <img src={project.images[0].url} alt="" />
                : project.videos[0]
                  ? <video src={project.videos[0].url} muted playsInline preload="metadata" />
                  : <span>{project.title.slice(0, 1)}</span>}
            </div>
            <div><h3>{project.title}</h3><p>{project.category} · {project.year}</p></div>
            <span className={`status-badge ${project.status}`}>{project.status === "published" ? "展示中" : "已下架"}</span>
            <div className="admin-row-actions"><button type="button" onClick={() => startEdit(project)}>修改</button>{project.status === "draft" ? <button type="button" onClick={() => restoreProject(project)} disabled={busy}>重新展示</button> : null}<button type="button" className="danger" onClick={() => removeProject(project)} disabled={busy}>删除</button></div>
          </article>)}</div> : <div className="empty-state compact"><span>还没有作品</span><p>点击“新增作品”建立第一个项目。</p></div>}
        </section>

        <form id="project-form" className="admin-form" onSubmit={submit}>
          <div className="admin-section-head"><div><p className="eyebrow">内容编辑</p><h2>{editingId ? "修改作品" : "新增作品"}</h2></div>{editingId ? <button type="button" className="quiet" onClick={startNew}>取消修改</button> : null}</div>
          <div className="form-grid">
            <label><span>作品名称</span><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
            <label><span>作品类别</span><input required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="例如：海报设计" /></label>
            <label><span>年份</span><input required inputMode="numeric" pattern="\d{4}" value={form.year} onChange={(event) => setForm({ ...form, year: event.target.value })} /></label>
            <label><span>网址标识</span><input value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} placeholder="留空自动生成" /></label>
            <label className="form-wide"><span>一句话概述</span><textarea rows={2} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} /></label>
            <label className="form-wide"><span>项目背景</span><textarea rows={5} value={form.context} onChange={(event) => setForm({ ...form, context: event.target.value })} /></label>
            <label className="form-wide"><span>设计概念</span><textarea rows={5} value={form.concept} onChange={(event) => setForm({ ...form, concept: event.target.value })} /></label>
            <label><span>标签</span><input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="用逗号分隔" /></label>
            <label className="checkbox-label"><input type="checkbox" checked={form.featured} onChange={(event) => setForm({ ...form, featured: event.target.checked })} /><span>设为精选</span></label>
            <label className="form-wide upload-field"><span>作品图片</span><input key={fileKey} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /><small>一次可选多张；系统会逐张上传。单张不超过十五兆，每个项目最多十二张。</small></label>
            <label className="form-wide upload-field"><span>视频作品</span><input key={videoFileKey} type="file" accept="video/mp4,video/webm,video/quicktime,video/x-m4v" multiple onChange={(event) => setVideoFiles(Array.from(event.target.files ?? []))} /><small>视频单独作为作品媒体；支持 MP4、WEBM、MOV、M4V。单个不超过 200MB，每个项目最多四个视频。</small></label>
          </div>
          {editingProject?.images.length ? <div className="admin-media-block"><p>已上传图片</p><div className="admin-image-grid">{editingProject.images.map((image) => <figure key={image.id}><img src={image.url} alt={image.altText} /><button type="button" onClick={() => removeImage(image.id)} disabled={busy}>删除图片</button></figure>)}</div></div> : null}
          {editingProject?.videos.length ? <div className="admin-media-block"><p>已上传视频</p><div className="admin-video-grid">{editingProject.videos.map((video) => <figure key={video.id}><video src={video.url} controls preload="metadata" /><button type="button" onClick={() => removeVideo(video.id)} disabled={busy}>删除视频</button></figure>)}</div></div> : null}
          <div className="form-actions"><button type="submit" disabled={busy}>{busy ? "正在保存…" : editingId ? "保存修改" : "提交作品"}</button><span>提交后会显示在你的作品页；进入作品详情页可在作品概述下方下架。</span></div>
          {message ? <p className="form-message" role="status">{message}</p> : null}
          {error ? <p className="form-message error" role="alert">{error}</p> : null}
        </form>
      </div>
    </details>

    <details className="admin-panel">
      <summary><span>本人介绍</span><small>上传本人图片，修改自我介绍、关注方向、经历和奖项</small></summary>
      <form className="admin-form profile-admin-form" onSubmit={submitProfile}>
        <div className="profile-admin-preview">
          <div className="profile-admin-gallery">
            {profile.imageUrls.length ? profile.imageUrls.map((url, index) => <figure key={profile.imageKeys[index] ?? url}>
              <img src={url} alt={index === 0 ? "本人主图预览" : `本人附图 ${index}`} />
              <figcaption>{index === 0 ? "主图" : `附图 ${index}`}</figcaption>
              <button type="button" className="quiet" onClick={() => removeProfileImage(profile.imageKeys[index])} disabled={profileBusy}>删除</button>
            </figure>) : <figure className="profile-admin-empty"><div><span>本人图片</span><small>尚未上传</small></div></figure>}
          </div>
          <label className="upload-field"><span>上传本人图片</span><input key={profileFileKey} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => setProfileFiles(Array.from(event.target.files ?? []))} /><small>最多三张；第一张会作为本人介绍页的大图，后两张作为生活照、工作照等附属图片。单张不超过十五兆。</small></label>
        </div>
        <div className="form-grid">
          <label><span>身份介绍</span><input required value={profileForm.roleZh} onChange={(event) => setProfileForm({ ...profileForm, roleZh: event.target.value })} placeholder="例如：视觉传达设计创作者" /></label>
          <label><span>关注方向</span><input value={profileForm.focus} onChange={(event) => setProfileForm({ ...profileForm, focus: event.target.value })} placeholder="用逗号或换行分隔" /></label>
          <label className="form-wide"><span>自我介绍</span><textarea required rows={6} value={profileForm.intro} onChange={(event) => setProfileForm({ ...profileForm, intro: event.target.value })} /></label>
          <label className="form-wide"><span>教育经历</span><textarea rows={4} value={profileForm.education} onChange={(event) => setProfileForm({ ...profileForm, education: event.target.value })} /></label>
          <label className="form-wide"><span>实践经历</span><textarea rows={4} value={profileForm.experience} onChange={(event) => setProfileForm({ ...profileForm, experience: event.target.value })} /></label>
          <label className="form-wide"><span>奖项与展览</span><textarea rows={4} value={profileForm.awards} onChange={(event) => setProfileForm({ ...profileForm, awards: event.target.value })} /></label>
        </div>
        <div className="form-actions"><button type="submit" disabled={profileBusy}>{profileBusy ? "正在保存…" : "保存本人介绍"}</button><span>保存后，本人介绍页面会自动更新。</span></div>
        {profileMessage ? <p className="form-message" role="status">{profileMessage}</p> : null}
        {profileError ? <p className="form-message error" role="alert">{profileError}</p> : null}
      </form>
    </details>

    <details className="admin-panel">
      <summary><span>联系信息</span><small>增加、修改、删除邮箱、社交平台和作品平台</small></summary>
      <section className="admin-contact-panel" aria-labelledby="contact-list-title">
        <div className="admin-section-head"><div><p className="eyebrow">联系页面</p><h2 id="contact-list-title">联系信息</h2></div><button type="button" className="quiet" onClick={startNewContact}>新增入口</button></div>
        {contactLinks.length ? <div className="admin-contact-list">{contactLinks.map((link) => <article key={link.id} className="admin-contact-row">
          <div><strong>{link.label}</strong><p>{link.value}</p><small>{contactKindOptions.find((option) => option.value === link.kind)?.label ?? "其他"}{link.href ? ` · ${link.href}` : ""}</small></div>
          <div className="admin-row-actions"><button type="button" onClick={() => startEditContact(link)}>修改</button><button type="button" className="danger" onClick={() => removeContact(link)} disabled={contactBusy}>删除</button></div>
        </article>)}</div> : <div className="empty-state compact"><span>暂无联系入口</span><p>新增后会显示在联系页面。</p></div>}
        <form className="contact-admin-form" onSubmit={submitContact}>
          <div className="form-grid">
            <label><span>类型</span><select value={contactForm.kind} onChange={(event) => setContactForm({ ...contactForm, kind: event.target.value as ContactKind })}>{contactKindOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
            <label><span>名称</span><input value={contactForm.label} onChange={(event) => setContactForm({ ...contactForm, label: event.target.value })} placeholder="例如：电子邮箱" /></label>
            <label className="form-wide"><span>显示内容</span><input value={contactForm.value} onChange={(event) => setContactForm({ ...contactForm, value: event.target.value })} placeholder="例如：name@example.com" /></label>
            <label className="form-wide"><span>链接</span><input value={contactForm.href} onChange={(event) => setContactForm({ ...contactForm, href: event.target.value })} placeholder="可留空；邮箱会自动生成邮件链接" /></label>
          </div>
          <div className="form-actions"><button type="submit" disabled={contactBusy}>{contactBusy ? "正在保存…" : editingContactId ? "保存联系信息" : "添加联系信息"}</button>{editingContactId ? <button type="button" className="quiet" onClick={startNewContact}>取消修改</button> : null}</div>
          {contactMessage ? <p className="form-message" role="status">{contactMessage}</p> : null}
          {contactError ? <p className="form-message error" role="alert">{contactError}</p> : null}
        </form>
      </section>
    </details>
  </div>;
}
