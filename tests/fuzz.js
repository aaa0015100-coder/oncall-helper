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
  inr:[0.9,9],plt:[5,600],wbc:[0.2,60],anc:[0,30],bili:[0.2,30],uo:[0,1500],uo_h:[1,24],ne:[0.01,1.5],mg:[0.5,5],phos:[0.5,9],sosm:[220,380],uosm:[50,1200],una:[5,200],na_prev:[105,175],na_h:[1,48],o2_flow:[1,60],
  an_tryp:[1,120],an_tryb:[1,30],sy_lsbp:[60,220],sy_ldbp:[30,120],sy_lhr:[30,160],sy_ssbp:[50,220],sy_sdbp:[25,120],sy_shr:[30,180]};
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
    // v1.0 過敏反應
    if(m.id==='ana'){ const w=num(o.wt); const d=(t.match(/epinephrine ([\d.]+) mg IM/)||[])[1];
      if(d&&+d>0.5) return 'epinephrine IM >0.5 mg';
      if(d&&w!==null&&w<50&&Math.abs(+d-Math.round(w)/100)>0.011) return 'epinephrine 未依體重 '+d;
      const sbp=num(o.sbp), hyp=(sbp!==null&&sbp<90)||o.an_cv, c1=o.an_skin&&(o.an_resp||hyp||o.an_gi), c2=o.an_expo&&(hyp||o.an_resp);
      if(/符合條件/.test(t)!==!!(c1||c2)) return 'WAO 判定不一致';
      if(o.an_epi==='3'&&/觀察時間/.test(t)&&!/至少 12 小時/.test(t)) return '>2 劑未列 12 小時';
      if(/Refractory anaphylaxis（/.test(t)&&!(+o.an_epi>=2&&o.an_persist&&!o.an_resolved)) return 'refractory 條件錯';
      if(/目前僅皮膚黏膜症狀/.test(t)&&(o.an_resp||hyp||o.an_gi)) return '有全身症狀仍判僅皮膚'; }
    // v1.0 暈厥
    if(m.id==='syn'){ const maj=['sy_pain','sy_exert','sy_supine','sy_palp','sy_gib','sy_murmur','sy_shd','hx_hf','sy_e_isch','sy_e_avb','sy_e_brady','sy_e_bbb','sy_e_vt','sy_e_dev','sy_e_brug','sy_e_qt'].some(f=>o[f])||(num(o.sbp)!==null&&num(o.sbp)<90)||(num(o.hr)!==null&&num(o.hr)<40);
      if(maj&&!/高風險 ：早期密集評估/.test(t)) return '有主要高風險特徵未列高風險';
      if(/低風險 ：多為反射性/.test(t)&&(maj||o.sy_bleed||o.sy_gib)) return '高風險或出血仍列低風險';
      const s1=num(o.sy_lsbp), s3=num(o.sy_ssbp); if(s1!==null&&s3!==null){ const oh=s1-s3>=20||s3<90||(num(o.sy_ldbp)!==null&&num(o.sy_sdbp)!==null&&num(o.sy_ldbp)-num(o.sy_sdbp)>=10); if(/符合 OH/.test(t)!==oh) return 'OH 判定錯'; } }
    // v1.0 抗血栓藥圍術期
    if(m.id==='peri'){ const urg=o.pe_when==='urgent', hiB=o.pe_bleed==='high'||o.pe_neur;
      if(urg&&/術前停 \d/.test(t)) return '急迫手術仍列術前停藥天數';
      if(/建議 bridging （高風險例外/.test(t)&&/不 bridging ：AF/.test(t)) return 'bridging 互斥';
      if(/Bridging：符合高風險例外/.test(t)&&!(o.pe_warf&&((o.pe_af&&(o.pe_strk3||A.chads().vasc>=7))||(o.pe_mhv&&(o.pe_mhvold||o.pe_strk3||o.pe_periTE||(o.pe_mhvpos==='mitral'&&o.pe_mhvrf)))||(o.pe_vte&&(o.pe_vtet==='lt3'||o.pe_thromS))))) return 'bridging 無例外條件';
      if(!urg&&o.pe_bleed){ for(const [f,n] of [['pe_apix','apixaban'],['pe_riva','rivaroxaban'],['pe_edox','edoxaban']]) if(o[f]){ const d=(t.match(new RegExp(n+' 術前停 (\\d) 天'))||[])[1]; if(o.pe_bleed!=='min'&&d!==(hiB?'2':'1')) return n+' 停藥天數錯 '+d; if(o.pe_bleed==='min'&&!o.pe_neur&&d) return '極低出血仍停 '+n; }
        if(o.pe_warf&&o.pe_bleed==='min'&&!o.pe_neur&&/warfarin 術前停/.test(t)) return '極低出血仍停 warfarin';
        if(o.pe_neur&&(o.pe_apix||o.pe_riva||o.pe_edox)&&!/≥72 小時（治療劑量）/.test(t)) return 'neuraxial 未列 ASRA 72 小時'; } }
    if(m.id!=='acls'){ const ns=[...h.matchAll(/class="st-n">(\d+)</g)].map(x=>+x[1]); for(let j=0;j<ns.length;j++) if(ns[j]!==j+1) return '步驟編號不連續 '+ns.join(','); }
    // 腎功能（v0.8）：rv() 不存在時（舊版）略過
    if(A.rv){ const x=A.rv('crcl'), sev=x&&(x.hd||x.v<30);
      if(sev&&/enoxaparin [\d.]+ mg SC q12h/.test(t)) return 'CrCl <30 或透析仍給 enoxaparin q12h';
      if(x&&!x.hd&&x.v>=30&&/enoxaparin [\d.]+ mg SC q24h/.test(t)) return 'CrCl ≥30 卻給 enoxaparin q24h';
      if(m.id==='ams'&&/levetiracetam [\d.]+ mg IV/.test(t)&&A.rv('egfr')&&!/之後 維持/.test(t)) return '有腎功能但未顯示 levetiracetam 維持劑量';
      if(m.id==='peri'&&x&&o.pe_dabi&&!x.hd&&(o.pe_bleed==='high'||o.pe_neur)&&o.pe_when!=='urgent'){ const d=(t.match(/dabigatran 術前停 (\S+) 天/)||[])[1]; if(d&&d!==(x.v>=50?'2':'4')) return 'dabigatran 高出血停藥天數錯 '+d; }
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
// v0.9 住院血糖、降壓藥（舊版無此函式時略過）
if(A.renderGluc&&(!MODSEL.length||MODSEL.includes('gluc'))) outs.push(['gluc',A.renderGluc,(t,h,o)=>{
  const c=A.glCtx(); const rc=A.rv('crcl'), age=num(o.age); const lowD=(age!==null&&age>=70)||!!(rc&&(rc.hd||rc.v<60));
  if(c.crisis&&/insulin glargine（長效）\d/.test(t)) return 'DKA／HHS 中仍給皮下 insulin 醫囑';
  // 明確醫囑：獨立計算 basal 劑量
  if(!c.crisis&&!c.homeIns&&c.wt!==null&&c.hi!==null&&c.hi>=180&&c.hi<=400&&o.gl_ster!=='am'&&(c.dm||(c.a1c!==null&&c.a1c>=6.5))){
    let tdd = o.gl_t1? 0.3*c.wt : (lowD? 0.3 : (c.hi>200?0.5:0.4))*c.wt; let bas = o.gl_t1? 0.15*c.wt : tdd/2;
    if(c.lo!==null&&c.lo<70){ tdd*=0.8; bas*=0.8; }
    const B=Math.max(1,Math.round(bas));
    if(!new RegExp('insulin glargine（長效）'+B+' U SC 每日一次').test(t)) return 'basal 醫囑劑量不符（預期 '+B+' U）';
    if((o.gl_eat===''||o.gl_eat==='eat')&&!/三餐\s*，隨餐或餐後立即給/.test(t)) return '進食者缺餐前 insulin 醫囑';
    if(o.gl_eat==='npo'&&/三餐\s*，隨餐或餐後立即給/.test(t)) return 'NPO 仍給餐前 insulin';
    if(o.gl_eat==='tfc'&&!/q4h.{0,40}管灌中斷即停/.test(t)) return '連續管灌缺營養 insulin q4h';
    if(!/矯正量表/.test(t)) return '缺矯正量表';
  }
  if(!c.crisis&&!c.homeIns&&o.gl_ster==='am'&&c.hi!==null&&c.hi>=180&&c.hi<=400&&!/NPH（中效）10 U SC 早上/.test(t)) return '早上類固醇缺 NPH 10 U 醫囑';
  if(!c.crisis&&!c.homeIns&&!o.gl_t1&&c.dm&&c.hi!==null&&c.hi>=140&&c.hi<180){
    const e=A.rv('egfr'); const d= e&&(e.hd||e.v<30)?25 : e&&e.v<45?50 : 100;
    if(!new RegExp('sitagliptin（DPP-4i）'+d+' mg PO 每日一次').test(t)) return 'sitagliptin 劑量與 eGFR 不符（預期 '+d+'）'; }
  if(c.lo!==null&&c.lo<70&&!/低血糖（<70）/.test(t)) return '低血糖未提示';
  if(!c.crisis&&c.wt!==null&&c.hi!==null&&c.hi>=180&&c.hi<=400&&!c.homeIns&&!o.gl_t1&&lowD&&!/0\.3 U\/kg：老人或腎功能不全/.test(t)) return '老人或腎功能不全未用 ≤0.3 U/kg';
  if(!c.crisis&&c.wt!==null&&c.hi!==null&&c.hi>=180&&c.hi<=400&&!c.homeIns&&!o.gl_t1&&!lowD&&/0\.3 U\/kg：老人或腎功能不全/.test(t)) return '非老人非腎差卻用 0.3';
  if(!c.crisis&&num(o.gm_tdd)>0&&!/沿用家中 insulin/.test(t)) return '有家中 insulin 未沿用';
  if(!c.crisis&&o.gm_met&&c.eg&&(c.eg.hd||c.eg.v<30)&&!/禁用/.test(t)) return 'eGFR <30／透析 metformin 未標禁用';
  if(!c.crisis&&o.h_sglt2&&o.sx_plan&&!/手術前至少 3 天停/.test(t)) return '預計手術 SGLT2i 未提示停藥';
  if(!c.crisis&&o.gl_t1&&!/NPO 時仍需 basal/.test(t)) return '第一型未提示不可停 basal';
  const ns=[...h.matchAll(/class="st-n">(\d+)</g)].map(x=>+x[1]); for(let j=0;j<ns.length;j++) if(ns[j]!==j+1) return '步驟編號不連續';
  return ''; }]);
if(A.renderBPmed&&(!MODSEL.length||MODSEL.includes('bpmed'))) outs.push(['bpmed',A.renderBPmed,(t,h,o)=>{
  const c=A.bpCtx();
  const K=c.cls||{ACEI:o.bp_acei,ARB:o.bp_arb,M:o.bp_mra};
  if(K.ACEI&&K.ARB&&!/ACEi ＋ ARB 同時使用：不建議/.test(t)) return 'ACEi＋ARB 未提示';
  if(o.bp_preg&&(K.ACEI||K.ARB||K.M)&&!/懷孕：停/.test(t)) return '懷孕用 RAAS 未提示停';
  if(A.bpOn){ // v0.9 具體藥物
    const on=A.bpOn(), k=num(o.k);
    for(const x of on){ const top = x.i>=x.d.st.length-1 || (x.d.id==='rami'&&c.lowCr&&x.i>=2);
      if(top&&new RegExp(x.d.lab.replace(' 口服','')+' '+x.d.st[x.i].replace(/[.]/g,'\\.')+' → ').test(t)) return x.d.id+' 已達上限仍建議增量'; }
    if(o.bp_preg&&/(Losartan|Ramipril|Spironolactone|Valsartan|Olmesartan) [\d.]+ mg PO/.test(t)) return '懷孕建議 RAAS／MRA';
    if(o.bp_gout&&/(Indapamide|Hydrochlorothiazide) [\d.]+ mg PO|Hydrochlorothiazide [\d.]+ mg QD → /.test(t)) return '痛風建議 thiazide';
    if(k!==null&&k>=5.5&&/(Losartan|Ramipril|Spironolactone) [\d.]+ mg PO|(Losartan|Valsartan|Olmesartan|Ramipril|Spironolactone) [\d.]+ mg QD → /.test(t)) return 'K ≥5.5 仍建議 RAAS／MRA';
    if(c.cls.D&&/Losartan 50 mg PO/.test(t)) return '已用利尿劑 losartan 未 25 mg 起始';
    if(c.lowCr&&/Ramipril 2\.5 mg PO/.test(t)) return 'CrCl <40 ramipril 未 1.25 mg 起始';
    if(c.hypot) for(const x of on) if(!new RegExp('暫停[^<]*'+x.d.lab.replace(' 口服','')).test(t)&&!/暫停 /.test(t)) return '低血壓未列出暫停藥名';
  }
  if(o.bp_preg&&/加 <b>(ACEi|ARB|CCB 或 thiazide)/.test(h)) return '懷孕仍建議加 ACEi／ARB';
  if(c.hypot&&!/暫停降壓藥|如有使用降壓藥：暫停|低血壓（[^）]*）：暫停 /.test(t)) return '低血壓未提示暫停';
  if(c.hypot&&/不追加 PRN/.test(t)) return '低血壓仍出現血壓偏高建議';
  if(c.emerg&&/不追加 PRN/.test(t)) return '急症卻給非急症建議';
  const ns=[...h.matchAll(/class="st-n">(\d+)</g)].map(x=>+x[1]); for(let j=0;j<ns.length;j++) if(ns[j]!==j+1) return '步驟編號不連續';
  return ''; }]);
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
  // 30% 回合偏向住院血糖情境（糖尿病、血糖 140–400、有體重），提高血糖模組覆蓋
  if(Math.random()<.3&&F.gl_hi){ o.hx_dm=Math.random()<.85; o.gl_hi=Math.round(140+Math.random()*260); if(o.wt===null) o.wt=Math.round(45+Math.random()*60); if(Math.random()<.5) o.gm_tdd=null; }
  // 另 25% 回合偏向住院高血壓用藥情境（BP 偏高、選 2 種平時用藥、K 與 AKI 多數正常），提高 bpmed 覆蓋
  else if(Math.random()<.25&&F.bpd_amlo){ o.sbp=Math.round(140+Math.random()*60); o.dbp=Math.round(70+Math.random()*40); if(Math.random()<.7) o.bp_aki=false; if(Math.random()<.7) o.k=+(3.5+Math.random()*1.4).toFixed(1);
    const bf=Object.keys(F).filter(f=>f.startsWith('bpd_')); for(const f of bf) o[f]=''; if(Math.random()<.3){ o.cr=+(2.5+Math.random()*3).toFixed(1); o.age=Math.round(60+Math.random()*30); o.wt=Math.round(45+Math.random()*30); }
    for(let j=0;j<2;j++){ const f=pick(bf); o[f]=pick(F[f].v.filter(Boolean)); } }
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
  console.log(`  ${fails[k].length}× ${k}\n     例：${JSON.stringify(short).slice(0,process.env.FULL?99999:260)}`);
}
process.exitCode=keys.length?1:0;
