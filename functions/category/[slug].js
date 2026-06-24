// Cloudflare Pages Function — server-side meta injection for /category/{slug}
// Reads category.html template + fetches category from Supabase server-side
// Injects per-category title, description, canonical, og:*, twitter:*, CollectionPage + Breadcrumb JSON-LD
// Also fetches latest 24 articles so crawlers see real content (not skeleton loader)

export async function onRequest(context) {
  const SUPABASE_URL = 'https://zsebcpfblecwumbaxeaz.supabase.co';
  const KEY = context.env.SUPABASE_KEY;
  const SITE = 'https://ivylife.com.tw';
  const slug = context.params.slug;

  if (!KEY) return new Response('SUPABASE_KEY env var missing', { status: 500 });
  if (!slug) return new Response('Missing slug', { status: 400 });

  try {
    const [catResp, artResp] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/ivy_categories?slug=eq.${encodeURIComponent(slug)}&select=*&limit=1`, {
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
      }),
      fetch(`${SUPABASE_URL}/rest/v1/ivy_articles?select=slug,title,synopsis,cover_image,city,created_at,ivy_categories!inner(slug,name,icon)&ivy_categories.slug=eq.${encodeURIComponent(slug)}&published=eq.true&order=created_at.desc&limit=24`, {
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
      }),
    ]);

    const cats = catResp.ok ? await catResp.json() : [];
    const cat = cats[0];

    if (!cat) {
      const templateResp = await context.env.ASSETS.fetch(new Request(`${new URL(context.request.url).origin}/category`, context.request));
      return new Response(await templateResp.text(), {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    const articles = artResp.ok ? await artResp.json() : [];

    const templateResp = await context.env.ASSETS.fetch(new Request(`${new URL(context.request.url).origin}/category`, context.request));
    let html = await templateResp.text();

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const stripHtml = s => String(s == null ? '' : s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const ivThumb = (u, w) => (!u || u.indexOf('/storage/v1/object/public/') < 0) ? u : u.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') + (u.indexOf('?') < 0 ? '?' : '&') + 'width=' + (w || 600) + '&resize=contain&quality=62';

    const canonicalUrl = `${SITE}/category/${slug}`;
    const title = `${cat.name} - IvyLife 艾薇生活`;
    const description = (cat.description || `${cat.name} 主題文章精選 — 艾薇分享台灣各地${cat.name}相關體驗。`).slice(0, 200);
    const image = `${SITE}/og-default.jpg`;

    const breadcrumbLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首頁', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: cat.name, item: canonicalUrl },
      ],
    };

    const collectionLd = {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
      description: description,
      url: canonicalUrl,
      inLanguage: 'zh-TW',
      isPartOf: { '@type': 'WebSite', name: 'IvyLife 艾薇生活', url: SITE + '/' },
      ...(articles.length ? {
        hasPart: articles.slice(0, 10).map(a => ({
          '@type': 'Article',
          headline: a.title,
          url: `${SITE}/article/${a.slug}`,
          ...(a.cover_image ? { image: a.cover_image } : {}),
          datePublished: a.created_at,
          author: { '@type': 'Person', name: '艾薇' },
        })),
      } : {}),
    };

    const headInject = `
<meta name="robots" content="index, follow">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonicalUrl)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:site_name" content="IvyLife 艾薇生活">
<meta property="og:locale" content="zh_TW">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<script type="application/ld+json">${JSON.stringify(collectionLd)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>
`.trim();

    html = html.replace(
      /<title[^>]*id="metaTitle"[^>]*>[^<]*<\/title>/,
      `<title id="metaTitle">${esc(title)}</title>`
    );
    html = html.replace(
      /<meta\s+name="description"\s+id="metaDesc"[^>]*>/,
      `<meta name="description" id="metaDesc" content="${esc(description)}">`
    );
    html = html.replace(
      /<link\s+rel="canonical"\s+id="canonical"[^>]*>/,
      `<link rel="canonical" id="canonical" href="${esc(canonicalUrl)}">`
    );
    // SSR H1：把靜態「分類文章」換成實際分類名，讓不執行 JS 的爬蟲讀到正確標題
    html = html.replace(
      /<h1 id="catTitle">[^<]*<\/h1>/,
      `<h1 id="catTitle">${esc(cat.name)}</h1>`
    );

    html = html.replace('</head>', headInject + '\n</head>');

    // SSR article cards as fallback content (visible to crawlers; JS may re-render later)
    if (articles.length) {
      const cardsHtml = articles.map(a => {
        const date = a.created_at ? new Date(a.created_at).toLocaleDateString('zh-TW') : '';
        const synopsis = stripHtml(a.synopsis).slice(0, 80);
        const thumb = a.cover_image
          ? `<img src="${esc(ivThumb(a.cover_image, 600))}" alt="${esc(a.title)}" loading="lazy" style="width:100%;height:100%;object-fit:cover">`
          : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:2rem">${esc(cat.icon || '📝')}</div>`;
        return `<a class="article-card" href="/article/${esc(a.slug)}" style="text-decoration:none;color:inherit"><div class="card-img">${thumb}</div><div class="card-body"><span class="card-category">${esc(cat.name)}</span><h3 class="card-title">${esc(a.title)}</h3><p class="card-synopsis">${esc(synopsis)}</p><span class="card-meta">${esc(date)}</span></div></a>`;
      }).join('\n');
      html = html.replace(
        /<div id="articleGrid"[^>]*>[\s\S]*?<\/div>\s*<div class="pagination"/,
        `<div id="articleGrid" class="articles-grid" data-ssr="1">${cardsHtml}</div><div class="pagination"`
      );
    }

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=600',
        'X-Category-Slug': slug,
        'X-Rendered-By': 'pages-function',
      },
    });
  } catch (e) {
    return new Response(`Render error: ${e.message}`, { status: 500 });
  }
}
