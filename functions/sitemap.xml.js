// functions/sitemap.xml.js
// 動態 sitemap：每次請求時從 Supabase 撈 ivy_articles 已發布文章
// 部署後驗證：fetch('/sitemap.xml').then(r => r.headers.get('x-generated-by'))
// 應該回傳 'pages-function'。若沒有，表示 repo 根還有 sitemap.xml 靜態檔在 shadow。

export async function onRequest(context) {
  const SUPABASE_URL = 'https://zsebcpfblecwumbaxeaz.supabase.co';
  const KEY = context.env.SUPABASE_KEY;
  const BASE_URL = 'https://ivylife.com.tw';

  if (!KEY) {
    return new Response('Server misconfiguration: SUPABASE_KEY missing', { status: 500 });
  }

  try {
    const articlesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/ivy_articles?select=slug,updated_at,published_at&published=eq.true&order=updated_at.desc&limit=5000`,
      { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }
    );
    if (!articlesRes.ok) {
      return new Response(`Supabase upstream ${articlesRes.status}`, { status: 502 });
    }
    const articles = await articlesRes.json();

    const catsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/ivy_categories?select=slug,updated_at`,
      { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }
    );
    const categories = catsRes.ok ? await catsRes.json() : [];

    const today = new Date().toISOString().slice(0, 10);
    const escape = s => String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

    const staticPages = [
      { loc: '/',         priority: '1.0', changefreq: 'daily' },
      { loc: '/about',    priority: '0.5', changefreq: 'monthly' },
    ];

    const urls = [];

    for (const p of staticPages) {
      urls.push(
        `  <url>\n` +
        `    <loc>${BASE_URL}${p.loc}</loc>\n` +
        `    <lastmod>${today}</lastmod>\n` +
        `    <changefreq>${p.changefreq}</changefreq>\n` +
        `    <priority>${p.priority}</priority>\n` +
        `  </url>`
      );
    }

    for (const cat of categories) {
      const lastmod = (cat.updated_at || today).slice(0, 10);
      urls.push(
        `  <url>\n` +
        `    <loc>${BASE_URL}/category/${escape(cat.slug)}</loc>\n` +
        `    <lastmod>${lastmod}</lastmod>\n` +
        `    <changefreq>weekly</changefreq>\n` +
        `    <priority>0.7</priority>\n` +
        `  </url>`
      );
    }

    for (const a of articles) {
      if (!a.slug) continue;
      const lastmod = (a.updated_at || a.published_at || today).slice(0, 10);
      urls.push(
        `  <url>\n` +
        `    <loc>${BASE_URL}/article/${escape(a.slug)}</loc>\n` +
        `    <lastmod>${lastmod}</lastmod>\n` +
        `    <changefreq>monthly</changefreq>\n` +
        `    <priority>0.8</priority>\n` +
        `  </url>`
      );
    }

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.join('\n') + '\n' +
      `</urlset>\n`;

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        'X-Generated-By': 'pages-function',
        'X-Article-Count': String(articles.length),
        'X-Category-Count': String(categories.length),
      },
    });
  } catch (e) {
    return new Response(`Sitemap error: ${e.message}`, { status: 500 });
  }
}
