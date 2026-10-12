/* 数控铣竞赛图档库导航 —— 原生 ES6，零外部依赖，可 file:// 双击运行 */
"use strict";

/* SECTION: site-prefix —— 站点相对图档库根的前缀（入口在 _site/ 下 = "../"） */
const PREFIX = (() => {
  const p = decodeURIComponent(location.pathname);
  const i = p.lastIndexOf("/_site/");
  if (i < 0) return "../";
  // _site/ 之后的非空段数即当前 HTML 距库根的层数：
  //   /_site/index.html -> 1 -> "../"
  //   /_site/history/v1/delivery/index.html -> 4 -> "../../../../"
  const depth = p.slice(i + 7).split("/").filter(Boolean).length;
  return "../".repeat(Math.max(1, depth));
})();
const IS_FILE = location.protocol === "file:";

/* SECTION: constants —— 维度取值与展示顺序 */
const LEVELS = ["世界技能大赛", "国赛", "行业赛", "省赛", "市赛", "校赛", "未知"];
const KINDS = ["二维工程图", "二维CAD源文件", "三维CAD源文件", "评分表", "检测/评分表",
  "任务书/试题说明", "备料/工艺卡", "装配图", "实物照片/图纸照片", "说明文档", "打包压缩包", "其他"];
const MODULES = ["模块一/MOD1/铝件", "模块二/MOD2/钢件", "组合件", "单件", "(未标注)"];
const UGROUPS = ["数字系列 1~10（10 个）", "数字系列 1(2)~4(2)（4 个）", "MOD / M 系列（9 个）",
  "2012-07 系列（15 个，疑为成套样题）", "编号散件（1-19 / 2-18未加工）"];
const DIM_LABEL = { region: "按地区", level: "按竞赛层级", kind: "按内容类型", module: "按模块", year: "按年份" };
const BROWSABLE = new Set(["pdf", "jpg", "jpeg", "png"]);
const BADGE_CLASS = { pdf: "b-pdf", doc: "b-doc", docx: "b-doc", rtf: "b-doc", txt: "b-doc",
  xls: "b-sheet", xlsx: "b-sheet", jpg: "b-img", jpeg: "b-img", png: "b-img",
  zip: "b-zip", rar: "b-zip", exb: "b-cad2", dwg: "b-cad2",
  ics: "b-cad3", mxe: "b-cad3", prt: "b-cad3", stp: "b-cad3", step: "b-cad3",
  igs: "b-cad3", iges: "b-cad3", x_t: "b-cad3", "x-t": "b-cad3", elt: "b-cad3", bak: "b-cad3" };
const UNCLASS = "未分类";

/* SECTION: pinyin —— 结构化字段的拼音/缩写匹配（自由文本文件名不做全量拼音） */
const PINYIN = {
  "北京": "bj beijing", "天津": "tj tianjin", "河北": "hebei hb", "山西": "shanxi",
  "吉林": "jilin jl", "黑龙江": "heilongjiang hlj", "上海": "shanghai sh", "江苏": "jiangsu js",
  "浙江": "zhejiang zj", "山东": "shandong sd", "福建": "fujian fj", "河南": "henan",
  "湖南": "hunan", "广东": "guangdong gd", "广西": "guangxi gx", "海南": "hainan",
  "重庆": "chongqing cq", "贵州": "guizhou gz", "云南": "yunnan yn", "陕西": "shaanxi",
  "宁夏": "ningxia nx", "无锡": "wuxi wx", "徐州": "xuzhou xz", "宁波": "ningbo nb",
  "绍兴": "shaoxing", "湖州": "huzhou hz", "嘉兴": "jiaxing", "国赛": "guosai gs",
  "省赛": "shengsai", "市赛": "shisai", "未分类": "wfcl", "通用": "tongyong", "跨地区": "kdq",
  "世界技能大赛": "shijie", "世赛": "shisai", "行业赛": "hangye", "校赛": "xiao",
  "模块一/MOD1/铝件": "m1 lvjian alum", "模块二/MOD2/钢件": "m2 gangjian steel",
  "组合件": "zuhe", "单件": "danjian", "二维工程图": "2d gongcheng",
  "二维CAD源文件": "cad2 exb dwg", "三维CAD源文件": "cad3 ics mxe prt stp igs x_t elt",
  "评分表": "pingfen", "检测/评分表": "jiance", "任务书/试题说明": "renwushu shiti",
  "备料/工艺卡": "gongyi beiliao", "装配图": "zhuangpei", "实物照片/图纸照片": "zhaopian photo",
  "说明文档": "shuoming", "打包压缩包": "yasuo zip rar", "其他": "qita", "(未标注)": "wubz",
};

/* SECTION: state —— 全局筛选状态 */
const state = {
  q: "",
  sel: { region: new Set(), level: new Set(), kind: new Set(), module: new Set(), year: new Set(), sub: new Set() },
  sort: "path", dir: 1, view: "card", size: 24, page: 1,
};
let ALL = [], META = null;

/* SECTION: util */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtSize = n => n >= 1048576 ? (n / 1048576).toFixed(1) + " MB"
  : n >= 1024 ? Math.round(n / 1024) + " KB" : n + " B";
const fmtTime = t => { const d = new Date(t * 1000), p = x => String(x).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()); };
function naturalKey(s) {
  return String(s).toLowerCase().split(/(\d+)/).map(x =>
    /^\d+$/.test(x) ? x.padStart(12, "0") : x).join("");
}
function hrefFor(relPath) {
  return PREFIX + relPath.split("/").map(encodeURIComponent).join("/");
}
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2200);
}
async function copyText(txt) {
  try { await navigator.clipboard.writeText(txt); return true; }
  catch (e) { /* file:// 或非安全上下文回退 */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy"); ta.remove(); return ok;
  } catch (e) { return false; }
}

/* SECTION: data-load —— 先试 fetch（http 环境），失败回退内联 assets/data.js */
async function loadData() {
  if (!IS_FILE) {
    try {
      const r = await fetch("data/index.json", { cache: "no-store" });
      if (r.ok) return await r.json();
    } catch (e) { /* 落到内联数据 */ }
  }
  if (window.__CNC_DATA__) return window.__CNC_DATA__;
  throw new Error("索引数据缺失：请先运行 _site/tools/gen_index.py 生成 data/index.json 与 assets/data.js");
}

/* SECTION: prepare —— 派生字段（顶层目录 / 二级路径 / 城市）与拼音扩展 */
function prepare(data) {
  ALL = data.files.map(f => {
    const parts = f.path.split("/");
    const top = parts.length > 1 ? parts[0] : "(根目录)";
    const sub2 = parts.length > 2 ? parts.slice(0, 2).join("/") : top;
    const hay = [f.name, f.path, f.ext, f.region, f.city, f.level, f.kind, f.module,
      f.year, (f.tags || []).join(" "),
      PINYIN[f.region] || "", PINYIN[f.city] || "", PINYIN[f.level] || "",
      PINYIN[f.kind] || "", PINYIN[f.module] || "", PINYIN[f.ext] || ""]
      .join(" ").toLowerCase();
    return Object.assign({}, f, { top, sub2, hay, ugroup: f.ugroup || "" });
  });
  META = data.meta;
}

/* SECTION: counts —— 各维度静态计数（树节点后缀） */
function countBy(fn) {
  const m = new Map();
  for (const f of ALL) { const k = fn(f); if (k === "" || k == null) continue; m.set(k, (m.get(k) || 0) + 1); }
  return m;
}
function branchCount(region) {
  const m = new Map();
  for (const f of ALL) if (f.region === region) {
    m.set("topdir:" + f.top, (m.get("topdir:" + f.top) || 0) + 1);
    if (f.sub2 !== f.top) m.set("sub2:" + f.sub2, (m.get("sub2:" + f.sub2) || 0) + 1);
  }
  return m;
}

/* SECTION: facets —— 匹配判断（维度内 OR、维度间 AND） */
function passSub(f) {
  for (const v of state.sel.sub) {
    if (v.startsWith("city:") && f.city === v.slice(5)) return true;
    if (v.startsWith("group:") && f.ugroup === v.slice(6)) return true;
    if (v.startsWith("sub2:") && f.sub2 === v.slice(5)) return true;
    if (v.startsWith("topdir:") && f.top === v.slice(7)) return true;
  }
  return false;
}
function moduleVal(f) { return f.module || "(未标注)"; }
function passFacets(f) {
  const s = state.sel;
  if (s.region.size && !s.region.has(f.region)) return false;
  if (s.level.size && !s.level.has(f.level)) return false;
  if (s.kind.size && !s.kind.has(f.kind)) return false;
  if (s.module.size && !s.module.has(moduleVal(f))) return false;
  if (s.year.size && !s.year.has(f.year || "(无年份)")) return false;
  if (s.sub.size && !passSub(f)) return false;
  return true;
}

/* SECTION: query —— 搜索串解析：空格=AND，支持 key:值 前缀语法 */
const KEY_ALIAS = {
  "地区": "region", "region": "region", "省": "region",
  "城市": "city", "city": "city",
  "层级": "level", "level": "level",
  "类型": "kindext", "kind": "kind", "内容类型": "kind", "ext": "ext", "扩展名": "ext",
  "年份": "year", "year": "year",
  "模块": "module", "module": "module",
  "标签": "tag", "tag": "tag",
};
function parseQuery(raw) {
  const terms = [], facet = { region: [], city: [], level: [], kind: [], ext: [], year: [], module: [], tag: [], kindext: [] };
  for (const tok of raw.trim().split(/\s+/).filter(Boolean)) {
    const m = tok.match(/^([^:：=]{1,6})[:：=](.+)$/);
    if (m && KEY_ALIAS[m[1].toLowerCase()]) {
      facet[KEY_ALIAS[m[1].toLowerCase()]].push(m[2].toLowerCase());
    } else {
      terms.push(tok.toLowerCase());
    }
  }
  return { terms, facet };
}
function passQuery(f, qt) {
  for (const t of qt.terms) if (!f.hay.includes(t)) return false;
  // 维度值匹配：子串 OR 拼音缩写（如 地区:gd 命中"广东"）
  const any = (list, val) => !list.length || list.some(v => {
    if (String(val).toLowerCase().includes(v)) return true;
    const py = PINYIN[String(val)];
    return py ? py.split(" ").some(p => p.startsWith(v)) : false;
  });
  const eq = (list, val) => !list.length || list.some(v => v === String(val).toLowerCase());
  // 类型: 同时兼容扩展名与内容类型（"类型:pdf" / "类型:评分" 都能命中）
  const kindOrExt = [f.kind, f.ext].join(" ").toLowerCase();
  return any(qt.facet.region, f.region) && any(qt.facet.city, f.city) &&
    any(qt.facet.level, f.level) && eq(qt.facet.ext, f.ext) &&
    any(qt.facet.kind, f.kind) && any(qt.facet.year, f.year || "(无年份)") &&
    any(qt.facet.module, f.module) && any(qt.facet.tag, (f.tags || []).join(" ")) &&
    (qt.facet.kindext || []).every(v => kindOrExt.includes(v));
}

/* SECTION: filter+sort */
function computeResults() {
  const qt = parseQuery(state.q);
  const res = ALL.filter(f => passFacets(f) && passQuery(f, qt));
  const dir = state.dir;
  const key = state.sort;
  const REGION_ORD = {};
  (META ? META.macroRegions : []).forEach((mr, i) => mr[1].forEach((r, j) => { REGION_ORD[r] = i * 100 + j; }));
  res.sort((a, b) => {
    let x, y;
    if (key === "path") { x = naturalKey(a.path); y = naturalKey(b.path); }
    else if (key === "size") { x = a.size; y = b.size; }
    else if (key === "mtime") { x = a.mtime; y = b.mtime; }
    else if (key === "year") { x = a.year ? -Number(a.year) : 99999; y = b.year ? -Number(b.year) : 99999; }
    else if (key === "region") { x = REGION_ORD[a.region] ?? 9999; y = REGION_ORD[b.region] ?? 9999; }
    else { x = a.path; y = b.path; }
    return x < y ? -dir : x > y ? dir : 0;
  });
  return res;
}

/* SECTION: highlight */
function hl(text) {
  const terms = state.q.trim().split(/\s+/).filter(t => t && !/^[^:：=]{1,6}[:：=]/.test(t));
  let out = esc(text);
  for (const t of terms.slice(0, 8)) {
    const re = new RegExp("(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
    out = out.replace(re, "<mark>$1</mark>");
  }
  return out;
}

/* SECTION: tree —— 五维分类树渲染 */
function nodeHTML(opt) {
  // opt: {kind, val, label, count, children, flagged}
  const kids = opt.children && opt.children.length;
  const key = opt.kind + ":" + opt.val;
  const collapsed = treeCollapsed[key];
  const selected = state.sel[opt.selKey || opt.kind] && state.sel[opt.selKey || opt.kind].has(opt.val);
  let html = '<div class="tnode' + (opt.macro ? " tmacro" : "") + '">' +
    '<div class="trow' + (selected ? " sel" : "") + (opt.flagged ? " flagged" : "") + '"' +
    ' data-kind="' + esc(opt.kind) + '" data-val="' + esc(opt.val) + '"' +
    (opt.selKey ? ' data-selkey="' + esc(opt.selKey) + '"' : "") + ">" +
    '<span class="tw">' + (kids ? (collapsed ? "▶" : "▼") : "·") + "</span>" +
    '<span class="lbl">' + esc(opt.label) + "</span>" +
    '<span class="cnt">' + (opt.count == null ? "" : opt.count) + "</span></div>";
  if (kids) {
    html += '<div class="tkids' + (collapsed ? " hide" : "") + '" data-parent="' + esc(key) + '">' +
      opt.children.map(nodeHTML).join("") + "</div>";
  }
  return html + "</div>";
}
let treeCollapsed = {};

function buildRegionTree() {
  const regCnt = countBy(f => f.region);
  return (META.macroRegions || []).map(([macro, list]) => {
    const present = list.filter(r => regCnt.get(r));
    const total = present.reduce((s, r) => s + regCnt.get(r), 0);
    const children = present.map(r => {
      const bc = branchCount(r);
      const kids = [];
      const cities = new Map();
      for (const f of ALL) if (f.region === r && f.city) cities.set(f.city, (cities.get(f.city) || 0) + 1);
      for (const [c, n] of cities) kids.push({ kind: "sub", selKey: "sub", val: "city:" + c, label: c + "（市）", count: n });
      const tops = new Map();
      for (const f of ALL) if (f.region === r) tops.set(f.top, (tops.get(f.top) || 0) + 1);
      for (const [t, n] of [...tops].sort((a, b) => naturalKey(a[0]) < naturalKey(b[0]) ? -1 : 1)) {
        const subs = [];
        if (t !== "(根目录)") {
          const s2 = new Map();
          for (const f of ALL) if (f.region === r && f.sub2 !== f.top && f.top === t) s2.set(f.sub2, (s2.get(f.sub2) || 0) + 1);
          for (const [s, n2] of [...s2].sort((a, b) => naturalKey(a[0]) < naturalKey(b[0]) ? -1 : 1)) {
            subs.push({ kind: "sub", selKey: "sub", val: "sub2:" + s, label: s.split("/").slice(-1)[0], count: n2 });
          }
        } else {
          const gu = new Map();
          for (const f of ALL) if (f.top === "(根目录)" && f.ugroup) gu.set(f.ugroup, (gu.get(f.ugroup) || 0) + 1);
          for (const [g, n2] of UGROUPS.filter(x => gu.has(x)).map(x => [x, gu.get(x)])) {
            subs.push({ kind: "sub", selKey: "sub", val: "group:" + g, label: g, count: n2, flagged: true });
          }
        }
        kids.push({ kind: "sub", selKey: "sub", val: "topdir:" + t, label: t === "(根目录)" ? "根目录散件" : t, count: n, children: subs });
      }
      return { kind: "region", val: r, label: r, count: regCnt.get(r), children: kids,
        flagged: r === UNCLASS || r === "通用" || r === "跨地区" };
    });
    return { kind: "macro", val: macro, label: macro, count: total, children };
  }).filter(n => n.count);
}
function simpleTree(kind, values, selKey) {
  const cnt = countBy(f => kind === "module" ? moduleVal(f) : f[kind] || "(无年份)");
  return values.filter(v => cnt.get(v)).map(v => ({ kind, val: v, label: v, count: cnt.get(v), selKey }));
}
function buildYearTree() {
  const cnt = countBy(f => f.year || "(无年份)");
  const ys = [...cnt.keys()].filter(y => y !== "(无年份)").sort((a, b) => b.localeCompare(a));
  const nodes = ys.map(y => ({ kind: "year", val: y, label: y, count: cnt.get(y) }));
  if (cnt.get("(无年份)")) nodes.push({ kind: "year", val: "(无年份)", label: "无年份", count: cnt.get("(无年份)") });
  return nodes;
}
let activeDim = "region";
function renderTree() {
  const dims = {
    region: () => buildRegionTree(),
    level: () => simpleTree("level", LEVELS, "level"),
    kind: () => simpleTree("kind", KINDS, "kind"),
    module: () => simpleTree("module", MODULES, "module"),
    year: buildYearTree,
  };
  const tabs = Object.keys(DIM_LABEL).map(k =>
    '<button data-dim="' + k + '" class="' + (k === activeDim ? "on" : "") + '">' + DIM_LABEL[k] + "</button>").join("");
  $("#dimTabs").innerHTML = tabs; // 只更新按钮，不重建容器（事件委托在 init 前已绑定）
  $("#tree").innerHTML =
    (activeDim === "region" ? '<div class="tnote">大区 → 地区 → 二级目录；地区节点下的「市」表示该省下属市级试题</div>' : "") +
    dims[activeDim]().map(nodeHTML).join("");
}

/* SECTION: stats */
function renderStats() {
  const y = META.yearSpan || [];
  const cards = [
    [META.totalFiles, "文件总数"], [fmtSize(META.totalSize), "总大小"],
    [META.regionCount, "覆盖地区"], [META.pdfCount, "PDF 文档"],
    [META.cad3dCount, "三维模型"], [META.scoreCount, "评分/检测表"],
    [y.length ? y[0] + "–" + y[1] : "—", "年份跨度"],
  ];
  $("#stats").innerHTML = cards.map(c => '<div class="stat"><b>' + esc(c[0]) + "</b><span>" + c[1] + "</span></div>").join("");
  $("#footer").innerHTML =
    "<span>最后更新 " + fmtTime(META.generatedAt) + "</span>" +
    "<span>共 " + META.totalFiles + " 个文件 / " + fmtSize(META.totalSize) + "</span>" +
    "<span>数据源 data/index.json · 重跑：python _site/tools/gen_index.py</span>" +
    (IS_FILE ? '<span style="color:var(--danger)">当前 file:// 打开：PDF 内嵌预览不可用（浏览器限制），「预览」将降级为新标签打开</span>'
             : "<span>当前 http 打开：PDF/图片支持内嵌预览</span>");
}

/* SECTION: crumbs */
function crumbLabel(kind, val) {
  if (kind === "sub") {
    if (val.startsWith("city:")) return "城市:" + val.slice(5);
    if (val.startsWith("group:")) return "分组:" + val.slice(6);
    if (val.startsWith("sub2:")) return val.slice(5);
    return val.slice(7);
  }
  return val;
}
function renderCrumbs() {
  const items = [];
  for (const k of Object.keys(state.sel)) {
    for (const v of state.sel[k]) items.push({ k, v });
  }
  if (state.q.trim()) items.unshift({ k: "q", v: state.q.trim() });
  $("#crumbs").innerHTML = items.map(it =>
    '<span class="crumb"><b>' + esc(it.k === "q" ? "搜索" : DIM_LABEL[activeDim] && it.k === activeDim ? DIM_LABEL[it.k] : it.k) +
    ":</b> " + esc(it.k === "q" ? it.v : crumbLabel(it.k, it.v)) +
    '<span class="x" data-k="' + esc(it.k) + '" data-v="' + esc(it.v) + '" title="移除">✕</span></span>').join("");
}

/* SECTION: render-list */
function actionHTML(f) {
  const canOpen = BROWSABLE.has(f.ext);
  let html = "";
  if (canOpen) {
    html += '<a class="btn" href="' + esc(hrefFor(f.path)) + '" target="_blank" rel="noopener">打开</a>';
    html += '<button class="btn" data-act="preview" data-p="' + esc(f.path) + '" data-ext="' + esc(f.ext) + '">预览</button>';
  } else {
    html += '<button class="btn" data-act="open-cad" data-p="' + esc(f.path) + '" title="浏览器无法打开该类型，路径已复制，请用本机 CAD/Office 软件打开">复制并说明</button>';
  }
  html += '<button class="btn" data-act="copy" data-p="' + esc(f.path) + '">复制路径</button>';
  return html;
}
function badgeFor(f) {
  return '<span class="badge ' + (BADGE_CLASS[f.ext] || "b-other") + '">' + esc((f.ext || "?").toUpperCase()) + "</span>";
}
function chipsFor(f) {
  const c = [];
  c.push('<span class="chip">' + esc(f.kind) + "</span>");
  c.push('<span class="chip">' + esc(f.region + (f.city ? "·" + f.city : "")) + "</span>");
  if (f.level) c.push('<span class="chip">' + esc(f.level) + "</span>");
  if (f.module) c.push('<span class="chip">' + esc(f.module) + "</span>");
  if (f.year) c.push('<span class="chip">' + esc(f.year) + " 年</span>");
  (f.tags || []).slice(0, 4).forEach(t => c.push('<span class="chip tag">' + esc(t) + "</span>"));
  if (f.region === UNCLASS) c.push('<span class="chip warn">待确认来源</span>');
  return c.join("");
}
function renderCards(rows) {
  $("#cards").innerHTML = rows.map(f =>
    '<div class="card">' +
    '<div class="top">' + badgeFor(f) + '<span class="fname" title="' + esc(f.name) + "." + esc(f.ext) + '">' + hl(f.name) + "</span></div>" +
    '<div class="fpath">' + hl(f.path) + "</div>" +
    '<div class="meta">' + chipsFor(f) + "</div>" +
    '<div class="foot"><span class="size">' + fmtSize(f.size) + " · " + fmtTime(f.mtime) + "</span>" + actionHTML(f) + "</div>" +
    "</div>").join("");
}
function renderTable(rows) {
  const cols = [["name", "名称"], ["kind", "类型"], ["region", "地区"], ["level", "层级"],
    ["module", "模块"], ["year", "年份"], ["size", "大小"], ["mtime", "修改时间"], ["", "操作"]];
  const map = { name: "path", kind: "kind", region: "region", level: "level", module: "module",
    year: "year", size: "size", mtime: "mtime" };
  let html = "<table><thead><tr>" + cols.map(([k, l]) =>
    "<th data-sort=\"" + (map[k] || "") + '"' + (map[k] === state.sort ? ' class="sorted"' : "") + ">" + l +
    (map[k] === state.sort ? (state.dir > 0 ? " ↑" : " ↓") : "") + "</th>").join("") + "</tr></thead><tbody>";
  for (const f of rows) {
    html += "<tr><td class=\"name\" title=\"" + esc(f.path) + "\">" + badgeFor(f) + " " + hl(f.name) + "</td>" +
      "<td>" + esc(f.kind) + "</td>" +
      "<td>" + esc(f.region + (f.city ? "·" + f.city : "")) + "</td>" +
      "<td>" + esc(f.level) + "</td>" +
      "<td>" + esc(f.module || "—") + "</td>" +
      "<td>" + esc(f.year || "—") + "</td>" +
      "<td>" + fmtSize(f.size) + "</td>" +
      "<td>" + fmtTime(f.mtime) + "</td>" +
      "<td>" + actionHTML(f) + "</td></tr>";
  }
  $("#tableWrap").innerHTML = html + "</tbody></table>";
}
function renderPager(total, pages) {
  if (pages <= 1) { $("#pager").innerHTML = ""; return; }
  const btn = (n, label, dis) => "<button class=\"btn" + (n === state.page ? " cur" : "") +
    '"' + (dis ? " disabled" : "") + ' data-page="' + n + '">' + label + "</button>";
  let html = btn(Math.max(1, state.page - 1), "←", state.page === 1);
  const win = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - state.page) <= 2) win.push(i);
  let prev = 0;
  for (const i of win) { if (prev && i - prev > 1) html += '<span style="color:var(--fg-3)">…</span>'; html += btn(i, i, false); prev = i; }
  html += btn(Math.min(pages, state.page + 1), "→", state.page === pages);
  $("#pager").innerHTML = html;
}
function renderNotice(rows) {
  const hasUnclass = rows.some(f => f.region === UNCLASS);
  $("#notice").innerHTML = (state.sel.region.has(UNCLASS) || state.sel.sub.size && [...state.sel.sub].some(v => v.startsWith("group:"))) && hasUnclass
    ? '<div class="crumb" style="border-radius:8px;background:var(--bg-3);padding:8px 12px;margin-bottom:10px">⚠ 这组文件按编号命名、无法从名称判断来源，' +
      '建议你人工确认来源后，在 <span style="font-family:var(--mono)">_site/tools/gen_index.py</span> 的 ROOT_FILE_RULES 里补一行映射再重跑索引（待确认清单见 <span style="font-family:var(--mono)">_site/data/review.csv</span>）。</div>'
    : "";
}
function render() {
  const rows = computeResults();
  const pages = Math.max(1, Math.ceil(rows.length / state.size));
  if (state.page > pages) state.page = pages;
  const slice = rows.slice((state.page - 1) * state.size, state.page * state.size);
  $("#count").textContent = "共 " + rows.length + " 个文件" +
    (rows.length ? " · 第 " + state.page + "/" + pages + " 页" : "");
  renderCrumbs(); renderNotice(rows);
  const showCards = state.view === "card", showTable = state.view === "table";
  $("#cards").hidden = !showCards; $("#tableWrap").hidden = !showTable;
  $("#empty").hidden = rows.length > 0;
  if (rows.length) { showCards ? renderCards(slice) : renderTable(slice); }
  renderPager(rows.length, pages);
  $("#listWrap").scrollTop = 0;
  writeHash();
}

/* SECTION: hash —— 用 location.hash 记住筛选状态，可分享链接 */
function writeHash() {
  const p = new URLSearchParams();
  if (state.q) p.set("q", state.q);
  for (const k of ["region", "level", "kind", "module", "year", "sub"]) {
    if (state.sel[k].size) p.set(k, [...state.sel[k]].join("|"));
  }
  if (state.sort !== "path") p.set("sort", state.sort + (state.dir < 0 ? ":desc" : ""));
  if (state.view !== "card") p.set("view", state.view);
  if (state.size !== 24) p.set("size", state.size);
  if (state.page > 1) p.set("page", state.page);
  const s = p.toString();
  history.replaceState(null, "", s ? "#" + s : location.pathname + location.search);
}
function readHash() {
  if (!location.hash) return;
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.has("q")) state.q = p.get("q");
  for (const k of ["region", "level", "kind", "module", "year", "sub"]) {
    if (p.get(k)) for (const v of p.get(k).split("|")) if (v) state.sel[k].add(v);
  }
  if (p.get("sort")) {
    const [s, d] = p.get("sort").split(":");
    state.sort = s; state.dir = d === "desc" ? -1 : 1;
  }
  if (p.get("view")) state.view = p.get("view");
  if (p.get("size")) state.size = parseInt(p.get("size"), 10) || 24;
  if (p.get("page")) state.page = parseInt(p.get("page"), 10) || 1;
  // hash 里带 sub 选中时自动切到地区树，保证侧栏可见
  if (state.sel.sub.size || state.sel.region.size) activeDim = "region";
  for (const k of ["level", "kind", "module", "year"]) if (state.sel[k].size) activeDim = k;
}

/* SECTION: modal —— PDF/图片内嵌预览（file:// 自动降级为打开） */
function openModal(f) {
  $("#modalBadge").textContent = (f.ext || "?").toUpperCase();
  $("#modalBadge").className = "badge " + (BADGE_CLASS[f.ext] || "b-other");
  $("#modalTitle").textContent = f.path;
  $("#modalOpen").href = hrefFor(f.path);
  $("#modalCopy").dataset.p = f.path;
  const body = $("#modalBody");
  if (!BROWSABLE.has(f.ext)) return;
  if (IS_FILE && f.ext === "pdf") {
    /* file:// 下浏览器禁止 iframe 加载本地文件，降级提示 */
    body.innerHTML = '<div id="modalNote"><p>⚠ 当前以 <b>file:// 双击方式</b>打开本站，浏览器安全策略禁止在页面内嵌显示本机 PDF。</p>' +
      '<p>请点右上「↗ 新标签打开」（已为你准备好），或改用本地服务方式获得内嵌预览：<br>' +
      '<code style="font-family:var(--mono)">python -m http.server 8000 -d 图档库根目录</code>，再访问 <code>http://localhost:8000/_site/index.html</code></p></div>';
  } else {
    const src = hrefFor(f.path) + (f.ext === "pdf" ? "#toolbar=1" : "");
    body.innerHTML = '<iframe src="' + esc(src) + '" title="预览"></iframe>';
  }
  $("#modal").classList.add("open");
}
function closeModal() { $("#modal").classList.remove("open"); $("#modalBody").innerHTML = ""; }

/* SECTION: events */
function toggleSelect(kind, selKey, val) {
  const set = state.sel[selKey];
  set.has(val) ? set.delete(val) : set.add(val);
  state.page = 1;
  renderTree(); render();
}
function bindEvents() {
  // 搜索（防抖 200ms）
  let deb;
  $("#search").addEventListener("input", e => {
    clearTimeout(deb);
    deb = setTimeout(() => { state.q = e.target.value; state.page = 1; render(); }, 200);
  });
  // 树：折叠箭头 / 选择行
  $("#tree").addEventListener("click", e => {
    const tw = e.target.closest(".tw");
    const row = e.target.closest(".trow");
    if (!row) return;
    const kind = row.dataset.kind;
    if (tw && row.nextElementSibling && row.nextElementSibling.classList.contains("tkids")) {
      treeCollapsed[kind + ":" + row.dataset.val] = !treeCollapsed[kind + ":" + row.dataset.val];
      renderTree(); return;
    }
    if (kind === "macro") { // 大区节点只折叠不选中
      treeCollapsed["macro:" + row.dataset.val] = !treeCollapsed["macro:" + row.dataset.val];
      renderTree(); return;
    }
    if (kind === "region") {
      // 地区行：Ctrl 点击=多选，普通点击=单选替换（保留折叠子级）
      if (e.ctrlKey || e.metaKey) toggleSelect("region", "region", row.dataset.val);
      else { state.sel.region = new Set([row.dataset.val]); state.page = 1; renderTree(); render(); }
      return;
    }
    toggleSelect(kind, row.dataset.selkey || kind, row.dataset.val);
  });
  $("#dimTabs").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    activeDim = b.dataset.dim; renderTree();
  });
  // 面包屑移除
  $("#crumbs").addEventListener("click", e => {
    const x = e.target.closest(".x"); if (!x) return;
    const k = x.dataset.k, v = x.dataset.v;
    if (k === "q") { state.q = ""; $("#search").value = ""; }
    else state.sel[k].delete(v);
    state.page = 1; renderTree(); render();
  });
  // 清空
  const clearAll = () => {
    for (const k of Object.keys(state.sel)) state.sel[k].clear();
    state.q = ""; $("#search").value = ""; state.page = 1;
    renderTree(); render();
  };
  $("#clearAll").addEventListener("click", clearAll);
  $("#emptyClear").addEventListener("click", clearAll);
  $("#expandAll").addEventListener("click", () => { treeCollapsed = {}; renderTree(); });
  $("#collapseAll").addEventListener("click", () => {
    for (const [k, v] of Object.entries(regionKeys())) treeCollapsed[k] = v;
    renderTree();
  });
  function regionKeys() {
    const m = {};
    document.querySelectorAll("#tree .tnode").forEach(n => {
      const row = n.querySelector(":scope > .trow"), kids = n.querySelector(":scope > .tkids");
      if (row && kids) m[row.dataset.kind + ":" + row.dataset.val] = true;
    });
    return m;
  }
  // 视图 / 排序 / 每页
  $("#viewSeg").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    state.view = b.dataset.v;
    document.querySelectorAll("#viewSeg button").forEach(x => x.classList.toggle("on", x === b));
    render();
  });
  $("#sortSel").addEventListener("change", e => { state.sort = e.target.value; state.page = 1; render(); });
  $("#sizeSel").addEventListener("change", e => { state.size = +e.target.value; state.page = 1; render(); });
  $("#tableWrap").addEventListener("click", e => {
    const th = e.target.closest("th[data-sort]"); if (!th || !th.dataset.sort) return;
    if (state.sort === th.dataset.sort) state.dir = -state.dir; else { state.sort = th.dataset.sort; state.dir = 1; }
    $("#sortSel").value = ["path", "size", "mtime", "year", "region"].includes(state.sort) ? state.sort : "path";
    render();
  });
  // 列表操作（卡片 + 表格共用委托）
  $("#listWrap").addEventListener("click", async e => {
    const pg = e.target.closest("button[data-page]");
    if (pg) { state.page = +pg.dataset.page; render(); return; }
    const btn = e.target.closest("button[data-act]"); if (!btn) return;
    const f = ALL.find(x => x.path === btn.dataset.p);
    const act = btn.dataset.act;
    if (act === "preview" && f) { openModal(f); return; }
    if (act === "copy") {
      const ok = await copyText(btn.dataset.p);
      toast(ok ? "已复制相对路径：" + btn.dataset.p : "复制失败，请手动选中路径");
      return;
    }
    if (act === "open-cad") {
      await copyText(btn.dataset.p);
      toast("浏览器打不开 " + (f ? f.ext_label : "") + "，已复制相对路径，请在本机 CAD/Office 软件中打开（Ctrl+O 粘贴）");
    }
  });
  // 模态框
  $("#modalClose").addEventListener("click", closeModal);
  $("#modal").addEventListener("click", e => { if (e.target === $("#modal")) closeModal(); });
  $("#modalCopy").addEventListener("click", async e => {
    const ok = await copyText(e.target.dataset.p);
    toast(ok ? "已复制路径" : "复制失败");
  });
  // 主题
  $("#themeBtn").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("cnc-theme", next); } catch (err) { /* 无痕模式忽略 */ }
  });
  // 抽屉
  $("#menuBtn").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  // 键盘：/ 聚焦搜索，Esc 关模态/清搜索，←→ 翻页
  document.addEventListener("keydown", e => {
    const inInput = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (e.key === "/" && !inInput) { e.preventDefault(); $("#search").focus(); }
    else if (e.key === "Escape") {
      if ($("#modal").classList.contains("open")) closeModal();
      else if (inInput) { $("#search").value = ""; state.q = ""; state.page = 1; render(); $("#search").blur(); }
    }
    else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !inInput) {
      const pages = Math.max(1, Math.ceil(computeResults().length / state.size));
      const np = e.key === "ArrowLeft" ? state.page - 1 : state.page + 1;
      if (np >= 1 && np <= pages) { state.page = np; render(); }
    }
  });
  window.addEventListener("hashchange", () => {
    for (const k of Object.keys(state.sel)) state.sel[k].clear();
    readHash();
    $("#search").value = state.q;
    renderTree(); render();
  });
}

/* SECTION: init */
(async function init() {
  try { document.documentElement.dataset.theme = localStorage.getItem("cnc-theme") || "dark"; } catch (e) { }
  try {
    const data = await loadData();
    prepare(data);
  } catch (err) {
    $("#listWrap").innerHTML = '<div id="empty"><div class="big">!</div><p>' + esc(err.message) + "</p></div>";
    return;
  }
  readHash();
  $("#search").value = state.q;
  // hash 恢复的视图/每页数量同步回控件
  document.querySelectorAll("#viewSeg button").forEach(x => x.classList.toggle("on", x.dataset.v === state.view));
  $("#sizeSel").value = String(state.size);
  $("#sortSel").value = ["path", "size", "mtime", "year", "region"].includes(state.sort) ? state.sort : "path";
  renderStats(); renderTree(); render(); bindEvents();
})();
