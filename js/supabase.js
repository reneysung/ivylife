/* IvyLife Supabase Client */
const SUPABASE_URL = 'https://zsebcpfblecwumbaxeaz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_L2DOfeM0cAJqwlVCr1LwtA_jE9MBNDn';

async function supabaseQuery(table, params = {}) {
  let url = SUPABASE_URL + '/rest/v1/' + table + '?';
  const q = [];
  if (params.select) q.push('select=' + encodeURIComponent(params.select));
  if (params.eq) Object.entries(params.eq).forEach(([k,v]) => q.push(k + '=eq.' + encodeURIComponent(v)));
  if (params.order) q.push('order=' + encodeURIComponent(params.order));
  if (params.limit) q.push('limit=' + params.limit);
  if (params.offset) q.push('offset=' + params.offset);
  url += q.join('&');
  const res = await fetch(url, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' } });
  if (!res.ok) { const e = await res.text(); throw new Error('Supabase error: ' + res.status + ' ' + e); }
  return res.json();
}
async function getArticleBySlug(slug) {
  const rows = await supabaseQuery('ivy_articles', { select: '*,ivy_categories(name,slug)', eq: { slug, published: 'true' } });
  return rows[0] || null;
}
async function getArticles({ categorySlug, limit = 12, offset = 0 } = {}) {
  const p = { select: 'id,slug,title,synopsis,cover_image,created_at,category_id,ivy_categories(name,slug)', eq: { published: 'true' }, order: 'created_at.desc', limit, offset };
  if (categorySlug) { const cats = await supabaseQuery('ivy_categories', { eq: { slug: categorySlug } }); if (cats[0]) p.eq.category_id = cats[0].id; }
  return supabaseQuery('ivy_articles', p);
}
async function getCategories() { return supabaseQuery('ivy_categories', { order: 'sort_order.asc' }); }
function formatDate(s) { if (!s) return ''; return new Date(s).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' }); }
function categoryIcon(n) { return { '美食餐廣': '🍜', '飯店民宿': '🏨', '醫學美容': '✨', '決車美容': '🚗', '全身按摩': '💆', '宅修清潔': '🏠', '設計推薦': '🛋' }[n] || '📝'; }