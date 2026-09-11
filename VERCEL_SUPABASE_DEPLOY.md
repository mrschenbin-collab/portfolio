# Vercel Hobby + Supabase 部署步骤

## 1. 创建 Supabase 项目

注册并登录 Supabase，新建一个项目。选择离主要用户较近的区域即可。

项目创建后，在 Dashboard 的 Connect / API Keys 中取得：

```text
SUPABASE_URL
SUPABASE_SECRET_KEY（sb_secret_...）
```

Secret Key 是服务器主密钥，只放在 Vercel 环境变量，不要复制到前端代码，不要使用 `NEXT_PUBLIC_`。

## 2. 建立数据库和私有图片 Bucket

打开 Supabase SQL Editor。

复制并执行：

```text
supabase/migrations/001_initial.sql
```

该脚本会创建：

```text
users
projects
project_images
profiles
contact_links
email_codes
otp_send_attempts
login_attempts
```

同时创建 Private Storage Bucket：

```text
portfolio-media
```

数据库表全部启用 RLS，并且不开放匿名浏览器策略。

## 3. GitHub

将当前项目推送到 GitHub。确认不要提交：

```text
.env
.env.local
真实 Secret
用户数据
```

## 4. Vercel Hobby

登录 Vercel，选择 Add New Project / Import Git Repository，导入 GitHub 仓库。

Framework Preset 选择 / 自动识别：

```text
Next.js
```

Build Command 使用项目默认：

```text
npm run build
```

不要设置旧的 Vite / Vinext Build Command。

## 5. Vercel 环境变量

至少配置：

```text
APP_SECRET=<32字节以上随机高熵值>
SITE_URL=https://你的项目.vercel.app
ALLOWED_EMAILS=你的测试QQ邮箱

SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SECRET_KEY=sb_secret_xxxxx
SUPABASE_STORAGE_BUCKET=portfolio-media
```

腾讯 SES 正式启用时再加入：

```text
TENCENTCLOUD_SECRET_ID=...
TENCENTCLOUD_SECRET_KEY=...
TENCENT_SES_REGION=...
TENCENT_SES_FROM_EMAIL=...
TENCENT_SES_TEMPLATE_ID=...
TENCENT_SES_REPLY_TO=可选
```

`REGISTRATION_CODE` 可选。即使不配置邀请码，没有出现在 `ALLOWED_EMAILS` 的邮箱也无法注册。

## 6. 首次部署验证

先只把自己的测试邮箱放入 `ALLOWED_EMAILS`。

依次验证：

1. 首页 / 登录页正常。
2. 测试邮箱可以注册，非白名单邮箱不能获取注册验证码。
3. 登录成功后 `/work`、`/community`、`/admin` 正常。
4. 创建作品正常。
5. 上传 5MB 以上图片，确认图片是浏览器直接发往 Supabase Storage，而不是经过 Vercel Function 请求体。
6. 图片上传完成后可以显示。
7. 退出登录后直接访问 `/api/media/<key>` 被拒绝。
8. A 用户不能修改或删除 B 用户作品。
9. 忘记密码后旧 Session 失效。
10. Vercel Logs 无持续 4xx/5xx、Secret 泄漏或数据库异常。

## 7. 腾讯云 SES

正式让其他人注册前，再配置腾讯云 SES 发信域名与验证码模板。

网站仍由 Vercel 托管；Supabase 负责数据 / 图片；腾讯 SES 只负责邮件发送，三者互不冲突。

## 8. 后续绑定 .cn 域名

以后购买 `.cn` 后，在 Vercel Project → Domains 添加自己的域名，并按 Vercel 给出的 DNS 记录到域名注册商设置解析。

之后把：

```text
SITE_URL
```

改成正式 `https://你的域名.cn` 并重新部署即可。

## 9. 最终清理

只有在 Vercel + Supabase Production 全流程 PASS 后，再删除旧 Cloudflare / Vinext / Tencent Docker 构建文件与未使用依赖。不要在迁移尚未通过时同时大规模清理依赖。
