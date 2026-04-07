<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9">
<xsl:output method="html" encoding="UTF-8" indent="yes"/>
<xsl:template match="/">
<html lang="zh-TW">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>IvyLife 網站地圖</title>
<style>
body{font-family:"Noto Sans TC",sans-serif;background:#fdf7f8;color:#333;margin:0;padding:2rem}
h1{color:#c8566a;font-size:1.6rem;margin-bottom:0.5rem}
.subtitle{color:#999;font-size:0.9rem;margin-bottom:2rem}
table{width:100%;border-collapse:collapse;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(200,86,106,.1)}
th{background:#c8566a;color:white;padding:12px 16px;text-align:left;font-size:0.85rem;font-weight:600}
td{padding:11px 16px;border-bottom:1px solid #f0e8ea;font-size:0.85rem}
tr:last-child td{border-bottom:none}
tr:hover td{background:#fdf0f2}
a{color:#c8566a;text-decoration:none}
a:hover{text-decoration:underline}
.pri{display:inline-block;background:#fdf0f2;color:#c8566a;border-radius:4px;padding:2px 8px;font-size:0.78rem;font-weight:600}
.freq{color:#999;font-size:0.8rem}
.logo{font-size:1.2rem;font-weight:800;color:#c8566a;margin-bottom:0.25rem}
</style>
</head>
<body>
<div class="logo">IvyLife 艾薇生活</div>
<h1>網站地圖</h1>
<p class="subtitle">共 <xsl:value-of select="count(sm:urlset/sm:url)"/> 個頁面</p>
<table>
<tr><th>頁面網址</th><th>更新頻率</th><th>優先度</th></tr>
<xsl:for-each select="sm:urlset/sm:url">
<tr>
<td><a href="{sm:loc}"><xsl:value-of select="sm:loc"/></a></td>
<td><span class="freq"><xsl:value-of select="sm:changefreq"/></span></td>
<td><span class="pri"><xsl:value-of select="sm:priority"/></span></td>
</tr>
</xsl:for-each>
</table>
</body>
</html>
</xsl:template>
</xsl:stylesheet>