# Vercel + Supabase 迁移状态

## 已完成的代码改造

- Vercel 构建脚本改为标准 Next.js：`next dev / next build / next start`。
- `portfolio.json` 本地文件数据库已退出运行链路，用户、作品、资料、验证码、限流记录改为 Supabase PostgreSQL REST。
- 本地 `storage/uploads` 已退出运行链路，作品图片与本人图片改为 Supabase Private Storage。
- 新增 `supabase/migrations/001_initial.sql`，包含全部表、索引、RLS 与 `portfolio-media` 私有 Bucket。
- 图片改为浏览器直接上传 Supabase 临时目录，避免大图穿过 Vercel Function 请求体。
- 上传完成后仍由服务器检查真实 Magic Bytes、图片尺寸与大小；JPG/PNG/WEBP 会重编码并清除元数据。
- 图片读取改为“站内权限检查 → 60 秒 Signed URL → Supabase Storage”，图片文件本体不经过 Vercel Response。
- 原有 scrypt 密码 Hash、HttpOnly Session、authVersion、邮箱白名单、验证码 / 登录限流与腾讯云 SES 保留。
- Supabase 新 `sb_secret_*` 密钥只通过 `apikey` 请求头使用，避免把非 JWT Secret 错误放进 Bearer Header。
- Vercel Production 安全响应头迁移到 `next.config.ts`。
- 增加 `.env.example` 与 `VERCEL_SUPABASE_DEPLOY.md`。

## 已做的本地检查

- TypeScript / TSX 语法解析：通过。
- 本地 `@/` import 完整性：通过。
- 迁移静态安全测试：5/5 通过。
- 扫描未发现真实 Supabase / 腾讯云 Secret、私钥或 SMTP 残留。
- 运行时代码未再调用本地文件读写作为用户数据持久化。

## 当前环境无法完成的验证

当前执行环境无法从 npm registry 完成完整依赖下载，因此没有冒充以下项目已通过：

- `npm ci`
- `npm run build`
- Vercel Production Runtime
- 真实 Supabase PostgreSQL / Storage API
- 真实腾讯云 SES 邮件

这些需要在创建真实 Supabase 项目并填写环境变量后，在 Vercel / Codex 环境执行。

## 下一步

1. 创建 Supabase 项目。
2. 执行 `supabase/migrations/001_initial.sql`。
3. 在 Vercel 配置 `.env.example` 中对应变量。
4. 只先加入自己的测试邮箱到 `ALLOWED_EMAILS`。
5. 部署并测试注册、登录、重置密码、作品 CRUD、5MB+ 图片、两个账号权限隔离。
6. 全部通过后，再清理旧 Vinext / Cloudflare / Drizzle / Tencent Docker 依赖与遗留文件。
