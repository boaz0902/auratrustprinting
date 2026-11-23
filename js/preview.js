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

export const PAPER_SIZES = {
  short: { width: 8.5, height: 11 },
  letter: { width: 8.5, height: 11 },
  long: { width: 8.5, height: 13 },
  legal: { width: 8.5, height: 14 },
  a4: { width: 8.27, height: 11.69 },
  a3: { width: 11.69, height: 16.54 }
};

export function normalizePaper(value) {
  const paper = String(value || "").trim().toLowerCase();
  return PAPER_SIZES[paper] ? paper : "short";
}

export function updatePaperPreview(paper, sheet = document.querySelector("#preview-sheet"), stage = document.querySelector("#preview-canvas-wrap")) {
  if (!sheet || !stage) return;
  const key = normalizePaper(paper);
  const stageStyle = getComputedStyle(stage);
  const horizontalPadding = parseFloat(stageStyle.paddingLeft) + parseFloat(stageStyle.paddingRight);
  const verticalPadding = parseFloat(stageStyle.paddingTop) + parseFloat(stageStyle.paddingBottom);
  const availableWidth = Math.max(0, stage.clientWidth - horizontalPadding);
  const availableHeight = Math.max(0, stage.clientHeight - verticalPadding);
  if (availableWidth <= 0 || availableHeight <= 0) return;
  sheet.dataset.paper = key;
  sheet.style.aspectRatio = "auto";
  sheet.style.width = `${availableWidth}px`;
  sheet.style.height = `${availableHeight}px`;
  sheet.style.maxWidth = "100%";
  sheet.style.maxHeight = "100%";
}

export function renderWorkspace(container, files) {
  container.innerHTML = `
    <div class="preview-workspace">
      <div id="preview-file-tabs" class="preview-file-tabs" role="tablist" aria-label="Uploaded files"></div>
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
      <aside class="preview-options-panel" aria-label="Print options">
        <div id="preview-options"></div>
      </aside>
    </div>
  `;
  renderFileRail(files);
}

export function renderFileRail(files, activeIndex = 0) {
  const rail = document.querySelector("#preview-file-tabs");
  if (!rail) return;
  rail.innerHTML = files.map((entry, index) => `
    <article class="preview-file-tab ${index === activeIndex ? "is-active" : ""}" data-preview-file="${index}" role="tab" aria-selected="${index === activeIndex}" tabindex="${index === activeIndex ? "0" : "-1"}" aria-label="Preview ${escapeHtml(entry.file.name)}">
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
  updatePaperPreview(entry.options?.paper);
  sheet.style.transform = "none";
  const zoomLabel = document.querySelector("#preview-zoom-label");
  if (zoomLabel) zoomLabel.textContent = `${Math.round((entry.previewZoom || 1) * 100)}%`;
  const pageLabel = document.querySelector("#preview-page-label");
  if (pageLabel) pageLabel.textContent = "Page 1";
  content.innerHTML = '<div class="preview-loading at-skeleton" aria-label="Loading preview"></div>';
  strip.innerHTML = "";

  if (entry.file.type.startsWith("image/")) {
    await renderImage(entry, content, index);
  } else if (extension(entry.file.name) === "pdf") {
    await renderPdf(entry, content, strip, index);
  } else if (extension(entry.file.name) === "docx") {
    await renderDocx(entry, content);
  } else if (extension(entry.file.name) === "doc") {
    renderPlaceholder(entry, content, "Legacy .doc files cannot be previewed. We can still print this file.");
  } else if (extension(entry.file.name) === "txt") {
    const text = await entry.file.text();
    content.innerHTML = `<pre class="text-preview">${escapeHtml(text)}</pre>`;
  } else if (["xls", "xlsx", "csv"].includes(extension(entry.file.name)) && window.XLSX) {
    await renderXlsx(entry, content);
  } else {
    renderPlaceholder(entry, content);
  }
  if (!entry.pdf) fitPreviewContent(content, entry.previewZoom || 1);
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

export function fitPreviewContent(content, zoom = 1) {
  if (!content) return;
  const docxArea = content.querySelector(".docx-preview");
  const docxTarget = docxArea?.querySelector(".docx-pages, .mammoth-preview");
  if (docxTarget) fitElementToArea(docxTarget, docxArea, zoom);

  const spreadsheetArea = content.querySelector(".xlsx-table");
  const spreadsheet = spreadsheetArea?.querySelector("table");
  if (spreadsheet) fitElementToArea(spreadsheet, spreadsheetArea, zoom);

  const image = content.querySelector("#preview-image-canvas");
  if (image) image.style.transform = `scale(${zoom})`;

  const text = content.querySelector(".text-preview");
  if (text) {
    text.style.transform = `scale(${zoom})`;
    text.style.transformOrigin = "center center";
  }

  const placeholder = content.querySelector(".preview-placeholder, .preview-error");
  if (placeholder) {
    placeholder.style.transform = `scale(${zoom})`;
    placeholder.style.transformOrigin = "center center";
  }
}

function fitElementToArea(element, area, zoom = 1) {
  element.style.position = "absolute";
  element.style.left = "50%";
  element.style.top = "50%";
  element.style.width = "max-content";
  element.style.height = "max-content";
  element.style.maxWidth = "none";
  element.style.maxHeight = "none";
  element.style.margin = "0";
  element.style.transform = "translate(-50%, -50%)";
  element.style.transformOrigin = "center center";

  const bounds = element.getBoundingClientRect();
  const width = Math.max(element.scrollWidth, bounds.width);
  const height = Math.max(element.scrollHeight, bounds.height);
  const availableWidth = area.clientWidth - 24;
  const availableHeight = area.clientHeight - 24;
  if (width <= 0 || height <= 0 || availableWidth <= 0 || availableHeight <= 0) return;

  const scale = Math.min(1, availableWidth / width, availableHeight / height);
  element.style.transform = `translate(-50%, -50%) scale(${scale * zoom})`;
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
    entry.previewZoom = Number.isFinite(entry.previewZoom) ? entry.previewZoom : 1;
    entry.pdfFocusX = Number.isFinite(entry.pdfFocusX) ? entry.pdfFocusX : 0.5;
    entry.pdfFocusY = Number.isFinite(entry.pdfFocusY) ? entry.pdfFocusY : 0.5;
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

export async function renderPdfPage(entry, content, index, sheet = document.querySelector("#preview-sheet"), stage = document.querySelector("#preview-canvas-wrap")) {
  const pages = entry.pdfOrder.filter((page) => !entry.pdfDeleted.has(page));
  if (!pages.length) throw new Error("Keep at least one PDF page.");
  entry.pdfCurrentPosition = Math.min(entry.pdfCurrentPosition || 0, pages.length - 1);
  const pageIndex = pages[entry.pdfCurrentPosition];
  const page = await entry.pdf.getPage(pageIndex + 1);
  const rotation = (page.rotate + (entry.pdfRotations.get(pageIndex) || 0)) % 360;
  const paperKey = normalizePaper(entry.options?.paper);
  updatePaperPreview(paperKey, sheet, stage);
  const zoom = Number.isFinite(entry.previewZoom) ? entry.previewZoom : 1;
  const baseViewport = page.getViewport({ scale: 1, rotation });
  const fitScale = Math.min(content.clientWidth / baseViewport.width, content.clientHeight / baseViewport.height);
  const viewport = page.getViewport({ scale: fitScale * zoom, rotation });
  const outputScale = Math.min(window.devicePixelRatio || 1, 2.5);
  const canvas = document.createElement("canvas");
  canvas.className = "pdf-preview-canvas";
  canvas.width = Math.max(1, Math.round(viewport.width * outputScale));
  canvas.height = Math.max(1, Math.round(viewport.height * outputScale));
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  const renderToken = (content._pdfRenderToken || 0) + 1;
  content._pdfRenderToken = renderToken;
  await page.render({
    canvasContext: canvas.getContext("2d"),
    viewport,
    transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null
  }).promise;
  if (content._pdfRenderToken !== renderToken) return;
  content.replaceChildren(canvas);
  const label = document.querySelector("#preview-page-label");
  if (label) label.textContent = `Page ${entry.pdfCurrentPosition + 1} of ${pages.length}`;
  const fullscreenLabel = document.querySelector("#fullscreen-page-label");
  if (fullscreenLabel) fullscreenLabel.textContent = `Page ${entry.pdfCurrentPosition + 1} of ${pages.length}`;
  document.querySelectorAll("[data-pdf-position]").forEach((thumb, position) => thumb.classList.toggle("is-active", position === entry.pdfCurrentPosition));
  document.querySelectorAll("[data-preview-action='previous']").forEach((button) => { button.disabled = entry.pdfCurrentPosition === 0; });
  document.querySelectorAll("[data-preview-action='next']").forEach((button) => { button.disabled = entry.pdfCurrentPosition >= pages.length - 1; });
  updatePdfPan(entry, content);
}

export function updatePdfPan(entry, content) {
  const canvas = content?.querySelector(".pdf-preview-canvas");
  if (!canvas) return;
  const viewWidth = content.clientWidth;
  const viewHeight = content.clientHeight;
  const canvasWidth = parseFloat(canvas.style.width) || canvas.clientWidth;
  const canvasHeight = parseFloat(canvas.style.height) || canvas.clientHeight;
  const focusX = clampPdfFocus(entry.pdfFocusX ?? 0.5, canvasWidth, viewWidth);
  const focusY = clampPdfFocus(entry.pdfFocusY ?? 0.5, canvasHeight, viewHeight);
  const panX = (0.5 - focusX) * canvasWidth;
  const panY = (0.5 - focusY) * canvasHeight;
  canvas.style.transform = `translate3d(calc(-50% + ${panX}px), calc(-50% + ${panY}px), 0)`;
}

export function clampPdfFocus(focus, canvasSize, viewSize) {
  if (canvasSize <= viewSize || canvasSize <= 0) return 0.5;
  const halfView = Math.min(0.5, viewSize / (2 * canvasSize));
  return Math.max(halfView, Math.min(1 - halfView, focus));
}

export async function movePdfPage(entry, index, delta) {
  if (!entry.pdf) return;
  const pages = entry.pdfOrder.filter((page) => !entry.pdfDeleted.has(page));
  entry.pdfCurrentPosition = Math.max(0, Math.min(pages.length - 1, (entry.pdfCurrentPosition || 0) + delta));
  entry.pdfFocusX = 0.5;
  entry.pdfFocusY = 0.5;
  await renderPdfPage(entry, document.querySelector("#preview-sheet-content"), index);
}

async function renderDocx(entry, content) {
  content.innerHTML = '<div class="preview-loading at-skeleton" aria-label="Loading Word document"></div>';
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  content.innerHTML = '<div class="docx-preview docx"></div>';
  const container = content.querySelector(".docx-preview");
  if (!container || !container.isConnected) {
    console.error("DOCX preview failed: the preview container is not visible in the DOM.");
    renderError(content, "Document preview unavailable.", entry.file.name);
    return;
  }
  if (!window.JSZip) {
    console.error("DOCX preview failed: window.JSZip is missing.");
  } else if (!window.docx) {
    console.error("DOCX preview failed: window.docx is missing.");
  } else {
    try {
      await window.docx.renderAsync(await entry.file.arrayBuffer(), container, null, {
        className: "docx",
        inWrapper: false,
        ignoreWidth: false,
        ignoreHeight: false,
        breakPages: true,
        renderHeaders: true,
        renderFooters: true
      });
      const pages = document.createElement("div");
      pages.className = "docx-pages";
      pages.append(...container.childNodes);
      container.append(pages);
      fitPreviewContent(content);
      return;
    } catch (error) {
      console.error("DOCX preview failed in docx-preview:", error);
    }
  }

  if (window.mammoth) {
    try {
      container.innerHTML = '<div class="mammoth-preview"></div>';
      const result = await window.mammoth.convertToHtml({ arrayBuffer: await entry.file.arrayBuffer() });
      container.querySelector(".mammoth-preview").innerHTML = result.value;
      fitPreviewContent(content);
      return;
    } catch (error) {
      console.error("DOCX fallback failed in mammoth:", error);
    }
  } else {
    console.error("DOCX preview fallback failed: window.mammoth is missing.");
  }
  renderPlaceholder(entry, content);
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
      fitPreviewContent(content, entry.previewZoom || 1);
    };
    contentHost.querySelectorAll("[data-xlsx-sheet]").forEach((tab) => tab.addEventListener("click", () => renderSheet(Number(tab.dataset.xlsxSheet))));
    contentHost.classList.remove("at-skeleton");
    renderSheet(0);
  } catch (error) {
    renderError(content, "Spreadsheet preview unavailable.", entry.file.name);
  }
}

export function renderPlaceholder(entry, content, note = "Preview isn't available for this file, but we can still print it.") {
  const ext = extension(entry.file.name).toUpperCase();
  content.innerHTML = `<div class="preview-placeholder"><div class="preview-placeholder-inner"><div class="preview-placeholder-icon">${escapeHtml(ext.slice(0, 4))}</div><strong>${escapeHtml(entry.file.name)}</strong><span>${formatSize(entry.file.size)}</span><p>${escapeHtml(note)}</p></div></div>`;
}

function renderError(content, title, fileName) {
  content.innerHTML = `<div class="preview-error"><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(fileName)}</p></div></div>`;
}
