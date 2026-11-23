import { gcashInfo, orderLimits } from "./config.js";
import { createCustomerOrder, ensureAnonymousCustomer, requireSupabase, uploadOrderFile } from "./supabase.js";
import { priceList } from "./sample-data.js";
import { renderWorkspace, renderFileRail, renderActivePreview, renderPdfPage, movePdfPage, drawImagePreview, fitPreviewContent, updatePdfPan, clampPdfFocus, updatePaperPreview } from "./preview.js";
import { initializeOptions, renderOptions, updateLiveSummary, calculateEstimate, getPageCount, getPageIndices, getLinePrice, validatePages, showToast } from "./options.js";

const currency = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const files = [];
let services = [];
let servicesReady = false;

const menuToggle = document.querySelector(".menu-toggle");
const navLinks = document.querySelector("#primary-nav");
menuToggle.addEventListener("click", () => {
  const expanded = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!expanded));
  menuToggle.setAttribute("aria-label", expanded ? "Open navigation" : "Close navigation");
  navLinks.classList.toggle("is-open", !expanded);
});
navLinks.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open navigation");
    navLinks.classList.remove("is-open");
  }
});

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function extension(name) {
  return name.split(".").pop().toLowerCase();
}

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.ceil(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.random() * 16 | 0;
    return (character === "x" ? random : (random & 3 | 8)).toString(16);
  });
}

function setStep(step) {
  document.querySelectorAll("[data-panel]").forEach((panel) => { panel.hidden = Number(panel.dataset.panel) !== step; });
  document.querySelectorAll(".wizard-progress li").forEach((item) => item.classList.toggle("active", Number(item.dataset.step) <= step));
  document.querySelector("#progress-bar").style.width = `${((step - 1) / 3) * 100}%`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

const dropZone = document.querySelector("#drop-zone");
const fileInput = document.querySelector("#file-input");
const fileList = document.querySelector("#file-list");
const uploadError = document.querySelector("#upload-error");

if (location.protocol === "file:") {
  uploadError.textContent = "Local ES modules need an HTTP server. Run start-local.bat, then open http://127.0.0.1:8765/order.html.";
  document.querySelector("#upload-next").disabled = true;
  document.querySelector("#browse-files").disabled = true;
}

document.querySelector("#browse-files").addEventListener("click", () => fileInput.click());

function validateFile(file) {
  const fileExtension = extension(file.name);
  const blockedExtensions = ["exe", "bat", "cmd", "com", "scr", "msi", "vbs", "ps1", "jar", "dll", "sh"];
  if (blockedExtensions.includes(fileExtension)) return `“${file.name}” is an executable and cannot be uploaded.`;
  if (!orderLimits.allowedExtensions.includes(fileExtension)) return `“${file.name}” is not a supported file type.`;
  if (file.type && !orderLimits.allowedMimeTypes.includes(file.type) && file.type !== "application/octet-stream") {
    return `“${file.name}” has an unsupported file type.`;
  }
  if (!file.size) return `“${file.name}” is empty.`;
  if (file.size > orderLimits.maxFileSizeMB * 1024 * 1024) return `“${file.name}” exceeds the ${orderLimits.maxFileSizeMB} MB limit.`;
  return "";
}

function renderFileList() {
  fileList.innerHTML = files.map((entry, index) => `
    <div class="upload-file">
      <div class="file-icon" aria-hidden="true">${escapeHtml(extension(entry.file.name).toUpperCase())}</div>
      <div class="file-meta"><strong>${escapeHtml(entry.file.name)}</strong><span>${formatSize(entry.file.size)} · ${entry.progress === 100 ? "Uploaded" : entry.progress ? "Uploading…" : "Ready for review"}</span>
        <div class="upload-progress" role="progressbar" aria-label="Upload ${escapeHtml(entry.file.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${entry.progress}"><div style="width:${entry.progress}%"></div></div>
      </div>
      <button type="button" class="remove-file" data-remove="${index}" aria-label="Remove ${escapeHtml(entry.file.name)}">×</button>
    </div>
  `).join("");
  document.querySelector("#upload-next").disabled = files.length === 0 || !servicesReady;
}

function releaseFilePreview(entry) {
  if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
  entry.previewUrl = null;
  entry.pdf = null;
  entry.image = null;
  entry.options = null;
  entry.manual = null;
  entry.suggestions = null;
}

function addFiles(selectedFiles) {
  uploadError.textContent = "";
  const messages = [];
  for (const file of selectedFiles) {
    if (files.length >= orderLimits.maxFiles) {
      messages.push(`You can upload up to ${orderLimits.maxFiles} print files.`);
      break;
    }
    const problem = validateFile(file);
    if (problem) {
      messages.push(problem);
      continue;
    }
    if (files.some((entry) => entry.file.name === file.name && entry.file.size === file.size)) continue;
    files.push({ file, progress: 0, options: { service: "", variantLabel: "", addons: [], paper: "short", copies: 1, pageCount: "", pageRange: "", notes: "" } });
  }
  if (messages.length) uploadError.textContent = messages.join(" ");
  renderFileList();
}

dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});
["dragenter", "dragover"].forEach((name) => dropZone.addEventListener(name, (event) => {
  event.preventDefault();
  dropZone.classList.add("is-dragging");
}));
["dragleave", "drop"].forEach((name) => dropZone.addEventListener(name, (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-dragging");
}));
dropZone.addEventListener("drop", (event) => addFiles(event.dataTransfer.files));
fileInput.addEventListener("change", () => {
  addFiles(fileInput.files);
  fileInput.value = "";
});
fileList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove]");
  if (!button) return;
  const [removed] = files.splice(Number(button.dataset.remove), 1);
  releaseFilePreview(removed);
  renderFileList();
});

function sanitizePreview(markup) {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(markup, "text/html");
  const allowed = new Set(["P", "BR", "STRONG", "EM", "B", "I", "H1", "H2", "H3", "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD"]);
  const copy = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || "");
    if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
    const fragment = document.createDocumentFragment();
    for (const child of node.childNodes) fragment.append(copy(child));
    if (!allowed.has(node.tagName)) return fragment;
    const safeElement = document.createElement(node.tagName.toLowerCase());
    safeElement.append(fragment);
    return safeElement;
  };
  const wrapper = document.createElement("div");
  parsed.body.childNodes.forEach((node) => wrapper.append(copy(node)));
  return wrapper.innerHTML;
}

function imageCanvas(entry, canvas) {
  const image = entry.image;
  const cropRatio = entry.imageCrop ? 0.8 : 1;
  const sourceWidth = image.naturalWidth * cropRatio;
  const sourceHeight = image.naturalHeight * cropRatio;
  const rotated = (entry.imageRotation || 0) % 180 !== 0;
  canvas.width = Math.round(rotated ? sourceHeight : sourceWidth);
  canvas.height = Math.round(rotated ? sourceWidth : sourceHeight);
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((entry.imageRotation || 0) * Math.PI / 180);
  context.filter = entry.imageBW ? "grayscale(1)" : "none";
  context.drawImage(
    image,
    (image.naturalWidth - sourceWidth) / 2,
    (image.naturalHeight - sourceHeight) / 2,
    sourceWidth,
    sourceHeight,
    -sourceWidth / 2,
    -sourceHeight / 2,
    sourceWidth,
    sourceHeight
  );
  context.restore();
}

async function renderPdf(entry, container, index) {
  const pdf = entry.pdf || await window.pdfjsLib.getDocument({ data: await entry.file.arrayBuffer() }).promise;
  entry.pdf = pdf;
  entry.pdfOrder ||= Array.from({ length: pdf.numPages }, (_, page) => page);
  entry.pdfDeleted ||= new Set();
  entry.pdfRotations ||= new Map();
  const availablePages = entry.pdfOrder.filter((page) => !entry.pdfDeleted.has(page));
  if (!availablePages.length) throw new Error("Keep at least one PDF page.");
  entry.pdfCurrentPosition = Math.min(entry.pdfCurrentPosition || 0, availablePages.length - 1);
  const originalPageIndex = availablePages[entry.pdfCurrentPosition];
  const page = await pdf.getPage(originalPageIndex + 1);
  const rotation = (page.rotate + (entry.pdfRotations.get(originalPageIndex) || 0)) % 360;
  const viewport = page.getViewport({ scale: 1.15, rotation });
  const canvas = container.querySelector("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  container.querySelector(`[data-pdf-page="${index}"]`).textContent = `Page ${entry.pdfCurrentPosition + 1} of ${availablePages.length}`;
  container.querySelector(`[data-pdf-prev="${index}"]`).disabled = entry.pdfCurrentPosition === 0;
  container.querySelector(`[data-pdf-next="${index}"]`).disabled = entry.pdfCurrentPosition >= availablePages.length - 1;
}

async function renderPreview(entry, index) {
  const container = document.querySelector(`[data-preview="${index}"]`);
  const file = entry.file;
  if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
  entry.previewUrl = URL.createObjectURL(file);
  if (file.type.startsWith("image/")) {
    container.innerHTML = `<div class="image-tools"><canvas data-image-canvas="${index}" aria-label="Edited image preview"></canvas><div><button type="button" data-image-rotate="${index}">Rotate</button><button type="button" data-image-bw="${index}">B&amp;W</button><button type="button" data-image-crop="${index}">Crop</button></div></div>`;
    const image = new Image();
    image.onload = () => {
      entry.image = image;
      imageCanvas(entry, container.querySelector("canvas"));
    };
    image.onerror = () => { container.textContent = "Image preview unavailable."; };
    image.src = entry.previewUrl;
    return;
  }
  if (extension(file.name) === "pdf") {
    container.innerHTML = `<canvas class="pdf-canvas" aria-label="PDF page preview"></canvas><div class="preview-nav"><button type="button" data-pdf-prev="${index}" aria-label="Previous PDF page">←</button><span data-pdf-page="${index}">Loading PDF…</span><button type="button" data-pdf-next="${index}" aria-label="Next PDF page">→</button></div><div class="pdf-edit-tools"><button type="button" data-pdf-rotate="${index}">Rotate page</button><button type="button" data-pdf-delete="${index}">Delete page</button><button type="button" data-pdf-left="${index}">Move left</button><button type="button" data-pdf-right="${index}">Move right</button></div>`;
    try {
      await renderPdf(entry, container, index);
    } catch (error) {
      console.error("PDF preview failed.", error);
      container.innerHTML = `<div class="unsupported-preview">PDF preview unavailable.</div>`;
    }
    return;
  }
  if (extension(file.name) === "docx") {
    container.innerHTML = `<div class="unsupported-preview">Preview is handled by the new document viewer.</div>`;
    return;
  }
  if (["xls", "xlsx"].includes(extension(file.name)) && window.XLSX) {
    try {
      const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      container.innerHTML = `<div class="xlsx-preview">${sanitizePreview(window.XLSX.utils.sheet_to_html(sheet))}</div>`;
    } catch (error) {
      console.error("Spreadsheet preview failed.", error);
      container.innerHTML = `<div class="unsupported-preview">Spreadsheet preview unavailable.</div>`;
    }
    return;
  }
  container.innerHTML = `<div class="unsupported-preview"><strong aria-hidden="true">${escapeHtml(extension(file.name).toUpperCase())} file</strong><strong>${escapeHtml(file.name)}</strong><span>${formatSize(file.size)}</span></div>`;
}

function serviceId(service, index) {
  return service.id === undefined || service.id === null ? `sample-${index}` : String(service.id);
}

function selectedService(entry) {
  return services.find((service, index) => serviceId(service, index) === entry.options.service);
}

const previewContext = { activeIndex: 0 };

async function renderPreviews() {
  const container = document.querySelector("#preview-step2");
  renderWorkspace(container, files);
  document.querySelector("#step-file-count").textContent = `${files.length} file${files.length === 1 ? "" : "s"}`;
  const stickyCount = document.querySelector("#step2-file-count");
  if (stickyCount) stickyCount.textContent = `${files.length} file${files.length === 1 ? "" : "s"}`;
  files.forEach((entry) => { entry.isActive = false; });
  files[0].isActive = true;
  previewContext.activeIndex = 0;
  await initializeOptions(files, services, previewContext);
  await renderActivePreview(files[0], 0);
  updateLiveSummary(files, services);
}

document.querySelector("#preview-step2").addEventListener("click", async (event) => {
  const remove = event.target.closest("[data-preview-remove]");
  if (remove) {
    event.preventDefault();
    event.stopPropagation();
    const removedIndex = Number(remove.dataset.previewRemove);
    if (!Number.isInteger(removedIndex) || !files[removedIndex]) return;
    if (fullscreenIsOpen()) closeFullscreen();
    const activeEntry = files[previewContext.activeIndex];
    const [removed] = files.splice(removedIndex, 1);
    releaseFilePreview(removed);

    if (!files.length) {
      previewContext.activeIndex = 0;
      document.querySelector("#preview-options").replaceChildren();
      document.querySelector("#preview-step2").replaceChildren();
      document.querySelector("#step-file-count").textContent = "0 files";
      updateLiveSummary(files, services);
      setStep(1);
      renderFileList();
      return;
    }

    previewContext.activeIndex = activeEntry === removed
      ? Math.min(removedIndex, files.length - 1)
      : files.indexOf(activeEntry);
    if (previewContext.activeIndex < 0) previewContext.activeIndex = 0;
    files.forEach((entry) => { entry.isActive = false; });
    const nextEntry = files[previewContext.activeIndex];
    nextEntry.isActive = true;
    renderFileList();
    renderFileRail(files, previewContext.activeIndex);
    renderOptions(nextEntry, previewContext.activeIndex, files, services, previewContext);
    await renderActivePreview(nextEntry, previewContext.activeIndex);
    document.querySelector("#step-file-count").textContent = `${files.length} file${files.length === 1 ? "" : "s"}`;
    updateLiveSummary(files, services);
    return;
  }

  const card = event.target.closest("[data-preview-file]");
  if (card) {
    const nextIndex = Number(card.dataset.previewFile);
    files.forEach((entry) => { entry.isActive = false; });
    files[nextIndex].isActive = true;
    previewContext.activeIndex = nextIndex;
    renderFileRail(files, nextIndex);
    renderOptions(files[nextIndex], nextIndex, files, services, previewContext);
    await renderActivePreview(files[nextIndex], nextIndex);
  }

  const action = event.target.closest("[data-preview-action]");
  if (action) {
    const entry = files[previewContext.activeIndex];
    if (!entry) return;
    if (!Number.isFinite(entry.previewZoom)) entry.previewZoom = 1;
    if (entry.pdf && ["zoom-in", "zoom-out", "fit"].includes(action.dataset.previewAction)) {
      if (action.dataset.previewAction === "fit") {
        entry.previewZoom = 1;
        entry.pdfFocusX = 0.5;
        entry.pdfFocusY = 0.5;
        await renderPdfViews(entry, previewContext.activeIndex);
      } else {
        const factor = action.dataset.previewAction === "zoom-in" ? 1.2 : 1 / 1.2;
        await changePdfZoom(entry, previewContext.activeIndex, factor, document.querySelector("#preview-sheet-content"));
      }
    } else if (["zoom-in", "zoom-out", "fit"].includes(action.dataset.previewAction)) {
      if (action.dataset.previewAction === "zoom-in") entry.previewZoom = Math.min(2.5, entry.previewZoom + 0.15);
      if (action.dataset.previewAction === "zoom-out") entry.previewZoom = Math.max(0.6, entry.previewZoom - 0.15);
      if (action.dataset.previewAction === "fit") entry.previewZoom = 1;
      fitPreviewContent(document.querySelector("#preview-sheet-content"), entry.previewZoom);
      if (fullscreenIsOpen()) fitPreviewContent(document.querySelector("#fullscreen-paper-content"), entry.previewZoom);
      syncPreviewZoomLabel(entry);
    }
    if (action.dataset.previewAction === "previous") await changePdfPage(entry, previewContext.activeIndex, -1);
    if (action.dataset.previewAction === "next") await changePdfPage(entry, previewContext.activeIndex, 1);
    if (action.dataset.previewAction === "fullscreen") await openFullscreen(entry, previewContext.activeIndex);
    if (action.dataset.previewAction === "close-fullscreen") closeFullscreen();
  }

  const thumb = event.target.closest("[data-pdf-position]");
  if (thumb) {
    const entry = files[previewContext.activeIndex];
    entry.pdfCurrentPosition = Number(thumb.dataset.pdfPosition);
    entry.pdfFocusX = 0.5;
    entry.pdfFocusY = 0.5;
    await renderPdfViews(entry, previewContext.activeIndex);
  }

  const imageAction = event.target.closest("[data-image-action]");
  if (imageAction) {
    const entry = files[previewContext.activeIndex];
    if (imageAction.dataset.imageAction === "rotate") entry.imageRotation = ((entry.imageRotation || 0) + 90) % 360;
    if (imageAction.dataset.imageAction === "crop") entry.imageCrop = !entry.imageCrop;
    drawImagePreview(entry, document.querySelector("#preview-image-canvas"));
  }
});

document.querySelector("#preview-step2").addEventListener("keydown", (event) => {
  const card = event.target.closest("[data-preview-file]");
  if (card && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    card.click();
  }
});

document.querySelector("#preview-step2").addEventListener("change", (event) => {
  if (event.target.id === "preview-bw-switch") {
    document.querySelector("#preview-sheet-content")?.classList.toggle("is-bw", event.target.checked);
  }
});

function fullscreenIsOpen() {
  return document.querySelector("#preview-fullscreen")?.classList.contains("is-open") || false;
}

function syncPreviewZoomLabel(entry) {
  const label = `${Math.round((entry.previewZoom || 1) * 100)}%`;
  document.querySelectorAll(".zoom-label").forEach((node) => { node.textContent = label; });
}

async function renderPdfViews(entry, index) {
  updatePaperPreview(entry.options?.paper);
  await renderPdfPage(entry, document.querySelector("#preview-sheet-content"), index);
  if (fullscreenIsOpen()) {
    const stage = document.querySelector("#fullscreen-paper-stage");
    const sheet = document.querySelector("#fullscreen-paper");
    const content = document.querySelector("#fullscreen-paper-content");
    updatePaperPreview(entry.options?.paper, sheet, stage);
    await renderPdfPage(entry, content, index, sheet, stage);
  }
  syncPreviewZoomLabel(entry);
}

async function changePdfPage(entry, index, delta) {
  await movePdfPage(entry, index, delta);
  if (fullscreenIsOpen()) {
    await renderPdfPage(
      entry,
      document.querySelector("#fullscreen-paper-content"),
      index,
      document.querySelector("#fullscreen-paper"),
      document.querySelector("#fullscreen-paper-stage")
    );
  }
}

async function changePdfZoom(entry, index, factor, content, anchor = { x: 0.5, y: 0.5 }) {
  const canvas = content?.querySelector(".pdf-preview-canvas");
  const oldZoom = entry.previewZoom || 1;
  const nextZoom = Math.max(0.4, Math.min(5, oldZoom * factor));
  if (canvas && nextZoom !== oldZoom) {
    const width = parseFloat(canvas.style.width) || canvas.clientWidth;
    const height = parseFloat(canvas.style.height) || canvas.clientHeight;
    const sourceX = (entry.pdfFocusX ?? 0.5) + (anchor.x - 0.5) * content.clientWidth / width;
    const sourceY = (entry.pdfFocusY ?? 0.5) + (anchor.y - 0.5) * content.clientHeight / height;
    const scale = nextZoom / oldZoom;
    entry.pdfFocusX = clampPdfFocus(sourceX - (anchor.x - 0.5) * content.clientWidth / (width * scale), width * scale, content.clientWidth);
    entry.pdfFocusY = clampPdfFocus(sourceY - (anchor.y - 0.5) * content.clientHeight / (height * scale), height * scale, content.clientHeight);
  }
  entry.previewZoom = nextZoom;
  await renderPdfViews(entry, index);
}

async function openFullscreen(entry, index) {
  const modal = document.querySelector("#preview-fullscreen");
  const fullscreen = document.querySelector("#fullscreen-paper");
  const stage = document.querySelector("#fullscreen-paper-stage");
  const content = document.querySelector("#preview-sheet-content");
  const clone = content.cloneNode(true);
  clone.removeAttribute("id");
  clone.id = "fullscreen-paper-content";
  clone.classList.toggle("is-bw", document.querySelector("#preview-bw-switch")?.checked);
  clone.classList.add("fullscreen-content");
  fullscreen.replaceChildren(clone);
  modal.classList.add("is-open");
  document.body.style.overflow = "hidden";
  modal.querySelectorAll(".pdf-only").forEach((control) => { control.hidden = !entry.pdf; });
  updatePaperPreview(entry.options?.paper, fullscreen, stage);
  if (entry.pdf) {
    await renderPdfPage(entry, clone, index, fullscreen, stage);
    syncPreviewZoomLabel(entry);
  } else {
    fitPreviewContent(clone, entry.previewZoom || 1);
    syncPreviewZoomLabel(entry);
  }
  modal.querySelector("[data-preview-action='close-fullscreen']").focus();
}

function closeFullscreen() {
  const modal = document.querySelector("#preview-fullscreen");
  const entry = files[previewContext.activeIndex];
  if (entry?.pdf) updatePdfPan(entry, document.querySelector("#preview-sheet-content"));
  modal?.classList.remove("is-open");
  document.querySelector("#fullscreen-paper")?.replaceChildren();
  document.body.style.overflow = "";
}

document.querySelector("#preview-fullscreen").addEventListener("click", async (event) => {
  if (event.target === event.currentTarget) {
    closeFullscreen();
    return;
  }
  const action = event.target.closest("[data-preview-action]");
  if (!action) return;
  if (action.dataset.previewAction === "close-fullscreen") {
    closeFullscreen();
    return;
  }
  const entry = files[previewContext.activeIndex];
  if (!entry) return;
  if (action.dataset.previewAction === "zoom-in" || action.dataset.previewAction === "zoom-out") {
    if (entry.pdf) {
      const factor = action.dataset.previewAction === "zoom-in" ? 1.2 : 1 / 1.2;
      await changePdfZoom(entry, previewContext.activeIndex, factor, document.querySelector("#fullscreen-paper-content"));
    } else {
      const delta = action.dataset.previewAction === "zoom-in" ? 0.15 : -0.15;
      entry.previewZoom = Math.max(0.6, Math.min(2.5, (entry.previewZoom || 1) + delta));
      fitPreviewContent(document.querySelector("#preview-sheet-content"), entry.previewZoom);
      fitPreviewContent(document.querySelector("#fullscreen-paper-content"), entry.previewZoom);
      syncPreviewZoomLabel(entry);
    }
    return;
  }
  if (action.dataset.previewAction === "fit") {
    entry.previewZoom = 1;
    if (entry.pdf) {
      entry.pdfFocusX = 0.5;
      entry.pdfFocusY = 0.5;
      await renderPdfViews(entry, previewContext.activeIndex);
    } else {
      fitPreviewContent(document.querySelector("#preview-sheet-content"), 1);
      fitPreviewContent(document.querySelector("#fullscreen-paper-content"), 1);
      syncPreviewZoomLabel(entry);
    }
    return;
  }
  if (!entry.pdf) return;
  if (action.dataset.previewAction === "previous") await changePdfPage(entry, previewContext.activeIndex, -1);
  if (action.dataset.previewAction === "next") await changePdfPage(entry, previewContext.activeIndex, 1);
});

document.querySelector("#preview-step2").addEventListener("change", async (event) => {
  if (!["service", "variantLabel"].includes(event.target.dataset.option)) return;
  const entry = files[previewContext.activeIndex];
  if (!entry) return;
  updatePaperPreview(entry.options?.paper);
  if (fullscreenIsOpen()) updatePaperPreview(entry.options?.paper, document.querySelector("#fullscreen-paper"), document.querySelector("#fullscreen-paper-stage"));
  if (entry.pdf) await renderPdfViews(entry, previewContext.activeIndex);
  else {
    fitPreviewContent(document.querySelector("#preview-sheet-content"), entry.previewZoom || 1);
    if (fullscreenIsOpen()) fitPreviewContent(document.querySelector("#fullscreen-paper-content"), entry.previewZoom || 1);
  }
});

let pdfDrag = null;
document.addEventListener("pointerdown", (event) => {
  const canvas = event.target.closest(".pdf-preview-canvas");
  const entry = files[previewContext.activeIndex];
  if (!canvas || !entry?.pdf || event.button !== 0) return;
  const content = canvas.closest(".preview-sheet-content");
  const width = parseFloat(canvas.style.width) || canvas.clientWidth;
  const height = parseFloat(canvas.style.height) || canvas.clientHeight;
  pdfDrag = {
    canvas,
    content,
    entry,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    focusX: entry.pdfFocusX ?? 0.5,
    focusY: entry.pdfFocusY ?? 0.5,
    width,
    height
  };
  canvas.setPointerCapture(event.pointerId);
  content.classList.add("is-panning");
  event.preventDefault();
});

document.addEventListener("pointermove", (event) => {
  if (!pdfDrag || event.pointerId !== pdfDrag.pointerId) return;
  const deltaX = event.clientX - pdfDrag.startX;
  const deltaY = event.clientY - pdfDrag.startY;
  pdfDrag.entry.pdfFocusX = clampPdfFocus(pdfDrag.focusX - deltaX / pdfDrag.width, pdfDrag.width, pdfDrag.content.clientWidth);
  pdfDrag.entry.pdfFocusY = clampPdfFocus(pdfDrag.focusY - deltaY / pdfDrag.height, pdfDrag.height, pdfDrag.content.clientHeight);
  updatePdfPan(pdfDrag.entry, document.querySelector("#preview-sheet-content"));
  if (fullscreenIsOpen()) updatePdfPan(pdfDrag.entry, document.querySelector("#fullscreen-paper-content"));
});

function endPdfDrag(event) {
  if (!pdfDrag || (event && event.pointerId !== pdfDrag.pointerId)) return;
  pdfDrag.content.classList.remove("is-panning");
  if (pdfDrag.canvas.hasPointerCapture(pdfDrag.pointerId)) pdfDrag.canvas.releasePointerCapture(pdfDrag.pointerId);
  pdfDrag = null;
}

document.addEventListener("pointerup", endPdfDrag);
document.addEventListener("pointercancel", endPdfDrag);

document.addEventListener("wheel", (event) => {
  if (!event.ctrlKey) return;
  const canvas = event.target.closest(".pdf-preview-canvas");
  const entry = files[previewContext.activeIndex];
  if (!canvas || !entry?.pdf) return;
  const content = canvas.closest(".preview-sheet-content");
  const bounds = content.getBoundingClientRect();
  const anchor = {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
  };
  event.preventDefault();
  const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
  changePdfZoom(entry, previewContext.activeIndex, factor, content, anchor);
}, { passive: false });

let pdfResizeTimer;
window.addEventListener("resize", () => {
  const entry = files[previewContext.activeIndex];
  if (!entry) return;
  clearTimeout(pdfResizeTimer);
  pdfResizeTimer = setTimeout(async () => {
    updatePaperPreview(entry.options?.paper);
    if (fullscreenIsOpen()) updatePaperPreview(entry.options?.paper, document.querySelector("#fullscreen-paper"), document.querySelector("#fullscreen-paper-stage"));
    if (entry.pdf) await renderPdfViews(entry, previewContext.activeIndex);
  }, 100);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeFullscreen();
});

async function processedFile(entry) {
  if (entry.image && (entry.imageRotation || entry.imageCrop || entry.imageBW)) {
    const canvas = document.createElement("canvas");
    imageCanvas(entry, canvas);
    const blob = await new Promise((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Image editing could not be saved.")), entry.file.type));
    return new File([blob], entry.file.name, { type: entry.file.type, lastModified: Date.now() });
  }
  if (extension(entry.file.name) === "pdf" && entry.pdfOrder) {
    const source = await window.PDFLib.PDFDocument.load(await entry.file.arrayBuffer());
    const edited = await window.PDFLib.PDFDocument.create();
    const pages = getPageIndices(entry);
    if (!pages.length) throw new Error("A PDF must keep at least one page.");
    const copied = await edited.copyPages(source, pages);
    copied.forEach((page, position) => {
      const rotation = entry.pdfRotations.get(pages[position]) || 0;
      if (rotation) page.setRotation(window.PDFLib.degrees((page.getRotation().angle + rotation) % 360));
      edited.addPage(page);
    });
    const bytes = await edited.save();
    return new File([bytes], entry.file.name, { type: "application/pdf", lastModified: Date.now() });
  }
  return entry.file;
}

function pageCount(entry) {
  return getPageCount(entry);
}

function priceFor(entry) {
  const line = getLinePrice(entry, services);
  return {
    service: line.service || selectedService(entry),
    variant: line.variant,
    addons: line.addons,
    unitPrice: line.price,
    confirmed: line.confirmed
  };
}

function calculateTotal() {
  return calculateEstimate(files, services);
}

function renderSummary() {
  const total = calculateTotal();
  const needsQuote = files.some((entry) => !getLinePrice(entry, services).confirmed);
  const rows = files.map((entry) => {
    const { service, variant, addons, unitPrice, confirmed } = priceFor(entry);
    const copies = Math.max(1, Number(entry.options.copies || 1));
    const quantity = service?.billing === "page" ? pageCount(entry) * copies : copies;
    const optionLabel = [service?.name, variant?.label, ...(addons || []).map((addon) => addon.label)].filter(Boolean).join(" · ");
    const unitLabel = service?.billing === "page" ? "page(s)" : String(service?.unit || "item(s)").replace(/^per\s+/i, "");
    const label = `${optionLabel || "Service to be confirmed"} · ${quantity} ${unitLabel}`;
    return `<div class="summary-row"><div><strong>${escapeHtml(entry.file.name)}</strong><span>${escapeHtml(label)}</span></div><strong>${confirmed ? `₱${currency.format(unitPrice * quantity)}` : "Price to be confirmed"}</strong></div>`;
  }).join("");
  document.querySelector("#order-summary").innerHTML = `<h3>Estimated breakdown</h3>${rows}<div class="summary-total"><span>${needsQuote ? "Priced items subtotal" : "Estimated total"}</span><strong>₱${currency.format(total)}${needsQuote ? " + quote" : ""}</strong></div><p class="summary-note">${needsQuote ? "Some selected options have no posted price. Confirm the final amount with AuraTrust before paying." : "This estimate uses the selected service, options, and quantity."}</p>`;
  document.querySelector("#gcash-exact").textContent = needsQuote
    ? "Confirm the final amount with AuraTrust before paying"
    : `Exact amount: ₱${currency.format(total)}`;
  return total;
}

document.querySelector("#upload-next").addEventListener("click", () => {
  uploadError.textContent = "";
  renderPreviews();
  setStep(2);
});

function continueFromOptions() {
  for (const entry of files) {
    const line = getLinePrice(entry, services);
    if (!line.service || line.reason === "Choose an option to see its price.") {
      showToast(line.reason || "Choose a service for " + entry.file.name + ".");
      return;
    }
    if (line.service.billing === "page" && extension(entry.file.name) !== "pdf" && !Number(entry.options.pageCount)) {
      showToast("Enter number of pages for " + entry.file.name + ".");
      return;
    }
    if (!validatePages(entry)) {
      showToast(entry.pageRangeError || "Check the page range.");
      return;
    }
  }
  try {
    renderSummary();
    setStep(3);
  } catch (error) {
    uploadError.textContent = error.message;
  }
}

document.querySelector("#options-next").addEventListener("click", continueFromOptions);
document.querySelectorAll("[data-back]").forEach((button) => button.addEventListener("click", () => setStep(Number(button.dataset.back))));

document.querySelector("#gcash-name").textContent = gcashInfo.name;
document.querySelector("#gcash-number").textContent = gcashInfo.number;
document.querySelector("#download-qr").href = gcashInfo.qrPath;
document.querySelector("#gcash-qr").src = gcashInfo.qrPath;
document.querySelector("#terms-checkbox").addEventListener("change", (event) => {
  document.querySelector("#place-order").disabled = !event.target.checked;
});

function validateReceipt(receipt) {
  if (!receipt) throw new Error("Please upload your GCash receipt screenshot.");
  if (!["jpg", "jpeg", "png", "webp"].includes(extension(receipt.name))) throw new Error("The receipt must be a JPG, PNG, or WebP image.");
  if (receipt.size > orderLimits.maxFileSizeMB * 1024 * 1024) throw new Error(`The receipt exceeds the ${orderLimits.maxFileSizeMB} MB limit.`);
  if (!receipt.type.startsWith("image/")) throw new Error("The receipt file must be an image.");
}

function uniqueStorageName(fileName, index, seen) {
  const clean = fileName.normalize("NFKC").replace(/[^a-zA-Z0-9._-]/g, "_");
  let name = clean;
  let suffix = 2;
  while (seen.has(name.toLowerCase())) {
    const dot = clean.lastIndexOf(".");
    name = dot > 0 ? `${clean.slice(0, dot)}-${suffix}${clean.slice(dot)}` : `${clean}-${suffix}`;
    suffix++;
  }
  seen.add(name.toLowerCase());
  return name || `file-${index + 1}`;
}

async function createOrder(form) {
  const client = requireSupabase();
  const user = await ensureAnonymousCustomer();
  const orderId = makeId();
  const orderNumber = `AT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${makeId().slice(0, 6).toUpperCase()}`;
  const receipt = form.receipt.files[0];
  validateReceipt(receipt);

  const uploadedPaths = [];
  const seenNames = new Set();
  const progress = document.querySelector("#submission-progress");
  progress.innerHTML = files.map((entry, index) => `<div class="upload-file"><span class="file-icon">${escapeHtml(extension(entry.file.name).toUpperCase())}</span><div class="file-meta"><strong>${escapeHtml(entry.file.name)}</strong><span data-upload-status="${index}">Preparing file…</span><div class="upload-progress" role="progressbar" aria-label="Upload ${escapeHtml(entry.file.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div data-submit-progress="${index}" style="width:0%"></div></div></div></div>`).join("");
  progress.hidden = false;

  try {
    const items = [];
    for (const [index, entry] of files.entries()) {
      document.querySelector(`[data-upload-status="${index}"]`).textContent = "Preparing…";
      const file = await processedFile(entry);
      const storageName = uniqueStorageName(file.name, index, seenNames);
      const progressBar = document.querySelector(`[data-submit-progress="${index}"]`);
      progressBar.parentElement.classList.add("is-indeterminate");
      progressBar.parentElement.removeAttribute("aria-valuenow");
      progressBar.parentElement.setAttribute("aria-valuetext", "Uploading");
      document.querySelector(`[data-upload-status="${index}"]`).textContent = "Uploading securely…";
      const uploaded = await uploadOrderFile(user.id, orderId, file, storageName);
      uploadedPaths.push(uploaded.path);
      entry.progress = 100;
      progressBar.parentElement.classList.remove("is-indeterminate");
      progressBar.style.width = "100%";
      progressBar.parentElement.setAttribute("aria-valuenow", "100");
      progressBar.parentElement.removeAttribute("aria-valuetext");
      document.querySelector(`[data-upload-status="${index}"]`).textContent = "Uploaded";
      const { service, variant } = priceFor(entry);
      items.push({
        fileName: entry.file.name,
        storagePath: uploaded.path,
        fileType: file.type || "application/octet-stream",
        size: file.size,
        options: { ...entry.options, service: service?.name || "To be confirmed", serviceId: service?.id || null, variant: variant || null }
      });
    }

    const receiptName = uniqueStorageName(`receipt-${receipt.name}`, files.length, seenNames);
    const uploadedReceipt = await uploadOrderFile(user.id, orderId, receipt, receiptName);
    uploadedPaths.push(uploadedReceipt.path);
    const estimatedTotal = calculateTotal();
    const order = await createCustomerOrder({
      id: orderId,
      order_number: orderNumber,
      customer_id: user.id,
      customer_name: form.customerName.value.trim(),
      mobile: form.mobile.value.trim(),
      pickup_or_delivery: form.pickupOrDelivery.value,
      items,
      estimated_total: estimatedTotal,
      gcash_ref: form.gcashRef.value.trim(),
      receipt_path: uploadedReceipt.path,
      status: "Received",
      terms_accepted_at: new Date().toISOString()
    });
    return order;
  } catch (error) {
    if (uploadedPaths.length) {
      const { error: cleanupError } = await client.storage.from("order-files").remove(uploadedPaths);
      if (cleanupError) console.error("Failed to clean up incomplete order uploads.", cleanupError);
    }
    progress.hidden = true;
    files.forEach((entry) => { entry.progress = 0; });
    renderFileList();
    throw error;
  }
}

document.querySelector("#payment-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget.elements;
  const error = document.querySelector("#payment-error");
  const button = document.querySelector("#place-order");
  if (!document.querySelector("#terms-checkbox").checked) return;
  button.disabled = true;
  error.textContent = "";
  try {
    const order = await createOrder(form);
    document.querySelector("#confirmed-number").textContent = order.order_number;
    document.querySelector("#track-order-link").href = `track.html?order=${encodeURIComponent(order.order_number)}`;
    setStep(4);
  } catch (problem) {
    console.error("Order submission failed.", problem);
    error.textContent = problem.message === "Anonymous sign-ins are disabled"
      ? "Online ordering is not enabled yet. AuraTrust needs to enable anonymous sign-ins in Supabase Auth."
      : problem.message || "We could not place the order. Please try again.";
  } finally {
    button.disabled = !document.querySelector("#terms-checkbox").checked;
  }
});

document.querySelector("#payment-form").elements.receipt.addEventListener("change", (event) => {
  try {
    validateReceipt(event.target.files[0]);
    document.querySelector("#payment-error").textContent = "";
  } catch (error) {
    document.querySelector("#payment-error").textContent = error.message;
  }
});

async function loadServices() {
  services = priceList.filter((service) => service.visible);
  if (!services.length) {
    document.querySelector("#order-service-error").hidden = false;
  }
  servicesReady = services.length > 0;
  renderFileList();
}

document.querySelector("#order-service-error").hidden = true;
document.querySelector("#upload-next").disabled = true;
loadServices();
renderFileList();
