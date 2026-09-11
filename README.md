# 视觉传达设计作品集社区

这是一个约 10 名受邀作者使用的小型作品集社区。当前部署目标为：

- **Vercel Hobby**：运行 Next.js 页面和 API
- **Supabase PostgreSQL**：保存用户、密码 Hash、作品、资料、验证码与限流记录
- **Supabase Storage（Private）**：保存作品图片与本人图片
- **腾讯云 SES API**：发送注册 / 找回密码验证码

> Supabase 只承担数据库和私有图片存储，本项目**不使用 Supabase Auth**。原有的 scrypt 密码 Hash、HttpOnly Session、authVersion、邮箱白名单和腾讯云 SES 验证流程继续保留。

## 本地启动

```bash
npm ci
npm run dev
```

默认地址：

```text
http://localhost:3000
```

首次运行前需要先创建 Supabase 项目，并执行：

```text
supabase/migrations/001_initial.sql
```

然后配置 `.env.local`（不要提交 Git）：

```text
APP_SECRET=至少 32 字节高熵随机值
SITE_URL=http://localhost:3000
ALLOWED_EMAILS=user1@qq.com,user2@qq.com

SUPABASE_URL=https://你的项目.supabase.co
SUPABASE_SECRET_KEY=sb_secret_xxxxxxxxx
SUPABASE_STORAGE_BUCKET=portfolio-media

TENCENTCLOUD_SECRET_ID=腾讯云 CAM 专用身份 SecretId
TENCENTCLOUD_SECRET_KEY=腾讯云 CAM 专用身份 SecretKey
TENCENT_SES_REGION=SES 地域
TENCENT_SES_FROM_EMAIL=已审核发信地址
TENCENT_SES_TEMPLATE_ID=已审核验证码模板 ID
TENCENT_SES_REPLY_TO=可选

REGISTRATION_CODE=可选；邮箱白名单之外的第二层邀请校验
```

开发环境若没有配置腾讯云 SES，会返回仅供本地开发使用的测试验证码；Production 不会把验证码返回浏览器。

## 图片上传

图片不再经过 Vercel Function 传输完整文件：

1. 登录用户向站内 API 请求一次性 Supabase Signed Upload URL。
2. 浏览器把图片直接上传到 Private Storage 的临时目录。
3. 服务端重新读取临时对象，检查 Magic Bytes、真实图片格式、尺寸和文件大小。
4. JPG / PNG / WEBP 经 Sharp 重编码并剥离元数据；GIF 保留动画但仍验证格式与尺寸。
5. 合格图片移动到正式 `media/` 路径，临时对象删除。
6. 查看图片时先经过网站权限检查，再签发短时 Supabase Signed URL。

单张图片最大 15MB；作品最多 12 张，本人介绍最多 5 张。

## 数据与账号安全

- 密码只保存 `scrypt` Hash + Salt，不保存明文密码。
- 修改 / 重置密码会递增 `authVersion`，使旧 Session 失效。
- Session Cookie 使用 HttpOnly、SameSite=Lax，Production 使用 Secure。
- 注册默认关闭，只允许 `ALLOWED_EMAILS` 中的邮箱注册。
- 验证码有邮箱/IP限流、尝试次数与过期限制。
- 登录有邮箱/IP失败次数限制。
- Supabase Secret Key 只允许出现在 Vercel Server 环境变量，禁止添加 `NEXT_PUBLIC_` 前缀。
- Supabase 数据表启用 RLS 且不创建浏览器策略；服务器 Secret Key 执行经过本应用授权后的数据库操作。
- Storage Bucket 为 Private，不创建公开读取策略。

## Vercel 部署

完整步骤见：

```text
VERCEL_SUPABASE_DEPLOY.md
```

构建命令已经切换为标准 Next.js：

```bash
npm run build
npm run start
```

旧的 Vinext / Cloudflare / 腾讯 Docker 文件暂时保留在仓库中，但不再参与 Vercel 的生产构建；待 Vercel + Supabase 真机验收通过后再做最终依赖清理。
