const dom = {
  editor: document.getElementById("editor"),
  article: document.getElementById("article"),
  fileLocation: document.getElementById("fileLocation"),
  saveStatus: document.getElementById("saveStatus"),
  lineNumbers: document.getElementById("lineNumbers"),
  themeToggle: document.getElementById("themeToggle"),
  exportBtn: document.getElementById("exportBtn"),
  resizer: document.getElementById("resizer"),
  editorPane: document.getElementById("editorPane"),
  editorToolbar: document.getElementById("editorToolbar"),
  outlineBox: document.getElementById("outlineBox"),
  outlineList: document.getElementById("outlineList"),

  // Search bar
  openFileBtn: document.getElementById("openFileBtn"),
  searchToggleBtn: document.getElementById("searchToggleBtn"),
  searchBar: document.getElementById("searchBar"),
  searchInput: document.getElementById("searchInput"),
  searchCount: document.getElementById("searchCount"),
  searchPrev: document.getElementById("searchPrev"),
  searchNext: document.getElementById("searchNext"),
  searchClose: document.getElementById("searchClose"),

  // Status bar (word count)
  wordCount: document.getElementById("wordCount"),
  charCount: document.getElementById("charCount"),
  readingTime: document.getElementById("readingTime"),

  // hljs theme stylesheet link
  hljsTheme: document.getElementById("hljsTheme"),
};

const STORAGE_KEY = "ke_document_content";
const LOCATION_KEY = "ke_file_location";
const THEME_KEY = "ke_theme";

// The two highlight.js theme URLs we swap between.
const HLJS_LIGHT =
  "https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github.min.css";
const HLJS_DARK =
  "https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github-dark.min.css";

let saveTimer = null;
let mermaidReady = false;

window.addEventListener("mermaid-ready", () => {
  mermaidReady = true;
});

// ---------------------------------------------------
// THEME TOGGLE (Light/Dark)
// ---------------------------------------------------
const Theme = {
  load() {
    const saved = localStorage.getItem(THEME_KEY);
    const isDark =
      saved === "dark" ||
      (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (isDark) document.documentElement.setAttribute("data-theme", "dark");
    dom.themeToggle.textContent = isDark ? "☀️" : "🌙";
    this.applyHljsTheme(isDark);
  },

  toggle() {
    const isDark =
      document.documentElement.getAttribute("data-theme") === "dark";
    if (isDark) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem(THEME_KEY, "light");
      dom.themeToggle.textContent = "🌙";
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem(THEME_KEY, "dark");
      dom.themeToggle.textContent = "☀️";
    }

    const nowDark = !isDark;

    // Swap the highlight.js stylesheet to match the new theme.
    this.applyHljsTheme(nowDark);

    // Re-theme Mermaid and redraw any diagrams already on screen,
    // otherwise they'd keep the old theme until the next edit.
    if (window.reinitMermaidTheme) {
      window.reinitMermaidTheme(nowDark);
      renderMarkdown();
    }
  },

  // Feature 1: Syntax highlighting theme switching.
  // Swaps the <link id="hljsTheme"> href between the light and dark
  // highlight.js stylesheets so fenced code blocks stay readable
  // instead of looking washed out in dark mode.
  applyHljsTheme(isDark) {
    if (!dom.hljsTheme) return;
    const targetHref = isDark ? HLJS_DARK : HLJS_LIGHT;
    if (dom.hljsTheme.getAttribute("href") !== targetHref) {
      dom.hljsTheme.setAttribute("href", targetHref);
    }
  },
};

// ---------------------------------------------------
// AUTOSAVE MODULE
// ---------------------------------------------------
const Autosave = {
  load() {
    const savedContent = localStorage.getItem(STORAGE_KEY);
    const savedLocation = localStorage.getItem(LOCATION_KEY);
    if (savedContent !== null) dom.editor.value = savedContent;
    if (savedLocation !== null) dom.fileLocation.value = savedLocation;
  },
  scheduleSave() {
    dom.saveStatus.textContent = "● Editing";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, dom.editor.value);
      localStorage.setItem(LOCATION_KEY, dom.fileLocation.value);
      dom.saveStatus.textContent = "✓ Saved";
    }, 400);
  },
};

// ---------------------------------------------------
// LINE NUMBERS
// ---------------------------------------------------
const LineNumbers = {
  update() {
    const linesCount = dom.editor.value.split("\n").length || 1;
    let html = "";
    for (let i = 1; i <= linesCount; i++) html += `<div>${i}</div>`;
    dom.lineNumbers.innerHTML = html;
  },
  syncScroll() {
    dom.lineNumbers.scrollTop = dom.editor.scrollTop;
  },
};

// ---------------------------------------------------
// WIKI LINK PARSING
// ---------------------------------------------------
const WikiLinks = {
  transform(rawMarkdown) {
    return rawMarkdown.replace(/\[\[([^\[\]]+)\]\]/g, (match, concept) => {
      const clean = concept.trim();
      const slug = clean.toLowerCase().replace(/\s+/g, "-");
      return `<span class="wiki-link" data-concept="${slug}" title="Internal concept: ${clean}">${clean}</span>`;
    });
  },
};

// ---------------------------------------------------
// MARKDOWN RENDERING CONFIG
// ---------------------------------------------------
const renderer = new marked.Renderer();
let codeBlockIndex = 0;
const mermaidBlocks = [];

renderer.code = function (code, infostring) {
  const lang = (infostring || "").trim().toLowerCase();

  if (lang === "mermaid") {
    const id = `mermaid-${codeBlockIndex++}`;
    mermaidBlocks.push({ id, code });
    return `<div class="mermaid-wrapper" id="${id}"></div>`;
  }

  let highlighted = escapeHtml(code);
  try {
    if (lang && hljs.getLanguage(lang))
      highlighted = hljs.highlight(code, { language: lang }).value;
  } catch (e) {}

  const blockId = `code-${codeBlockIndex++}`;
  return `<div class="code-block-wrapper"><button class="copy-btn" data-target="${blockId}">Copy</button><pre><code id="${blockId}" class="hljs language-${lang}">${highlighted}</code></pre></div>`;
};

marked.setOptions({ gfm: true, breaks: true });
marked.use({ renderer });

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMarkdown() {
  const raw = dom.editor.value;

  if (!raw.trim()) {
    dom.article.innerHTML =
      '<p class="empty-state">Start writing to see the live preview...</p>';
    Outline.render([]);
    return;
  }

  codeBlockIndex = 0;
  mermaidBlocks.length = 0;

  const withWikiLinks = WikiLinks.transform(raw);
  const html = marked.parse(withWikiLinks);
  dom.article.innerHTML = html;

  MathRenderer.render(dom.article);
  Mermaid.renderAll();
  CodeBlocks.attachCopyButtons();

  const headings = Outline.extract(dom.article);
  Outline.render(headings);
}

// ---------------------------------------------------
// UTILITIES (Math, Mermaid, Outline, Copy)
// ---------------------------------------------------
const MathRenderer = {
  render(container) {
    if (!window.renderMathInElement) return;
    renderMathInElement(container, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
      ],
      throwOnError: false,
    });
  },
};

const Mermaid = {
  async renderAll() {
    if (mermaidBlocks.length === 0) return;
    if (!mermaidReady || !window.mermaid)
      return setTimeout(() => Mermaid.renderAll(), 150);

    for (const block of mermaidBlocks) {
      const el = document.getElementById(block.id);
      if (!el) continue;
      try {
        const { svg } = await window.mermaid.render(
          block.id + "-svg",
          block.code,
        );
        el.innerHTML = svg;
      } catch (err) {
        el.innerHTML = `<p class="empty-state">Invalid diagram</p>`;
      }
    }
  },
};

const CodeBlocks = {
  attachCopyButtons() {
    dom.article.querySelectorAll(".copy-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const codeEl = document.getElementById(btn.getAttribute("data-target"));
        navigator.clipboard.writeText(codeEl.textContent).then(() => {
          btn.textContent = "Copied";
          btn.classList.add("copied");
          setTimeout(() => {
            btn.textContent = "Copy";
            btn.classList.remove("copied");
          }, 1200);
        });
      });
    });
  },
};

const Outline = {
  extract(container) {
    const nodes = container.querySelectorAll("h1, h2, h3");
    const headings = [];
    nodes.forEach((node, i) => {
      if (!node.id) node.id = `heading-${i}`;
      headings.push({
        id: node.id,
        text: node.textContent,
        level: parseInt(node.tagName.substring(1), 10),
      });
    });
    return headings;
  },
  render(headings) {
    if (headings.length === 0) {
      dom.outlineList.innerHTML =
        '<span class="outline-empty">No headings yet</span>';
      return;
    }
    dom.outlineList.innerHTML = headings
      .map((h) => `<a href="#${h.id}" class="lvl-${h.level}">${h.text}</a>`)
      .join("");
  },
};

// ---------------------------------------------------
// FORMATTING TOOLBAR & SHORTCUTS
// ---------------------------------------------------
const FormatToolbar = {
  actions: {
    bold: () => FormatToolbar.wrap("**", "**", "bold text"),
    italic: () => FormatToolbar.wrap("*", "*", "italic text"),
    h1: () => FormatToolbar.linePrefix("# "),
    h2: () => FormatToolbar.linePrefix("## "),
    h3: () => FormatToolbar.linePrefix("### "),
    quote: () => FormatToolbar.linePrefix("> "),
    code: () => FormatToolbar.wrap("`", "`", "code"),
    codeblock: () => FormatToolbar.wrap("```\n", "\n```", "code"),
    ul: () => FormatToolbar.linePrefix("- "),
    ol: () => FormatToolbar.linePrefix("1. "),
    task: () => FormatToolbar.linePrefix("- [ ] "),
    link: () => FormatToolbar.wrap("[", "](https://)", "link text"),
    wikilink: () => FormatToolbar.wrap("[[", "]]", "Concept"),
  },

  wrap(before, after, placeholder) {
    const el = dom.editor;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = el.value.substring(start, end) || placeholder;
    el.value = `${el.value.slice(0, start)}${before}${selected}${after}${el.value.slice(end)}`;
    el.selectionStart = start + before.length;
    el.selectionEnd = start + before.length + selected.length;
    el.focus();
    el.dispatchEvent(new Event("input")); // Triggers autosave + render properly
  },

  linePrefix(prefix) {
    const el = dom.editor;
    const start = el.selectionStart;
    const lineStart = el.value.lastIndexOf("\n", start - 1) + 1;
    el.value =
      el.value.slice(0, lineStart) + prefix + el.value.slice(lineStart);
    el.selectionStart = el.selectionEnd = start + prefix.length;
    el.focus();
    el.dispatchEvent(new Event("input")); // Triggers autosave + render properly
  },

  bind() {
    dom.editorToolbar.querySelectorAll(".fmt-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.getAttribute("data-action");
        if (FormatToolbar.actions[action]) FormatToolbar.actions[action]();
      });
    });
  },
};

// ---------------------------------------------------
// FEATURE: SEARCH (Ctrl+F)
// ---------------------------------------------------
// A lightweight in-editor search. It doesn't paint every match with
// its own highlight color (a plain <textarea> can't render rich
// styling inside its own text), but it finds every occurrence,
// jumps the cursor + native text selection to it, and shows you
// "match X of Y" — which covers the actual workflow need: find,
// jump, repeat.
const Search = {
  matches: [], // array of {start, end}
  current: -1, // index into matches

  open() {
    dom.searchBar.classList.add("visible");
    dom.searchInput.value = "";
    dom.searchInput.focus();
    this.clear();
  },

  close() {
    dom.searchBar.classList.remove("visible");
    this.clear();
    dom.editor.focus();
  },

  clear() {
    this.matches = [];
    this.current = -1;
    dom.searchCount.textContent = "0/0";
  },

  runQuery() {
    const query = dom.searchInput.value;
    this.matches = [];
    this.current = -1;

    if (!query) {
      dom.searchCount.textContent = "0/0";
      return;
    }

    const text = dom.editor.value;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();

    let fromIndex = 0;
    let idx;
    while ((idx = lowerText.indexOf(lowerQuery, fromIndex)) !== -1) {
      this.matches.push({ start: idx, end: idx + query.length });
      fromIndex = idx + query.length;
    }

    if (this.matches.length > 0) {
      this.current = 0;
      this.selectCurrent();
    } else {
      dom.searchCount.textContent = "0/0";
    }
  },

  selectCurrent() {
    if (this.current < 0 || this.matches.length === 0) return;
    const m = this.matches[this.current];
    dom.editor.focus();
    dom.editor.setSelectionRange(m.start, m.end);
    this.scrollMatchIntoView(m.start);
    dom.searchCount.textContent = `${this.current + 1}/${this.matches.length}`;
  },

  // Textareas don't offer a native "scroll to character index" API,
  // so we estimate the line the match is on and scroll proportionally.
  scrollMatchIntoView(charIndex) {
    const textBefore = dom.editor.value.slice(0, charIndex);
    const lineNumber = textBefore.split("\n").length;
    const totalLines = dom.editor.value.split("\n").length || 1;
    const lineHeight = dom.editor.scrollHeight / totalLines;
    dom.editor.scrollTop = Math.max(0, lineHeight * (lineNumber - 4));
  },

  next() {
    if (this.matches.length === 0) return this.runQuery();
    this.current = (this.current + 1) % this.matches.length;
    this.selectCurrent();
  },

  prev() {
    if (this.matches.length === 0) return this.runQuery();
    this.current =
      (this.current - 1 + this.matches.length) % this.matches.length;
    this.selectCurrent();
  },

  bind() {
    dom.searchToggleBtn.addEventListener("click", () => this.open());
    dom.searchClose.addEventListener("click", () => this.close());

    dom.searchInput.addEventListener("input", () => this.runQuery());
    dom.searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) this.prev();
        else this.next();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.close();
      }
    });

    dom.searchNext.addEventListener("click", () => this.next());
    dom.searchPrev.addEventListener("click", () => this.prev());
  },
};

// ---------------------------------------------------
// FEATURE: LIVE WORD COUNT
// ---------------------------------------------------
const WordCount = {
  update() {
    const text = dom.editor.value;
    const trimmed = text.trim();
    const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
    const chars = text.length;
    const minutes = Math.max(1, Math.round(words / 200)); // ~200 wpm reading speed

    dom.wordCount.textContent = `Words: ${words}`;
    dom.charCount.textContent = `Characters: ${chars}`;
    dom.readingTime.textContent = `Reading time: ${words === 0 ? 0 : minutes} min`;
  },
};

// ---------------------------------------------------
// FEATURE: DRAG & DROP IMAGES
// ---------------------------------------------------
// Dropping an image file onto the editor reads it as a base64 data
// URL (no backend/file server needed) and inserts a Markdown image
// reference at the last known cursor position.
const DragDropImages = {
  lastCaret: 0,

  bind() {
    // Track the caret so we know where to insert on drop.
    dom.editor.addEventListener(
      "keyup",
      () => (this.lastCaret = dom.editor.selectionStart),
    );
    dom.editor.addEventListener(
      "click",
      () => (this.lastCaret = dom.editor.selectionStart),
    );

    dom.editorPane.addEventListener("dragover", (e) => {
      e.preventDefault(); // required, or drop never fires
      dom.editorPane.classList.add("drag-over");
    });

    dom.editorPane.addEventListener("dragleave", (e) => {
      if (
        e.target === dom.editorPane ||
        !dom.editorPane.contains(e.relatedTarget)
      ) {
        dom.editorPane.classList.remove("drag-over");
      }
    });

    dom.editorPane.addEventListener("drop", (e) => {
      e.preventDefault();
      dom.editorPane.classList.remove("drag-over");

      const files = Array.from(e.dataTransfer.files || []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length === 0) return;

      files.forEach((file) => this.insertImage(file));
    });
  },

  insertImage(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const markdown = `![${file.name}](${dataUrl})\n`;

      const pos = this.lastCaret;
      const el = dom.editor;
      el.value = el.value.slice(0, pos) + markdown + el.value.slice(pos);

      const newPos = pos + markdown.length;
      el.selectionStart = el.selectionEnd = newPos;
      this.lastCaret = newPos;

      el.focus();
      el.dispatchEvent(new Event("input")); // triggers render + autosave + word count
    };
    reader.readAsDataURL(file);
  },
};

// ---------------------------------------------------
// FEATURE: LOCAL FILE SYSTEM (real save-to-disk)
// ---------------------------------------------------
// localStorage survives a deploy fine, but it's tied to one browser
// profile. This lets you open a real .md file once, then every save
// writes straight back to that file on your actual disk. Only
// Chrome/Edge support it, so FileSystem.supported() gates it off in
// other browsers -- they silently keep using the download-based
// export instead.
const FileSystem = {
  handle: null,

  supported() {
    return "showOpenFilePicker" in window;
  },

  async open() {
    if (!this.supported()) return;
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          { description: "Markdown", accept: { "text/markdown": [".md"] } },
        ],
      });
      this.handle = handle;
      const file = await handle.getFile();
      const text = await file.text();
      dom.editor.value = text;
      dom.fileLocation.value = file.name;
      dom.editor.dispatchEvent(new Event("input")); // re-render + word count + autosave
      dom.saveStatus.textContent = "📁 Local";
    } catch (err) {
      if (err.name !== "AbortError") console.error("Open failed:", err);
    }
  },

  async saveToHandle() {
    if (!this.handle) return false;
    try {
      const writable = await this.handle.createWritable();
      await writable.write(dom.editor.value);
      await writable.close();
      dom.saveStatus.textContent = "✓ Local";
      return true;
    } catch (err) {
      console.error("Disk save failed:", err);
      return false;
    }
  },
};

// ---------------------------------------------------
// EXPORT & RESIZER
// ---------------------------------------------------
const Exporters = {
  // Tries writing to the linked local file first; only falls back
  // to the browser download dialog if no file is open (or on
  // browsers without File System Access API support).
  async save() {
    const savedToDisk = await FileSystem.saveToHandle();
    if (!savedToDisk) this.download();
  },
  download() {
    const markdown = dom.editor.value;
    const filenamePath = dom.fileLocation.value.trim() || "untitled.md";
    const filename = filenamePath.split("/").pop() || "untitled.md";
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};

const SplitPane = {
  bind() {
    let resizing = false;
    dom.resizer.addEventListener("mousedown", () => {
      resizing = true;
      document.body.style.userSelect = "none";
    });
    document.addEventListener("mousemove", (e) => {
      if (!resizing) return;
      const totalWidth = document.querySelector(".workspace").offsetWidth;
      const newWidthPercent = (e.clientX / totalWidth) * 100;
      if (newWidthPercent > 20 && newWidthPercent < 80)
        dom.editorPane.style.width = newWidthPercent + "%";
    });
    document.addEventListener("mouseup", () => {
      resizing = false;
      document.body.style.userSelect = "";
    });
  },
};

// ---------------------------------------------------
// FEATURE: TOPBAR SPACE SHADER (decorative)
// ---------------------------------------------------
const TopbarStars = {
  init() {
    const container = document.getElementById("topbarStars");
    if (!container) return;
    const STAR_COUNT = 40; // fewer than the original 70 -- thin bar, no need to overcrowd
    let html = "";
    for (let i = 0; i < STAR_COUNT; i++) {
      let size;

      const r = Math.random();

      if (r < 0.7) size = 1;
      else if (r < 0.92) size = 2;
      else if (r < 0.985) size = 3;
      else size = 4;
      const top = Math.random() * 100;
      const left = Math.random() * 100;
      const duration = (Math.random() * 3 + 1.5).toFixed(2);
      const delay = (Math.random() * 4).toFixed(2);

      const colors = [
        "#ffffff",
        "#f8fbff",
        "#dbeafe",
        "#93c5fd",
        "#c4b5fd",
        "#fde68a",
      ];

      const color = colors[Math.floor(Math.random() * colors.length)];

      html += `<span
      style="
      width:${size}px;
      height:${size}px;
      top:${top}%;
      left:${left}%;
      background:${color};
      box-shadow:0 0 6px ${color};
      animation-duration:${duration}s;
      animation-delay:${delay}s;
      "></span>`;
    }
    container.innerHTML = html;
  },
};

// ---------------------------------------------------
// UI WIRING & INIT
// ---------------------------------------------------
function bindEvents() {
  dom.editor.addEventListener("input", () => {
    LineNumbers.update();
    renderMarkdown();
    Autosave.scheduleSave();
    WordCount.update();
  });
  dom.editor.addEventListener("scroll", LineNumbers.syncScroll);
  dom.fileLocation.addEventListener("input", Autosave.scheduleSave);
  dom.exportBtn.addEventListener("click", () => Exporters.save());
  dom.openFileBtn.addEventListener("click", () => FileSystem.open());
  dom.themeToggle.addEventListener("click", () => Theme.toggle());

  // Save shortcut works anywhere on the page, not just while the
  // editor textarea is focused (e.g. while editing the file path).
  window.addEventListener("keydown", (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

    if (isCmdOrCtrl && e.key.toLowerCase() === "s") {
      e.preventDefault();
      Exporters.save();
    }

    // Ctrl/Cmd+F opens our in-editor search instead of the browser's
    // native page search.
    if (isCmdOrCtrl && e.key.toLowerCase() === "f") {
      e.preventDefault();
      Search.open();
    }
  });

  // Bold/italic shortcuts only make sense while typing in the editor.
  dom.editor.addEventListener("keydown", (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
    if (isCmdOrCtrl) {
      switch (e.key.toLowerCase()) {
        case "b":
          e.preventDefault();
          FormatToolbar.actions.bold();
          break;
        case "i":
          e.preventDefault();
          FormatToolbar.actions.italic();
          break;
      }
    }
  });

  FormatToolbar.bind();
  SplitPane.bind();
  Search.bind();
  DragDropImages.bind();
}

function init() {
  Theme.load();
  Autosave.load();
  bindEvents();
  LineNumbers.update();
  renderMarkdown();
  WordCount.update();
  TopbarStars.init();
}

init();
