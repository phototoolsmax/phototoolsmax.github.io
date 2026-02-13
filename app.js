// PhotoToolsMax - app.js
// Features:
// ✅ Light/Dark theme toggle (fixed)
// ✅ File select info show (name + size + count)
// ✅ Compress to target KB (JPG/WEBP best) + optional maxWidth
// ✅ Progress + per-file download links

const $ = (id) => document.getElementById(id);

const fileInput = $("fileInput");
const dropZone = $("dropZone");
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

const selectedInfo = $("selectedInfo");
const dropTitle = $("dropTitle");
const dropSub = $("dropSub");

const themeBtn = $("themeBtn");

// ---------------- THEME (Fixed) ----------------
(function initTheme(){
  const saved = localStorage.getItem("ptm_theme");
  if(saved === "dark"){
    document.documentElement.classList.add("theme-dark");
    themeBtn.textContent = "☀️";
  }else{
    document.documentElement.classList.remove("theme-dark");
    themeBtn.textContent = "🌙";
  }
})();

themeBtn.addEventListener("click", () => {
  const isDark = document.documentElement.classList.toggle("theme-dark");
  localStorage.setItem("ptm_theme", isDark ? "dark" : "light");
  themeBtn.textContent = isDark ? "☀️" : "🌙";
});

// ---------------- HELPERS ----------------
function bytesToNice(bytes){
  const kb = bytes / 1024;
  if(kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb/1024).toFixed(2)} MB`;
}

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function setProgress(pct){
  progressBar.style.width = `${clamp(pct,0,100)}%`;
}

function resetUI(){
  list.innerHTML = "";
  setProgress(0);
  statusLine.textContent = "Result: —";
  countLine.textContent = "";
  selectedInfo.textContent = "No file selected";
  dropTitle.textContent = "Select or Drag & Drop Images Here";
  dropSub.textContent = "JPG / PNG / WebP supported • Multiple images";
}

// ---------------- FILE SELECT INFO ----------------
function updateSelectedInfo(files){
  if(!files || files.length === 0){
    selectedInfo.textContent = "No file selected";
    dropTitle.textContent = "Select or Drag & Drop Images Here";
    dropSub.textContent = "JPG / PNG / WebP supported • Multiple images";
    return;
  }

  let total = 0;
  const names = [];
  for(const f of files){
    total += f.size;
    names.push(`${f.name} (${bytesToNice(f.size)})`);
  }

  dropTitle.textContent = `${files.length} file(s) selected ✅`;
  dropSub.textContent = `Total size: ${bytesToNice(total)}`;
  selectedInfo.textContent = names.slice(0, 3).join(" • ") + (names.length > 3 ? ` • +${names.length-3} more` : "");
}

fileInput.addEventListener("change", () => {
  updateSelectedInfo(fileInput.files);
});

// Make select button open picker
selectBtn.addEventListener("click", () => fileInput.click());

// Drag UI feedback (optional)
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
});
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  // Browser will handle drop into input in many cases; but to be safe:
  if(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length){
    fileInput.files = e.dataTransfer.files;
    updateSelectedInfo(fileInput.files);
  }
});

// ---------------- IMAGE COMPRESS CORE ----------------
function loadImageFromFile(file){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, mime, quality){
  return new Promise((resolve) => {
    if(mime === "image/png"){
      canvas.toBlob((b)=>resolve(b), "image/png");
      return;
    }
    canvas.toBlob((b)=>resolve(b), mime, quality);
  });
}

async function compressOne(file, opts){
  // opts: { targetBytes, maxW, mime }
  const img = await loadImageFromFile(file);

  // compute resized dims
  let w = img.naturalWidth;
  let h = img.naturalHeight;

  if(opts.maxW && opts.maxW > 0 && w > opts.maxW){
    const ratio = opts.maxW / w;
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: true });
  ctx.drawImage(img, 0, 0, w, h);

  // PNG cannot be targeted well by "quality". We'll still export but size may not meet target.
  if(opts.mime === "image/png"){
    const blob = await canvasToBlob(canvas, "image/png", 1);
    return { blob, note: "PNG output size exact nahi ho sakta. JPG/WEBP recommended." };
  }

  // Binary search quality for JPG/WEBP
  let lo = 0.25, hi = 0.95;
  let bestBlob = null;

  for(let i=0; i<10; i++){
    const q = (lo + hi) / 2;
    const b = await canvasToBlob(canvas, opts.mime, q);
    if(!b) break;

    if(b.size > opts.targetBytes){
      hi = q;
    }else{
      bestBlob = b;
      lo = q;
    }
  }

  // If still bigger, try lower quality a bit
  if(!bestBlob){
    bestBlob = await canvasToBlob(canvas, opts.mime, 0.2);
  }

  return { blob: bestBlob, note: "" };
}

function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function makeOutputName(originalName, mime){
  const base = originalName.replace(/\.[^/.]+$/, "");
  const ext = mime === "image/webp" ? "webp" : (mime === "image/png" ? "png" : "jpg");
  return `${base}-compressed.${ext}`;
}

// ---------------- BUTTONS ----------------
clearBtn.addEventListener("click", () => {
  fileInput.value = "";
  resetUI();
});

compressBtn.addEventListener("click", async () => {
  const files = Array.from(fileInput.files || []);
  if(files.length === 0){
    statusLine.textContent = "Result: Please select image(s) first.";
    return;
  }

  // limit suggestion
  const tooBig = files.find(f => f.size > 20 * 1024 * 1024);
  if(tooBig){
    statusLine.textContent = `Result: "${tooBig.name}" is bigger than 20MB. Please use smaller file.`;
    return;
  }

  const targetBytes = Math.max(10, Number(targetKB.value || 200)) * 1024;
  const maxW = Number(maxWidth.value || 0);
  const mime = outFormat.value;

  list.innerHTML = "";
  setProgress(0);

  statusLine.textContent = "Result: Compressing...";
  countLine.textContent = `${files.length} file(s)`;

  let done = 0;

  for(const file of files){
    try{
      const before = file.size;

      const { blob, note } = await compressOne(file, { targetBytes, maxW, mime });

      const after = blob ? blob.size : 0;
      const savedPct = before > 0 ? Math.max(0, Math.round(((before - after) / before) * 100)) : 0;

      // UI item
      const item = document.createElement("div");
      item.className = "item";

      const top = document.createElement("div");
      top.className = "itemTop";

      const left = document.createElement("div");
      left.innerHTML = `
        <div class="fileName">${file.name}</div>
        <div class="meta">Before: ${bytesToNice(before)} • After: ${bytesToNice(after)} • Saved: ${savedPct}%</div>
        ${note ? `<div class="meta">Note: ${note}</div>` : ``}
      `;

      const right = document.createElement("div");
      right.innerHTML = `<div class="meta">Target: ${Math.round(targetBytes/1024)} KB</div>`;

      top.appendChild(left);
      top.appendChild(right);

      const actions = document.createElement("div");
      actions.className = "actions";

      const outName = makeOutputName(file.name, mime);

      const dl = document.createElement("a");
      dl.className = "linkBtn";
      dl.href = "#";
      dl.textContent = "Download";
      dl.addEventListener("click", (e) => {
        e.preventDefault();
        downloadBlob(blob, outName);
      });

      actions.appendChild(dl);

      item.appendChild(top);
      item.appendChild(actions);

      list.appendChild(item);

      // auto-download as well (like your button says)
      downloadBlob(blob, outName);

    }catch(err){
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `<div class="fileName">${file.name}</div><div class="meta">Error: ${err.message || "Failed"}</div>`;
      list.appendChild(item);
    }

    done++;
    setProgress((done / files.length) * 100);
  }

  statusLine.textContent = "Result: Done ✅ Files downloaded.";
});
