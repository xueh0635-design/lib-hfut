(() => {
  "use strict";

  const state = { catalog: null, nodeByPath: new Map(), files: [], collections: [] };
  const el = {
    search: document.getElementById("searchInput"),
    clear: document.getElementById("clearSearch"),
    status: document.getElementById("statusLine"),
    crumbs: document.getElementById("breadcrumbs"),
    content: document.getElementById("content"),
    fileActionsTemplate: document.getElementById("fileActionsTemplate"),
  };

  const searchKey = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\s_\-—–·.]+/g, "");
  const encodePath = (path) => path.split("/").map((part) => encodeURIComponent(part)).join("/");
  const decodeHashPath = () => {
    const raw = location.hash.replace(/^#\/?/, "");
    if (!raw) return "";
    try { return raw.split("/").map((part) => decodeURIComponent(part)).join("/"); } catch { return ""; }
  };
  const setPath = (path) => {
    if (!path) { history.pushState(null, "", location.pathname + location.search); render(); return; }
    location.hash = "#/" + encodePath(path);
  };
  const formatSize = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return "未知大小";
    const units = ["B", "KB", "MB", "GB"]; let value = bytes; let i = 0;
    while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
    return `${value >= 10 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
  };
  const extOf = (name) => { const idx = name.lastIndexOf("."); return idx >= 0 ? name.slice(idx + 1).toLowerCase() : ""; };
  const fileIcon = (name) => {
    const ext = extOf(name);
    if (ext === "pdf") return "📕";
    if (["ppt", "pptx"].includes(ext)) return "📊";
    if (["doc", "docx"].includes(ext)) return "📝";
    if (["xls", "xlsx", "csv"].includes(ext)) return "📈";
    if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "🗜️";
    if (["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) return "🖼️";
    if (["mp4", "mov", "avi", "mkv"].includes(ext)) return "🎬";
    if (["mp3", "wav", "flac", "m4a"].includes(ext)) return "🎵";
    if (["md", "txt", "tex"].includes(ext)) return "📄";
    return "📎";
  };
  const rawUrl = (path) => `https://github.com/${state.catalog.repo}/raw/refs/heads/${state.catalog.branch}/${encodePath(path)}`;
  const viewUrl = (path) => `https://github.com/${state.catalog.repo}/blob/${state.catalog.branch}/${encodePath(path)}`;
  const treeUrl = (path) => `https://github.com/${state.catalog.repo}/tree/${state.catalog.branch}/${encodePath(path)}`;

  const indexNode = (node) => {
    state.nodeByPath.set(node.path, node);
    if (node.type === "file") { state.files.push(node); return; }
    for (const child of node.children || []) indexNode(child);
  };

  const makeSectionHead = (title, meta = "") => {
    const wrap = document.createElement("div"); wrap.className = "section-head";
    const h2 = document.createElement("h2"); h2.textContent = title; wrap.appendChild(h2);
    if (meta) { const m = document.createElement("div"); m.className = "meta"; m.textContent = meta; wrap.appendChild(m); }
    return wrap;
  };

  const makeCourseCard = (collection) => {
    const card = document.createElement("div"); card.className = "course-card"; card.tabIndex = 0; card.setAttribute("role", "button");
    card.addEventListener("click", () => setPath(collection.path));
    card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPath(collection.path); } });
    const title = document.createElement("div"); title.className = "course-title"; title.textContent = collection.title || collection.name; card.appendChild(title);
    if (collection.code) { const code = document.createElement("span"); code.className = "course-code"; code.textContent = collection.code; card.appendChild(code); }
    const stats = document.createElement("div"); stats.className = "course-stats"; stats.textContent = `${collection.file_count || 0} 个文件 · ${collection.dir_count || 0} 个子目录`; card.appendChild(stats);
    return card;
  };

  const makeDirectoryRow = (node) => {
    const row = document.createElement("button"); row.type = "button"; row.className = "directory-row"; row.addEventListener("click", () => setPath(node.path));
    const icon = document.createElement("div"); icon.className = "item-icon"; icon.textContent = "📁";
    const body = document.createElement("div"); body.className = "item-body";
    const title = document.createElement("div"); title.className = "item-title"; title.textContent = node.name;
    const sub = document.createElement("div"); sub.className = "item-sub"; sub.textContent = `${node.file_count || 0} 个文件 · ${node.dir_count || 0} 个子目录`;
    const arrow = document.createElement("div"); arrow.className = "row-arrow"; arrow.textContent = "›";
    body.append(title, sub); row.append(icon, body, arrow); return row;
  };

  const makeFileRow = (node, showPath = false) => {
    const row = document.createElement("div"); row.className = "file-row"; if (showPath) row.classList.add("search-file-hit");
    const icon = document.createElement("div"); icon.className = "item-icon"; icon.textContent = fileIcon(node.name);
    const body = document.createElement("div"); body.className = "item-body";
    const title = document.createElement("div"); title.className = "item-title"; title.textContent = node.name;
    const sub = document.createElement("div"); sub.className = "item-sub"; sub.textContent = showPath ? node.path : formatSize(node.size); body.append(title, sub);
    const actions = el.fileActionsTemplate.content.cloneNode(true);
    const view = actions.querySelector(".js-view"); const download = actions.querySelector(".js-download");
    view.href = viewUrl(node.path); download.href = rawUrl(node.path); download.setAttribute("download", node.name);
    row.append(icon, body, actions); return row;
  };

  const renderBreadcrumbs = (path) => {
    el.crumbs.replaceChildren();
    const home = document.createElement("button"); home.type = "button"; home.className = "crumb"; home.textContent = "首页"; home.addEventListener("click", () => setPath("")); el.crumbs.appendChild(home);
    if (!path) return;
    const parts = path.split("/"); let current = "";
    parts.forEach((part, idx) => {
      const sep = document.createElement("span"); sep.className = "crumb-sep"; sep.textContent = "›"; el.crumbs.appendChild(sep);
      current = current ? `${current}/${part}` : part;
      const button = document.createElement("button"); button.type = "button"; button.className = idx === parts.length - 1 ? "crumb current" : "crumb"; button.textContent = part;
      if (idx !== parts.length - 1) { const target = current; button.addEventListener("click", () => setPath(target)); } else { button.disabled = true; }
      el.crumbs.appendChild(button);
    });
  };

  const renderHome = () => {
    renderBreadcrumbs(""); el.content.replaceChildren();
    const courses = state.collections.filter((item) => item.is_course); const other = state.collections.filter((item) => !item.is_course);
    el.content.appendChild(makeSectionHead("全部课程", `${courses.length} 门课程 · 点击课程直接查看资料`));
    const grid = document.createElement("div"); grid.className = "course-grid"; for (const course of courses) grid.appendChild(makeCourseCard(course)); el.content.appendChild(grid);
    if (other.length) { el.content.appendChild(makeSectionHead("其他资料", `${other.length} 个资料分类`)); const otherGrid = document.createElement("div"); otherGrid.className = "course-grid"; for (const item of other) otherGrid.appendChild(makeCourseCard(item)); el.content.appendChild(otherGrid); }
  };

  const renderDirectory = (node) => {
    renderBreadcrumbs(node.path); el.content.replaceChildren();
    el.content.appendChild(makeSectionHead(node.title || node.name, `${node.file_count || 0} 个文件 · ${node.dir_count || 0} 个子目录`));
    const list = document.createElement("div"); list.className = "list";
    if (!node.children || node.children.length === 0) { const empty = document.createElement("div"); empty.className = "empty-card"; empty.innerHTML = `这个目录当前没有可显示的文件。<br><a href="${treeUrl(node.path)}" target="_blank" rel="noopener">在 GitHub 中查看</a>`; el.content.appendChild(empty); return; }
    for (const child of node.children) list.appendChild(child.type === "dir" ? makeDirectoryRow(child) : makeFileRow(child));
    el.content.appendChild(list);
  };

  const renderSearch = (query) => {
    const key = searchKey(query); renderBreadcrumbs(""); el.content.replaceChildren();
    const courseMatches = state.collections.filter((item) => searchKey(`${item.title || ""} ${item.name || ""} ${item.code || ""} ${item.path || ""}`).includes(key));
    const fileMatches = state.files.filter((file) => searchKey(`${file.name} ${file.path}`).includes(key));
    el.content.appendChild(makeSectionHead(`搜索“${query}”`, `${courseMatches.length} 个课程/分类 · ${fileMatches.length} 个文件`));
    if (courseMatches.length) { const group = document.createElement("div"); group.className = "search-group"; group.appendChild(makeSectionHead("课程与分类")); const grid = document.createElement("div"); grid.className = "course-grid"; for (const item of courseMatches.slice(0, 60)) grid.appendChild(makeCourseCard(item)); group.appendChild(grid); el.content.appendChild(group); }
    if (fileMatches.length) { const group = document.createElement("div"); group.className = "search-group"; group.appendChild(makeSectionHead("文件匹配", fileMatches.length > 100 ? `显示前 100 个，共 ${fileMatches.length} 个` : "")); const list = document.createElement("div"); list.className = "list"; for (const file of fileMatches.slice(0, 100)) list.appendChild(makeFileRow(file, true)); group.appendChild(list); el.content.appendChild(group); }
    if (!courseMatches.length && !fileMatches.length) { const empty = document.createElement("div"); empty.className = "empty-card"; empty.textContent = "没有找到匹配结果。可以试试课程代码、课程简称或文件名中的关键词。"; el.content.appendChild(empty); }
  };

  const render = () => {
    if (!state.catalog) return;
    const query = el.search.value.trim(); el.clear.hidden = !query;
    if (query) { renderSearch(query); return; }
    const path = decodeHashPath(); if (!path) { renderHome(); return; }
    const node = state.nodeByPath.get(path);
    if (!node || node.type !== "dir") { history.replaceState(null, "", location.pathname + location.search); renderHome(); return; }
    renderDirectory(node);
  };

  const init = async () => {
    try {
      const response = await fetch("./data/catalog.json", { cache: "no-store" }); if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.catalog = await response.json(); state.collections = state.catalog.collections || [];
      for (const collection of state.collections) indexNode(collection);
      const courseCount = state.collections.filter((item) => item.is_course).length;
      el.status.textContent = `${courseCount} 门课程 · ${state.files.length} 个文件 · 搜索支持中文、课程代码和文件名`;
      render();
    } catch (error) {
      console.error(error); el.status.textContent = "资料索引加载失败"; el.content.innerHTML = '<div class="empty-card">索引暂时无法加载，请刷新页面后重试。</div>';
    }
  };

  el.search.addEventListener("input", render);
  el.clear.addEventListener("click", () => { el.search.value = ""; el.clear.hidden = true; el.search.focus(); render(); });
  window.addEventListener("hashchange", render); window.addEventListener("popstate", render);
  init();
})();
