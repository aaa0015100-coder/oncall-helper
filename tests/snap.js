// 快照：固定情境下所有 render 函式的文字輸出。node tests/snap.js [index.html] [out]
// 只改外觀時，前後版本快照必須完全相同（Changelog／版本號除外）。
const fs=require('fs'),path=require('path');
const {A,set,txt}=require('./harness')(process.argv[2]);
const out=process.argv[3]||path.join(__dirname,'snap.txt');
const SC={
  empty:{},
  stableOld:{age:82,sex:"M",wt:60,egfr:35,vs_ok:true,hx_copd:true,hx_hcrf:true,med_opioid:true},
  shock:{age:67,sex:"F",wt:55,hr:128,sbp:78,rr:28,spo2:88,o2:"o2",o2_dev:"nc",temp:38.9,gcs:13,lac:4.6,cr:2.1,k:6.4,na:128,glu:420,ph:7.12,pco2:30,hco3:9,cl:98,
    f_line:true,f_resp:true,d_wob:true,d_crackle:true,u_foley:"y",uo:20,uo_h:6,b_perit:true,ecg:"stemi",trop:"rise"},
  hypercap:{age:74,sex:"M",wt:70,hr:104,sbp:150,rr:32,spo2:84,o2:"o2",o2_dev:"venturi",fio2:35,ph:7.25,pco2:72,hco3:30,hx_copd:true,hx_hcrf:true,d_wheeze:true,gcs:12,dnr:"dni"},
  bleed:{age:58,sex:"M",wt:72,hr:118,sbp:92,hb:6.8,plt:45,inr:2.4,bun:60,med_ac:"warf",hx_cirr:true,bili:3,alb:2.6},
};
const L=[];
const add=(lab,f)=>{ let h; try{h=f();}catch(e){h="EXC "+e.message;} L.push("## "+lab+"\n"+txt(h)); };
add("panels",()=>{ set({}); const P=A.buildPanels(); return Object.keys(P).sort().map(k=>"["+k+"] "+P[k]).join("\n"); });
for(const [n,o] of Object.entries(SC)){
  set(o); try{ const g=A.gcsCalc(); if(g!==null){A.S.gcs=g;} }catch(e){}
  add(n+" score",A.scoreBox); add(n+" redBanner",A.redBanner); add(n+" abg",A.abgRes); add(n+" gcsBox",A.gcsBox);
  for(const m of A.MODS){ add(n+" "+m.id,()=>A.hypoX(m.id)+A.o2X(m.id)+m.r()); if(m.lab) add(n+" "+m.id+" lab",m.lab); }
  add(n+" rsi",A.rsiCard); add(n+" calc",A.calcPanel); add(n+" drugs",A.renderDrugs); // sbarText 需 DOM，由 e2e 檢查
}
add("ref",A.renderRefPanel);
fs.writeFileSync(out,L.join("\n\n")+"\n");
const bad=L.filter(x=>/\bundefined\b|\bNaN\b|\[object|EXC /.test(x)).map(x=>x.split("\n")[0]);
console.log("SNAP "+L.length+" blocks → "+path.basename(out)+(bad.length?"  BAD in: "+bad.join(", "):""));
