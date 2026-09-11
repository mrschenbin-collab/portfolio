# 已停止使用的腾讯云 Docker 部署方案

当前项目已经迁移为：

```text
Vercel Hobby + Supabase PostgreSQL + Supabase Private Storage + 腾讯云 SES API
```

腾讯云仍只用于 SES 邮件验证码（以及未来可选的域名注册），不再作为网站运行和本地磁盘持久化环境。

请使用：

```text
VERCEL_SUPABASE_DEPLOY.md
```

进行部署。
