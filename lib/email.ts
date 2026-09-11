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
  register: "注册验证",
  reset: "重置密码",
};

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function tencentSecretId(): string {
  return process.env.TENCENT_SECRET_ID?.trim() ?? "";
}

function tencentSecretKey(): string {
  return process.env.TENCENT_SECRET_KEY?.trim() ?? "";
}

function sesRegion(): string {
  return process.env.TENCENT_SES_REGION?.trim() || "ap-hongkong";
}

function sesFromEmail(): string {
  return process.env.TENCENT_SES_FROM_EMAIL?.trim() || "no-reply@mail.cblworks.site";
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

function sesErrorInfo(error: unknown): { code: string; message: string; requestId: string } {
  const details = typeof error === "object" && error ? error as {
    code?: unknown;
    message?: unknown;
    requestId?: unknown;
    getRequestId?: unknown;
  } : {};
  const requestId = typeof details.requestId === "string"
    ? details.requestId
    : typeof details.getRequestId === "function"
      ? String(details.getRequestId())
      : "";
  return {
    code: typeof details.code === "string" ? details.code : "UNKNOWN",
    message: error instanceof Error
      ? error.message
      : typeof details.message === "string"
        ? details.message
        : "unknown error",
    requestId,
  };
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
  const title = "CBL WORKS 验证码";
  const secretId = tencentSecretId();
  const secretKey = tencentSecretKey();
  const region = sesRegion();
  const fromEmail = sesFromEmail();
  const id = templateId();
  const client = new ses.v20201002.Client({
    credential: {
      secretId,
      secretKey,
    },
    region,
    profile: {
      httpProfile: {
        reqMethod: "POST",
        reqTimeout: 30,
        endpoint: "ses.tencentcloudapi.com",
      },
    },
  });

  try {
    await client.SendEmail({
      FromEmailAddress: fromEmail,
      ReplyToAddresses: fromEmail,
      Destination: [to],
      Subject: title,
      Template: {
        TemplateID: id,
        TemplateData: JSON.stringify({
          siteName: "CBL WORKS",
          purpose: label,
          code,
          minutes: "10",
        }),
      },
      TriggerType: 1,
    });
    return { ok: true, message: "验证码已发送，请查看邮箱。" };
  } catch (error) {
    console.error("[ses] SendEmail failed:", {
      ...sesErrorInfo(error),
      endpoint: "ses.tencentcloudapi.com",
      region,
      fromEmail,
      templateId: id,
      secretIdLength: secretId.length,
      secretKeyLength: secretKey.length,
    });
    return { error: "验证码邮件发送失败，请稍后重试或检查腾讯云 SES 配置。" };
  }
}
