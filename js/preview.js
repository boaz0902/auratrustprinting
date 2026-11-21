// Step 2 viewers. Preview rendering never changes the customer's print-color option.
export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

export function formatSize(bytes) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.ceil(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function extension(name) {
  return name.split(".").pop().toLowerCase();
}

export function renderWorkspace(container, files) {
  container.innerHTML = `
    <div class="preview-workspace">
      <aside class="preview-file-rail at-card" aria-label="Uploaded files">
        <div id="preview-file-list" class="preview-file-list"></div>
      </aside>
      <section class="preview-stage" aria-label="Document preview">
        <div class="preview-toolbar">
          <div class="preview-toolbar-group">
            <button class="at-icon-btn" type="button" data-preview-action="zoom-out" aria-label="Zoom out">−</button>
            <span id="preview-zoom-label" class="zoom-label">100%</span>
            <button class="at-icon-btn" type="button" data-preview-action="zoom-in" aria-label="Zoom in">+</button>
            <button class="at-icon-btn" type="button" data-preview-action="fit" aria-label="Fit to width">Fit</button>
          </div>
          <div class="preview-toolbar-group">
            <button class="at-icon-btn" type="button" data-preview-action="previous" aria-label="Previous page">←</button>
            <span id="preview-page-label" class="page-label">Page 1</span>
            <button class="at-icon-btn" type="button" data-preview-action="next" aria-label="Next page">→</button>
          </div>
          <div class="preview-toolbar-group">
            <label class="bw-toggle"><input id="preview-bw-switch" type="checkbox"><span class="toggle-track" aria-hidden="true"></span><span>Preview as B&amp;W</span></label>
            <button class="at-icon-btn" type="button" data-preview-action="fullscreen" aria-label="Open fullscreen preview">⛶</button>
          </div>
        </div>
        <div id="preview-canvas-wrap" class="preview-canvas-wrap">
          <div id="preview-sheet" class="preview-sheet" data-paper="short"><div id="preview-sheet-content" class="preview-sheet-content"></div></div>
        </div>
        <div id="preview-page-strip" class="preview-page-strip" aria-label="PDF page thumbnails"></div>
      </section>
      <aside class="preview-options-panel at-card" aria-label="Print options">
        <div id="preview-options"></div>
      </aside>
    </div>
    <div id="preview-fullscreen" class="fullscreen-modal" role="dialog" aria-modal="true" aria-label="Fullscreen document preview">
      <div class="fullscreen-sheet" id="fullscreen-sheet"><button class="at-icon-btn fullscreen-close" type="button" data-preview-action="close-fullscreen" aria-label="Close fullscreen preview">×</button></div>
    </div>
  `;
  renderFileRail(files);
}

export function renderFileRail(files, activeIndex = 0) {
  const rail = document.querySelector("#preview-file-list");
  if (!rail) return;
  rail.innerHTML = files.map((entry, index) => `
    <article class="preview-file-card ${index === activeIndex ? "is-active" : ""}" data-preview-file="${index}" role="button" tabindex="0" aria-label="Preview ${escapeHtml(entry.file.name)}">
      <div class="preview-thumb" data-preview-thumb="${index}"><span>${escapeHtml(extension(entry.file.name).toUpperCase())}</span></div>
      <div class="preview-file-meta"><strong>${escapeHtml(entry.file.name)}</strong><span>${formatSize(entry.file.size)}</span><span class="file-type-badge">${escapeHtml(extension(entry.file.name).toUpperCase())}</span></div>
      <button class="preview-remove" type="button" data-preview-remove="${index}" aria-label="Remove ${escapeHtml(entry.file.name)}">×</button>
    </article>
  `).join("");
  files.forEach((entry, index) => {
    const thumb = rail.querySelector(`[data-preview-thumb="${index}"]`);
    if (!thumb) return;
    if (entry.file.type.startsWith("image/")) {
      const url = entry.previewUrl || URL.createObjectURL(entry.file);
      entry.previewUrl = url;
      const image = new Image();
      image.onload = () => thumb.replaceChildren(image);
      image.src = url;
    } else if (extension(entry.file.name) === "pdf" && window.pdfjsLib) {
      entry.file.arrayBuffer().then(async (data) => {
        try {
          const pdf = await window.pdfjsLib.getDocument({ data }).promise;
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 0.12 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
          thumb.replaceChildren(canvas);
        } catch (error) {
          // Keep the accessible file-type badge as the thumbnail fallback.
        }
      });
    }
  });
}

export async function renderActivePreview(entry, index) {
  const content = document.querySelector("#preview-sheet-content");
  const sheet = document.querySelector("#preview-sheet");
  const strip = document.querySelector("#preview-page-strip");
  if (!content || !sheet) return;
  const paper = String(entry.options?.paper || "short").toLowerCase();
  sheet.dataset.paper = ["short", "a4", "long", "a3"].includes(paper) ? paper : "short";
  content.innerHTML = '<div class="preview-loading at-skeleton" aria-label="Loading preview"></div>';
  strip.innerHTML = "";

  if (entry.file.type.startsWith("image/")) {
    await renderImage(entry, content, index);
  } else if (extension(entry.file.name) === "pdf") {
    await renderPdf(entry, content, strip, index);
  } else if (extension(entry.file.name) === "docx" && window.docx) {
    await renderDocx(entry, content);
  } else if (["xls", "xlsx"].includes(extension(entry.file.name)) && window.XLSX) {
    await renderXlsx(entry, content);
  } else {
    renderPlaceholder(entry, content);
  }
}

async function renderImage(entry, content) {
  try {
    const url = entry.previewUrl || URL.createObjectURL(entry.file);
    entry.previewUrl = url;
    content.innerHTML = `<div class="image-tools"><canvas id="preview-image-canvas" aria-label="Image preview"></canvas><div class="preview-nav"><button class="at-icon-btn" type="button" data-image-action="rotate" aria-label="Rotate image">↻</button><button class="at-icon-btn" type="button" data-image-action="crop" aria-label="Crop image">Crop</button></div></div>`;
    const canvas = content.querySelector("canvas");
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    entry.image = image;
    drawImagePreview(entry, canvas);
  } catch (error) {
    renderError(content, "Image preview unavailable.", entry.file.name);
  }
}

export function drawImagePreview(entry, canvas) {
  const image = entry.image;
  if (!image || !canvas) return;
  const cropRatio = entry.imageCrop ? 0.8 : 1;
  const sourceWidth = image.naturalWidth * cropRatio;
  const sourceHeight = image.naturalHeight * cropRatio;
  const rotation = entry.imageRotation || 0;
  const rotated = rotation % 180 !== 0;
  canvas.width = rotated ? sourceHeight : sourceWidth;
  canvas.height = rotated ? sourceWidth : sourceHeight;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(rotation * Math.PI / 180);
  context.drawImage(image,
    (image.naturalWidth - sourceWidth) / 2,
    (image.naturalHeight - sourceHeight) / 2,
    sourceWidth, sourceHeight,
    -sourceWidth / 2, -sourceHeight / 2,
    sourceWidth, sourceHeight);
  context.restore();
}

async function renderPdf(entry, content, strip, index) {
  if (!window.pdfjsLib) {
    renderError(content, "PDF preview unavailable.", entry.file.name);
    return;
  }
  try {
    const pdf = entry.pdf || await window.pdfjsLib.getDocument({ data: await entry.file.arrayBuffer() }).promise;
    entry.pdf = pdf;
    entry.pdfCurrentPosition ||= 0;
    entry.pdfDeleted ||= new Set();
    entry.pdfOrder ||= Array.from({ length: pdf.numPages }, (_, page) => page);
    entry.pdfRotations ||= new Map();
    const pages = entry.pdfOrder.filter((page) => !entry.pdfDeleted.has(page));
    strip.innerHTML = "";

    for (let position = 0; position < pages.length; position++) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `preview-page-thumb ${position === entry.pdfCurrentPosition ? "is-active" : ""}`;
      button.setAttribute("aria-label", `View page ${position + 1}`);
      button.dataset.pdfPosition = String(position);
      button.innerHTML = '<span class="at-skeleton" style="width:40px;height:54px"></span>';
      strip.append(button);
    }

    await renderPdfPage(entry, content, index);
    const thumbs = strip.querySelectorAll("[data-pdf-position]");
    const observer = new IntersectionObserver(async (items) => {
      for (const item of items) {
        if (!item.isIntersecting) continue;
        const position = Number(item.target.dataset.pdfPosition);
        const pageIndex = pages[position];
        if (item.target.dataset.ready) continue;
        item.target.dataset.ready = "true";
        const page = await pdf.getPage(pageIndex + 1);
        const viewport = page.getViewport({ scale: 0.18 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        item.target.replaceChildren(canvas);
        observer.unobserve(item.target);
      }
    });
    thumbs.forEach((thumb) => observer.observe(thumb));
  } catch (error) {
    console.error("PDF preview failed.", error);
    renderError(content, "PDF preview unavailable.", entry.file.name);
  }
}

async function renderPdfPage(entry, content, index) {
  const pages = entry.pdfOrder.filter((page) => !entry.pdfDeleted.has(page));
  if (!pages.length) throw new Error("Keep at least one PDF page.");
  entry.pdfCurrentPosition = Math.min(entry.pdfCurrentPosition || 0, pages.length - 1);
  const pageIndex = pages[entry.pdfCurrentPosition];
  const page = await entry.pdf.getPage(pageIndex + 1);
  const rotation = (page.rotate + (entry.pdfRotations.get(pageIndex) || 0)) % 360;
  const baseViewport = page.getViewport({ scale: 1, rotation });
  const sheet = document.querySelector("#preview-sheet");
  const availableWidth = sheet?.clientWidth || 420;
  const scale = Math.min(1.7, availableWidth / baseViewport.width);
  const viewport = page.getViewport({ scale, rotation });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width * (window.devicePixelRatio || 1));
  canvas.height = Math.round(viewport.height * (window.devicePixelRatio || 1));
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  await page.render({
    canvasContext: canvas.getContext("2d"),
    viewport,
    transform: window.devicePixelRatio > 1 ? [window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0] : null
  }).promise;
  content.replaceChildren(canvas);
  const label = document.querySelector("#preview-page-label");
  if (label) label.textContent = `Page ${entry.pdfCurrentPosition + 1} of ${pages.length}`;
  document.querySelectorAll("[data-pdf-position]").forEach((thumb, position) => thumb.classList.toggle("is-active", position === entry.pdfCurrentPosition));
}

export async function movePdfPage(entry, index, delta) {
  if (!entry.pdf) return;
  const pages = entry.pdfOrder.filter((page) => !entry.pdfDeleted.has(page));
  entry.pdfCurrentPosition = Math.max(0, Math.min(pages.length - 1, (entry.pdfCurrentPosition || 0) + delta));
  await renderPdfPage(entry, document.querySelector("#preview-sheet-content"), index);
}

async function renderDocx(entry, content) {
  content.innerHTML = '<div class="preview-loading at-skeleton" aria-label="Loading Word document"></div>';
  try {
    content.innerHTML = '<div class="docx-preview"></div>';
    await window.docx.renderAsync(await entry.file.arrayBuffer(), content.querySelector(".docx-preview"), null, {
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      breakPages: true
    });
  } catch (error) {
    console.error("DOCX preview failed.", error);
    renderError(content, "Document preview unavailable.", entry.file.name);
  }
}

async function renderXlsx(entry, content) {
  try {
    content.innerHTML = '<div class="xlsx-preview at-skeleton"></div>';
    const workbook = window.XLSX.read(await entry.file.arrayBuffer(), { type: "array" });
    const sheetNames = workbook.SheetNames || [];
    const contentHost = content.querySelector(".xlsx-preview");
    contentHost.innerHTML = `<div class="xlsx-tabs">${sheetNames.map((name, index) => `<button class="at-chip" type="button" data-xlsx-sheet="${index}" aria-pressed="${index === 0}">${escapeHtml(name)}</button>`).join("")}</div><div class="xlsx-table"></div>`;
    const renderSheet = (index) => {
      contentHost.querySelector(".xlsx-table").innerHTML = window.XLSX.utils.sheet_to_html(workbook.Sheets[sheetNames[index]], { editable: false });
      contentHost.querySelectorAll("[data-xlsx-sheet]").forEach((tab, tabIndex) => tab.setAttribute("aria-pressed", String(tabIndex === index)));
    };
    contentHost.querySelectorAll("[data-xlsx-sheet]").forEach((tab) => tab.addEventListener("click", () => renderSheet(Number(tab.dataset.xlsxSheet))));
    contentHost.classList.remove("at-skeleton");
    renderSheet(0);
  } catch (error) {
    renderError(content, "Spreadsheet preview unavailable.", entry.file.name);
  }
}

export function renderPlaceholder(entry, content) {
  const ext = extension(entry.file.name).toUpperCase();
  content.innerHTML = `<div class="preview-placeholder"><div class="preview-placeholder-inner"><div class="preview-placeholder-icon">${escapeHtml(ext.slice(0, 4))}</div><strong>${escapeHtml(entry.file.name)}</strong><span>${formatSize(entry.file.size)}</span><p>Preview not available for this file type. We can still print it.</p></div></div>`;
}

function renderError(content, title, fileName) {
  content.innerHTML = `<div class="preview-error"><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(fileName)}</p></div></div>`;
}
