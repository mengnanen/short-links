/**
 * POST /create
 * Body: { url, slug?, expiry?, password? }
 * 若你想给“创建短链”加口令，请在 Pages → Settings → Variables 里设置 ACCESS_PASSWORD。
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

export async function onRequest(context) {
  const { request, env } = context;

  // 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  // 只允许 POST
  if (request.method !== 'POST') {
    return json({ message: 'Use POST /create with JSON body' }, 405);
  }

  // 安全解析 JSON（避免 1101）
  const body = await request.json().catch(() => null);
  if (!body) return json({ message: '缺少 JSON 请求体' }, 400);

  let { url, slug, expiry, password } = body;

  // 若设置了创建口令，则校验；未设置 ACCESS_PASSWORD 时跳过
  if (env.ACCESS_PASSWORD) {
    if (!password || password !== env.ACCESS_PASSWORD) {
      return json({ message: '访问密码错误' }, 403);
    }
  }

  // URL 基本校验
  if (!url || !/^https?:\/\/.{3,}/i.test(url)) {
    return json({ message: '非法格式：url。' }, 400);
  }
  // slug 校验：2~10 且不以文件后缀结尾
  if (slug && (slug.length < 2 || slug.length > 10 || /\.[a-zA-Z]{1,8}$/.test(slug))) {
    return json({ message: 'Illegal length: slug (>=2 && <=10), or not ending with a file extension.' }, 400);
  }

  const reqURL = new URL(request.url);
  const origin = `${reqURL.protocol}//${reqURL.hostname}`;

  // 禁止把自己域名再次缩短
  try {
    const target = new URL(url);
    if (target.hostname === reqURL.hostname) {
      return json({ message: 'You cannot shorten a link to the same domain.' }, 400);
    }
  } catch {
    return json({ message: '非法格式：url。' }, 400);
  }

  // 访问信息
  const ip = request.headers.get('CF-Connecting-IP')
        || request.headers.get('x-forwarded-for')
        || request.headers.get('clientIP')
        || '';
  const ua = request.headers.get('user-agent') || '';

  try {
    // 若自定义 slug：检查是否已存在
    if (slug) {
      const row = await env.DB.prepare('SELECT url FROM links WHERE slug = ?')
        .bind(slug).first();

      if (row && row.url === url) {
        // 同映射已存在，直接返回
        return json({ slug, link: `${origin}/${slug}` });
      }
      if (row) {
        return json({ message: 'Slug already exists.' }, 409);
      }
    }

    // 目标 URL 已存在且未提供 slug：直接复用
    const dup = await env.DB.prepare('SELECT slug FROM links WHERE url = ?')
      .bind(url).first();
    if (dup && !slug) {
      return json({ slug: dup.slug, link: `${origin}/${dup.slug}` });
    }

    // 生成 slug & 过期时间
    const slug2 = slug || gen(4);
    const expires_at = parseExpiry(expiry);
    const create_time = new Date().toISOString(); // 也可不传，让表的 DEFAULT 生效

    // 写库（参数化，避免注入）
    await env.DB.prepare(
      'INSERT INTO links (url, slug, ip, status, ua, create_time, expires_at, password) VALUES (?, ?, ?, 1, ?, ?, ?, ?)'
    ).bind(url, slug2, ip, ua, create_time, expires_at, password || null).run();

    return json({ slug: slug2, link: `${origin}/${slug2}` });
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes('UNIQUE')) return json({ message: 'Slug already exists.' }, 409);
    return json({ message: msg || '服务器错误' }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' }
  });
}

function gen(n) {
  const chars = '1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function parseExpiry(exp) {
  if (!exp) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(exp)) return exp; // 已是 ISO
  const m = /^(\d+)\s*([mhd])$/.exec(String(exp).trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = { m: 60e3, h: 3600e3, d: 86400e3 }[m[2]];
  return new Date(Date.now() + n * unit).toISOString();
}
