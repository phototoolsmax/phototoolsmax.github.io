// PhotoToolsMax - app.js
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const selectBtn = document.getElementById("selectBtn");

const targetKB = document.getElementById("targetKB");
const maxWidth = document.getElementById("maxWidth");
const outFormat = document.getElementById("outFormat");

const compressBtn = document.getElementById("compressBtn");
const clearBtn = document.getElementById("clearBtn");

const statusLine = document.getElementById("statusLine");
const countLine = document.getElementById("countLine");
const progressBar = document.getElementById("progressBar");
const list = document.getElementById("list");

const selectedInfo = document.getElementById("selectedInfo");
const themeBtn = document.getElementById("themeBtn");

let selectedFiles = [];

// ---------- Helpers ----------
function formatBytes(bytes) {
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function setStatus(text) {
  statusLine.textContent = `Result: ${text}`;
}

function setProgress(pct) {
  progressBar.style.width = `${pct}%`;
}

function updateSelectedInfo() {
  if (!selectedInfo) return;

  if (!selectedFiles || selectedFiles.length === 0) {
    selectedInfo.textContent = "No file selected";
    return;
  }

  if (selectedFiles.length === 1) {
    const f = selectedFiles[0];
    selectedInfo.textContent = `Selected: ${f.name} (${formatBytes(f.size)})`;
  } else {
    let total = 0;
    for (const f of selectedFiles) total += f.size;
    selectedInfo.textContent = `Selected: ${selectedFiles.length} files (${formatBytes(total)})`;
  }
}

function clearAll() {
  selectedFiles = [];
  fileInput.value = "";
  list.innerHTML = "";
  countLine.textContent = "";
  setProgress(0);
  setStatus("—");
  updateSelectedInfo();
}

// ---------- Theme ----------
(function initTheme() {
  const key = "pt_theme";
  const saved = localStorage.getItem(key);
  if (saved === "light") document.body.classList.add("light");
  themeBtn.textContent = document.body.classList.contains("light") ? "☀" : "☾";

  themeBtn.addEventListener("click", () => {
    document.body.classList.toggle("light");
    localStorage.setItem(key, document.body.classList.contains("light") ? "light" : "dark");
    themeBtn.textContent = document.body.classList.contains("light") ? "☀" : "☾";
  });
})();

// Light theme (small)
const style = document.createElement("style");
style.textContent = `
  body.light{
    --bg:#f6f8ff;
    --card:#ffffff;
    --text:#0b1220;
    --muted:#44506a;
    --line:rgba(0,0,0,.10);
    --shadow: 0 10px 30px rgba(20,40,120,.10);
  }
`;
document.head.appendChild(style);

// ---------- Events ----------
selectBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  selectedFiles = Array.from(fileInput.files || []);
  // Limit size (soft)
  const over = selectedFiles.find(f => f.size > 20 * 1024 * 1024);
  if (over) {
    alert("Max recommended image size is 20MB. Please choose smaller images.");
  }
  updateSelectedInfo();
  setStatus(selectedFiles.length ? "Files selected" : "—");
  countLine.textContent = selectedFiles.length ? `${selectedFiles.length} file(s) selected` : "";
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag");
  const files = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith("image/"));
  if (files.length) {
    selectedFiles = files;
    updateSelectedInfo();
    setStatus("Files selected");
    countLine.textContent = `${selectedFiles.length} file(s) selected`;
  }
});

clearBtn.addEventListener("click", clearAll);

// ---------- Core Compression ----------
async function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mime, quality);
  });
}

async function compressOne(file, targetBytes, mime, maxW) {
  const img = await loadImage(file);

  let w = img.naturalWidth;
  let h = img.naturalHeight;

  // Apply max width (if given)
  if (maxW && maxW > 0 && w > maxW) {
    const ratio = maxW / w;
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  // PNG doesn't support quality like JPG/WEBP; for PNG we will still try but size may be big
  let quality = 0.92;
  let blob = await canvasToBlob(canvas, mime, quality);

  // If target is very low, binary search quality
  // Stop conditions for safety
  const maxIter = 18;

  if (mime === "image/png") {
    // For PNG, we can't control quality well; return early
    return { blob, width: w, height: h };
  }

  // If already smaller than target, return
  if (blob && blob.size <= targetBytes) return { blob, width: w, height: h };

  let low = 0.20;
  let high = 0.92;
  let best = blob;

  for (let i = 0; i < maxIter; i++) {
    const mid = (low + high) / 2;
    const b = await canvasToBlob(canvas, mime, mid);
    if (!b) break;

    if (b.size > targetBytes) {
      high = mid;
    } else {
      best = b;
      low = mid;
    }
  }

  return { blob: best, width: w, height: h };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function renderItem(originalFile, outBlob, dims, idx, total) {
  const ext = outBlob.type.includes("webp") ? "webp" : outBlob.type.includes("png") ? "png" : "jpg";
  const outName = originalFile.name.replace(/\.[^.]+$/, "") + `-ptm.${ext}`;

  const div = document.createElement("div");
  div.className = "item";

  const left = document.createElement("div");
  const title = document.createElement("b");
  title.textContent = outName;

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent =
    `Original: ${formatBytes(originalFile.size)} → Output: ${formatBytes(outBlob.size)} • ${dims.width}×${dims.height}`;

  left.appendChild(title);
  left.appendChild(meta);

  const btn = document.createElement("a");
  btn.href = "#";
  btn.textContent = "Download";
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    downloadBlob(outBlob, outName);
  });

  div.appendChild(left);
  div.appendChild(btn);

  list.appendChild(div);
}

compressBtn.addEventListener("click", async () => {
  if (!selectedFiles || selectedFiles.length === 0) {
    alert("Please select at least 1 image.");
    return;
  }

  list.innerHTML = "";
  setProgress(0);
  setStatus("Processing...");

  const target = Math.max(10, parseInt(targetKB.value || "200", 10));
  const targetBytes = target * 1024;

  const mw = parseInt(maxWidth.value || "0", 10);
  const mime = outFormat.value || "image/jpeg";

  countLine.textContent = `Processing ${selectedFiles.length} image(s)...`;

  try {
    for (let i = 0; i < selectedFiles.length; i++) {
      const f = selectedFiles[i];

      // Soft limit
      if (f.size > 20 * 1024 * 1024) {
        const div = document.createElement("div");
        div.className = "item";
        div.innerHTML = `<div><b>Skipped: ${f.name}</b><div class="meta">File too large (>20MB)</div></div>`;
        list.appendChild(div);
        continue;
      }

      const res = await compressOne(f, targetBytes, mime, mw);
      if (res && res.blob) {
        renderItem(f, res.blob, { width: res.width, height: res.height }, i + 1, selectedFiles.length);
      }

      const pct = Math.round(((i + 1) / selectedFiles.length) * 100);
      setProgress(pct);
      setStatus(`${pct}% done`);
      countLine.textContent = `Done ${i + 1}/${selectedFiles.length}`;
    }

    setStatus("Completed ✅");
  } catch (err) {
    console.error(err);
    setStatus("Error ❌");
    alert("Something went wrong. Please try another image or change settings.");
  }
});

// Init
clearAll();
