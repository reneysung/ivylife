// ivy-cms 圖片上傳代理 → Cloudflare R2（bucket ivy-images，供圖網域 img.ivylife.com.tw）
// 受 functions/_middleware.js 的 Basic Auth 保護（路徑在 /ivy-cms/ 底下）→ 非公開端點。
// 前端已把圖轉成 WebP（≤1200寬）再 POST；這裡只負責寫進 R2 binding。
export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const fn = url.searchParams.get('fn') || '';
  // 檔名白名單：只允許安全字元 + 圖片副檔名（防路徑穿越 / 任意寫入）
  if (!/^[A-Za-z0-9._-]+\.(webp|jpe?g|png|gif)$/i.test(fn)) {
    return json({ error: 'bad filename' }, 400);
  }
  if (!env.IVY_IMAGES) {
    return json({ error: 'R2 binding IVY_IMAGES missing on Pages project' }, 500);
  }
  const ct = request.headers.get('Content-Type') || 'image/webp';
  const body = await request.arrayBuffer();
  if (!body || body.byteLength === 0) return json({ error: 'empty body' }, 400);
  if (body.byteLength > 15 * 1024 * 1024) return json({ error: 'too large' }, 413);
  await env.IVY_IMAGES.put(fn, body, {
    httpMetadata: { contentType: ct, cacheControl: 'public, max-age=31536000, immutable' },
  });
  return json({ url: 'https://img.ivylife.com.tw/' + fn });
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
