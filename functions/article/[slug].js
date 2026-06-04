// Cloudflare Pages Function — server-side meta injection for /article/{slug}
// Reads articles/article.html template + fetches article from Supabase server-side
// Injects title, description, canonical, og:*, twitter:*, Article + Breadcrumb JSON-LD
// Returns 200 with proper meta so crawlers (Google, LINE/FB OG, AI bots) get correct data
// without waiting for JS render

export async function onRequest(context) {
  const SUPABASE_URL = 'https://zsebcpfblecwumbaxeaz.supabase.co';
  const KEY = context.env.SUPABASE_KEY;
  const SITE = 'https://ivylife.com.tw';
  const slug = context.params.slug;

  if (!KEY) {
    return new Response('SUPABASE_KEY env var missing', { status: 500 });
  }
  if (!slug) {
    return new Response('Missing slug', { status: 400 });
  }

  const isNumeric = /^\d+$/.test(slug);
  const filter = isNumeric ? `id=eq.${slug}` : `slug=eq.${encodeURIComponent(slug)}`;

  try {
    const apiResp = await fetch(
      `${SUPABASE_URL}/rest/v1/ivy_articles?${filter}&select=*,ivy_categories(name,slug,icon)&published=eq.true&limit=1`,
      { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }
    );
    if (!apiResp.ok) {
      return context.env.ASSETS.fetch(new Request(`${new URL(context.request.url).origin}/articles/article?slug=${encodeURIComponent(slug)}`, context.request));
    }
    const rows = await apiResp.json();
    const article = rows && rows[0];

    if (!article) {
      const notFound = await context.env.ASSETS.fetch(new Request(`${new URL(context.request.url).origin}/articles/article?slug=${encodeURIComponent(slug)}`, context.request));
      return new Response(await notFound.text(), {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
      });
    }

    const templateResp = await context.env.ASSETS.fetch(new Request(`${new URL(context.request.url).origin}/articles/article`, context.request));
    let html = await templateResp.text();

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    // 先解 HTML 實體（&nbsp; &amp; &#39; …），再去標籤、收斂空白；避免實體殘留被 esc() 二次編碼成 &amp;nbsp;
    const decodeEntities = s => String(s == null ? '' : s)
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch (_) { return ''; } })
      .replace(/&amp;/g, '&');
    // 去標籤 → 解實體 → 再去標籤 → 去尾端被截斷的不完整標籤（synopsis 在 DB 被截成 300 字、結尾常卡半截 <div style="te，無結尾 > 故 /<[^>]+>/ 抓不到）
    const stripHtml = s => decodeEntities(String(s == null ? '' : s).replace(/<[^>]+>/g, ''))
      .replace(/<[^>]+>/g, '').replace(/<[^>]*$/, '').replace(/\s+/g, ' ').trim();
    // 按「字元」截斷（Array.from 不切斷 surrogate pair），並去掉尾端 U+FFFD 亂碼 / 落單 surrogate
    const safeTrunc = (s, n) => Array.from(String(s == null ? '' : s)).slice(0, n).join('')
      .replace(/[�]+$/g, '').replace(/[\uD800-\uDBFF]$/g, '').trim();

    const canonicalUrl = `${SITE}/article/${slug}`;
    const title = safeTrunc(article.meta_title || article.title || 'IvyLife 艾薇生活', 80);
    const description = safeTrunc(stripHtml(article.meta_description) || stripHtml(article.synopsis) || stripHtml(article.content) || 'IvyLife 艾薇生活的文章', 155);
    const image = article.cover_image || `${SITE}/og-default.jpg`;
    const cat = article.ivy_categories || {};
    const pageTitle = `${title} - IvyLife 艾薇生活`;

    const breadcrumb = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首頁', item: SITE + '/' },
        ...(cat.slug ? [{ '@type': 'ListItem', position: 2, name: cat.name, item: `${SITE}/category/${cat.slug}` }] : []),
        { '@type': 'ListItem', position: cat.slug ? 3 : 2, name: title, item: canonicalUrl },
      ],
    };

    const articleLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: article.title,
      description: description,
      image: image,
      datePublished: article.published_at || article.created_at,
      dateModified: article.updated_at || article.published_at || article.created_at,
      author: { '@type': 'Person', name: '艾薇', url: `${SITE}/about` },
      publisher: {
        '@type': 'Organization',
        name: 'IvyLife 艾薇生活',
        logo: { '@type': 'ImageObject', url: `${SITE}/favicon.png` },
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
      inLanguage: 'zh-TW',
      ...(article.keywords ? { keywords: article.keywords } : {}),
      ...(article.city ? { contentLocation: { '@type': 'Place', name: article.city, addressRegion: article.city, addressCountry: 'TW' } } : {}),
    };

    const localBusinessLd = (article.store_name || article.store_address) ? {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: article.store_name || article.title,
      ...(article.store_address ? { address: { '@type': 'PostalAddress', streetAddress: article.store_address, addressCountry: 'TW' } } : {}),
      ...(article.store_phone ? { telephone: article.store_phone } : {}),
      ...(article.store_hours ? { openingHours: article.store_hours } : {}),
      ...(article.cover_image ? { image: article.cover_image } : {}),
    } : null;

    const headInject = `
<meta name="robots" content="index, follow">
<meta property="og:type" content="article">
<meta property="og:url" content="${esc(canonicalUrl)}">
<meta property="og:site_name" content="IvyLife 艾薇生活">
<meta property="og:locale" content="zh_TW">
<meta property="article:published_time" content="${esc(article.published_at || article.created_at || '')}">
<meta property="article:modified_time" content="${esc(article.updated_at || article.published_at || article.created_at || '')}">
${cat.name ? `<meta property="article:section" content="${esc(cat.name)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<script type="application/ld+json">${JSON.stringify(articleLd)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>
${localBusinessLd ? `<script type="application/ld+json">${JSON.stringify(localBusinessLd)}</script>` : ''}
`.trim();

    html = html.replace(
      /<title[^>]*id="page-title"[^>]*>[^<]*<\/title>/,
      `<title id="page-title">${esc(pageTitle)}</title>`
    );
    html = html.replace(
      /<meta\s+name="description"\s+id="meta-desc"[^>]*>/,
      `<meta name="description" id="meta-desc" content="${esc(description)}">`
    );
    html = html.replace(
      /<link\s+rel="canonical"\s+id="canonical-url"[^>]*>/,
      `<link rel="canonical" id="canonical-url" href="${esc(canonicalUrl)}">`
    );
    html = html.replace(
      /<meta\s+property="og:title"\s+id="og-title"[^>]*>/,
      `<meta property="og:title" id="og-title" content="${esc(title)}">`
    );
    html = html.replace(
      /<meta\s+property="og:description"\s+id="og-desc"[^>]*>/,
      `<meta property="og:description" id="og-desc" content="${esc(description)}">`
    );
    html = html.replace(
      /<meta\s+property="og:image"\s+id="og-image"[^>]*>/,
      `<meta property="og:image" id="og-image" content="${esc(image)}">`
    );

    html = html.replace('</head>', headInject + '\n</head>');

    // Inline article data so client JS can skip a Supabase round-trip
    // (also fixes "loading…" flash on slow connections).
    const inlineDataTag = `<script id="__ssr_article" type="application/json">${JSON.stringify(article).replace(/<\/script/gi, '<\\/script')}</script>`;
    html = html.replace('</body>', inlineDataTag + '\n</body>');

    // SSR 可見正文：把 H1 + 內文寫進 #art-wrap，讓不執行 JS 的爬蟲 / AI bot 也讀得到內容（AEO）。
    // client JS 載入後會用 __ssr_article 重新渲染並做圖片/連結後處理，整段覆蓋此內容，故對真人無影響。
    const pubDateStr = String(article.published_at || article.created_at || '').slice(0, 10);
    const coverSrc = article.cover_image ? article.cover_image.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/ /g, '%20') : '';
    const ssrContent = String(article.content || '').replace(/<script[\s\S]*?<\/script\s*>/gi, '');
    const ssrBody = `
      <a class="art-back" href="${cat.slug ? '/category/' + esc(cat.slug) : '/'}">← ${esc(cat.name || '返回首頁')}</a>
      <h1 class="art-title">${esc(article.title || '')}</h1>
      ${cat.name ? `<div><span class="art-cat-badge">${esc(cat.name)}</span></div>` : ''}
      ${coverSrc ? `<img class="art-cover" src="${esc(coverSrc)}" alt="${esc(article.title || '')}" onerror="this.style.display='none'">` : ''}
      <div class="art-meta">${pubDateStr ? `<span>📅 ${esc(pubDateStr)}</span>` : ''}${cat.name ? `<span>📁 ${esc(cat.name)}</span>` : ''}</div>
      ${article.synopsis ? `<p class="art-synopsis">${esc(stripHtml(article.synopsis))}</p>` : ''}
      <div class="art-content" id="art-body">${ssrContent}</div>
      <div class="art-footer-line">感謝閱讀 · 艾薇生活</div>`;
    html = html.replace('<div class="loading-state"><p>載入中…</p></div>', ssrBody);

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=600',
        'X-Article-Slug': slug,
        'X-Rendered-By': 'pages-function',
      },
    });
  } catch (e) {
    return new Response(`Render error: ${e.message}`, { status: 500 });
  }
}
