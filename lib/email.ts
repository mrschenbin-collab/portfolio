import { ses } from "tencentcloud-sdk-nodejs-ses";
import type { StoredEmailCodePurpose } from "@/lib/file-store";

type SendMailResult = {
  ok: true;
  message: string;
  devCode?: string;
} | {
  error: string;
};

const purposeLabels: Record<StoredEmailCodePurpose, string> = {
  register: "注册账号",
  reset: "重置密码",
};

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function tencentSecretId(): string {
  return clean(process.env.TENCENT_SECRET_ID, 300);
}

function tencentSecretKey(): string {
  return clean(process.env.TENCENT_SECRET_KEY, 300);
}

function sesRegion(): string {
  return clean(process.env.TENCENT_SES_REGION, 60) || "ap-hongkong";
}

function sesFromEmail(): string {
  return clean(process.env.TENCENT_SES_FROM_EMAIL, 300) || "no-reply@mail.cblworks.site";
}

function templateId(): number {
  const id = Number(clean(process.env.TENCENT_SES_TEMPLATE_ID, 40));
  return Number.isInteger(id) && id > 0 ? id : 0;
}

export function isMailConfigured(): boolean {
  return Boolean(
    tencentSecretId()
    && tencentSecretKey()
    && sesRegion()
    && sesFromEmail()
    && templateId(),
  );
}

export async function sendVerificationEmail(
  to: string,
  code: string,
  purpose: StoredEmailCodePurpose,
): Promise<SendMailResult> {
  const allowDevCode = process.env.NODE_ENV !== "production";
  if (!isMailConfigured()) {
    if (allowDevCode) {
      console.info(`[portfolio-email-code] ${purpose}:${to}:${code}`);
      return { ok: true, message: "开发模式下已生成验证码，页面会直接显示。", devCode: code };
    }
    return { error: "腾讯云 SES 邮件服务还没有配置完整，暂时无法发送验证码。" };
  }

  const label = purposeLabels[purpose];
  const title = `视觉档案${label}验证码`;
  const client = new ses.v20201002.Client({
    credential: {
      secretId: tencentSecretId(),
      secretKey: tencentSecretKey(),
    },
    region: sesRegion(),
    profile: {
      signMethod: "TC3-HMAC-SHA256",
      httpProfile: {
        reqMethod: "POST",
        reqTimeout: 30,
        endpoint: "ses.tencentcloudapi.com",
      },
    },
  });

  try {
    const fromEmail = sesFromEmail();
    await client.SendEmail({
      FromEmailAddress: fromEmail,
      ReplyToAddresses: fromEmail,
      Destination: [to],
      Subject: title,
      Template: {
        TemplateID: templateId(),
        TemplateData: JSON.stringify({
          code,
          purpose: label,
          siteName: "视觉档案",
          minutes: "10",
        }),
      },
      TriggerType: 1,
    });
    return { ok: true, message: "验证码已发送，请查看邮箱。" };
  } catch (error) {
    console.error("[ses] SendEmail failed:", error instanceof Error ? error.message : "unknown error");
    return { error: "验证码邮件发送失败，请稍后重试或检查腾讯云 SES 配置。" };
  }
}
