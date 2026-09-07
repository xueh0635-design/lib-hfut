(() => {
  "use strict";

  const REPO = "xueh0635-design/lib-hfut";
  const BRANCH = "master";
  const RECENT_KEY = "hfut_recent_courses_v2";
  const FAVORITE_KEY = "hfut_favorite_courses_v1";
  const EXCLUDED = new Set([".git", ".github", "docs", "site", "public", "web"]);
  const RESOURCE_TYPES = ["全部", "试卷", "课件", "教材", "实验资料", "习题作业", "其他"];
  const state = {
    nodes: new Map(), roots: [], files: [], activeCategory: "全部",
    homeType: "全部", dirType: "全部", lastDirPath: ""
  };

  const $ = (id) => document.getElementById(id);
  const searchInput = $("searchInput");
  const clearSearch = $("clearSearch");
  const suggestions = $("suggestions");
  const statusLine = $("statusLine");
  const breadcrumbs = $("breadcrumbs");
  const content = $("content");
  const fileTemplate = $("fileActionsTemplate");

  const key = (s) => String(s || "").normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\s_\-—–·.]+/g, "");
  const enc = (path) => path.split("/").map(encodeURIComponent).join("/");
  const fromHash = () => {
    const raw = location.hash.replace(/^#\/?/, "");
    try { return raw ? raw.split("/").map(decodeURIComponent).join("/") : ""; }
    catch { return ""; }
  };
  const info = (name) => {
    const m = name.match(/^(.+)_([A-Za-z0-9]+)$/);
    return m ? { title: m[1], code: m[2], is_course: true } : { title: name.replace(/^_+|_+$/g, "") || name, code: "", is_course: false };
  };
  const size = (bytes) => {
    if (!bytes) return "未知大小";
    const u = ["B", "KB", "MB", "GB"]; let v = bytes, i = 0;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v >= 10 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${u[i]}`;
  };
  const icon = (name) => {
    const ext = (name.split(".").pop() || "").toLowerCase();
    if (ext === "pdf") return "📕";
    if (["ppt","pptx"].includes(ext)) return "📊";
    if (["doc","docx"].includes(ext)) return "📝";
    if (["xls","xlsx","csv"].includes(ext)) return "📈";
    if (["zip","rar","7z","tar","gz"].includes(ext)) return "🗜️";
    if (["jpg","jpeg","png","gif","webp","bmp"].includes(ext)) return "🖼️";
    if (["mp4","mov","avi","mkv"].includes(ext)) return "🎬";
    if (["mp3","wav","flac","m4a"].includes(ext)) return "🎵";
    if (["md","txt","tex"].includes(ext)) return "📄";
    return "📎";
  };
  const rawUrl = (path) => `https://github.com/${REPO}/raw/refs/heads/${BRANCH}/${enc(path)}`;
  const viewUrl = (path) => `https://github.com/${REPO}/blob/${BRANCH}/${enc(path)}`;
  const treeUrl = (path) => `https://github.com/${REPO}/tree/${BRANCH}/${enc(path)}`;
  const folderDownloadUrl = (path) => `https://download-directory.github.io/?url=${encodeURIComponent(treeUrl(path))}`;

  const categoryOf = (node) => {
    if (!node.is_course) return "其他资料";
    const n = key(node.title || node.name);
    const rules = [
      ["数学基础", ["高等数学","线性代数","概率","数理统计","离散数学","复变","数学物理","数值分析"]],
      ["计算机与 AI", ["python","java","程序设计","数据结构","算法","数据库","操作系统","软件","计算机","机器学习","人工智能","编译","web","网络技术","大数据"]],
      ["电子与信息", ["电路","电子","单片机","嵌入式","信号","通信","控制","自动化","数字系统","模拟","微机","传感器"]],
      ["工程与机械", ["机械","工程","材料","力学","流体","车辆","制造","热工","结构","工程图"]],
      ["通识与语言", ["英语","毛概","马原","思政","形势","军事","创新创业","大学语文","体育","经济","管理"]],
    ];
    for (const [label, words] of rules) if (words.some((w) => n.includes(key(w)))) return label;
    return "专业课程";
  };

  const resourceTypeOf = (file) => {
    const n = key(`${file.name} ${file.path}`);
    if (["试卷","真题","期末","期中","考试","考卷","历年题"].some((w) => n.includes(key(w)))) return "试卷";
    if (["课件","讲义","ppt","pptx","slides"].some((w) => n.includes(key(w)))) return "课件";
    if (["教材","参考书","电子书","教科书","textbook","book","教程"].some((w) => n.includes(key(w)))) return "教材";
    if (["实验","实验报告","lab","实训"].some((w) => n.includes(key(w)))) return "实验资料";
    if (["作业","习题","练习","题库","答案","解答"].some((w) => n.includes(key(w)))) return "习题作业";
    return "其他";
  };

  function readList(storageKey) {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  const loadRecent = () => readList(RECENT_KEY);
  const loadFavorites = () => readList(FAVORITE_KEY);
  const isFavorite = (path) => loadFavorites().includes(path);

  function toggleFavorite(path) {
    let items = loadFavorites();
    items = items.includes(path) ? items.filter((x) => x !== path) : [path, ...items.filter((x) => x !== path)];
    localStorage.setItem(FAVORITE_KEY, JSON.stringify(items.slice(0, 50)));
    render();
  }

  function rememberCourse(path) {
    const root = state.roots.find((x) => x.is_course && (path === x.path || path.startsWith(`${x.path}/`)));
    if (!root) return;
    const next = loadRecent().filter((x) => x.path !== root.path);
    next.unshift({ path: root.path, at: Date.now() });
    localStorage.setItem(RECENT_KEY, JSON.stringify(next.slice(0, 8)));
  }

  function hideSuggestions() { suggestions.hidden = true; suggestions.replaceChildren(); }
  function go(path) {
    hideSuggestions();
    if (path) rememberCourse(path);
    if (!path) { history.pushState(null, "", location.pathname + location.search); render(); }
    else location.hash = "#/" + enc(path);
  }

  function buildTree(entries) {
    state.nodes.clear(); state.roots = []; state.files = [];
    for (const e of entries.filter((e) => e.type === "tree")) {
      const top = e.path.split("/")[0];
      if (EXCLUDED.has(top) || top.startsWith(".")) continue;
      const parts = e.path.split("/");
      state.nodes.set(e.path, { type: "dir", name: parts.at(-1), path: e.path, children: [], file_count: 0, dir_count: 0 });
    }
    for (const node of state.nodes.values()) {
      const parts = node.path.split("/");
      if (parts.length === 1) { Object.assign(node, info(node.name)); node.category = categoryOf(node); state.roots.push(node); }
      else { const parent = state.nodes.get(parts.slice(0, -1).join("/")); if (parent) parent.children.push(node); }
    }
    for (const e of entries) {
      if (e.type !== "blob" && e.type !== "commit") continue;
      const parts = e.path.split("/");
      if (parts.length < 2) continue;
      const top = parts[0];
      if (EXCLUDED.has(top) || top.startsWith(".")) continue;
      const parent = state.nodes.get(parts.slice(0, -1).join("/"));
      if (!parent) continue;
      const file = { type: "file", name: parts.at(-1), path: e.path, size: e.size || 0 };
      file.resourceType = resourceTypeOf(file);
      parent.children.push(file); state.files.push(file);
    }
    const finish = (node) => {
      node.children.sort((a,b) => (a.type === b.type ? a.name.localeCompare(b.name, "zh-CN") : a.type === "dir" ? -1 : 1));
      let files = 0, dirs = 0;
      for (const child of node.children) {
        if (child.type === "file") files++;
        else { finish(child); files += child.file_count; dirs += 1 + child.dir_count; }
      }
      node.file_count = files; node.dir_count = dirs;
    };
    state.roots.forEach(finish);
    state.roots.sort((a,b) => (a.is_course === b.is_course ? a.title.localeCompare(b.title, "zh-CN") : a.is_course ? -1 : 1));
  }

  function head(title, meta = "") {
    const w = document.createElement("div"); w.className = "section-head";
    const h = document.createElement("h2"); h.textContent = title; w.append(h);
    if (meta) { const m = document.createElement("div"); m.className = "meta"; m.textContent = meta; w.append(m); }
    return w;
  }

  function favoriteButton(node, label = false) {
    const b = document.createElement("button"); b.type = "button";
    const fav = isFavorite(node.path);
    b.className = `favorite-btn${fav ? " active" : ""}${label ? " with-label" : ""}`;
    b.setAttribute("aria-label", fav ? "取消收藏" : "收藏课程");
    b.title = fav ? "取消收藏" : "收藏课程";
    b.textContent = label ? `${fav ? "★" : "☆"} ${fav ? "已收藏" : "收藏课程"}` : (fav ? "★" : "☆");
    b.onclick = (e) => { e.stopPropagation(); toggleFavorite(node.path); };
    return b;
  }

  function card(node, compact = false) {
    const c = document.createElement("article"); c.className = `course-card${compact ? " compact" : ""}`;
    const top = document.createElement("div"); top.className = "course-card-top";
    const cat = document.createElement("span"); cat.className = "category-badge"; cat.textContent = node.category || categoryOf(node);
    top.append(cat, favoriteButton(node));
    const t = document.createElement("div"); t.className = "course-title"; t.textContent = node.title || node.name;
    const tags = document.createElement("div"); tags.className = "course-tags";
    if (node.code) { const code = document.createElement("span"); code.className = "course-code"; code.textContent = node.code; tags.append(code); }
    const stat = document.createElement("span"); stat.className = "mini-stat"; stat.textContent = `${node.file_count} 文件`; tags.append(stat);
    const actions = document.createElement("div"); actions.className = "course-actions";
    const openBtn = document.createElement("button"); openBtn.type = "button"; openBtn.className = "btn secondary"; openBtn.textContent = "打开资料"; openBtn.onclick = () => go(node.path);
    const download = document.createElement("a"); download.className = "btn primary"; download.textContent = "一键下载"; download.href = folderDownloadUrl(node.path); download.target = "_blank"; download.rel = "noopener"; download.onclick = () => rememberCourse(node.path);
    actions.append(openBtn, download);
    c.append(top, t, tags, actions);
    c.addEventListener("click", (e) => { if (!e.target.closest("button,a")) go(node.path); });
    return c;
  }

  function folderRow(node) {
    const r = document.createElement("button"); r.type = "button"; r.className = "directory-row"; r.onclick = () => go(node.path);
    const i = document.createElement("div"); i.className = "item-icon"; i.textContent = "📁";
    const b = document.createElement("div"); b.className = "item-body";
    const t = document.createElement("div"); t.className = "item-title"; t.textContent = node.name;
    const s = document.createElement("div"); s.className = "item-sub"; s.textContent = `${node.file_count} 个文件 · ${node.dir_count} 个子目录`;
    const a = document.createElement("div"); a.className = "row-arrow"; a.textContent = "›";
    b.append(t,s); r.append(i,b,a); return r;
  }

  function fileRow(node, showPath = false) {
    const r = document.createElement("div"); r.className = "file-row" + (showPath ? " search-file-hit" : "");
    const i = document.createElement("div"); i.className = "item-icon"; i.textContent = icon(node.name);
    const b = document.createElement("div"); b.className = "item-body";
    const t = document.createElement("div"); t.className = "item-title"; t.textContent = node.name;
    const type = document.createElement("span"); type.className = "resource-badge"; type.textContent = node.resourceType || resourceTypeOf(node);
    const s = document.createElement("div"); s.className = "item-sub"; s.textContent = showPath ? node.path : size(node.size);
    b.append(t, type, s);
    const actions = fileTemplate.content.cloneNode(true);
    actions.querySelector(".js-view").href = viewUrl(node.path);
    const dl = actions.querySelector(".js-download"); dl.href = rawUrl(node.path); dl.setAttribute("download", node.name);
    r.append(i,b,actions); return r;
  }

  function crumbs(path) {
    breadcrumbs.replaceChildren();
    const homeBtn = document.createElement("button"); homeBtn.className = "crumb"; homeBtn.textContent = "首页"; homeBtn.onclick = () => go(""); breadcrumbs.append(homeBtn);
    if (!path) return;
    const parts = path.split("/"); let current = "";
    parts.forEach((p, idx) => {
      const sep = document.createElement("span"); sep.className = "crumb-sep"; sep.textContent = "›"; breadcrumbs.append(sep);
      current = current ? `${current}/${p}` : p;
      const b = document.createElement("button"); b.className = idx === parts.length - 1 ? "crumb current" : "crumb"; b.textContent = p;
      if (idx < parts.length - 1) { const target = current; b.onclick = () => go(target); } else b.disabled = true;
      breadcrumbs.append(b);
    });
  }

  function categoryBar(courses) {
    const counts = new Map([["全部", courses.length]]);
    for (const course of courses) counts.set(course.category, (counts.get(course.category) || 0) + 1);
    const wrap = document.createElement("div"); wrap.className = "category-strip";
    for (const [label, count] of counts) {
      const b = document.createElement("button"); b.type = "button"; b.className = `category-chip${state.activeCategory === label ? " active" : ""}`;
      b.innerHTML = `<span>${label}</span><small>${count}</small>`;
      b.onclick = () => { state.activeCategory = label; home(); };
      wrap.append(b);
    }
    return wrap;
  }

  function resourceTypeBar(current, onChange, files = state.files) {
    const counts = new Map(RESOURCE_TYPES.map((x) => [x, 0])); counts.set("全部", files.length);
    for (const f of files) counts.set(f.resourceType, (counts.get(f.resourceType) || 0) + 1);
    const wrap = document.createElement("div"); wrap.className = "resource-strip";
    for (const type of RESOURCE_TYPES) {
      const b = document.createElement("button"); b.type = "button"; b.className = `resource-chip${current === type ? " active" : ""}`;
      b.innerHTML = `<span>${type}</span><small>${counts.get(type) || 0}</small>`;
      b.onclick = () => onChange(type);
      wrap.append(b);
    }
    return wrap;
  }

  function favoritesSection() {
    const favs = loadFavorites().map((p) => state.roots.find((x) => x.path === p)).filter(Boolean);
    if (!favs.length) return null;
    const section = document.createElement("section"); section.className = "home-block";
    section.append(head("我的收藏", `${favs.length} 门课程 · 收藏只保存在当前浏览器`));
    const grid = document.createElement("div"); grid.className = "recent-grid"; favs.slice(0, 10).forEach((x) => grid.append(card(x, true))); section.append(grid);
    return section;
  }

  function recentCourses() {
    const recent = loadRecent().map((r) => state.roots.find((x) => x.path === r.path)).filter(Boolean).slice(0, 6);
    if (!recent.length) return null;
    const section = document.createElement("section"); section.className = "home-block";
    section.append(head("最近课程", "保存在当前浏览器，本地记录，不上传"));
    const grid = document.createElement("div"); grid.className = "recent-grid"; recent.forEach((x) => grid.append(card(x, true))); section.append(grid);
    return section;
  }

  function renderResourceHits(files, type, limit = 80) {
    const matches = type === "全部" ? [] : files.filter((f) => f.resourceType === type);
    if (type === "全部") return null;
    const block = document.createElement("section"); block.className = "home-block resource-results";
    block.append(head(`${type}资料`, matches.length > limit ? `显示前 ${limit} 个，共 ${matches.length} 个` : `${matches.length} 个文件`));
    if (!matches.length) { const e = document.createElement("div"); e.className = "empty-card"; e.textContent = `这里暂时没有识别到“${type}”资料。`; block.append(e); return block; }
    const list = document.createElement("div"); list.className = "list"; matches.slice(0, limit).forEach((f) => list.append(fileRow(f, true))); block.append(list); return block;
  }

  function home() {
    crumbs(""); content.replaceChildren();
    const courses = state.roots.filter(x => x.is_course), other = state.roots.filter(x => !x.is_course);
    const fav = favoritesSection(); if (fav) content.append(fav);
    const recent = recentCourses(); if (recent) content.append(recent);

    const resources = document.createElement("section"); resources.className = "home-block";
    resources.append(head("按资料类型找", "试卷、课件、教材、实验资料等可直接筛选"));
    resources.append(resourceTypeBar(state.homeType, (type) => { state.homeType = type; home(); }));
    const hits = renderResourceHits(state.files, state.homeType); if (hits) resources.append(hits);
    content.append(resources);

    const categories = document.createElement("section"); categories.className = "home-block";
    categories.append(head("课程分类", "点分类即可筛选课程"), categoryBar(courses)); content.append(categories);

    const filtered = state.activeCategory === "全部" ? courses : courses.filter((x) => x.category === state.activeCategory);
    content.append(head(state.activeCategory === "全部" ? "全部课程" : state.activeCategory, `${filtered.length} 门课程 · 可收藏、打开或一键下载`));
    const grid = document.createElement("div"); grid.className = "course-grid"; filtered.forEach(x => grid.append(card(x))); content.append(grid);

    if (other.length && state.activeCategory === "全部") {
      content.append(head("其他资料", `${other.length} 个资料分类`));
      const g = document.createElement("div"); g.className = "course-grid"; other.forEach(x => g.append(card(x))); content.append(g);
    }
  }

  function directory(node) {
    rememberCourse(node.path);
    if (state.lastDirPath !== node.path) { state.dirType = "全部"; state.lastDirPath = node.path; }
    crumbs(node.path); content.replaceChildren();
    const titleWrap = document.createElement("div"); titleWrap.className = "directory-titlebar";
    const titleInfo = document.createElement("div"); titleInfo.append(head(node.title || node.name, `${node.file_count} 个文件 · ${node.dir_count} 个子目录`));
    titleWrap.append(titleInfo);
    const rootCourse = state.roots.find((x) => x.is_course && (node.path === x.path || node.path.startsWith(`${x.path}/`)));
    if (rootCourse) titleWrap.append(favoriteButton(rootCourse, true));
    const dl = document.createElement("a"); dl.className = "btn primary directory-download"; dl.textContent = "一键下载此目录"; dl.href = folderDownloadUrl(node.path); dl.target = "_blank"; dl.rel = "noopener"; titleWrap.append(dl);
    content.append(titleWrap);

    const subtreeFiles = state.files.filter((f) => f.path.startsWith(`${node.path}/`));
    const filterBlock = document.createElement("section"); filterBlock.className = "home-block directory-filter";
    filterBlock.append(head("资料筛选", "筛选当前目录及其所有子目录"));
    filterBlock.append(resourceTypeBar(state.dirType, (type) => { state.dirType = type; directory(node); }, subtreeFiles));
    content.append(filterBlock);

    if (state.dirType !== "全部") {
      const hits = renderResourceHits(subtreeFiles, state.dirType, 120); if (hits) content.append(hits); return;
    }

    const list = document.createElement("div"); list.className = "list";
    if (!node.children.length) { const e = document.createElement("div"); e.className = "empty-card"; e.textContent = "这个目录当前没有可显示的文件。"; content.append(e); return; }
    node.children.forEach(x => list.append(x.type === "dir" ? folderRow(x) : fileRow(x))); content.append(list);
  }

  function search(q) {
    const k = key(q); crumbs(""); content.replaceChildren();
    const roots = state.roots.filter(x => key(`${x.title} ${x.name} ${x.code} ${x.path}`).includes(k));
    const files = state.files.filter(x => key(`${x.name} ${x.path}`).includes(k));
    content.append(head(`搜索“${q}”`, `${roots.length} 个课程/分类 · ${files.length} 个文件`));
    if (roots.length) { const g = document.createElement("div"); g.className = "course-grid"; roots.slice(0,60).forEach(x => g.append(card(x))); content.append(g); }
    if (files.length) { content.append(head("文件匹配", files.length > 100 ? `显示前 100 个，共 ${files.length} 个` : "")); const list = document.createElement("div"); list.className = "list"; files.slice(0,100).forEach(x => list.append(fileRow(x,true))); content.append(list); }
    if (!roots.length && !files.length) { const e = document.createElement("div"); e.className = "empty-card"; e.textContent = "没有找到匹配结果，可以试试课程代码、课程简称或文件名。"; content.append(e); }
  }

  function showSuggestions(q) {
    const k = key(q); suggestions.replaceChildren();
    if (!k) { hideSuggestions(); return; }
    const courseHits = state.roots.filter(x => x.is_course && key(`${x.title} ${x.name} ${x.code}`).includes(k)).slice(0,5);
    const fileHits = state.files.filter(x => key(`${x.name} ${x.path}`).includes(k)).slice(0,5);
    const hits = [...courseHits.map(x => ({kind:"课程", icon:"📚", title:x.title, sub:x.code || x.path, action:() => { searchInput.value=""; go(x.path); }})),
      ...fileHits.map(x => ({kind:x.resourceType || "文件", icon:icon(x.name), title:x.name, sub:x.path, action:() => window.open(viewUrl(x.path), "_blank")}))];
    if (!hits.length) { hideSuggestions(); return; }
    for (const hit of hits) {
      const row = document.createElement("button"); row.type = "button"; row.className = "suggestion-row"; row.setAttribute("role","option");
      row.innerHTML = `<span class="suggestion-icon">${hit.icon}</span><span class="suggestion-body"><strong></strong><small></small></span><span class="suggestion-tag">${hit.kind}</span>`;
      row.querySelector("strong").textContent = hit.title; row.querySelector("small").textContent = hit.sub; row.onclick = hit.action; suggestions.append(row);
    }
    suggestions.hidden = false;
  }

  function render() {
    const q = searchInput.value.trim(); clearSearch.hidden = !q;
    if (q) return search(q);
    const path = fromHash(); if (!path) return home();
    const node = state.nodes.get(path); if (!node) return home(); directory(node);
  }

  async function init() {
    try {
      statusLine.textContent = "正在从 GitHub 读取完整目录索引…";
      const res = await fetch(`https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`, { cache: "no-store" });
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      const data = await res.json(); buildTree(data.tree || []);
      statusLine.textContent = `${state.roots.filter(x=>x.is_course).length} 门课程 · ${state.files.length} 个文件 · 支持收藏、中文联想、资料类型筛选与一键下载${data.truncated ? " · 部分超大目录可能被截断" : ""}`;
      render();
    } catch (err) {
      console.error(err); statusLine.textContent = "目录索引加载失败";
      content.innerHTML = '<div class="empty-card">暂时无法读取 GitHub 目录，请稍后刷新页面重试。</div>';
    }
  }

  searchInput.addEventListener("input", () => { showSuggestions(searchInput.value); render(); });
  searchInput.addEventListener("focus", () => showSuggestions(searchInput.value));
  clearSearch.addEventListener("click", () => { searchInput.value = ""; clearSearch.hidden = true; hideSuggestions(); searchInput.focus(); render(); });
  document.addEventListener("click", (e) => { if (!e.target.closest(".search-area")) hideSuggestions(); });
  addEventListener("hashchange", render); addEventListener("popstate", render);
  init();
})();