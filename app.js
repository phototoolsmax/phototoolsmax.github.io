const $ = (id) => document.getElementById(id);

const fileInput = $("fileInput");
const selectBtn = $("selectBtn");
const compressBtn = $("compressBtn");
const clearBtn = $("clearBtn");
const targetKB = $("targetKB");
const maxWidth = $("maxWidth");
const outFormat = $("outFormat");
const statusLine = $("statusLine");
const countLine = $("countLine");
const list = $("list");
const progressBar = $("progressBar");
const themeBtn = $("themeBtn");

let files = [];

function bytesToKB(bytes){ return Math.round(bytes / 1024); }
function formatBytes(bytes){
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb/1024).toFixed(2)} MB`;
}

function setStatus(msg){ statusLine.textContent = `Result: ${msg}`; }
function setProgress(p){ progressBar.style.width = `${Math.max(0, Math.min(100, p))}%`; }

selectBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
  files = Array.from(e.target.files || []);
  renderList();
});

function renderList(){
  list.innerHTML = "";
  if (!files.length){
    countLine.textContent = "";
    setStatus("—");
    setProgress(0);
    return;
  }
  countLine.textContent = `${files.length} file(s) selected`;
  setStatus("Ready");
  files.forEach((f) => {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="itemLeft">
        <div class="itemTitle">${escapeHtml(f.name)}</div>
        <div class="itemMeta">Original: ${formatBytes(f.size)}</div>
      </div>
      <div class="itemActions">
        <span class="pill">${f.type || "image"}</span>
      </div>
    `;
    list.appendChild(row);
  });
}

clearBtn.addEventListener("click", () => {
  files = [];
  fileInput.value = "";
  renderList();
});

function escapeHtml(s){
  return s.replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

async function readAsDataURL(file){
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

async function loadImage(src){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function canvasToBlob(canvas, mime, quality){
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

function computeTargetWidth(imgW, userMaxW){
  const mw = Number(userMaxW || 0);
  if (!mw || mw <= 0) return imgW; // no resize
  return Math.min(imgW, mw);
}

async function compressOne(file, targetKBValue, userMaxW, mime){
  // Limit
  if (file.size > 20 * 1024 * 1024){
    throw new Error("File is bigger than 20MB");
  }

  const src = await readAsDataURL(file);
  const img = await loadImage(src);

  const w = computeTargetWidth(img.width, userMaxW);
  const scale = w / img.width;
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d", { alpha: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);

  const targetBytes = Math.max(10, Number(targetKBValue || 200)) * 1024;

  // PNG cannot control quality well; prefer JPG/WEBP for targeting
  const isPng = mime === "image/png";
  const minQ = 0.2;
  let lo = minQ, hi = 0.95, bestBlob = null;

  if (isPng){
    // Try WebP fallback behavior? We'll just export PNG once
    const blob = await canvasToBlob(canvas, "image/png", 1);
    return { blob, width: w, height: h };
  }

  // Binary search quality for closest under/near target
  for (let i=0; i<12; i++){
    const q = (lo + hi) / 2;
    const blob = await canvasToBlob(canvas, mime, q);
    if (!blob) throw new Error("Compression failed");

    bestBlob = blob;
    if (blob.size > targetBytes){
      hi = q;
    } else {
      lo = q;
    }
  }

  // If still too big, reduce width automatically (small step)
  if (bestBlob && bestBlob.size > targetBytes && w > 720){
    const newMaxW = Math.max(720, Math.floor(w * 0.85));
    return compressOne(file, targetKBValue, newMaxW, mime);
  }

  return { blob: bestBlob, width: w, height: h };
}

function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

compressBtn.addEventListener("click", async () => {
  if (!files.length){
    setStatus("Please select images first");
    return;
  }

  const tKB = Number(targetKB.value || 200);
  const mw = Number(maxWidth.value || 0);
  const mime = outFormat.value;

  setProgress(0);
  setStatus("Compressing...");

  list.innerHTML = "";
  for (let i=0; i<files.length; i++){
    const f = files[i];
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="itemLeft">
        <div class="itemTitle">${escapeHtml(f.name)}</div>
        <div class="itemMeta">Working...</div>
      </div>
      <div class="itemActions"></div>
    `;
    list.appendChild(row);

    try{
      const original = f.size;

      const { blob, width, height } = await compressOne(f, tKB, mw, mime);
      const saved = original - blob.size;
      const pct = original ? Math.max(0, Math.round((saved / original) * 100)) : 0;

      const ext = (mime === "image/webp") ? "webp" : (mime === "image/png") ? "png" : "jpg";
      const baseName = f.name.replace(/\.[^/.]+$/, "");
      const outName = `${baseName}-PhotoToolsMax.${ext}`;

      row.querySelector(".itemMeta").textContent =
        `Original: ${formatBytes(original)} → New: ${formatBytes(blob.size)} • ${width}×${height} • Saved ${pct}%`;

      const actions = row.querySelector(".itemActions");
      const dl = document.createElement("button");
      dl.className = "btn btnPrimary";
      dl.type = "button";
      dl.textContent = "Download";
      dl.addEventListener("click", () => downloadBlob(blob, outName));
      actions.appendChild(dl);

      const tag = document.createElement("span");
      tag.className = "pill";
      tag.textContent = `${bytesToKB(blob.size)} KB`;
      actions.appendChild(tag);

    }catch(err){
      row.querySelector(".itemMeta").textContent = `Error: ${err.message || err}`;
    }

    setProgress(Math.round(((i+1)/files.length) * 100));
  }

  setStatus("Done ✅");
});

// Theme toggle
function applyTheme(theme){
  document.documentElement.classList.toggle("light", theme === "light");
  localStorage.setItem("pt_theme", theme);
  themeBtn.textContent = theme === "light" ? "☼" : "☾";
}

(function initTheme(){
  const saved = localStorage.getItem("pt_theme");
  if (saved) applyTheme(saved);
  else applyTheme("dark");
})();

themeBtn.addEventListener("click", () => {
  const isLight = document.documentElement.classList.contains("light");
  applyTheme(isLight ? "dark" : "light");
});
    
