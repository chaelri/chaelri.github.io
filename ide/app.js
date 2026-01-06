const viewer = document.getElementById("viewer");
const inspectorData = document.getElementById("inspector-data");
const consoleLogs = document.getElementById("console-logs");
const toggleInspect = document.getElementById("toggleInspect");
const consoleInput = document.getElementById("consoleInput");
const htmlPicker = document.getElementById("htmlPicker");
const fileList = document.getElementById("file-list");

let isInspectMode = false;
let currentFileMap = {};
let currentActivePath = "";

// --- THE "SUPER SMART" BRIDGE ---
// Overrides fetch/XHR inside iframe to point to our local blobs
const getBridgeScript = (fileMap, currentPath) => `
<script>
    window.localFileMap = ${JSON.stringify(fileMap)};
    window.currentPath = "${currentPath}";

    const resolveLocalPath = (rel) => {
        if (!rel || rel.startsWith('http') || rel.startsWith('blob:') || rel.startsWith('data:')) return rel;
        const stack = window.currentPath.split('/'); stack.pop();
        for (const part of rel.split('/')) {
            if (part === '.') continue;
            if (part === '..') stack.pop(); else stack.push(part);
        }
        const abs = stack.join('/');
        return window.localFileMap[abs] || rel;
    };

    // INTERCEPT FETCH
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        const resolved = resolveLocalPath(url);
        return originalFetch(resolved, init);
    };

    // INTERCEPT XHR
    const originalXHR = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(method, url) {
        return originalXHR.apply(this, [method, resolveLocalPath(url)]);
    };

    // INSPECTOR LOGIC
    let selectedEl = null;
    const relay = (level, args) => window.parent.postMessage({ type: 'CONSOLE', level, data: args.join(' ') }, '*');
    console.log = (...args) => relay('log', args);
    console.error = (...args) => relay('error', args);

    window.addEventListener('click', (e) => {
        if (window.isInspectMode) {
            e.preventDefault(); e.stopPropagation();
            selectedEl = e.target;
            const style = window.getComputedStyle(selectedEl);
            window.parent.postMessage({
                type: 'INSPECT',
                tagName: selectedEl.tagName.toLowerCase(),
                id: selectedEl.id,
                classList: Array.from(selectedEl.classList),
                innerHTML: selectedEl.innerHTML,
                styles: {
                    display: style.display, color: style.color, 'background-color': style.backgroundColor,
                    padding: style.padding, margin: style.margin, 'font-size': style.fontSize
                }
            }, '*');
        }
    }, true);

    window.addEventListener('message', (e) => {
        const { type, enabled, code, prop, value, attr, html } = e.data;
        if(type === 'SET_INSPECT_MODE') { window.isInspectMode = enabled; document.body.style.cursor = enabled ? 'crosshair' : 'default'; }
        if(type === 'EXEC_JS') try { eval(code); } catch(err) { console.error(err.message); }
        if(!selectedEl) return;
        if(type === 'UPDATE_STYLE') selectedEl.style[prop] = value;
        if(type === 'UPDATE_ATTR') selectedEl.setAttribute(attr, value);
        if(type === 'UPDATE_HTML') selectedEl.innerHTML = html;
    });
</script>`;

// --- PATH RESOLUTION & RECURSIVE SCAN ---

async function scanDirectory(dirHandle, path = "") {
  for await (const entry of dirHandle.values()) {
    const entryPath = path ? `${path}/${entry.name}` : entry.name;
    if (entry.kind === "file") {
      const file = await entry.getFile();
      let blobUrl = URL.createObjectURL(file);

      // CSS SMART PROCESSING
      if (entry.name.endsWith(".css")) {
        let cssText = await file.text();
        cssText = cssText.replace(
          /url\(["']?([^"']+)["']?\)/g,
          (match, rel) => {
            const abs = resolveInternalPath(entryPath, rel);
            return `url(${currentFileMap[abs] || rel})`;
          }
        );
        blobUrl = URL.createObjectURL(
          new Blob([cssText], { type: "text/css" })
        );
      }

      currentFileMap[entryPath] = blobUrl;
      addFileToSidebar(entryPath);
      if (entry.name.endsWith(".html")) {
        const opt = document.createElement("option");
        opt.value = entryPath;
        opt.textContent = entryPath;
        htmlPicker.appendChild(opt);
      }
    } else await scanDirectory(entry, entryPath);
  }
}

function resolveInternalPath(basePath, relativePath) {
  if (
    !relativePath ||
    relativePath.startsWith("http") ||
    relativePath.startsWith("blob:")
  )
    return relativePath;
  const stack = basePath.split("/");
  stack.pop();
  for (const part of relativePath.split("/")) {
    if (part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

document.getElementById("pickFolder").addEventListener("click", async () => {
  try {
    const dirHandle = await window.showDirectoryPicker();
    currentFileMap = {};
    htmlPicker.innerHTML = "";
    fileList.innerHTML = "";
    await scanDirectory(dirHandle);
    const options = Array.from(htmlPicker.options).map((o) => o.value);
    const target = options.includes("index.html")
      ? "index.html"
      : options[0] || "";
    if (target) {
      htmlPicker.classList.remove("hidden");
      htmlPicker.value = target;
      loadSmartHtml(target);
    }
  } catch (e) {
    console.error(e);
  }
});

document.getElementById("pickFile").addEventListener("click", async () => {
  try {
    const [handle] = await window.showOpenFilePicker();
    const file = await handle.getFile();
    const html = await file.text();
    htmlPicker.classList.add("hidden");
    render(html + getBridgeScript({}, file.name));
  } catch (e) {}
});

async function loadSmartHtml(filePath) {
  currentActivePath = filePath;
  const response = await fetch(currentFileMap[filePath]);
  let html = (await response.text()).replace(
    /(src|href|data|poster)=["']([^"']+)["']/g,
    (match, attr, relPath) => {
      const abs = resolveInternalPath(filePath, relPath);
      return currentFileMap[abs] ? `${attr}="${currentFileMap[abs]}"` : match;
    }
  );
  render(html + getBridgeScript(currentFileMap, filePath));
}

function render(fullHtml) {
  document.getElementById("empty-state").classList.add("hidden");
  viewer.classList.add("visible");
  viewer.srcdoc = fullHtml;
}

// --- DEVTOOLS HANDLERS ---

window.addEventListener("message", (e) => {
  const { type, level, data, tagName, id, classList, styles, innerHTML } =
    e.data;
  if (type === "CONSOLE") {
    const div = document.createElement("div");
    div.className = `log-entry log-${level}`;
    div.innerText = `[${level.toUpperCase()}] ` + data;
    consoleLogs.appendChild(div);
    consoleLogs.scrollTop = consoleLogs.scrollHeight;
  }
  if (type === "INSPECT") {
    let styleInputs = "";
    for (const [prop, val] of Object.entries(styles)) {
      styleInputs += `
            <div class="prop-row">
                <span class="prop-label">${prop}</span>
                <input class="edit-input" value="${val}" onchange="updateLiveStyle('${prop}', this.value)">
            </div>`;
    }
    inspectorData.innerHTML = `
            <div class="p-6 bg-slate-900 border-b border-slate-800">
                <div class="text-orange-500 font-black text-2xl tracking-tighter italic">&lt;${tagName}&gt;</div>
                <div class="flex flex-col gap-3 mt-5">
                    <div class="flex items-center gap-3">
                        <span class="prop-label">ID</span>
                        <input class="edit-input" value="${id}" onchange="updateLiveAttr('id', this.value)">
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="prop-label">Class</span>
                        <input class="edit-input" value="${classList.join(
                          " "
                        )}" onchange="updateLiveAttr('class', this.value)">
                    </div>
                </div>
            </div>
            <div class="p-6 border-b border-slate-800 bg-slate-950">
                <div class="text-[9px] text-slate-500 font-bold uppercase mb-3 tracking-[0.2em]">HTML Content</div>
                <textarea class="edit-input h-32 text-[10px] leading-relaxed" oninput="updateLiveHtml(this.value)">${innerHTML}</textarea>
            </div>
            <div class="py-2">
                <div class="px-6 py-3 text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em]">Live Computed Styles</div>
                ${styleInputs}
            </div>`;
  }
});

window.updateLiveStyle = (prop, value) =>
  viewer.contentWindow.postMessage({ type: "UPDATE_STYLE", prop, value }, "*");
window.updateLiveAttr = (attr, value) =>
  viewer.contentWindow.postMessage({ type: "UPDATE_ATTR", attr, value }, "*");
window.updateLiveHtml = (html) =>
  viewer.contentWindow.postMessage({ type: "UPDATE_HTML", html }, "*");

function setViewport(w) {
  viewer.style.width = w;
  document
    .querySelectorAll(".v-btn")
    .forEach((b) => b.classList.remove("active"));
  event.currentTarget.classList.add("active");
}

function switchTab(t) {
  ["inspect", "files", "console"].forEach((id) => {
    document.getElementById("pane-" + id).classList.toggle("hidden", id !== t);
    document
      .getElementById("tab-" + id)
      .classList.toggle("border-emerald-500", id === t);
    document
      .getElementById("tab-" + id)
      .classList.toggle("text-emerald-400", id === t);
  });
}

function addFileToSidebar(path) {
  const div = document.createElement("div");
  div.className = "file-item";
  const icon = path.endsWith(".html")
    ? "code"
    : path.endsWith(".css")
    ? "palette"
    : "description";
  div.innerHTML = `<span class="material-icons text-[14px]"> ${icon}</span> <span>${path}</span>`;
  div.onclick = () => {
    if (path.endsWith(".html")) {
      htmlPicker.value = path;
      loadSmartHtml(path);
    }
  };
  fileList.appendChild(div);
}

consoleInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    viewer.contentWindow.postMessage(
      { type: "EXEC_JS", code: consoleInput.value },
      "*"
    );
    const div = document.createElement("div");
    div.className = "log-entry log-input";
    div.innerText = `>> ${consoleInput.value}`;
    consoleLogs.appendChild(div);
    consoleInput.value = "";
  }
});

toggleInspect.addEventListener("click", () => {
  isInspectMode = !isInspectMode;
  toggleInspect.classList.toggle("border-orange-500", isInspectMode);
  toggleInspect.classList.toggle("bg-slate-700", isInspectMode);
  viewer.contentWindow.postMessage(
    { type: "SET_INSPECT_MODE", enabled: isInspectMode },
    "*"
  );
});

htmlPicker.addEventListener("change", (e) => loadSmartHtml(e.target.value));
