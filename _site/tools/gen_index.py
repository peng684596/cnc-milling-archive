# -*- coding: utf-8 -*-
"""
数控铣竞赛图档库 —— 索引生成脚本（只读扫描，绝不改动原文件）

用法（在本库根目录或任意位置均可）：
    python _site/tools/gen_index.py
    python _site/tools/gen_index.py --root "D:\其他路径\图档库"

产出（均写在 <root>/_site/ 下）：
    data/index.json   前端 fetch 用的主数据
    assets/data.js    file:// 双击打开时 fetch 被禁的回退数据（window.__CNC_DATA__）
    data/review.csv   "未分类/待确认 + 通用机构"文件的待人工确认清单

重跑时机：新增/删除/改名文件后重跑一次即可，网页数据随之更新。

分类规则全部集中在本文件的规则表中（REGION_*、GENERIC_KEYS、KIND_* 等），
拿不准来源的新文件会被归入"未分类/待确认"而不是硬猜；确认来源后在
ROOT_FILE_RULES 或 TOP_DIR_MAP 里补一行映射再重跑即可。
"""

import argparse
import csv
import json
import re
import sys
import time
from pathlib import Path

SCHEMA_VERSION = 1

# ---------------------------------------------------------------- 地区映射 --
# 顶层目录名 -> (region, city)。city 为空表示区级（省/直辖市本级）。
TOP_DIR_MAP = {
    "上海": ("上海", ""),
    "云南": ("云南", ""),
    "北京1": ("北京", ""),
    "北京2": ("北京", ""),
    "吉林": ("吉林", ""),
    "吉林高职院校技能大赛": ("吉林", ""),
    "嘉兴组合": ("浙江", "嘉兴"),
    "天津": ("天津", ""),
    "宁夏": ("宁夏", ""),
    "山东": ("山东", ""),
    "山西": ("山西", ""),
    "广东1": ("广东", ""),
    "广东2": ("广东", ""),
    "广东3": ("广东", ""),
    "广西": ("广西", ""),
    "无锡市组合试题": ("江苏", "无锡"),
    "江苏1": ("江苏", ""),
    "江苏2": ("江苏", ""),
    "江苏省技能大赛 学生": ("江苏", ""),
    "江苏省技能大赛 教师组": ("江苏", ""),
    "河北1": ("河北", ""),
    "河北2": ("河北", ""),
    "河南": ("河南", ""),
    "浙江1": ("浙江", ""),
    "浙江2": ("浙江", ""),
    "浙江省教师大赛": ("浙江", ""),
    "浙江省教师组合-格式全": ("浙江", ""),
    "浙江省赛实体": ("浙江", ""),
    "海南": ("海南", ""),
    "湖南": ("湖南", ""),
    "湖州市": ("浙江", "湖州"),
    "湖州市综合": ("浙江", "湖州"),
    "贵州": ("贵州", ""),
    "重庆市-带CAD图片": ("重庆", ""),
    "陕西": ("陕西", ""),
    "黑龙江": ("黑龙江", ""),
}

# 根目录散落文件：文件名片段 -> (region, city, level)。按表序命中第一个。
# 用户已确认的判断都写在这里；level 取值见 LEVELS。
ROOT_FILE_RULES = [
    ("绍兴", "浙江", "绍兴", "市赛"),
    ("宁波市职校", "浙江", "宁波", "市赛"),
    ("北京市中职", "北京", "", "市赛"),
    ("2014教师组比赛单件", "北京", "", "市赛"),
    ("徐州市职业技能大赛", "江苏", "徐州", "市赛"),
    ("2017年江苏省单件", "江苏", "", "省赛"),
    ("45届 福建选拔赛", "福建", "", "世界技能大赛"),
    ("46届 山东选拔赛", "山东", "", "世界技能大赛"),
    ("46届山东选拔赛2", "山东", "", "世界技能大赛"),
    ("46届广西选拔赛", "广西", "", "世界技能大赛"),
    ("45届 全国机械行业选拔赛", "", "", "国赛"),
    ("海峡两岸", "跨地区", "", "未知"),
]
# 全国机械行业选拔赛的 region 特殊值：
ROOT_RULE_REGION_OVERRIDE = {"45届 全国机械行业选拔赛": "国赛"}

# 通用机构/单件题库关键词（根目录散件，按"通用"归类，机构名保留为 tag）
GENERIC_KEYS = [
    "万向节", "三爪", "千斤顶", "压印机", "内齿轮啮合", "手动折弯机",
    "摇杆机构", "机械手臂", "榨汁机", "坦克车", "电动刀架", "翻斗车",
    "虎钳", "风车", "飞机", "车铣组合模拟试题",
]

# 根目录"未分类/待确认"显式清单（纯编号/系列样题，名字无法判断来源）。
UNCLASSIFIED_NAMES_EXPLICIT = [
    "1 (2).pdf", "1-19.pdf", "1.pdf", "10.pdf", "2 (2).pdf", "2-18未加工.pdf",
    "2.pdf", "3 (2).pdf", "3.pdf", "4 (2).pdf", "4.pdf", "5.pdf", "6.pdf",
    "7.pdf", "8.pdf", "9.pdf", "M1-07.pdf", "M2-07.pdf", "MOD1-104.pdf",
    "MOD1-107.pdf", "MOD1_104A.pdf", "MOD1_111A.pdf", "MOD1_114A.pdf",
    "MOD2_101A.pdf", "MOD2_104.pdf",
]

# 未分类记录的展示分组（前端"未分类/待确认"区按组头排布）
def ungrouped_group(stem: str) -> str:
    if re.match(r"^\d{4}-\d{2}-\d", stem):
        return "2012-07 系列（15 个，疑为成套样题）"
    if stem.startswith("MOD") or re.match(r"^M\d", stem):
        return "MOD / M 系列（9 个）"
    if re.match(r"^\d+$", stem):
        return "数字系列 1~10（10 个）"
    if re.match(r"^\d \(2\)$", stem):
        return "数字系列 1(2)~4(2)（4 个）"
    if re.match(r"^\d-\d+", stem):
        return "编号散件（1-19 / 2-18未加工）"
    return "其他待确认"

# ---------------------------------------------------------------- 行政大区 --
MACRO_REGIONS = [
    ("华北", ["北京", "天津", "河北", "山西", "内蒙古"]),
    ("东北", ["黑龙江", "吉林", "辽宁"]),
    ("华东", ["上海", "江苏", "浙江", "山东", "福建", "安徽", "江西"]),
    ("华中", ["河南", "湖南", "湖北"]),
    ("华南", ["广东", "广西", "海南"]),
    ("西南", ["重庆", "四川", "贵州", "云南"]),
    ("西北", ["陕西", "宁夏", "甘肃", "新疆"]),
    ("跨地区 / 通用 / 未分类", ["跨地区", "通用", "未分类", "国赛"]),
]

LEVELS = ["世界技能大赛", "国赛", "行业赛", "省赛", "市赛", "校赛", "未知"]

# 市级目录（region 下再分 city）；这些 region 默认层级为市赛
MUNICIPALITY_CITY = {"上海", "北京", "天津", "重庆"}

PROVINCE_NAMES = {"云南", "吉林", "天津", "宁夏", "山东", "山西", "广东", "广西",
                  "江苏", "河北", "河南", "浙江", "海南", "湖南", "贵州", "陕西",
                  "黑龙江", "北京", "上海", "重庆"}

# ---------------------------------------------------------------- 模块识别 --
# 统一识别式：目录段与文件名共用。
# 注意中文文件名里 \b 不可靠（CJK 属于 \w），改用数字前瞻/后顾。
MOD1_RX = re.compile(
    r"(?i)(?:mod[_-]?1|m[_-]?0?1(?![a-z0-9])|模块\s*[_-]?1(?![\d])|模块一|铝件)")
MOD2_RX = re.compile(
    r"(?i)(?:mod[_-]?2|m[_-]?0?2(?![a-z0-9])|模块\s*[_-]?2(?![\d])|模块二|钢件)")
COMBO_RX = re.compile(r"组合|综合")   # 组合件/车铣综合类
SINGLE_RX = re.compile(r"单件")

# 显式目录覆盖：证据是同目录下成对出现的 !OD1-3 / !OD2-2（即 MOD1-3 / MOD2-2，
# 首字母 M 被 OCR 成 "!"），故判断 -1- 为模块一、-2- 为模块二。命中时打 tag 供人工复核。
DIR_OVERRIDES = {
    "广东3/XIE2013-1-3": ("模块一/MOD1/铝件", "按目录编号推断"),
    "广东3/XIE2013-2-2": ("模块二/MOD2/钢件", "按目录编号推断"),
}

# ---------------------------------------------------------------- 类型识别 --
# 文件名关键词 -> kind，按序命中第一个（.pdf 兜底为二维工程图）
KIND_NAME_RULES = [
    (re.compile(r"图纸|工程图"), "二维工程图"),
    (re.compile(r"评分表|评分标准|检测表|检验|检测|评分"), "评分表"),
    (re.compile(r"相符性说明|打印说明|使用说明"), "说明文档"),
    (re.compile(r"任务书|样题|试题|技术要求|标准$"), "任务书/试题说明"),
    (re.compile(r"装配"), "装配图"),
    (re.compile(r"备料|工艺|过程卡片|工序卡片"), "备料/工艺卡"),
]

EXT_2D_CAD = {".exb", ".dwg"}
EXT_3D_CAD = {".ics", ".mxe", ".prt", ".stp", ".step", ".igs", ".iges",
              ".x_t", ".x-t", ".elt"}
EXT_DOC = {".doc", ".docx", ".rtf", ".txt"}
EXT_SHEET = {".xls", ".xlsx"}
EXT_IMG = {".jpg", ".jpeg", ".png"}
EXT_ARCHIVE = {".zip", ".rar", ".7z"}

EXT_LABEL = {
    ".pdf": "PDF 文档", ".exb": "CAXA 二维图纸", ".dwg": "AutoCAD 图纸",
    ".ics": "ICS 三维模型", ".mxe": "MESIM 仿真工程", ".prt": "UG/NX 零件",
    ".stp": "STEP 三维交换", ".step": "STEP 三维交换", ".igs": "IGES 交换",
    ".iges": "IGES 交换", ".x_t": "Parasolid 三维", ".x-t": "Parasolid 三维",
    ".elt": "MicroStation 设计", ".bak": "CAD 备份文件", ".jpg": "图片",
    ".jpeg": "图片", ".png": "图片", ".xls": "Excel 表格",
    ".xlsx": "Excel 表格", ".doc": "Word 文档", ".docx": "Word 文档",
    ".rtf": "RTF 文档", ".txt": "纯文本", ".zip": "ZIP 压缩包",
    ".rar": "RAR 压缩包", ".7z": "7z 压缩包", "": "无扩展名",
}

# ---------------------------------------------------------------- 标签识别 --
TAG_KEYS = ["选拔赛", "样题", "试题", "模拟", "教师组", "学生组", "院校组",
            "组合件", "单件", "车铣", "全国", "世赛", "世界技能大赛",
            "格式化", "实体", "仿真"]

# ---------------------------------------------------------------- 工具函数 --
def norm_rel(p: Path, root: Path) -> str:
    """相对路径，/ 分隔，UTF-8。"""
    return p.relative_to(root).as_posix()


def extract_year(text: str) -> str | None:
    m = re.search(r"(?<!\d)(19\d{2}|20\d{2})(?!\d)", text)
    return m.group(1) if m else None


def classify_module(rel: str, name: str, top: str, city: str, region: str):
    """返回 (module, extra_tags)。目录证据优先，其次文件名证据。"""
    tags = []
    # 1) 显式目录覆盖（编号歧义但有旁证）
    parts = rel.split("/")
    for depth in range(len(parts) - 1, 0, -1):
        key = "/".join(parts[:depth])
        if key in DIR_OVERRIDES:
            mod, why = DIR_OVERRIDES[key]
            return mod, [why]
    # 2) 目录段中的模块证据（最外层优先）
    for seg in parts[:-1]:
        if MOD1_RX.search(seg) and not MOD2_RX.search(seg):
            return "模块一/MOD1/铝件", tags
        if MOD2_RX.search(seg) and not MOD1_RX.search(seg):
            return "模块二/MOD2/钢件", tags
    # 3) 文件名证据
    if MOD1_RX.search(name) and not MOD2_RX.search(name):
        return "模块一/MOD1/铝件", tags
    if MOD2_RX.search(name) and not MOD1_RX.search(name):
        return "模块二/MOD2/钢件", tags
    if MOD1_RX.search(name) and MOD2_RX.search(name):
        return "", tags  # 同一文件同时提到模块1/2（如评分表合集），不判
    # 4) 组合件 / 单件
    text = rel
    if SINGLE_RX.search(text):
        return "单件", tags
    if COMBO_RX.search(text) or city in ("嘉兴", "湖州", "无锡") or top.endswith("组合试题"):
        return "组合件", tags
    return "", tags


def classify_kind(name_lower_ext: str, stem: str) -> str:
    ext = name_lower_ext
    if ext == ".pdf":
        for rx, kind in KIND_NAME_RULES:
            if rx.search(stem):
                return kind
        return "二维工程图"
    if ext in EXT_2D_CAD:
        return "二维CAD源文件"
    if ext in EXT_3D_CAD:
        return "三维CAD源文件"
    if ext == ".bak":
        return "三维CAD源文件"  # 本库 .bak 均为 CAXA 图纸备份，见 tag 备份文件
    if ext in EXT_SHEET:
        if re.search(r"检测|检验", stem):
            return "检测/评分表"
        return "评分表"
    if ext in EXT_DOC:
        if re.search(r"相符性说明|打印说明|说明", stem):
            return "说明文档"
        return "任务书/试题说明"
    if ext in EXT_IMG:
        if re.search(r"装配", stem):
            return "装配图"
        return "实物照片/图纸照片"
    if ext in EXT_ARCHIVE:
        return "打包压缩包"
    return "其他"


def classify_tags(rel: str, stem: str, region: str, ext: str) -> list:
    text = rel  # 含路径，可命中目录级关键词
    tags = [k for k in TAG_KEYS if k in text]
    m = re.findall(r"(\d{1,2})届", text)
    for d in m:
        t = f"{d}届"
        if t not in tags:
            tags.append(t)
    if region == "通用":
        for g in GENERIC_KEYS:
            if g in stem and g not in tags:
                tags.append(g)
        if "模拟试题" in stem and "模拟" not in tags:
            tags.append("模拟")
    if ext == ".bak" and "备份文件" not in tags:
        tags.append("备份文件")
    if "海峡两岸" in text and "两岸" not in tags:
        tags.append("两岸")
    return tags


def classify_level(rel: str, name: str, region: str, city: str, top: str) -> str:
    """层级判定。top 为顶层目录名（根目录散件时为空）。"""
    text = rel
    if region in ("通用", "跨地区", "未分类", "国赛"):
        if region == "国赛":
            return "国赛"  # 全国机械行业选拔赛：规则 C 含"全国"→国赛
        return "未知"
    if re.search(r"世赛|世界技能大赛|(\d{2})届", text):
        return "世界技能大赛"
    if re.search(r"全国|国赛", text):
        return "国赛"
    if not top:  # 根目录散件未命中上面规则
        return "未知"
    if city:  # 市级目录（无锡/湖州/嘉兴）
        return "市赛"
    if top == "吉林高职院校技能大赛" or "高职院校" in top:
        return "省赛"  # 用户确认：高职组按省赛，另打"院校组"tag
    if region in MUNICIPALITY_CITY:
        return "省赛"  # 直辖市目录按省级赛事；层级更细可由文件名规则覆盖
    if re.search(r"省赛|省.*大赛|省级", text):
        return "省赛"
    if re.search(r"市赛|市.*技能大赛|市中职|市职校", text):
        return "市赛"
    return "省赛"


def classify_root_scattered(p: Path, root: Path):
    """根目录散件的地区归属。返回 (region, city, level_or_None, special)。"""
    rel = norm_rel(p, root)
    name = p.name
    stem = p.stem
    for frag, region, city, level in ROOT_FILE_RULES:
        if frag in name:
            region = ROOT_RULE_REGION_OVERRIDE.get(frag, region) or region
            return region, city, level, "root-rule"
    for g in GENERIC_KEYS:
        if g in stem:
            return "通用", "", "未知", "generic"
    if name in UNCLASSIFIED_NAMES_EXPLICIT:
        return "未分类", "", "未知", "unclassified"
    # 兜底：表内没有的新散件一律进未分类，不硬猜
    return "未分类", "", "未知", "unclassified"


# ---------------------------------------------------------------- 主流程 ----
def build_index(root: Path) -> dict:
    files = []
    for p in sorted(root.rglob("*")):
        if not p.is_file():
            continue
        try:
            rp = p.relative_to(root)
        except ValueError:
            continue
        if rp.parts[0] == "_site":  # 索引站自身目录不参与扫描
            continue
        rel = rp.as_posix()
        ext = p.suffix.lower()
        stem = p.stem
        top = rp.parts[0] if len(rp.parts) > 1 else ""

        if top:  # 位于某个顶层目录内
            region, city = TOP_DIR_MAP.get(top, ("未分类", ""))
            if region == "未分类":
                level = "未知"
            else:
                level = None  # 交给 classify_level
            special = "topdir"
        else:
            region, city, level, special = classify_root_scattered(p, root)

        if level is None:
            level = classify_level(rel, stem, region, city, top)

        module, mod_tags = classify_module(rel, stem, top, city, region)
        kind = classify_kind(ext, stem)
        tags = classify_tags(rel, stem, region, ext) + mod_tags
        if special == "generic":
            tags = tags + ["通用机构件"] if "通用机构件" not in tags else tags
        if region == "未分类":
            tags = (tags or []) + ["待确认"]
        if city:
            tags = tags + [city] if city not in tags else tags

        year = extract_year(rel)
        stat = p.stat()

        files.append({
            "path": rel,
            "name": stem,
            "ext": ext.lstrip(".") if ext else "",
            "size": stat.st_size,
            "mtime": int(stat.st_mtime),
            "region": region,
            "city": city,
            "level": level,
            "module": module,
            "kind": kind,
            "year": year or "",
            "tags": tags,
            "ext_label": EXT_LABEL.get(ext, ext or "无扩展名"),
            "ugroup": ungrouped_group(stem) if region == "未分类" else "",
        })
    return {"schema": SCHEMA_VERSION, "count": len(files), "files": files}


def selfcheck(data: dict, root: Path) -> list:
    """各维度分组计数求和必须等于总数；实际文件数必须等于记录数。"""
    problems = []
    files = data["files"]
    actual = sum(1 for p in root.rglob("*")
                 if p.is_file() and p.relative_to(root).parts[0] != "_site")
    if actual != data["count"]:
        problems.append(f"记录数 {data['count']} != 实际文件数 {actual}")

    seen = set()
    for f in files:
        if f["path"] in seen:
            problems.append(f"重复记录: {f['path']}")
        seen.add(f["path"])
        if not (root / f["path"]).exists():
            problems.append(f"路径不存在: {f['path']}")

    for key in ("region", "level", "kind", "module", "year"):
        groups = {}
        for f in files:
            groups[f[key] or "(空)"] = groups.get(f[key] or "(空)", 0) + 1
        s = sum(groups.values())
        if s != len(files):
            problems.append(f"维度 {key} 分组和 {s} != 总数 {len(files)}")
        # region 允许"未分类"；kind/module 为空是合法状态，但要求枚举合法
    bad_kind = {f["kind"] for f in files} - {
        "二维工程图", "评分表", "检测/评分表", "任务书/试题说明", "备料/工艺卡",
        "装配图", "实物照片/图纸照片", "打包压缩包", "说明文档",
        "二维CAD源文件", "三维CAD源文件", "其他"}
    if bad_kind:
        problems.append(f"非法 kind: {bad_kind}")
    bad_level = {f["level"] for f in files} - set(LEVELS)
    if bad_level:
        problems.append(f"非法 level: {bad_level}")
    return problems


def summarize(data: dict) -> dict:
    files = data["files"]
    total_size = sum(f["size"] for f in files)
    regions = sorted({f["region"] for f in files})
    years = sorted({f["year"] for f in files if f["year"]})
    kinds = {}
    for f in files:
        kinds[f["kind"]] = kinds.get(f["kind"], 0) + 1
    return {
        "generatedAt": int(time.time()),
        "totalFiles": len(files),
        "totalSize": total_size,
        "regionCount": len(regions),
        "pdfCount": sum(1 for f in files if f["ext"] == "pdf"),
        "cad3dCount": sum(1 for f in files if f["kind"] == "三维CAD源文件"),
        "scoreCount": kinds.get("评分表", 0) + kinds.get("检测/评分表", 0),
        "yearSpan": [years[0], years[-1]] if years else [],
        "kindCounts": kinds,
        "levelCounts": {lv: sum(1 for f in files if f["level"] == lv) for lv in LEVELS},
        "macroRegions": MACRO_REGIONS,
    }


def main():
    ap = argparse.ArgumentParser(description="扫描图档库并生成索引（只读原文件）")
    ap.add_argument("--root", default=None, help="图档库根目录（默认取脚本上两级）")
    args = ap.parse_args()

    root = Path(args.root) if args.root else Path(__file__).resolve().parents[2]
    site = root / "_site"
    if not root.exists():
        sys.exit(f"根目录不存在: {root}")

    data = build_index(root)
    data["meta"] = summarize(data)

    problems = selfcheck(data, root)

    (site / "data").mkdir(parents=True, exist_ok=True)
    (site / "assets").mkdir(parents=True, exist_ok=True)

    (site / "data" / "index.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    (site / "assets" / "data.js").write_text(
        "window.__CNC_DATA__ = "
        + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8")

    # 待确认清单 CSV（未分类 + 通用 + 跨地区）
    review_rows = [f for f in data["files"] if f["region"] in ("未分类", "通用", "跨地区")]
    with open(site / "data" / "review.csv", "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh)
        w.writerow(["path", "region", "level", "kind", "module", "year", "tags", "建议"])
        for f in sorted(review_rows, key=lambda x: (x["region"], x["ugroup"], x["path"])):
            w.writerow([f["path"], f["region"], f["level"], f["kind"],
                        f["module"], f["year"], "|".join(f["tags"]),
                        "确认来源后在 gen_index.py 的 ROOT_FILE_RULES 补一行映射"
                        if f["region"] == "未分类" else "通用题库，维持现状即可"])

    m = data["meta"]
    print(f"[OK] 记录 {m['totalFiles']} 个文件 / {m['totalSize']/1048576:.1f} MB")
    print(f"     地区 {m['regionCount']} 个 | 年份 {m['yearSpan']} | 待确认 {len(review_rows)} 个")
    if problems:
        print("[FAIL] 自检发现问题：")
        for pb in problems:
            print("  -", pb)
        sys.exit(1)
    print("[OK] 自检通过：记录数=实际文件数，各维度分组和=总数，无重复/失效路径")


if __name__ == "__main__":
    main()
