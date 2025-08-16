// functions/[id].js
// 访问短链：GET /:slug?p=密码(可选)
import page404 from './404.html';

export async function onRequestGet({ request, env, params }) {
  try {
    const slug = params.id;
    if (!slug) return html(page404, 404);

    // 查映射（参数化，避免注入）
    const row = await env.DB
      .prepare('SELECT url, status, expires_at, password FROM links WHERE slug = ?')
      .bind(slug)
      .first();

    if (!row) return html(page404, 404);

    // 停用
    if (row.status !== 1) return text('链接已停用', 410);

    // 过期
    if (row.expires_at && Date.now() > Date.parse(row.expires_at)) {
      return text('链接已过期', 410);
    }

    // 访问密码（如果该条记录设置了 password）
    const u = new URL(request.url);
    const provided = u.searchParams.get('p') || request.headers.get('X-Access-Password');
    if (row.password && row.password !== provided) {
      return passwordForm(slug, !!provided);
    }

    // 记录访问日志（不阻塞跳转）
    const referer = request.headers.get('Referer') || null;
    const ua = request.headers.get('User-Agent') || null;
    const ip =
      request.headers.get('CF-Connecting-IP') ||
      request.headers.get('x-forwarded-for') ||
      request.headers.get('clientIP') || null;

    env.DB.prepare(
      'INSERT INTO logs (url, slug, referer, ua, ip) VALUES (?, ?, ?, ?, ?)'
    ).bind(row.url, slug, referer, ua, ip).run().catch(() => {});

    // 302 跳转到目标
    return Response.redirect(row.url, 302);
  } catch (e) {
    return text('Server error', 500);
  }
}

function text(s, status = 200) {
  return new Response(s, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
function html(s, status = 200) {
  return new Response(s, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
function passwordForm(slug, wrong) {
  return html(`<!doctype html><meta charset="utf-8">
<title>请输入访问密码</title>
<style>
body{font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f7f8fa;padding:32px}
.card{max-width:420px;margin:10vh auto;background:#fff;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.08);padding:24px}
h1{font-size:18px;margin:0 0 12px} .err{color:#b91c1c;background:#fee2e2;border-radius:8px;padding:8px 10px;margin-bottom:10px}
input{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px}
button{margin-top:12px;width:100%;padding:10px 12px;border:0;border-radius:8px;background:#22c55e;color:#fff;font-weight:600}
</style>
<div class="card">
  <h1>该短链已设置访问密码</h1>
  ${wrong ? '<div class="err">密码错误，请重试</div>' : '<p>请输入密码继续访问。</p>'}
  <form method="GET" action="/${encodeURIComponent(slug)}">
    <input type="password" name="p" placeholder="访问密码" autofocus />
    <button type="submit">验证并跳转</button>
  </form>
</div>`, wrong ? 401 : 200);
}

