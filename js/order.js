import { gcashInfo, orderLimits } from "./config.js";
import { createCustomerOrder, ensureAnonymousCustomer, getPublicPriceData, requireSupabase, uploadOrderFile } from "./supabase.js";
import { sampleServices } from "./sample-data.js";

const currency = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const files = [];
let services = [];
let servicesReady = false;

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
    files.push({ file, progress: 0, options: { service: "", variantLabel: "", paper: "A4", copies: 1, color: "Color", sides: "Single-sided", pages: "All", notes: "" } });
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
  if (removed.previewUrl) URL.revokeObjectURL(removed.previewUrl);
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
  if (extension(file.name) === "docx" && window.mammoth) {
    container.innerHTML = `<div class="docx-preview">Loading preview…</div>`;
    try {
      const { value } = await window.mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
      container.innerHTML = `<div class="docx-preview">${sanitizePreview(value)}</div>`;
    } catch (error) {
      console.error("DOCX preview failed.", error);
      container.innerHTML = `<div class="unsupported-preview">Document preview unavailable.</div>`;
    }
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

function renderVariantSelect(entry, index) {
  const service = selectedService(entry);
  const variants = Array.isArray(service?.variants) ? service.variants : [];
  const label = variants.length
    ? `<label class="order-field"><span>Price option</span><select data-option="variantLabel" data-index="${index}" required><option value="">Choose an option</option>${variants.map((variant) => `<option value="${escapeHtml(variant.label)}" ${entry.options.variantLabel === variant.label ? "selected" : ""}>${escapeHtml(variant.label)} — ₱${currency.format(Number(variant.price))}</option>`).join("")}</select></label>`
    : "";
  return label;
}

function renderPreviews() {
  document.querySelector("#preview-list").innerHTML = files.map((entry, index) => `
    <article class="preview-item"><div class="preview-layout">
      <div class="preview-pane" data-preview="${index}"></div>
      <div class="print-options">
        <h3>${escapeHtml(entry.file.name)}</h3>
        <label class="order-field"><span>Service type</span><select data-option="service" data-index="${index}" required><option value="">Choose service</option>${services.map((service, serviceIndex) => `<option value="${escapeHtml(serviceId(service, serviceIndex))}" ${entry.options.service === serviceId(service, serviceIndex) ? "selected" : ""}>${escapeHtml(service.name)} — ${escapeHtml(service.category)}</option>`).join("")}</select></label>
        <div data-variants="${index}">${renderVariantSelect(entry, index)}</div>
        <div class="option-grid"><label class="order-field"><span>Paper size</span><select data-option="paper" data-index="${index}"><option>A4</option><option>Short</option><option>Long</option><option>Other</option></select></label><label class="order-field"><span>Copies</span><input data-option="copies" data-index="${index}" type="number" min="1" max="500" step="1" value="${entry.options.copies}" inputmode="numeric"></label></div>
        <div class="option-grid"><label class="order-field"><span>Print</span><select data-option="color" data-index="${index}"><option value="Color">Color</option><option value="B&W">B&amp;W</option></select></label><label class="order-field"><span>Sides</span><select data-option="sides" data-index="${index}"><option>Single-sided</option><option>Double-sided</option></select></label></div>
        <label class="order-field"><span>Page range</span><input data-option="pages" data-index="${index}" value="${escapeHtml(entry.options.pages)}" placeholder="All pages or 1-5" maxlength="60"></label>
        <label class="order-field"><span>Notes for the shop</span><textarea data-option="notes" data-index="${index}" rows="3" maxlength="500" placeholder="Tell us any special instructions">${escapeHtml(entry.options.notes)}</textarea></label>
      </div>
    </div></article>
  `).join("");
  files.forEach((entry, index) => {
    const paper = document.querySelector(`[data-option="paper"][data-index="${index}"]`);
    const color = document.querySelector(`[data-option="color"][data-index="${index}"]`);
    const sides = document.querySelector(`[data-option="sides"][data-index="${index}"]`);
    paper.value = entry.options.paper;
    color.value = entry.options.color;
    sides.value = entry.options.sides;
    renderPreview(entry, index);
  });
}

document.querySelector("#preview-list").addEventListener("change", (event) => {
  const control = event.target.closest("[data-option]");
  if (!control) return;
  const index = Number(control.dataset.index);
  const entry = files[index];
  const key = control.dataset.option;
  if (key === "copies") {
    const copies = Number(control.value);
    if (!Number.isInteger(copies) || copies < 1 || copies > 500) {
      control.setCustomValidity("Enter a whole number from 1 to 500.");
      control.reportValidity();
      control.value = String(entry.options.copies);
      return;
    }
    control.setCustomValidity("");
    entry.options.copies = copies;
  } else {
    entry.options[key] = control.value;
  }
  if (key === "service") {
    entry.options.variantLabel = "";
    document.querySelector(`[data-variants="${index}"]`).innerHTML = renderVariantSelect(entry, index);
  }
});

document.querySelector("#preview-list").addEventListener("click", async (event) => {
  const indexOf = (selector) => Number(selector.dataset[Object.keys(selector.dataset).find((key) => key !== "index")]);
  const imageButton = event.target.closest("[data-image-rotate], [data-image-bw], [data-image-crop]");
  if (imageButton) {
    const index = indexOf(imageButton);
    const entry = files[index];
    if (imageButton.hasAttribute("data-image-rotate")) entry.imageRotation = ((entry.imageRotation || 0) + 90) % 360;
    if (imageButton.hasAttribute("data-image-bw")) entry.imageBW = !entry.imageBW;
    if (imageButton.hasAttribute("data-image-crop")) entry.imageCrop = !entry.imageCrop;
    imageCanvas(entry, document.querySelector(`[data-image-canvas="${index}"]`));
    return;
  }
  const pdfButton = event.target.closest("[data-pdf-prev], [data-pdf-next], [data-pdf-rotate], [data-pdf-delete], [data-pdf-left], [data-pdf-right]");
  if (!pdfButton) return;
  const index = indexOf(pdfButton);
  const entry = files[index];
  const available = entry.pdfOrder.filter((page) => !entry.pdfDeleted.has(page));
  const position = entry.pdfCurrentPosition || 0;
  const originalPage = available[position];
  if (pdfButton.hasAttribute("data-pdf-prev")) entry.pdfCurrentPosition = Math.max(0, position - 1);
  if (pdfButton.hasAttribute("data-pdf-next")) entry.pdfCurrentPosition = Math.min(available.length - 1, position + 1);
  if (pdfButton.hasAttribute("data-pdf-rotate")) entry.pdfRotations.set(originalPage, ((entry.pdfRotations.get(originalPage) || 0) + 90) % 360);
  if (pdfButton.hasAttribute("data-pdf-delete")) {
    if (available.length === 1) {
      document.querySelector("#upload-error").textContent = "A PDF must keep at least one page.";
      return;
    }
    entry.pdfDeleted.add(originalPage);
    entry.pdfCurrentPosition = Math.min(position, available.length - 2);
  }
  if (pdfButton.hasAttribute("data-pdf-left") && position > 0) {
    const pageOrderPosition = entry.pdfOrder.indexOf(originalPage);
    const previousPosition = entry.pdfOrder.indexOf(available[position - 1]);
    [entry.pdfOrder[pageOrderPosition], entry.pdfOrder[previousPosition]] = [entry.pdfOrder[previousPosition], entry.pdfOrder[pageOrderPosition]];
    entry.pdfCurrentPosition--;
  }
  if (pdfButton.hasAttribute("data-pdf-right") && position < available.length - 1) {
    const pageOrderPosition = entry.pdfOrder.indexOf(originalPage);
    const nextPosition = entry.pdfOrder.indexOf(available[position + 1]);
    [entry.pdfOrder[pageOrderPosition], entry.pdfOrder[nextPosition]] = [entry.pdfOrder[nextPosition], entry.pdfOrder[pageOrderPosition]];
    entry.pdfCurrentPosition++;
  }
  try {
    await renderPdf(entry, document.querySelector(`[data-preview="${index}"]`), index);
  } catch (error) {
    console.error("Could not update the PDF preview.", error);
  }
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
    const pages = entry.pdfOrder.filter((page) => !entry.pdfDeleted.has(page));
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
  const range = entry.options.pages.trim();
  if (range && range.toLowerCase() !== "all") {
    const numbers = new Set();
    for (const part of range.split(",")) {
      const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!match) throw new Error(`Use a page range like “1-5” for ${entry.file.name}.`);
      const start = Number(match[1]);
      const end = Number(match[2] || match[1]);
      if (end < start || end - start > 1000) throw new Error(`The page range for ${entry.file.name} is invalid.`);
      for (let page = start; page <= end; page++) numbers.add(page);
    }
    return numbers.size;
  }
  return entry.pdf ? entry.pdfOrder.filter((page) => !entry.pdfDeleted.has(page)).length : 1;
}

function priceFor(entry) {
  const service = selectedService(entry);
  if (!service) throw new Error(`Choose a service for ${entry.file.name}.`);
  const variants = Array.isArray(service.variants) ? service.variants : [];
  const variant = variants.find((item) => item.label === entry.options.variantLabel);
  if (variants.length && !variant) throw new Error(`Choose a price option for ${entry.file.name}.`);
  const unitPrice = variants.length ? Number(variant.price) : Number(service.price);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error(`The selected service has no usable price.`);
  return { service, variant, unitPrice };
}

function calculateTotal() {
  return files.reduce((total, entry) => {
    const { unitPrice } = priceFor(entry);
    return total + unitPrice * pageCount(entry) * Number(entry.options.copies);
  }, 0);
}

function renderSummary() {
  const total = calculateTotal();
  const rows = files.map((entry) => {
    const { service, variant, unitPrice } = priceFor(entry);
    const quantity = pageCount(entry) * Number(entry.options.copies);
    const label = `${service.name}${variant ? ` · ${variant.label}` : ""} · ${quantity} unit(s)`;
    const line = unitPrice * quantity;
    return `<div class="summary-row"><div><strong>${escapeHtml(entry.file.name)}</strong><span>${escapeHtml(label)}</span></div><strong>₱${currency.format(line)}</strong></div>`;
  }).join("");
  document.querySelector("#order-summary").innerHTML = `<h3>Estimated breakdown</h3>${rows}<div class="summary-total"><span>Estimated total</span><strong>₱${currency.format(total)}</strong></div><p class="summary-note">The final price is confirmed by the shop. This estimate uses the selected service, options, copies, and page range.</p>`;
  document.querySelector("#gcash-exact").textContent = `Exact amount: ₱${currency.format(total)}`;
  return total;
}

document.querySelector("#upload-next").addEventListener("click", () => {
  uploadError.textContent = "";
  renderPreviews();
  setStep(2);
});

document.querySelector("#options-next").addEventListener("click", () => {
  const selects = [...document.querySelectorAll('[data-option="service"], [data-option="variantLabel"]')];
  const missing = selects.find((select) => !select.value);
  if (missing) {
    missing.focus();
    missing.reportValidity();
    return;
  }
  try {
    renderSummary();
    setStep(3);
  } catch (error) {
    uploadError.textContent = error.message;
  }
});
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
        options: { ...entry.options, service: service.name, serviceId: service.id || null, variant: variant || null }
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
  try {
    const data = await getPublicPriceData();
    services = data.services.length ? data.services : sampleServices.filter((service) => service.visible);
  } catch (error) {
    console.error("Unable to load prices for the order form.", error);
    services = sampleServices.filter((service) => service.visible);
  }
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
