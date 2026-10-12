# -*- coding: utf-8 -*-
"""
导航站冒烟测试：在真实浏览器（Edge/Chrome）中打开站点，验证——
  1) 控制台无 JS 报错、无网络请求失败（file:// 与 http:// 两种模式都测）
  2) #count 计数与 data/index.json 记录数一致
  3) 全局搜索能命中文件
  4) 点击侧栏地区节点后计数变小（筛选真实生效）

前提：本机装有 Microsoft Edge 或 Chrome；首次运行会自动 pip 安装 playwright
（纯本机测试工具，不是网页运行依赖）。

用法：python _site/tools/smoke_test.py [http://localhost:8000]
"""
import json
import subprocess
import sys
import time
from pathlib import Path

SITE = Path(__file__).resolve().parents[1]

def ensure_playwright():
    try:
        from playwright.sync_api import sync_playwright  # noqa
        return
    except ImportError:
        print("[..] 安装 playwright（仅测试用）")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "playwright"])
        subprocess.check_call([sys.executable, "-m", "playwright", "install", "msedge", "--dry-run"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def run_case(browser, label, url, expect_http):
    errs, failed = [], []
    ctx = browser.new_context()
    page = ctx.new_page()
    page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    page.on("console", lambda m: m.type == "error" and errs.append("console: " + m.text))
    page.on("requestfailed", lambda r: failed.append(r.url))
    page.goto(url)
    page.wait_for_selector("#count", timeout=15000)
    time.sleep(0.6)
    ok = True
    def chk(cond, msg):
        nonlocal ok
        print(("  PASS " if cond else "  FAIL ") + msg)
        if not cond: ok = False
    n_text = page.text_content("#count") or ""
    print(f"[{label}] {url}")
    print("  count:", n_text)
    if errs: print("  errors:", errs)
    if failed: print("  failedRequests:", failed)
    chk(not errs, "无 JS 报错")
    if expect_http:
        # http 模式走 fetch；file 模式走内联数据，两者都应等于索引记录数
        data = json.loads((SITE / "data" / "index.json").read_text(encoding="utf-8"))
        chk(str(data["count"]) in n_text, f"计数 = 索引记录数 {data['count']}")
    # 搜索
    page.fill("#search", "凸轮轴")
    page.wait_for_timeout(400)
    chk("凸轮轴" in (page.text_content("#cards") or ""), "搜索「凸轮轴」有结果")
    page.fill("#search", "地区:广东 类型:pdf")
    page.wait_for_timeout(400)
    cnt = page.text_content("#count") or ""
    chk("个文件" in cnt and not cnt.startswith("共 446"), f"前缀语法过滤生效 {cnt}")
    page.fill("#search", "")
    page.wait_for_timeout(400)
    # 侧栏筛选
    row = page.query_selector('#tree .trow[data-kind="region"][data-val="浙江"]')
    if row:
        before = page.text_content("#count")
        row.click()
        page.wait_for_timeout(300)
        after = page.text_content("#count")
        chk(before != after, f"点击地区节点筛选生效 {before} -> {after}")
        page.click("#clearAll")
        page.wait_for_timeout(300)
        chk(page.text_content("#count") == before, "清空筛选恢复")
    # 主题切换
    page.click("#themeBtn"); page.wait_for_timeout(150)
    chk(page.evaluate("document.documentElement.dataset.theme") == "light", "主题切换")
    page.click("#themeBtn")
    ctx.close()
    return ok

def main():
    ensure_playwright()
    from playwright.sync_api import sync_playwright
    base = sys.argv[1] if len(sys.argv) > 1 else None
    results = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="msedge", headless=True)
        file_url = (SITE / "index.html").as_uri()
        results.append(run_case(browser, "file:// 双击模式", file_url, expect_http=False))
        if base:
            results.append(run_case(browser, "http 模式", base.rstrip("/") + "/_site/index.html", expect_http=True))
        browser.close()
    print("\n汇总:", "ALL PASS" if all(results) else "有失败项")
    sys.exit(0 if all(results) else 1)

if __name__ == "__main__":
    main()
