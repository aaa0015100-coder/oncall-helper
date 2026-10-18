// 用 node vm 載入 index.html 的純函式（不碰 DOM）。用法：const {A,set,txt}=require('./harness')(path)
const fs=require('fs'),vm=require('vm'),path=require('path');
module.exports=function(file){
  file=file||path.join(__dirname,'..','index.html');
  const html=fs.readFileSync(file,'utf8');
  const js=html.match(/<script>([\s\S]*)<\/script>/)[1];
  const ctx={console}; vm.createContext(ctx);
  const names=[...js.matchAll(/^function ([A-Za-z0-9_]+)/gm)].map(m=>m[1]);
  vm.runInContext(js+"\n;this.__api={S0,get S(){return S},set S(v){S=v},REF,MODS,TABS,APP_VERSION,CHECKED,"+names.join(",")+"};",ctx);
  const A=ctx.__api;
  const set=o=>{A.S=Object.assign(JSON.parse(JSON.stringify(A.S0)),o||{});};
  const txt=h=>String(h).replace(/<(\d)/g,"&lt;$1").replace(/<[^>]+>/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/\s+/g," ").trim();
  return {A,set,txt,html,js};
};
