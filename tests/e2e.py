# 瀏覽器測試。python3 tests/e2e.py [index.html] [--full] [--tab=id,id] [--shots=dir]
# 快速模式：390 深淺色＋1280，每個分頁開啟 → 無橫向溢出、無 undefined/NaN、#ov 可開；console 0 錯誤
# 完整模式：320/390/768/1280；指定分頁（或 --full 全部）每個 select 選項、checkbox、數字欄位都操作一次
import sys, os, pathlib
from playwright.sync_api import sync_playwright
args=[a for a in sys.argv[1:] if not a.startswith("--")]
FILE=pathlib.Path(args[0] if args else pathlib.Path(__file__).parent.parent/"index.html").resolve()
FULL="--full" in sys.argv
TABSEL=next((a.split("=",1)[1].split(",") for a in sys.argv if a.startswith("--tab=")),None)
SHOTS=next((a.split("=",1)[1] for a in sys.argv if a.startswith("--shots=")),None)
WIDTHS=[320,390,768,1280] if (FULL or "--wide" in sys.argv) else [390,1280]
errs=[];issues=[]
BADJS="(()=>{const t=document.body.innerText;const m=t.match(/.{0,30}(\\bundefined\\b|\\bNaN\\b|\\[object|Infinity).{0,30}/);return m?m[0]:''})()"
def go(pg,t):
    # v1.1：手機版頂部分頁列隱藏（改「目前主訴 ▾」＋最近），一律用與點選相同的 goTab()
    pg.evaluate(f"goTab('{t}')")
def chk(pg,W,where):
    sw=pg.evaluate("document.documentElement.scrollWidth")
    if sw>W: 
        wide=pg.evaluate(f"""[...document.querySelectorAll('body *')].filter(e=>{{const r=e.getBoundingClientRect();return r.right>{W}+1&&r.width>0&&!e.closest('.tscroll,.tbl-wrap,nav.tabs')}}).slice(0,3).map(e=>e.tagName+'.'+e.className)""")
        issues.append(f"{W} {where}: scrollWidth {sw} {wide}")
    b=pg.evaluate(BADJS)
    if b: issues.append(f"{W} {where}: 文字 {b}")
with sync_playwright() as p:
    br=p.chromium.launch()
    for W in WIDTHS:
        for scheme in (["light","dark"] if W in (390,) or FULL else ["light"]):
            pg=br.new_page(viewport={"width":W,"height":800},color_scheme=scheme)
            pg.on("pageerror",lambda e,W=W:errs.append(f"{W}:{e}"))
            pg.on("console",lambda m,W=W:errs.append(f"{W}:{m.text}") if m.type=="error" else None)
            pg.on("request",lambda r:issues.append("網路請求 "+r.url) if not r.url.startswith(("file:","data:","about:")) else None)
            pg.goto(FILE.as_uri()); pg.wait_for_timeout(200)
            tabs=pg.eval_on_selector_all("#tabs [data-tab]","e=>e.map(x=>x.dataset.tab)")
            for t in tabs:
                go(pg,t); pg.wait_for_timeout(40)
                chk(pg,W,t)
                if (FULL or (TABSEL and t in TABSEL)) and W==390:
                    sel=f"#p-{t}"
                    pg.evaluate("document.querySelectorAll('.card.col').forEach(c=>c.classList.remove('col'))")  # v1.0：先展開收合的輸入卡
                    for d in pg.query_selector_all(sel+" details"): 
                        try: d.evaluate("e=>e.open=true")
                        except: pass
                    for i in range(len(pg.query_selector_all(sel+" select[data-f]"))):
                        s=pg.query_selector_all(sel+" select[data-f]")[i]
                        vals=s.evaluate("e=>[...e.options].map(o=>o.value)")
                        for v in vals:
                            try: pg.query_selector_all(sel+" select[data-f]")[i].select_option(v)
                            except Exception as e: pass
                        chk(pg,W,f"{t} select{i}")
                    for i in range(len(pg.query_selector_all(sel+" input[type=checkbox][data-f]"))):
                        try: pg.query_selector_all(sel+" input[type=checkbox][data-f]")[i].check()
                        except: pass
                    chk(pg,W,f"{t} 全勾")
                    for d in pg.query_selector_all(sel+" details"):
                        try: d.evaluate("e=>e.open=true")
                        except: pass
                    chk(pg,W,f"{t} 展開")
                if SHOTS and W in (390,1280) and t in ("dysp","hypo","acls","calc"):
                    os.makedirs(SHOTS,exist_ok=True); pg.screenshot(path=f"{SHOTS}/{W}_{scheme}_{t}.png",full_page=False)
            # 彈出層：.src / .upd / abbr 各 1 個
            go(pg,"dysp")
            for s in [".panel.on .src",".panel.on .upd","#panels abbr.gl"]:
                el=pg.query_selector(s) if s!=".panel.on .upd" else (pg.query_selector(".panel.on .upd") or pg.query_selector(".upd"))
                if not el: issues.append(f"{W} 找不到 {s}"); continue
                if not el.is_visible():
                    tab=el.evaluate("e=>{const p=e.closest('.panel');return p?p.id.slice(2):null}")
                    if tab: go(pg,tab)
                    el.evaluate("e=>{let d=e.closest('details');while(d){d.open=true;d=d.parentElement.closest('details')}}")
                el.click(); pg.wait_for_timeout(30)
                if not pg.evaluate("document.getElementById('ov').classList.contains('on') && document.getElementById('ovBox').innerText.trim().length>5"):
                    issues.append(f"{W} {s} 點擊後 #ov 無內容")
                pg.keyboard.press("Escape")
            if W==390 and scheme=="light":
                # v1.0 介面：收合、跳到建議、搜尋、清除後復原、跨頁同步
                pg.goto(FILE.as_uri()); pg.wait_for_timeout(150)
                pg.fill('#p-dysp [data-f="hr"]','121'); pg.click('#bbMenu'); pg.click('#ovBox [data-tab="hk"]'); pg.wait_for_timeout(60)
                if pg.input_value('#p-hk [data-f="hr"]')!="121": issues.append("跨頁同步失敗")
                if not pg.evaluate("document.querySelector('#p-hk .card.icard').classList.contains('col')"): issues.append("已填病人資料換頁未自動收合")
                if "HR" not in pg.inner_text('#p-hk .card.icard .isum'): issues.append("收合摘要缺 HR")
                pg.click('#bbJump'); pg.wait_for_timeout(60)
                if pg.evaluate("Math.abs(document.querySelector('#p-hk .card>h2').getBoundingClientRect().top-110)")>40: issues.append("跳到建議位置錯")
                pg.click('#bbSearch'); pg.fill('#sq','k'); pg.wait_for_timeout(40)
                if "高血鉀" not in pg.inner_text('#sres'): issues.append("搜尋 k 未找到高血鉀")
                pg.fill('#sq','bridging'); pg.wait_for_timeout(40); pg.click('#sres button'); pg.wait_for_timeout(60)
                if pg.evaluate("curTab()")!="peri": issues.append("搜尋 bridging 未跳到抗血栓藥頁")
                pg.click('#bbClear'); pg.wait_for_timeout(40)
                if pg.evaluate("S.hr")is not None: issues.append("清除後 HR 未清空")
                pg.click('#undoBtn'); pg.wait_for_timeout(40)
                if pg.evaluate("S.hr")!=121: issues.append("復原失敗")
                for _ in range(3): pg.click("#themeBtn")
                if pg.evaluate("document.documentElement.dataset.theme||'auto'")!="auto": issues.append("主題切換 3 次後不是自動")
                # v1.1：結論卡、手機主訴列、網址 hash、免責收合
                pg.goto(FILE.as_uri()); pg.wait_for_timeout(150)
                for t in pg.evaluate("MODS.map(m=>m.id).filter(x=>!COL_SKIP.has(x))"):
                    go(pg,t); pg.wait_for_timeout(20)
                    if not pg.query_selector(f"#p-{t} > #r-cc-{t} .concl, #p-{t} .pmain > #r-cc-{t} .concl"): issues.append(f"{t} 無結論卡")
                    if pg.evaluate(f"document.querySelector('#p-{t}').firstElementChild.id")!=f"r-cc-{t}": issues.append(f"{t} 結論卡不在最上方")
                go(pg,"hypo"); pg.wait_for_timeout(30)
                pg.fill('#p-hypo [data-f="sbp"]','78'); pg.wait_for_timeout(30)
                if "紅旗" not in pg.inner_text("#r-cc-hypo"): issues.append("SBP 78 結論卡未列紅旗")
                pg.click('#r-cc-hypo [data-cj="rf"]'); pg.wait_for_timeout(40)
                if abs(pg.evaluate("document.getElementById('r-rf-hypo').getBoundingClientRect().top")-110)>40: issues.append("結論卡紅旗未跳到紅框")
                b=pg.query_selector('#r-cc-hypo [data-cj^="st:"]')
                if b: b.click(); pg.wait_for_timeout(40)
                else: issues.append("結論卡無可跳轉的步驟")
                if not pg.is_visible("#ccCur"): issues.append("手機未顯示目前主訴鈕")
                if pg.is_visible("#tabs"): issues.append("手機仍顯示頂部分頁列")
                if "低血壓" not in pg.inner_text("#ccCur"): issues.append("目前主訴鈕文字錯")
                go(pg,"hk"); pg.wait_for_timeout(30)
                if not pg.query_selector('#ccbar [data-tab="hypo"]'): issues.append("最近主訴未列低血壓")
                pg.click('#ccbar [data-tab="hypo"]'); pg.wait_for_timeout(30)
                if pg.evaluate("curTab()")!="hypo" or not pg.evaluate("location.hash")=="#hypo": issues.append("最近主訴點選或 hash 失敗")
                pg.click("#ccCur"); pg.wait_for_timeout(30)
                if not pg.evaluate("document.getElementById('ov').classList.contains('on')"): issues.append("目前主訴鈕未開選單")
                pg.keyboard.press("Escape")
                pg.click("#discOk"); pg.wait_for_timeout(20)
                if pg.is_visible("#disc") or not pg.evaluate("!document.getElementById('discF').hidden"): issues.append("免責聲明收合失敗")
                pg.goto("about:blank"); pg.goto(FILE.as_uri()+"#peri"); pg.wait_for_timeout(150)
                if pg.evaluate("curTab()")!="peri": issues.append("網址 #peri 未開到抗血栓藥頁")
                if not pg.is_visible("#disc"): issues.append("重新整理後免責聲明應再出現")
                # 寬螢幕雙欄 ↔ 手機切換
                pg.set_viewport_size({"width":1280,"height":800}); pg.wait_for_timeout(60)
                if not pg.query_selector("#p-hypo .pcols .pside .card.shr"): issues.append("1280 未成雙欄")
                if pg.evaluate("document.querySelectorAll('#p-hypo .pside .card').length")<2: issues.append("1280 左欄卡片不足")
                pg.set_viewport_size({"width":390,"height":800}); pg.wait_for_timeout(60)
                if pg.query_selector("#p-hypo .pcols"): issues.append("回 390 仍為雙欄")
                if not pg.evaluate("document.querySelector('#p-hypo > .card').classList.contains('shr')"): issues.append("回 390 病人資料卡位置錯")
                chk(pg,390,"版面切換後")
            pg.close()
    br.close()
print("E2E", "OK" if not issues and not errs else "FAIL")
if issues: print("ISSUES",len(issues),"\n  "+"\n  ".join(issues[:40]))
if errs: print("ERRORS",len(errs),"\n  "+"\n  ".join(errs[:20]))
sys.exit(1 if issues or errs else 0)
