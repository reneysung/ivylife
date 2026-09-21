// 內文圖搬 R2 一次性工具（perf 大工）。掛在 /ivy-cms/ 底下 → middleware 已 Basic Auth 保護（只 Reney）。
// 用現成 R2 binding(env.IVY_IMAGES) + Supabase 金鑰(env.SB_SERVICE_KEY) → 兩把鑰匙都不離開 CF、不經 Claude 手。
// 把文章 content 內熱連痞客邦(pimg.1px.tw / pic.pimg.tw)的 <img> 抓下來存 R2、改 content 指向 img.ivylife.com.tw。
//
// 動作：
//   ?action=scan                     唯讀盤點（哪些文章、幾張痞客邦圖）
//   ?action=migrate&id=<id>&max=<n>  搬單篇最多 n 張（可重複呼叫續搬；冪等，重跑跳過已是 R2 的）
//   （無參數）                        回一個簡單 HTML 控制台
// 安全：只把「成功抓下+存進 R2」的那張 URL 換掉，失敗的原封不動；改完 content 才 PATCH。WebP 不轉（Worker 無影像庫），
//       先存原檔治「慢」（latency 是主因）；要再省流量另開 Cloudflare Image Resizing。

const SB = 'https://zsebcpfblecwumbaxeaz.supabase.co';
const IMG_BASE = 'https://img.ivylife.com.tw';
const PIXNET_RE = /https?:\/\/(?:pimg\.1px\.tw|pic\.pimg\.tw)\/[^\s"'<>\\]+/gi;

function json(o, status) {
  return new Response(JSON.stringify(o), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function sbHeaders(env) {
  return { apikey: env.SB_SERVICE_KEY, Authorization: 'Bearer ' + env.SB_SERVICE_KEY };
}
async function sbGet(env, pathq) {
  const r = await fetch(SB + '/rest/v1/' + pathq, { headers: sbHeaders(env) });
  if (!r.ok) throw new Error('sbGet ' + r.status);
  return r.json();
}
async function sbPatchContent(env, id, content) {
  const r = await fetch(SB + '/rest/v1/ivy_articles?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: Object.assign(sbHeaders(env), { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify({ content }),
  });
  if (!r.ok) throw new Error('sbPatch ' + r.status + ' ' + (await r.text()).slice(0, 120));
}

// 從痞客邦 URL 造穩定的 R2 key：body-{倒數兩段路徑}，非法字元換底線 → 同一張圖永遠同 key（冪等/去重）
function r2Key(u) {
  try {
    const p = new URL(u).pathname.split('/').filter(Boolean);
    return ('body-' + p.slice(-2).join('-')).replace(/[^\w.-]/g, '_');
  } catch (e) {
    let h = 7; for (const c of u) h = (h * 31 + c.charCodeAt(0)) | 0;
    return 'body-' + Math.abs(h) + '.jpg';
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const params = new URL(request.url).searchParams;
  const action = params.get('action');

  if (!env.SB_SERVICE_KEY) return json({ error: 'SB_SERVICE_KEY env missing' }, 500);
  if (!env.IVY_IMAGES) return json({ error: 'IVY_IMAGES R2 binding missing' }, 500);

  try {
    if (action === 'scan') {
      const arts = await sbGet(env, 'ivy_articles?select=id,slug,title,content&published=eq.true');
      const rows = [];
      for (const a of arts) {
        const m = (a.content || '').match(PIXNET_RE) || [];
        if (m.length) rows.push({ id: a.id, slug: a.slug, title: (a.title || '').slice(0, 34), pixnet: m.length });
      }
      rows.sort((x, y) => y.pixnet - x.pixnet);
      return json({ total_articles: arts.length, affected: rows.length, total_imgs: rows.reduce((s, r) => s + r.pixnet, 0), articles: rows });
    }

    if (action === 'migrate') {
      const id = params.get('id');
      const max = Math.min(parseInt(params.get('max') || '12', 10) || 12, 40);
      if (!id) return json({ error: 'id required' }, 400);
      const arts = await sbGet(env, 'ivy_articles?select=id,content&id=eq.' + encodeURIComponent(id));
      if (!arts.length) return json({ error: 'article not found' }, 404);
      let content = arts[0].content || '';
      const urls = [...new Set(content.match(PIXNET_RE) || [])].slice(0, max);
      const results = []; let changed = false;
      for (const src of urls) {
        try {
          const resp = await fetch(src, { headers: { Referer: 'https://www.pixnet.net/', 'User-Agent': 'Mozilla/5.0' } });
          if (!resp.ok) { results.push({ src, ok: false, status: resp.status }); continue; }
          const buf = await resp.arrayBuffer();
          if (!buf.byteLength) { results.push({ src, ok: false, status: 'empty' }); continue; }
          const ct = resp.headers.get('Content-Type') || 'image/jpeg';
          const key = r2Key(src);
          await env.IVY_IMAGES.put(key, buf, { httpMetadata: { contentType: ct, cacheControl: 'public, max-age=31536000' } });
          const newUrl = IMG_BASE + '/' + key;
          content = content.split(src).join(newUrl);
          changed = true;
          results.push({ src, ok: true, to: newUrl, kb: Math.round(buf.byteLength / 1024) });
        } catch (e) { results.push({ src, ok: false, err: String(e).slice(0, 80) }); }
      }
      if (changed) await sbPatchContent(env, id, content);
      const remaining = (content.match(PIXNET_RE) || []).length;
      return json({ id, processed: urls.length, migrated: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, remaining, results });
    }

    return new Response(CONSOLE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (e) {
    return json({ error: String(e && e.message || e).slice(0, 200) }, 500);
  }
}

const CONSOLE_HTML = `<!doctype html><html lang="zh-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>內文圖搬 R2</title>
<style>body{font-family:system-ui,"Noto Sans TC",sans-serif;max-width:820px;margin:24px auto;padding:0 16px;color:#2d2020}
h1{font-size:20px}button{font:inherit;padding:8px 14px;border:1.5px solid #c8566a;background:#fff;color:#c8566a;border-radius:8px;cursor:pointer;margin:0 6px 6px 0}
button:hover{background:#fff0f2}button:disabled{opacity:.5;cursor:default}
table{border-collapse:collapse;width:100%;font-size:13px;margin-top:10px}td,th{border-bottom:1px solid #eee;padding:5px 8px;text-align:left}
#log{background:#2d2020;color:#e8dfe0;font:12px/1.6 ui-monospace,monospace;padding:12px;border-radius:8px;height:280px;overflow:auto;white-space:pre-wrap;margin-top:12px}
.n{color:#a08085;font-size:12px}</style></head><body>
<h1>內文圖搬 R2 <span class="n">(痞客邦 pimg/pic → img.ivylife.com.tw)</span></h1>
<p class="n">① 先「掃描」看清單(唯讀) ② 建議先點單篇最重的試、驗證前台不破圖 ③ 再「全部搬(續搬)」。每篇分批、每批最多 12 張,重複點會續搬直到 0。</p>
<div><button onclick="scan()">🔍 掃描</button> <button id="allBtn" onclick="migrateAll()" disabled>▶ 全部搬(續搬)</button> <button onclick="document.getElementById('log').textContent=''">清空 log</button></div>
<div id="tbl"></div>
<div id="log"></div>
<script>
var LIST=[];
function log(s){var l=document.getElementById('log');l.textContent+=s+"\\n";l.scrollTop=l.scrollHeight;}
function api(q){return fetch(location.pathname+'?'+q).then(function(r){return r.json();});}
function scan(){log('掃描中…');api('action=scan').then(function(d){if(d.error){log('錯誤: '+d.error);return;}LIST=d.articles||[];document.getElementById('allBtn').disabled=LIST.length===0;
var h='<p>受影響 <b>'+d.affected+'</b> 篇 / 共 '+d.total_articles+' 篇;痞客邦內文圖 <b>'+d.total_imgs+'</b> 張</p><table><tr><th>id</th><th>標題</th><th>痞客邦圖</th><th></th></tr>';
LIST.forEach(function(a){h+='<tr><td>'+a.id+'</td><td>'+a.title+'</td><td>'+a.pixnet+'</td><td><button onclick="one('+a.id+')">搬這篇</button> <a href="/article/'+a.slug+'" target="_blank">看</a></td></tr>';});
h+='</table>';document.getElementById('tbl').innerHTML=h;log('掃描完成: '+d.affected+' 篇 / '+d.total_imgs+' 張。');});}
function migrateOne(id){return api('action=migrate&id='+id+'&max=12').then(function(r){if(r.error){log('  #'+id+' 錯誤: '+r.error);return {remaining:0,err:1};}
log('  #'+id+' 搬 '+r.migrated+'/'+r.processed+(r.failed?(' 失敗'+r.failed):'')+' · 剩 '+r.remaining);
(r.results||[]).filter(function(x){return !x.ok;}).forEach(function(x){log('     ✗ '+(x.status||x.err)+' '+x.src.slice(-40));});return r;});}
function one(id){log('▶ 單篇 #'+id);(function loop(){migrateOne(id).then(function(r){if(r&&r.remaining>0&&!r.err)loop();else log('✓ #'+id+' 完成');});})();}
function migrateAll(){var i=0;var btn=document.getElementById('allBtn');btn.disabled=true;log('▶ 全部搬,共 '+LIST.length+' 篇');
(function nextArt(){if(i>=LIST.length){log('✓✓ 全部完成');btn.disabled=false;return;}var id=LIST[i].id;log('['+(i+1)+'/'+LIST.length+'] #'+id+' '+LIST[i].title);
(function loop(){migrateOne(id).then(function(r){if(r&&r.remaining>0&&!r.err)loop();else{i++;nextArt();}});})();})();}
</script></body></html>`;
