"use client";

import { useState, type FormEvent } from "react";
import { readApiResponse } from "@/lib/api-response";

type AuthMode = "login" | "register" | "reset";

type AuthResponse = {
  error?: string;
  message?: string;
  devCode?: string;
};

export function AuthForm({ nextPath }: { nextPath: string }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setCode("");
    setError("");
    setMessage("");
  }


  function title() {
    if (mode === "register") return "注册作者账号";
    if (mode === "reset") return "重置密码";
    return "登录作者账号";
  }

  async function sendCode() {
    if (mode === "login") return;
    setCodeBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "register" ? { purpose: "register", email } : { purpose: "reset", email }),
      });
      const result = await readApiResponse<AuthResponse>(response);
      if (!response.ok) throw new Error(result.error ?? "验证码发送失败");
      if (result.devCode) setCode(result.devCode);
      setMessage(result.devCode ? `${result.message ?? "验证码已生成"} 测试验证码：${result.devCode}` : result.message ?? "验证码已发送，请查看邮箱。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "验证码发送失败");
    } finally {
      setCodeBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const endpoint = mode === "reset" ? "/api/auth/reset-password" : `/api/auth/${mode}`;
      const payload = mode === "login"
        ? { email, password }
        : mode === "register"
          ? { name, email, password, code }
          : { email, password, code };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readApiResponse<AuthResponse>(response);
      if (!response.ok) throw new Error(result.error ?? "登录失败");
      if (mode === "register") {
        switchMode("login");
        setPassword("");
        setCode("");
        setMessage("注册成功。现在请重新输入邮箱和密码登录。");
        return;
      }
      if (mode === "reset") {
        switchMode("login");
        setPassword("");
        setCode("");
        setMessage("密码已重置。现在可以用新密码登录。");
        return;
      }
      window.location.href = nextPath || "/admin";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  return <section className="login-card">
    <p className="eyebrow">作品后台</p>
    <h1>{title()}</h1>
    <p>登录后可以提交作品、上传图片、修改本人介绍与联系信息。每个账号只管理自己的内容。</p>
    <div className="auth-switch" role="tablist" aria-label="选择登录或注册">
      <button type="button" className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")} aria-pressed={mode === "login"}>登录</button>
      <button type="button" className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")} aria-pressed={mode === "register"}>注册</button>
    </div>
    <form className="auth-form" onSubmit={submit}>
      {mode === "register" ? <label><span>姓名或昵称</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：陈同学" /></label> : null}
      <label><span>邮箱</span><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></label>
      <label><span>{mode === "reset" ? "新密码" : "密码"}</span><input required type="password" minLength={mode === "login" ? undefined : 12} maxLength={mode === "login" ? 200 : 128} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "login" ? "输入密码" : "至少十二位"} /></label>
      {mode !== "login" ? <label className="code-field"><span>邮箱验证码</span><div><input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="六位数字" /><button type="button" onClick={sendCode} disabled={codeBusy}>{codeBusy ? "发送中…" : mode === "register" ? "发送注册验证码" : "发送重置验证码"}</button></div></label> : null}
      <button type="submit" disabled={busy}>{busy ? "请稍候…" : mode === "register" ? "完成注册" : mode === "reset" ? "重置密码" : "登录"}</button>
      {mode === "login" ? <button className="forgot-button" type="button" onClick={() => switchMode("reset")}>忘记密码？用邮箱验证码重置</button> : null}
      {mode === "reset" ? <button className="forgot-button" type="button" onClick={() => switchMode("login")}>返回登录</button> : null}
      {message ? <p className="form-message" role="status">{message}</p> : null}
      {error ? <p className="form-message error" role="alert">{error}</p> : null}
    </form>
  </section>;
}
