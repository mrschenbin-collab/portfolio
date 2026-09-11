export type ApiResponsePayload = Record<string, unknown> & { error?: string };

function fallbackError(status: number, body: string): string {
  if (status === 401) return "请先登录后再操作。";
  if (status === 403) return "你没有权限操作这个内容。";
  if (status === 413) return "上传内容过大，请确认每张图片不超过十五兆后重试。";
  if (status >= 500) return "服务器暂时无法处理请求，请稍后重试。";
  return body.trim() || `请求失败（${status}）`;
}

export async function readApiResponse<T extends ApiResponsePayload>(
  response: Response,
): Promise<T> {
  const body = await response.text();
  if (body) {
    try {
      return JSON.parse(body) as T;
    } catch {
      if (!response.ok) {
        return { error: fallbackError(response.status, body) } as T;
      }
    }
  }

  if (!response.ok) {
    return { error: fallbackError(response.status, body) } as T;
  }

  return {} as T;
}
