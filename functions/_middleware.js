// 鬼 URL 防護 middleware
// 攔截所有不該走 SPA fallback 的路徑，直接回 404
// 部署後，1582 頁鬼 URL 下次被 Google 爬到就會收到 404，幾週內自動退出索引
//
// 注意：這個 middleware 會在所有其他 Pages Functions / _redirects / 靜態檔案之前執行
// 如果路徑不符合鬼 URL pattern，呼叫 context.next() 讓下游正常處理

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname;

  // 鬼 URL pattern：站內錯誤連結（缺 https:）造成的偽路徑、以及不存在的 PHP/ASPX 探測路徑
  const ghostPatterns = [
    /^\/www\./i,            // /www.facebook.com/... /www.anywhere.com/...
    /\.php$/i,              // *.php
    /\.aspx$/i,             // *.aspx
    /\.jsp$/i,              // *.jsp
    /^\/wp-/i,              // wp-admin / wp-login / wp-content (這站不是 WordPress)
    /^\/\.env/i,            // .env
    /^\/\.git/i,            // .git
    /^\/phpmyadmin/i,       // phpmyadmin probe
    /^\/admin\.php$/i,      // admin.php
  ];

  for (const pattern of ghostPatterns) {
    if (pattern.test(path)) {
      return new Response(
        `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><meta name="robots" content="noindex"><title>404 - 找不到頁面</title><style>body{font-family:'Noto Sans TC',system-ui,sans-serif;background:#f8f4f5;color:#2d2020;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:2rem}main{max-width:480px}h1{font-size:5rem;color:#c8566a;margin:0}p{color:#a08085;margin:1rem 0 2rem;line-height:1.7}a{color:#c8566a;text-decoration:none;font-weight:500;padding:10px 24px;border:1.5px solid #c8566a;border-radius:50px;display:inline-block;transition:all 0.2s}a:hover{background:#c8566a;color:white}</style></head><body><main><h1>404</h1><p>這個頁面不存在或已經移除了。<br>你可能輸入了錯誤的網址，或這個連結已經失效。</p><a href="/">回到 IvyLife 首頁</a></main></body></html>`,
        {
          status: 404,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=300',
            'X-Ghost-URL-Block': '1',
          },
        }
      );
    }
  }

  // 不是鬼 URL，繼續走原本的路由邏輯
  return context.next();
}
