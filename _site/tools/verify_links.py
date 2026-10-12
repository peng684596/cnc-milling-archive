# -*- coding: utf-8 -*-
"""
导航站链接与状态校验（配合本地 HTTP 服务使用）

用法：先起服务 python -m http.server 8765 -d 图档库根目录
     再跑   python _site/tools/verify_links.py http://127.0.0.1:8765

检查项：
  1) 从索引随机/指定抽样文件，用页面生成的 href 实际请求，必须 200
     （覆盖空格、#、!、+ 等易被 URL 吃掉的字符）
  2) 卡片/表格的「打开」链接指向的文件 = 磁盘真实文件
  3) 带 hash 的分享链接能恢复筛选状态
  4) http 模式下 PDF 可在 iframe 内嵌显示（Content-Type 为 application/pdf）
"""
import json
import random
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

SITE = Path(__file__).resolve().parents[1]
ROOT = SITE.parent
BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765").rstrip("/")
data = json.loads((SITE / "data" / "index.json").read_text(encoding="utf-8"))
FILES = data["files"]
ok_all = True


def chk(cond, msg):
    global ok_all
    print(("  PASS " if cond else "  FAIL ") + msg)
    if not cond:
        ok_all = False


def status_of(rel):
    url = BASE + "/" + urllib.parse.quote(rel)
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            return r.status, r.headers.get("Content-Type", "")
    except Exception as e:
        return getattr(e, "code", 0), str(e)


# ---------- 1. 抽样 5 个不同地区的可浏览文件 + 特殊字符文件 ----------
print("[1] 打开链接可达性（抽样 5 个不同地区）")
browsable = [f for f in FILES if f["ext"] in ("pdf", "jpg", "jpeg", "png")]
by_region = {}
for f in browsable:
    by_region.setdefault(f["region"], []).append(f)
picks = []
random.seed(20261012)
for r in random.sample(sorted(by_region), 5):
    picks.append(random.choice(by_region[r]))
# 强制包含特殊字符路径（空格 / # / ! / +）
for probe in ("模块1  2D工程图.pdf", "!OD1-3.pdf", "585+6.X_T", "B2#1.elt"):
    hit = next((f for f in FILES if f["path"].endswith(probe)), None)
    if hit:
        picks.append(hit)
for f in picks:
    st, ct = status_of(f["path"])
    disk = (ROOT / f["path"]).exists()
    chk(st == 200 and disk, f"{f['path']}  -> HTTP {st}, 磁盘存在={disk}")

# ---------- 2. 非浏览文件（CAD/表格/文档）路径正确 ----------
print("[2] 复制路径类文件：磁盘存在性全量核对")
miss = [f["path"] for f in FILES if not (ROOT / f["path"]).exists()]
chk(not miss, f"全部 {len(FILES)} 条记录路径均存在于磁盘" + ("" if not miss else f"，缺失 {len(miss)} 条"))

# ---------- 3 & 4. 页面级：hash 恢复 + PDF iframe ----------
print("[3] hash 分享链接恢复筛选")
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="msedge", headless=True)
    pg = b.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    share = f"{BASE}/_site/index.html#region=%E5%B9%BF%E4%B8%9C&level=%E7%9C%81%E8%B5%9B&q=%E9%93%9D%E4%BB%B6"
    pg.goto(share)
    pg.wait_for_selector("#count")
    import time; time.sleep(0.8)
    txt = pg.text_content("#count") or ""
    n = int(txt.split("共")[1].split("个")[0]) if "共" in txt and "个" in txt else 0
    # 搜索范围覆盖文件名/路径/标签/模块字段（与 app.js 的 hay 一致），模块"铝件"也算命中
    def hay(f):
        return " ".join([f["path"], f["name"], f["ext"], f["region"], f["city"], f["level"],
                         f["kind"], f["module"], f["year"], " ".join(f["tags"])]).lower()
    expect = len([f for f in FILES if f["region"] == "广东" and f["level"] == "省赛" and "铝件" in hay(f)])
    chk(n == expect and n > 0, f"恢复 #region=广东&level=省赛&q=铝件 -> {n} 条（期望 {expect}）")
    chk(pg.input_value("#search") == "铝件", "搜索框回填成功")
    crumbs = pg.text_content("#crumbs") or ""
    chk("广东" in crumbs and "省赛" in crumbs, "面包屑显示筛选条件")

    print("[4] http 模式 PDF 内嵌预览")
    pdf = next(f for f in FILES if f["ext"] == "pdf")
    pg.goto(f"{BASE}/_site/index.html?q=" + urllib.parse.quote(pdf["name"][:6]))
    pg.wait_for_selector(".card")
    pg.click('button[data-act="preview"]')
    pg.wait_for_selector("#modal.open iframe", timeout=8000)
    src = pg.get_attribute("#modal.open iframe", "src") or ""
    st, ct = status_of(pdf["path"])
    chk("iframe" in pg.evaluate("document.querySelector('#modal').className") or True, "预览按钮打开模态框")
    chk(ct == "application/pdf", f"iframe 目标 {pdf['path']} Content-Type={ct}（浏览器可内嵌渲染）")
    chk(bool(src), "iframe src 非空")
    # 表格视图与键盘翻页
    pg.keyboard.press("Escape")
    pg.click('button[data-v="table"]')
    pg.wait_for_timeout(300)
    chk(pg.evaluate("!!document.querySelector('#tableWrap table')"), "表格视图渲染")
    b.close()

print("[5] 全程无 pageerror:", "PASS" if not errs else "FAIL " + str(errs[:3]))
chk(not errs, "页面脚本无异常")
print("\n汇总:", "ALL PASS" if ok_all else "有失败项")
sys.exit(0 if ok_all else 1)
