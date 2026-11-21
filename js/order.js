import { gcashInfo, orderLimits } from "./config.js";
import { ensureAnonymousCustomer, getPublicPriceData, uploadOrderFile, createCustomerOrder } from "./firebase.js";

const currency = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const files = [];
let customerUid = "";
if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[character]);
}
function ext(name) { return name.split(".").pop().toLowerCase(); }
function formatSize(bytes) { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

function setStep(step) {
  document.querySelectorAll("[data-panel]").forEach((panel) => panel.hidden = Number(panel.dataset.panel) !== step);
  document.querySelectorAll(".wizard-progress li").forEach((li) => li.classList.toggle("active", Number(li.dataset.step) <= step));
  document.querySelector("#progress-bar").style.width = `${((step - 1) / 3) * 100}%`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

const dropZone = document.querySelector("#drop-zone");
const fileInput = document.querySelector("#file-input");
function validateFile(file) {
  const extension = ext(file.name);
  if (!orderLimits.allowedExtensions.includes(extension)) return `“${file.name}” is not a supported file type.`;
  if (!file.type || (!orderLimits.allowedMimeTypes.includes(file.type) && !["text/plain"].includes(file.type))) {
    return `“${file.name}” has an unknown or unsafe file type.`;
  }
  if (file.size > orderLimits.maxFileSizeMB * 1024 * 1024) return `“${file.name}” exceeds the ${orderLimits.maxFileSizeMB} MB limit.`;
  return "";
}

async function addFiles(selectedFiles) {
  const error = document.querySelector("#upload-error");
  error.textContent = "";
  for (const file of selectedFiles) {
    if (files.length >= orderLimits.maxFiles) { error.textContent = `You can upload up to ${orderLimits.maxFiles} files.`; break; }
    const problem = validateFile(file);
    if (problem) { error.textContent = problem; continue; }
    if (files.some((entry) => entry.file.name === file.name && entry.file.size === file.size)) continue;
    files.push({ file, uploaded: null, progress: 0 });
  }
  renderFileList();
  if (!files.length) return;
  document.querySelector("#upload-next").disabled = true;
  try {
    const customer = await ensureAnonymousCustomer();
    customerUid = customer.uid;
    for (let i = 0; i < files.length; i++) {
      if (files[i].uploaded) continue;
      files[i].uploaded = await uploadOrderFile(customer.uid, files[i].file, (progress) => {
        files[i].progress = progress;
        const bar = document.querySelector(`[data-progress="${i}"]`);
        if (bar) bar.style.width = `${progress}%`;
      });
      files[i].progress = 100;
      renderFileList();
    }
    document.querySelector("#upload-next").disabled = false;
  } catch (err) {
    console.error(err);
    error.textContent = "Upload could not start. Check Firebase Storage configuration and try again.";
  }
}
function renderFileList() {
  document.querySelector("#file-list").innerHTML = files.map((entry, index) => `
    <div class="upload-file"><div class="file-icon">${escapeHtml(ext(entry.file.name).toUpperCase())}</div><div class="file-meta"><strong>${escapeHtml(entry.file.name)}</strong><span>${formatSize(entry.file.size)} · ${entry.uploaded ? "Uploaded" : "Uploading"}</span><div class="upload-progress"><div data-progress="${index}" style="width:${entry.progress}%"></div></div></div><button type="button" class="remove-file" data-remove="${index}" aria-label="Remove ${escapeHtml(entry.file.name)}">×</button></div>
  `).join("");
  document.querySelector("#upload-next").disabled = files.length === 0;
}

dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInput.click(); } });
["dragenter","dragover"].forEach((name) => dropZone.addEventListener(name, (event) => { event.preventDefault(); dropZone.classList.add("is-dragging"); }));
["dragleave","drop"].forEach((name) => dropZone.addEventListener(name, (event) => { event.preventDefault(); dropZone.classList.remove("is-dragging"); }));
dropZone.addEventListener("drop", (event) => addFiles(event.dataTransfer.files));
fileInput.addEventListener("change", () => addFiles(fileInput.files));
document.querySelector("#file-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove]");
  if (!button) return;
  files.splice(Number(button.dataset.remove), 1);
  renderFileList();
});

async function renderPreview(entry, index) {
  const container = document.querySelector(`[data-preview="${index}"]`);
  const file = entry.file;
  const url = URL.createObjectURL(file);
  if (file.type.startsWith("image/")) {
    container.innerHTML = `<div class="image-tools"><canvas data-image-canvas="${index}"></canvas><div><button type="button" data-image-rotate="${index}">Rotate</button><button type="button" data-image-bw="${index}">B&amp;W</button><button type="button" data-image-crop="${index}">Crop</button></div></div>`;
    const img = new Image();
    img.onload = () => {
      const canvas = container.querySelector("canvas");
      const crop = entry.imageCrop ? 0.8 : 1;
      const cw = img.naturalWidth * crop, ch = img.naturalHeight * crop;
      const rotation = entry.imageRotation || 0;
      const swaps = rotation % 180 !== 0;
      canvas.width = swaps ? ch : cw; canvas.height = swaps ? cw : ch;
      const ctx = canvas.getContext("2d");
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rotation * Math.PI / 180);
      ctx.filter = entry.imageBW ? "grayscale(1)" : "none";
      ctx.drawImage(img, (img.naturalWidth-cw)/2, (img.naturalHeight-ch)/2, cw, ch, -cw/2, -ch/2, cw, ch);
      ctx.restore();
    };
    img.src = url;
  } else if (file.type === "application/pdf") {
    container.innerHTML = `<canvas class="pdf-canvas"></canvas><div class="preview-nav"><button type="button" data-pdf-prev="${index}">←</button><span data-pdf-page="${index}">Page 1</span><button type="button" data-pdf-next="${index}">→</button></div><div class="pdf-edit-tools"><button type="button" data-pdf-rotate="${index}">Rotate page</button><button type="button" data-pdf-delete="${index}">Delete page</button><button type="button" data-pdf-prevorder="${index}">Move left</button><button type="button" data-pdf-nextorder="${index}">Move right</button><button type="button" data-pdf-save="${index}">Save PDF</button></div>`;
    try {
      const pdf = await window.pdfjsLib.getDocument(url).promise;
      let pageNumber = 1;
      entry.pdf = pdf;
      entry.pdfPageCount = pdf.numPages;
      entry.pdfCurrentPage = 1;
      entry.pdfDeleted = entry.pdfDeleted || new Set();
      entry.pdfOrder = entry.pdfOrder || Array.from({length: pdf.numPages}, (_, i) => i);
      entry.pdfRotations = entry.pdfRotations || new Map();
      const draw = async () => {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.2 });
        const canvas = container.querySelector("canvas");
        canvas.width = viewport.width; canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        container.querySelector(`[data-pdf-page="${index}"]`).textContent = `Page ${pageNumber} of ${pdf.numPages}`;
      };
      entry.drawPdf = draw;
      await draw();
      container.querySelector(`[data-pdf-prev="${index}"]`).onclick = () => { if (pageNumber > 1) { pageNumber--; entry.pdfCurrentPage = pageNumber; draw(); } };
      container.querySelector(`[data-pdf-next="${index}"]`).onclick = () => { if (pageNumber < pdf.numPages) { pageNumber++; entry.pdfCurrentPage = pageNumber; draw(); } };
    } catch (error) { container.innerHTML = `<div class="unsupported-preview">PDF preview unavailable</div>`; }
  } else if (ext(file.name) === "docx") {
    container.innerHTML = `<div class="docx-preview">Loading preview…</div>`;
    const arrayBuffer = await file.arrayBuffer();
    const result = await window.mammoth.convertToHtml({ arrayBuffer });
    container.innerHTML = `<div class="docx-preview">${result.value}</div>`;
  } else if (["xls","xlsx"].includes(ext(file.name))) {
    try {
      const workbook = window.XLSX.read(await file.arrayBuffer(), { type:"array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      container.innerHTML = `<div class="xlsx-preview">${window.XLSX.utils.sheet_to_html(sheet)}</div>`;
    } catch (error) { container.innerHTML = `<div class="unsupported-preview">Spreadsheet preview unavailable</div>`; }
  } else {
    container.innerHTML = `<div class="unsupported-preview"><strong>${escapeHtml(file.name)}</strong><span>${formatSize(file.size)}</span></div>`;
  }
}

function renderPreviews() {
  document.querySelector("#preview-list").innerHTML = files.map((entry, index) => `
    <article class="preview-item"><div class="preview-layout"><div class="preview-pane" data-preview="${index}"></div><div class="print-options">
      <h3>${escapeHtml(entry.file.name)}</h3>
      <label class="order-field"><span>Service type</span><select data-option="service" data-index="${index}" required><option value="">Choose service</option></select></label>
      <div class="option-grid"><label class="order-field"><span>Paper size</span><select data-option="paper" data-index="${index}"><option>A4</option><option>Short</option><option>Long</option><option>Other</option></select></label><label class="order-field"><span>Copies</span><input data-option="copies" data-index="${index}" type="number" min="1" value="1"></label></div>
      <div class="option-grid"><label class="order-field"><span>Print</span><select data-option="color" data-index="${index}"><option value="Color">Color</option><option value="B&W">B&amp;W</option></select></label><label class="order-field"><span>Sides</span><select data-option="sides" data-index="${index}"><option>Single-sided</option><option>Double-sided</option></select></label></div>
      <label class="order-field"><span>Page range</span><input data-option="pages" data-index="${index}" placeholder="All pages or 1-5"></label><label class="order-field"><span>Notes for the shop</span><textarea data-option="notes" data-index="${index}" rows="3" placeholder="Tell us what to change"></textarea></label>
    </div></div></article>
  `).join("");
  files.forEach((entry, index) => {
    entry.options = entry.options || { service:"", paper:"A4", copies:1, color:"Color", sides:"Single-sided", pages:"All", notes:"" };
    renderPreview(entry, index);
  });
  loadServiceOptions();
}

async function loadServiceOptions() {
  let services = [];
  try { services = (await getPublicPriceData()).services; } catch (error) { console.error(error); }
  document.querySelectorAll('[data-option="service"]').forEach((select) => {
    select.innerHTML = `<option value="">Choose service</option>${services.map((service) => `<option value="${escapeHtml(service.id)}">${escapeHtml(service.name)} — ${escapeHtml(service.category)}</option>`).join("")}`;
  });
}

document.querySelector("#preview-list").addEventListener("change", (event) => {
  const select = event.target.closest("[data-option]");
  if (!select) return;
  const index = Number(select.dataset.index);
  files[index].options[select.dataset.option] = select.value;
  if (select.dataset.option === "copies") files[index].options.copies = Math.max(1, Number(select.value));
});
document.querySelector("#preview-list").addEventListener("click", (event) => {
  const rotate = event.target.closest("[data-image-rotate]");
  if (rotate) { const entry = files[Number(rotate.dataset.imageRotate)]; entry.imageRotation = ((entry.imageRotation || 0) + 90) % 360; renderPreview(entry, Number(rotate.dataset.imageRotate)); }
  const bw = event.target.closest("[data-image-bw]");
  if (bw) { const entry = files[Number(bw.dataset.imageBw)]; entry.imageBW = !entry.imageBW; renderPreview(entry, Number(bw.dataset.imageBw)); }
  const crop = event.target.closest("[data-image-crop]");
  if (crop) { const index = Number(crop.dataset.imageCrop); files[index].imageCrop = !files[index].imageCrop; renderPreview(files[index], index); }
  const pdfRotate = event.target.closest("[data-pdf-rotate]");
  if (pdfRotate) {
    const index = Number(pdfRotate.dataset.pdfRotate), entry = files[index];
    const originalIndex = entry.pdfOrder[entry.pdfCurrentPage - 1];
    entry.pdfRotations.set(originalIndex, ((entry.pdfRotations.get(originalIndex) || 0) + 90) % 360);
  }
  const pdfDelete = event.target.closest("[data-pdf-delete]");
  if (pdfDelete) {
    const index = Number(pdfDelete.dataset.pdfDelete), entry = files[index];
    const originalIndex = entry.pdfOrder[entry.pdfCurrentPage - 1];
    entry.pdfDeleted.add(originalIndex);
  }
  const pdfPrev = event.target.closest("[data-pdf-prevorder]");
  if (pdfPrev) {
    const index = Number(pdfPrev.dataset.pdfPrevorder), entry = files[index];
    const pos = entry.pdfCurrentPage - 1;
    if (pos > 0) [entry.pdfOrder[pos-1],entry.pdfOrder[pos]]=[entry.pdfOrder[pos],entry.pdfOrder[pos-1]];
  }
  const pdfNext = event.target.closest("[data-pdf-nextorder]");
  if (pdfNext) {
    const index = Number(pdfNext.dataset.pdfNextorder), entry = files[index];
    const pos = entry.pdfCurrentPage - 1;
    if (pos < entry.pdfOrder.length-1) [entry.pdfOrder[pos],entry.pdfOrder[pos+1]]=[entry.pdfOrder[pos+1],entry.pdfOrder[pos]];
  }
  const pdfSave = event.target.closest("[data-pdf-save]");
  if (pdfSave) saveEditedPdf(Number(pdfSave.dataset.pdfSave), pdfSave);
});

async async function saveEditedPdf(index, button) {
  const entry = files[index];
  if (!entry || !window.PDFLib) return;
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    const source = await window.PDFLib.PDFDocument.load(await entry.file.arrayBuffer());
    const edited = await window.PDFLib.PDFDocument.create();
    const kept = entry.pdfOrder.filter((pageIndex) => !entry.pdfDeleted.has(pageIndex));
    if (!kept.length) throw new Error("A PDF must retain at least one page.");
    const copied = await edited.copyPages(source, kept);
    copied.forEach((page, position) => {
      const rotation = entry.pdfRotations.get(kept[position]) || 0;
      if (rotation) page.setRotation(window.PDFLib.degrees(rotation));
      edited.addPage(page);
    });
    const bytes = await edited.save();
    const editedFile = new File([bytes], entry.file.name, { type: "application/pdf" });
    entry.file = editedFile;
    entry.uploaded = await uploadOrderFile(customerUid, editedFile, () => {});
    entry.pdfDeleted = new Set();
    entry.pdfOrder = Array.from({length: copied.length}, (_, i) => i);
    entry.pdfRotations = new Map();
    await renderPreview(entry, index);
    button.disabled = false;
    button.textContent = "Saved";
  } catch (error) {
    console.error(error);
    button.disabled = false;
    button.textContent = "Save PDF";
  }
}

async function renderSummary() {
  let services = [];
  try { services = (await getPublicPriceData()).services; } catch (error) { console.error(error); }
  const serviceMap = new Map(services.map((service) => [service.id, service]));
  let total = 0;
  const rows = files.map((entry) => {
    const service = serviceMap.get(entry.options?.service);
    let unitPrice = Number(service?.price || 0);
    if (!unitPrice && Array.from(service?.variants || []).length) unitPrice = Math.min(...service.variants.map((variant) => Number(variant.price)));
    const line = unitPrice * Math.max(1, Number(entry.options?.copies || 1));
    total += line;
    return `<div class="summary-row"><div><strong>${escapeHtml(entry.file.name)}</strong><span>${escapeHtml(service?.name || "Service to be confirmed")} · ${escapeHtml(entry.options?.paper)} · ${entry.options?.copies || 1} copy</span></div><strong>₱${currency.format(line)}</strong></div>`;
  }).join("");
  document.querySelector("#order-summary").innerHTML = `<h3>Estimated breakdown</h3>${rows}<div class="summary-total"><span>Estimated total</span><strong id="estimated-total">₱${currency.format(total)}</strong></div><p class="summary-note">The final price is confirmed by the shop.</p>`;
  document.querySelector("#gcash-exact").textContent = `Exact amount: ₱${currency.format(total)}`;
  window.__estimatedTotal = total;
}

document.querySelector("#upload-next").addEventListener("click", () => { renderPreviews(); setStep(2); });
document.querySelector("#options-next").addEventListener("click", () => {
  let missing = false;
  document.querySelectorAll('[data-option="service"]').forEach((select) => { if (!select.value) missing = true; files[Number(select.dataset.index)].options.service = select.value; });
  if (missing) { alert("Choose a service type for every file."); return; }
  renderSummary(); setStep(3);
});
document.querySelectorAll("[data-back]").forEach((button) => button.addEventListener("click", () => setStep(Number(button.dataset.back))));

document.querySelector("#gcash-name").textContent = gcashInfo.name;
document.querySelector("#gcash-number").textContent = gcashInfo.number;
document.querySelector("#download-qr").href = gcashInfo.qrPath;
document.querySelector("#gcash-qr").src = gcashInfo.qrPath;
document.querySelector("#terms-checkbox").addEventListener("change", (event) => { document.querySelector("#place-order").disabled = !event.target.checked; });

document.querySelector("#payment-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!document.querySelector("#terms-checkbox").checked) return;
  const button = document.querySelector("#place-order");
  const error = document.querySelector("#payment-error");
  button.disabled = true; error.textContent = "";
  try {
    if (!customerUid) await ensureAnonymousCustomer();
    const form = event.target.elements;
    const receipt = form.receipt.files[0];
    if (!receipt) throw new Error("Please upload your GCash receipt screenshot.");
    const receiptUpload = await uploadOrderFile(customerUid, receipt, () => {});
    const items = files.map((entry) => ({
      fileName: entry.file.name,
      storagePath: entry.uploaded.path,
      fileType: entry.file.type,
      size: entry.file.size,
      options: entry.options
    }));
    const result = await createCustomerOrder({
      customerName: form.customerName.value.trim(),
      mobile: form.mobile.value.trim(),
      pickupOrDelivery: form.pickupOrDelivery.value,
      gcashRef: form.gcashRef.value.trim(),
      receiptPath: receiptUpload.path,
      items,
      estimatedTotal: window.__estimatedTotal,
      termsAccepted: true,
      termsAcceptedAt: new Date().toISOString()
    });
    document.querySelector("#confirmed-number").textContent = result.orderNumber;
    document.querySelector("#track-order-link").href = `track.html?order=${encodeURIComponent(result.orderNumber)}`;
    setStep(4);
  } catch (err) {
    console.error(err);
    error.textContent = err.message || "We could not place the order. Please try again.";
    button.disabled = false;
  }
});
