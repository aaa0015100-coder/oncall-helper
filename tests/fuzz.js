// 組合模擬＋臨床不變式。用法：node tests/fuzz.js [index.html] [N=3000] [--mod=dysp,cp,...]
// 欄位與選項從 buildPanels() 的 HTML 自動抓取；數字欄位在臨床合理範圍內隨機（35% 留空）。
const path=require('path');
const args=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const FILE=args[0]||path.join(__dirname,'..','index.html');
const N=+(args[1]||3000);
const MODSEL=(process.argv.find(a=>a.startsWith('--mod='))||'').slice(6).split(',').filter(Boolean);
const {A,set,txt}=require('./harness')(FILE);

set({}); const all=Object.values(A.buildPanels()).join('');
const F={};
for(const m of all.matchAll(/<select[^>]*data-f="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) F[m[1]]={t:'sel',v:[...m[2].matchAll(/value="([^"]*)"/g)].map(x=>x[1])};
for(const m of all.matchAll(/<input[^>]*>/g)){ const f=(m[0].match(/data-f="([^"]+)"/)||[])[1]; if(!f||F[f]) continue;
  F[f]= /type="checkbox"/.test(m[0])?{t:'bool'}:{t:'num'}; }
const R={age:[16,100],wt:[35,150],ht:[140,195],egfr:[5,120],pod:[0,30],hr:[25,200],sbp:[50,250],dbp:[25,150],rr:[4,50],spo2:[70,100],fio2:[21,100],temp:[34,42],gcs:[3,15],glu:[20,1200],
  ph:[6.8,7.7],pco2:[15,120],po2:[30,500],hco3:[3,50],na:[105,175],k:[1.5,9],cl:[70,130],alb:[1,5],lac:[0.5,15],hb:[3,18],bun:[5,200],ca:[5,16],bhb:[0,10],cr:[0.3,12],cr_base:[0.3,6],
  inr:[0.9,9],plt:[5,600],wbc:[0.2,60],anc:[0,30],bili:[0.2,30],uo:[0,1500],uo_h:[1,24],ne:[0.01,1.5],mg:[0.5,5],phos:[0.5,9],sosm:[220,380],uosm:[50,1200],una:[5,200],na_prev:[105,175],na_h:[1,48],o2_flow:[1,60]};
const pick=a=>a[Math.floor(Math.random()*a.length)];
function rnd(f){ const s=F[f]; if(s.t==='bool') return Math.random()<.25; if(s.t==='sel') return pick(s.v);
  if(Math.random()<.35) return null; const r=R[f]||[0,100]; const x=r[0]+Math.random()*(r[1]-r[0]); return Math.random()<.5?Math.round(x):+x.toFixed(2); }

const BAD=/\bundefined\b|\bNaN\b|\[object|Infinity|\bnull\b/;
const fails={}; let n=0;
const fail=(k,o)=>{ (fails[k]=fails[k]||[]).push(o); };
const num=v=>(v===null||v===''||isNaN(+v))?null:+v;
// 舊版沒有 acsSusp() 時用相同定義，讓不變式也能對舊版跑
const acsSusp=()=>A.acsSusp?A.acsSusp():!!(A.S.ecg==='stemi'||A.S.ecg==='ischemia'||A.S.trop==='rise'||A.S.trop==='pos'||A.S.c_typical);

/* 每個輸出區：[標籤, 產生函式, 不變式(t,h,o)=>錯誤訊息或空字串] */
const outs=[];
const pageFn=m=>()=>A.hypoX(m.id)+A.o2X(m.id)+m.r();
function o2Inv(t,h,o,id){
  const tg=A.o2Target(), sp=num(o.spo2);
  // 頁內 SpO₂ 目標文字必須與 o2Target() 一致
  const m=t.match(/SpO₂ 目標 (\d\d–\d\d%|≥\d\d%)/); if(m&&m[1]!==tg.txt) return `頁內目標 ${m[1]} ≠ o2Target ${tg.txt}`;
  if(/低於目標 94–98%/.test(t)&&/SpO₂ <90% 才給氧/.test(t)) return '同頁：低於 94–98% 給氧 vs <90% 才給氧';
  if(acsSusp()&&!A.hypercapRisk()&&sp!==null&&sp>=90&&/SpO₂ [\d.]+% 低於目標/.test(t)) return '疑 ACS、SpO₂ ≥90 仍判低於目標';
  if(o.hx_asthma&&!acsSusp()&&!A.hypercapRisk()&&/SpO₂ 目標 94–98%/.test(t)) return '氣喘仍用 94–98%';
  return '';
}
for(const m of A.MODS){ if(MODSEL.length&&!MODSEL.includes(m.id)) continue;
  outs.push([m.id,pageFn(m),(t,h,o)=>{
    const e=o2Inv(t,h,o,m.id); if(e) return e;
    // 30 mL/kg：BMI >30 且可算 IBW 時，不可只給實際體重量
    const w=num(o.wt), ht=num(o.ht);
    if(/30 mL\/kg 晶體液/.test(t)&&w!==null&&ht!==null&&ht>=120&&w/Math.pow(ht/100,2)>30&&(o.sex==='m'||o.sex==='f')&&!/調整體重/.test(t)) return 'BMI>30 未用調整體重';
    if(m.id==='ams'&&o.hx_pd&&/haloperidol<\/b>：<b>0\.5–1 mg/.test(h)) return 'Parkinson 仍給 haloperidol 劑量';
    if(m.id!=='acls'){ const ns=[...h.matchAll(/class="st-n">(\d+)</g)].map(x=>+x[1]); for(let j=0;j<ns.length;j++) if(ns[j]!==j+1) return '步驟編號不連續 '+ns.join(','); }
    // 腎功能（v0.8）：rv() 不存在時（舊版）略過
    if(A.rv){ const x=A.rv('crcl'), sev=x&&(x.hd||x.v<30);
      if(sev&&/enoxaparin [\d.]+ mg SC q12h/.test(t)) return 'CrCl <30 或透析仍給 enoxaparin q12h';
      if(x&&!x.hd&&x.v>=30&&/enoxaparin [\d.]+ mg SC q24h/.test(t)) return 'CrCl ≥30 卻給 enoxaparin q24h';
      if(m.id==='ams'&&/levetiracetam [\d.]+ mg IV/.test(t)&&A.rv('egfr')&&!/之後 維持/.test(t)) return '有腎功能但未顯示 levetiracetam 維持劑量';
      if(sev&&/NSAID 合併使用/.test(t)) return 'CrCl <30 仍建議 NSAID';
      if(x&&(x.hd||x.v<40)&&/metoclopramide 10 mg IV/.test(t)) return 'CrCl <40 仍 metoclopramide 10 mg';
      if(x&&(x.hd||x.v<50)&&/desmopressin 2 µg IV/.test(t)&&!/CrCl <50 禁忌/.test(t)) return 'CrCl <50 desmopressin 未標禁忌';
    }
    if(m.id==='htn'){ const organ=/高血壓急症：/.test(t), noOrg=/無器官損傷證據/.test(t); if(organ&&noOrg) return '同時判定急症與無器官損傷'; }
    return '';
  }]);
  if(m.lab) outs.push([m.id+'.lab',m.lab,()=> '']);
}
if(!MODSEL.length||MODSEL.includes('rsi')) outs.push(['rsi',A.rsiCard,(t,h,o)=>{
  const c=A.shockCtx(); const hypo=c.hypot||(c.si!==null&&c.si>=1)||A.prInUse();
  if(hypo&&/0\.3 mg\/kg（仿單 0\.2–0\.6）/.test(t)) return '低血壓仍用 etomidate 0.3';
  if(hypo&&/Ketamine （?[^）]*）?1–2 mg\/kg ＝/.test(t)) return '低血壓仍用 ketamine 1–2';
  if(hypo&&!/Propofol 列為次選/.test(t)) return '低血壓 propofol 未降為次選';
  if(!hypo&&/列為次選/.test(t)) return '非低血壓卻降 propofol';
  if(A.rv){ const x=A.rv('crcl'); if(x&&(x.hd||x.v<30)&&!/sugammadex 仿單不建議/.test(t)) return 'CrCl <30 sugammadex 未標不建議'; }
  return ''; }]);
if(!MODSEL.length||MODSEL.includes('tachy')) if(typeof A.nhiDoacCheck().ok==='undefined') outs.push(['noac',A.nhiDoacCheck,(t,h,o)=>{
  const age=num(o.age), x=A.rv?A.rv('crcl'):null, eg=A.rv?(x&&!x.hd?x.v:null):num(o.egfr), hd=!!(x&&x.hd), risk=o.hx_dm||o.t_htn||o.c_cad;
  const base=o.t_stroke||o.t_ef==='low'||o.hx_hf||(age!==null&&age>=75);
  const exp = !o.g_type && !hd && !(eg!==null&&eg<15) && (base||(age!==null&&age>=50&&age<75&&risk));
  const got=/rivaroxaban（2\.1\.4\.2）： ✔ 符合/.test(t);
  return exp!==got? `rivaroxaban 判定 ${got} ≠ 預期 ${exp}`:''; }]);
for(const [lab,fn] of [['score',A.scoreBox],['red',A.redBanner],['abg',A.abgRes],['gcs',A.gcsBox],['calc',A.calcPanel]]) if(!MODSEL.length) outs.push([lab,fn,()=> '']);
// 藥物頁：有腎功能資料時，每個有腎功能列的藥恰好一個 ▶；沒有資料時不可出現 ▶
if(!MODSEL.length||MODSEL.includes('drug')) outs.push(['drugs',()=>{ A.S.dflt='all'; return A.renderDrugs(); },(t,h,o)=>{
  if(!A.renPick) return '';
  const cards=h.split('<div class="card drug">').slice(1);
  for(const c of cards){ if(!/<div class="k">腎功能<\/div>/.test(c)) continue;
    const n=(c.match(/▶/g)||[]).length, name=(c.match(/<h3>([^<]*)/)||[])[1];
    const known=!!A.rv('crcl')||!!A.rv('scr');
    if(n>1) return name+' 多個 ▶';
    if(!known&&n) return name+' 無腎功能資料卻標 ▶'; }
  return ''; }]);

for(let i=0;i<N;i++){
  const o={}; for(const f of Object.keys(F)) o[f]=rnd(f);
  set(o); const g=A.gcsCalc(); if(g!==null) A.S.gcs=g;
  for(const [lab,fn,inv] of outs){
    let h; try{ h=fn(); }catch(e){ fail(lab+' | EXC '+e.message,o); continue; }
    n++; const t=txt(h);
    const b=t.match(new RegExp('.{0,40}('+BAD.source+').{0,30}')); if(b){ fail(lab+' | BAD '+b[0].replace(/[\d.]+/g,'#'),o); continue; }
    const e=inv(t,h,o); if(e) fail(lab+' | '+e.replace(/[\d.]+/g,'#'),o);
  }
}
const keys=Object.keys(fails);
console.log(`FUZZ ${n} 次輸出，${keys.length} 種失敗`);
for(const k of keys.sort((a,b)=>fails[b].length-fails[a].length).slice(0,25)){
  const ex=fails[k][0]; const short=Object.fromEntries(Object.entries(ex).filter(([f,v])=>v!==null&&v!==''&&v!==false));
  console.log(`  ${fails[k].length}× ${k}\n     例：${JSON.stringify(short).slice(0,260)}`);
}
process.exitCode=keys.length?1:0;
