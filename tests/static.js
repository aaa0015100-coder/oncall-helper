// 靜態檢查：REF 完整、出處都存在、無重複 id、無寫死色碼、無外部載入、無 localStorage/cookie
const {A,html,js}=require('./harness')(process.argv[2]);
const F=[];
const css=(html.match(/<style>([\s\S]*?)<\/style>/)||["",""])[1];
// REF
for(const [k,v] of Object.entries(A.REF)){ if(!v.t||!v.f) F.push("REF 缺 t/f："+k); }
const used=new Set([...js.matchAll(/src\("([A-Za-z0-9_]+)"/g)].map(m=>m[1]).concat([...js.matchAll(/ref:"([A-Za-z0-9_]+)"/g)].map(m=>m[1])));
for(const k of used) if(!A.REF[k]) F.push("src() 引用不存在的 REF："+k);
// 靜態 id 重複
const ids=[...html.replace(/<script>[\s\S]*<\/script>/,"").matchAll(/\sid="([^"$]+)"/g)].map(m=>m[1]);
const dup=ids.filter((x,i)=>ids.indexOf(x)!==i); if(dup.length) F.push("重複 id："+[...new Set(dup)].join(","));
// 色碼：只允許出現在 :root token 區塊；rgba(0,0,0,x) 陰影／遮罩允許
const noRoot=css.replace(/:root[^{]*\{[^}]*\}/g,"").replace(/@media \(prefers-color-scheme: dark\)\{:root[^{]*\{[^}]*\}\}/g,"");
const hex=noRoot.match(/#[0-9a-fA-F]{3,8}\b/g); if(hex) F.push("CSS 寫死色碼："+[...new Set(hex)].join(","));
const rgb=(noRoot.match(/rgba?\([^)]*\)/g)||[]).filter(x=>!/^rgba\(0,\s*0,\s*0,\s*[.\d]+\)$/.test(x)); if(rgb.length) F.push("CSS 寫死 rgb："+rgb.join(","));
if(/(^|[^-])\b(white|black)\b/.test(noRoot.replace(/white-space/g,""))) F.push("CSS 使用色名 white/black");
const jsHex=js.match(/["'`][^"'`\n]*#[0-9a-fA-F]{6}\b/g); if(jsHex) F.push("JS 內寫死色碼："+jsHex.slice(0,3).join(" | "));
// 外部載入、儲存
if(/<link[^>]+href=["']https?:/i.test(html)) F.push("外部 <link>");
if(/<script[^>]+src=/i.test(html)) F.push("外部 <script>");
if(/@import|url\(\s*["']?https?:/i.test(css)) F.push("CSS 外部資源");
if(/fonts\.googleapis/.test(html)) F.push("Google Fonts 未移除");
if(/localStorage|sessionStorage|document\.cookie|indexedDB/.test(js)) F.push("使用瀏覽器儲存");
if(/<meta name="claude:/.test(html)) F.push("含 claude: meta");
// v1.0：藥物頁子分類——每個藥恰好屬於所在大類的一個子分類
{ const vm=require('vm'); const c={console}; vm.createContext(c);
  try{ vm.runInContext(js+';this.__X={DRUGS:typeof DRUGS!=="undefined"?DRUGS:null,DSUB:typeof DSUB!=="undefined"?DSUB:null};',c); const {DRUGS,DSUB}=c.__X;
    if(DRUGS&&DSUB){ const ids=new Set(DRUGS.map(d=>d.id));
      for(const d of DRUGS){ if(!d.ren) F.push('缺腎功能資料：'+d.id); }
      for(const d of DRUGS){ const n=(DSUB[d.cls]||[]).filter(x=>x[2].includes(d.id)).length; if(n!==1) F.push(`藥物子分類：${d.id} 在 ${d.cls} 出現 ${n} 次`); }
      for(const [k,ss] of Object.entries(DSUB)) for(const x of ss) for(const id of x[2]) if(!ids.has(id)) F.push("子分類引用不存在的藥："+id); } }catch(e){ F.push("子分類檢查失敗 "+e.message); } }
console.log(F.length?"STATIC FAIL "+F.length+"\n  "+F.join("\n  "):"STATIC OK");
process.exitCode=F.length?1:0;
