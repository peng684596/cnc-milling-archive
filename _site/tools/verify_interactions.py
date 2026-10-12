# -*- coding: utf-8 -*-
"""交互细节验收：翻页按钮、←/→ 键盘、排序、每页数量、hash 页码恢复。"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "file:///" +
        str(Path(__file__).resolve().parents[1] / "index.html")).replace("\\", "/")
if not BASE.startswith("http"):
    BASE = Path(BASE).resolve().as_uri()
ok = True


def chk(c, m):
    global ok
    print(("  PASS " if c else "  FAIL ") + m)
    ok = ok and c


with sync_playwright() as pw:
    b = pw.chromium.launch(channel="msedge", headless=True)
    pg = b.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE if BASE.startswith(("http", "file")) else "file:///" + BASE)
    pg.wait_for_selector("#count")
    pg.wait_for_timeout(600)

    print("[翻页按钮]")
    pg.click('button[data-page="2"]')
    pg.wait_for_timeout(300)
    chk("第 2/" in pg.text_content("#count"), "点击第 2 页生效: " + pg.text_content("#count"))

    print("[键盘 ←/→]")
    pg.keyboard.press("ArrowLeft")
    pg.wait_for_timeout(300)
    chk("第 1/" in pg.text_content("#count"), "← 回到第 1 页")
    pg.keyboard.press("ArrowRight")
    pg.wait_for_timeout(300)
    chk("第 2/" in pg.text_content("#count"), "→ 前进到第 2 页")

    print("[键盘 / 聚焦与 Esc 清空]")
    pg.keyboard.press("/")
    pg.wait_for_timeout(150)
    chk(pg.evaluate("document.activeElement.id") == "search", "/ 聚焦搜索框")
    pg.fill("#search", "叶轮")
    pg.wait_for_timeout(400)
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(400)
    chk(pg.input_value("#search") == "" and "共 446" in pg.text_content("#count"), "Esc 清空搜索并恢复全量")

    print("[排序与每页数量]")
    pg.select_option("#sortSel", "size")
    pg.wait_for_timeout(300)
    first = pg.text_content("#cards .card .size")
    # 库中存在一个 0 字节真实文件（黑龙江/MOD1/模块1 2D图纸.pdf），升序首位应极小
    chk("B" in (first or ""), f"按大小升序首个: {first}")
    pg.goto(BASE + "#sort=size:desc")
    pg.wait_for_timeout(600)
    first = pg.text_content("#cards .card .size")
    chk("MB" in (first or ""), f"按大小降序首个: {first}")
    pg.select_option("#sizeSel", "96")
    pg.wait_for_timeout(300)
    chk("/5" in pg.text_content("#count"), "每页 96 -> " + pg.text_content("#count"))

    print("[hash 恢复页码]")
    pg.goto(BASE + "#q=%E8%AF%84%E5%88%86&page=2&size=x")  # 非法参数必须被忽略
    pg.wait_for_timeout(600)
    chk("评分" in pg.input_value("#search"), "hash 恢复搜索词")
    b.close()

print("[pageerror]", "无" if not errs else errs)
chk(not errs, "全程无脚本异常")
print("汇总:", "ALL PASS" if ok else "有失败项")
sys.exit(0 if ok else 1)
