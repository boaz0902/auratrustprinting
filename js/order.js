import { fileTypeCategories, orderLimits } from "./config.js";
import {
  createQuoteOrder,
  ensureAnonymousCustomer,
  getPublicPriceData,
  requireSupabase,
  uploadOrderFile
} from "./supabase.js";

const currency = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const files = [];
const submissionOrderId = crypto.randomUUID();
let services = [];
let submitting = false;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function extension(name) {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

function categoryForFile(name) {
  const ext = extension(name);
  for (const [category, extensions] of Object.entries(fileTypeCategories)) {
    if (extensions.includes(ext)) return category;
  }
  return "Design / other";
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function setStep(step) {
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.hidden = Number(panel.dataset.panel) !== step;
  });
  document.querySelectorAll(".wizard-progress li").forEach((item) => {
    const active = Number(item.dataset.step) === step;
    item.classList.toggle("active", Number(item.dataset.step) <= step);
    if (active) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  });
  document.querySelector("#progress-bar").style.width = `${((step - 1) / 3) * 100}%`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function releaseFileResources(entry) {
  if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
  entry.previewUrl = null;
}

function validateFile(file) {
  if (!file.size) return `"${file.name}" is empty. Choose a file with content.`;
  if (file.size > orderLimits.maxFileSizeMB * 1024 * 1024) {
    return `"${file.name}" is larger than ${orderLimits.maxFileSizeMB} MB. Choose a smaller file.`;
  }
  return "";
}

function renderFileList() {
  const list = document.querySelector("#file-list");
  list.innerHTML = files.map((entry) => {
    const ext = extension(entry.file.name) || "file";
    return `<article class="upload-file" data-upload-file="${escapeHtml(entry.id)}">
      <span class="file-icon" aria-hidden="true">${escapeHtml(ext.slice(0, 5).toUpperCase())}</span>
      <div class="file-meta"><strong>${escapeHtml(entry.file.name)}</strong><span>${formatSize(entry.file.size)}</span></div>
      <span class="extension-badge">.${escapeHtml(ext)}</span>
      <button type="button" class="remove-file" data-remove-file="${escapeHtml(entry.id)}" aria-label="Remove ${escapeHtml(entry.file.name)}">×</button>
    </article>`;
  }).join("");
  document.querySelector("#file-count").textContent = `${files.length} / ${orderLimits.maxFiles} file${files.length === 1 ? "" : "s"}`;
  document.querySelector("#upload-next").disabled = files.length === 0;
  document.querySelector("#upload-limits").textContent =
    `Up to ${orderLimits.maxFiles} files, ${orderLimits.maxFileSizeMB} MB each and ${orderLimits.maxTotalSizeMB} MB total. We welcome any file type.`;
}

function addFiles(selectedFiles) {
  const error = document.querySelector("#upload-error");
  error.textContent = "";
  const messages = [];
  let totalSize = files.reduce((total, entry) => total + entry.file.size, 0);
  for (const file of selectedFiles) {
    if (files.length >= orderLimits.maxFiles) {
      messages.push(`You have reached the ${orderLimits.maxFiles}-file limit. Remove a file before adding another.`);
      break;
    }
    const problem = validateFile(file);
    if (problem) {
      messages.push(problem);
      continue;
    }
    if (files.some((entry) => entry.file.name === file.name && entry.file.size === file.size)) continue;
    if (totalSize + file.size > orderLimits.maxTotalSizeMB * 1024 * 1024) {
      messages.push(`These files exceed the ${orderLimits.maxTotalSizeMB} MB total limit. Remove a file or choose smaller files.`);
      continue;
    }
    files.push({
      id: crypto.randomUUID(),
      file,
      previewUrl: null,
      pages: "",
      notes: "",
      selections: []
    });
    totalSize += file.size;
  }
  if (messages.length) error.textContent = messages.join(" ");
  renderFileList();
}

const dropZone = document.querySelector("#drop-zone");
const fileInput = document.querySelector("#file-input");
document.querySelector("#browse-files").addEventListener("click", () => fileInput.click());
dropZone.addEventListener("click", () => fileInput.click());
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
document.querySelector("#file-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-file]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const index = files.findIndex((entry) => entry.id === button.dataset.removeFile);
  if (index < 0) return;
  releaseFileResources(files[index]);
  files.splice(index, 1);
  renderFileList();
});

function serviceMatchesFile(service, entry) {
  const kinds = Array.isArray(service.file_kinds) ? service.file_kinds.map((kind) => String(kind).toLowerCase()) : [];
  const ext = extension(entry.file.name);
  if (kinds.includes(ext) || (categoryForFile(entry.file.name) === "Images" && kinds.includes("image"))) return true;
  const text = `${service.category || ""} ${service.name || ""}`.toLowerCase();
  if (categoryForFile(entry.file.name) === "Documents") {
    if (/photo|image|sticker|label|keychain|mug|tarp|banner|pin|button|polaroid|instax/.test(text)) return false;
    return /doc|document|print|binding|laminat|photocopy|xerox|scan|office/.test(text);
  }
  if (categoryForFile(entry.file.name) === "Images") {
    return /image|photo|\bid\b|sticker|label|keychain|mug|tarp|banner|pin|button|polaroid|instax|card/.test(text);
  }
  return true;
}

function serviceVariants(service) {
  const variants = Array.isArray(service.variants) ? service.variants : [];
  return variants.length ? variants : [{ label: service.unit || "Standard", price: service.price }];
}

function priceValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function findService(id) {
  return services.find((service) => String(service.id) === String(id));
}

function selectionFromControls(card) {
  const check = card.querySelector("[data-service-check]");
  if (!check.checked) return null;
  const service = findService(check.dataset.serviceCheck);
  if (!service) return null;
  const variantIndex = Number(card.querySelector("[data-variant]").value);
  const variant = serviceVariants(service)[variantIndex];
  if (!variant) return null;
  const quantity = Math.min(500, Math.max(1, Number(card.querySelector("[data-quantity]").value) || 1));
  const entry = files.find((item) => item.id === card.dataset.fileId);
  const enteredPages = entry && entry.pages !== "" ? Number(entry.pages) : null;
  const pages = Number.isInteger(enteredPages) && enteredPages >= 1 && enteredPages <= 10000 ? enteredPages : null;
  const perPage = /page/i.test(service.unit || "");
  const unitPrice = priceValue(variant.price);
  const lineTotal = unitPrice === null || (perPage && !pages) ? null : unitPrice * quantity * (perPage ? pages : 1);
  return {
    serviceId: service.id,
    serviceName: service.name,
    optionLabel: variant.label,
    unit: service.unit || "unit",
    quantity,
    pages,
    unitPrice,
    lineTotal,
    needsPageCount: perPage && !pages
  };
}

function calculateEstimate(entry) {
  const selections = entry.selections;
  const incomplete = selections.some((selection) => selection.lineTotal === null);
  const total = selections.reduce((sum, selection) => sum + (selection.lineTotal || 0), 0);
  return { total, incomplete, hasSelections: selections.length > 0 };
}

function formatAmount(value) {
  return `₱${currency.format(value)}`;
}

function updateFileEstimate(fileId) {
  const entry = files.find((item) => item.id === fileId);
  const card = document.querySelector(`[data-file-card="${CSS.escape(fileId)}"]`);
  if (!entry || !card) return;
  entry.selections = [...card.querySelectorAll("[data-service-option]")].map(selectionFromControls).filter(Boolean);
  const estimate = calculateEstimate(entry);
  const total = card.querySelector("[data-file-estimate]");
  const label = !estimate.hasSelections
    ? "No services selected · you can leave a note"
    : estimate.incomplete
      ? estimate.total > 0 ? `${formatAmount(estimate.total)} known subtotal · Staff will quote remaining items` : "Staff will quote the selected options"
      : formatAmount(estimate.total);
  total.textContent = label;
  card.querySelectorAll("[data-unit-price]").forEach((element) => {
    const service = findService(element.dataset.serviceId);
    const optionIndex = Number(element.closest("[data-service-option]").querySelector("[data-variant]").value);
    const price = service && priceValue(serviceVariants(service)[optionIndex]?.price);
    element.textContent = price === null ? "Staff will quote" : `${formatAmount(price)} ${service.unit ? `/ ${service.unit.replace(/^per\s+/i, "")}` : ""}`;
  });
}

function renderServiceGuide() {
  const list = document.querySelector("#service-guide-list");
  const empty = document.querySelector("#service-guide-empty");
  if (!services.length) {
    list.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  list.innerHTML = files.map((entry) => {
    const category = categoryForFile(entry.file.name);
    const applicable = services.filter((service) => serviceMatchesFile(service, entry));
    const perFile = applicable.map((service) => {
      const variants = serviceVariants(service);
      const selected = entry.selections.find((item) => String(item.serviceId) === String(service.id));
      const selectedIndex = selected ? variants.findIndex((item) => item.label === selected.optionLabel) : 0;
      const variantOptions = variants.map((variant, index) => {
        const price = priceValue(variant.price);
        const amount = price === null ? "Staff will quote" : `${formatAmount(price)}${service.unit ? ` / ${service.unit.replace(/^per\s+/i, "")}` : ""}`;
        return `<option value="${index}" ${index === Math.max(0, selectedIndex) ? "selected" : ""}>${escapeHtml(variant.label)} · ${escapeHtml(amount)}</option>`;
      }).join("");
      const price = priceValue(variants[Math.max(0, selectedIndex)]?.price);
      const unitPrice = price === null ? "Staff will quote" : `${formatAmount(price)}${service.unit ? ` / ${service.unit.replace(/^per\s+/i, "")}` : ""}`;
      return `<div class="service-option" data-service-option data-file-id="${escapeHtml(entry.id)}">
        <label class="service-option-name"><input type="checkbox" data-service-check="${escapeHtml(service.id)}" ${selected ? "checked" : ""}><span><strong>${escapeHtml(service.name)}</strong><small>${escapeHtml(service.description || service.category || "Available service")}</small></span></label>
        <div class="service-option-controls">
          <label><span>Option / finish</span><select data-variant aria-label="${escapeHtml(service.name)} option">${variantOptions}</select></label>
          <label><span>Quantity</span><input data-quantity type="number" min="1" max="500" value="${selected?.quantity || 1}" inputmode="numeric" aria-label="${escapeHtml(service.name)} quantity"></label>
          <span class="unit-price" data-unit-price data-service-id="${escapeHtml(service.id)}">${unitPrice}</span>
        </div>
      </div>`;
    }).join("");
    const estimate = calculateEstimate(entry);
    const initialTotal = !entry.selections.length
      ? "No services selected · you can leave a note"
      : estimate.incomplete
        ? estimate.total > 0 ? `${formatAmount(estimate.total)} known subtotal · Staff will quote remaining items` : "Staff will quote the selected options"
        : formatAmount(estimate.total);
    return `<article class="service-file-card" data-file-card="${escapeHtml(entry.id)}">
      <div class="service-file-heading"><span class="file-icon" aria-hidden="true">${escapeHtml((extension(entry.file.name) || "FILE").slice(0, 5).toUpperCase())}</span><div><h3>${escapeHtml(entry.file.name)}</h3><span>${escapeHtml(category)} price guide</span></div></div>
      <p class="service-category-note">${category === "Design / other" ? "Custom job — our staff will review your file and quote you." : category === "Documents" ? "Document printing, photocopying, scanning and finishing options." : "Photo printing and related personalized services."}</p>
      <label class="order-field page-count-field"><span>Number of pages <small>(optional, if known)</small></span><input data-page-count="${escapeHtml(entry.id)}" type="number" min="1" max="10000" value="${escapeHtml(entry.pages)}" inputmode="numeric" placeholder="Leave blank if unsure"></label>
      <div class="service-options">${perFile || '<p class="step-copy">No matching price-list items are available. Staff will review your file and quote you.</p>'}</div>
      <label class="order-field"><span>Notes for this file <small>(optional)</small></span><textarea data-file-notes="${escapeHtml(entry.id)}" rows="2" maxlength="500" placeholder="Print preferences or instructions">${escapeHtml(entry.notes)}</textarea></label>
      <div class="file-estimate"><span>Estimated total <small>Estimated. Final price confirmed by our staff.</small></span><strong data-file-estimate>${escapeHtml(initialTotal)}</strong></div>
    </article>`;
  }).join("");
  list.querySelectorAll("[data-file-card]").forEach((card) => updateFileEstimate(card.dataset.fileCard));
}

document.querySelector("#service-guide-list").addEventListener("change", (event) => {
  const card = event.target.closest("[data-file-card]");
  if (!card) return;
  if (event.target.matches("[data-page-count]")) {
    const entry = files.find((item) => item.id === event.target.dataset.pageCount);
    if (entry) entry.pages = event.target.value;
  }
  updateFileEstimate(card.dataset.fileCard);
});
document.querySelector("#service-guide-list").addEventListener("input", (event) => {
  const card = event.target.closest("[data-file-card]");
  if (!card) return;
  if (event.target.matches("[data-file-notes]")) {
    const entry = files.find((item) => item.id === event.target.dataset.fileNotes);
    if (entry) entry.notes = event.target.value;
  }
  if (event.target.matches("[data-page-count]")) {
    const entry = files.find((item) => item.id === event.target.dataset.pageCount);
    if (entry) entry.pages = event.target.value;
  }
  if (event.target.matches("[data-page-count],[data-quantity]")) updateFileEstimate(card.dataset.fileCard);
});

function allSelections() {
  return files.flatMap((entry) => entry.selections.map((selection) => ({ entry, selection })));
}

function calculateOrderEstimate() {
  const selections = allSelections();
  const incomplete = selections.some(({ selection }) => selection.lineTotal === null);
  const total = selections.reduce((sum, { selection }) => sum + (selection.lineTotal || 0), 0);
  return { total, incomplete, hasSelections: selections.length > 0 };
}

function renderReview(form) {
  const data = new FormData(form);
  const estimate = calculateOrderEstimate();
  const fileHtml = files.map((entry) => {
    const options = entry.selections.length
      ? entry.selections.map((selection) => `<li>${escapeHtml(selection.serviceName)} · ${escapeHtml(selection.optionLabel)} · ${selection.quantity} ${escapeHtml(selection.unit)}${selection.pages ? ` · ${selection.pages} pages` : ""} · ${selection.lineTotal === null ? "Staff will quote" : formatAmount(selection.lineTotal)}</li>`).join("")
      : "<li>No service selected — staff quote requested</li>";
    return `<article class="review-file"><strong>${escapeHtml(entry.file.name)}</strong><ul>${options}</ul>${entry.notes ? `<p>File note: ${escapeHtml(entry.notes)}</p>` : ""}</article>`;
  }).join("");
  const totalText = !estimate.hasSelections
    ? "Staff quote requested"
    : estimate.incomplete
      ? estimate.total > 0 ? `${formatAmount(estimate.total)} known subtotal · Staff will quote remaining items` : "Staff will quote the selected options"
      : formatAmount(estimate.total);
  const customerDetails = [
    data.get("customerName"),
    data.get("mobile"),
    data.get("contactMethod"),
    data.get("contactHandle"),
    data.get("pickupOrDelivery"),
    data.get("preferredPickupDate") ? `Preferred date: ${data.get("preferredPickupDate")}` : ""
  ].filter(Boolean).join(" · ");
  document.querySelector("#review-summary").innerHTML = `
    <div class="review-summary-section"><h4>Files and services</h4>${fileHtml}</div>
    ${data.get("customerNotes") ? `<div class="review-summary-section"><h4>Special instructions</h4><p>${escapeHtml(data.get("customerNotes"))}</p></div>` : ""}
    <div class="review-summary-total"><span>Estimated total</span><strong>${escapeHtml(totalText)}</strong></div>
    <p class="review-customer">${escapeHtml(customerDetails)}</p>`;
}

const detailsForm = document.querySelector("#customer-details-form");
["input", "change"].forEach((eventName) => detailsForm.addEventListener(eventName, () => renderReview(detailsForm)));

function normalizePhilippineMobile(value) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("63")) digits = `0${digits.slice(2)}`;
  else if (digits.length === 10 && digits.startsWith("9")) digits = `0${digits}`;
  return digits;
}

function validPhilippineMobile(value) {
  return /^09\d{9}$/.test(normalizePhilippineMobile(value));
}

document.querySelector("#upload-next").addEventListener("click", () => {
  renderServiceGuide();
  setStep(2);
});
document.querySelector("#services-back").addEventListener("click", () => setStep(1));
document.querySelector("#services-next").addEventListener("click", () => {
  renderReview(detailsForm);
  setStep(3);
});
document.querySelector("#details-back").addEventListener("click", () => {
  renderServiceGuide();
  setStep(2);
});

function userFacingUploadError(error) {
  const message = String(error?.message || "");
  if (/quota|storage.*limit|exceed.*limit|payload too large|entity too large|maximum allowed size/i.test(message)) {
    return "AuraTrust’s available file storage limit was reached. Please try again later or contact us to send your files another way.";
  }
  if (/bucket.*not found/i.test(message)) return "File storage is not ready yet. Please contact AuraTrust and try again later.";
  return "We couldn’t upload your files. Check your connection and try again; your request has not been submitted.";
}

function buildOrderItems(uploadedFiles) {
  return files.map((entry, index) => ({
    fileName: entry.file.name,
    fileType: entry.file.type || "application/octet-stream",
    extension: extension(entry.file.name),
    size: entry.file.size,
    storagePath: uploadedFiles[index].path,
    pages: Number.isInteger(Number(entry.pages)) && Number(entry.pages) >= 1 && Number(entry.pages) <= 10000
      ? Number(entry.pages)
      : null,
    notes: entry.notes,
    selections: entry.selections.map((selection) => ({
      serviceId: selection.serviceId,
      serviceName: selection.serviceName,
      optionLabel: selection.optionLabel,
      unit: selection.unit,
      quantity: selection.quantity,
      pages: selection.pages,
      unitPrice: selection.unitPrice,
      estimatedTotal: selection.lineTotal
    }))
  }));
}

document.querySelector("#customer-details-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitting) return;
  const form = event.currentTarget;
  const values = new FormData(form);
  const customerName = form.elements.customerName;
  customerName.setCustomValidity(customerName.value.trim().length >= 2 ? "" : "Enter your name using at least 2 characters.");
  const mobile = form.elements.mobile;
  mobile.setCustomValidity(validPhilippineMobile(mobile.value) ? "" : "Enter a valid Philippine mobile number, such as 09XXXXXXXXX or +639XXXXXXXXX.");
  if (!form.reportValidity()) return;
  if (values.get("website")) {
    document.querySelector("#details-error").textContent = "We couldn’t submit this request. Please review the form and try again.";
    return;
  }
  if (!files.length) {
    setStep(1);
    document.querySelector("#upload-error").textContent = "Add at least one file before sending your request.";
    return;
  }
  const button = document.querySelector("#submit-order");
  const error = document.querySelector("#details-error");
  submitting = true;
  button.disabled = true;
  button.textContent = "Sending your request…";
  error.textContent = "";
  let uploaded = [];
  let orderWriteStarted = false;
  try {
    const user = await ensureAnonymousCustomer();
    const orderId = submissionOrderId;
    for (const entry of files) {
      uploaded.push(await uploadOrderFile(user.id, orderId, entry.file, `${entry.id}-${entry.file.name}`));
    }
    const estimate = calculateOrderEstimate();
    orderWriteStarted = true;
    const order = await createQuoteOrder({
      id: orderId,
      customerId: user.id,
      customerName: String(values.get("customerName")).trim(),
      mobile: normalizePhilippineMobile(String(values.get("mobile"))),
      contactMethod: String(values.get("contactMethod")),
      contactHandle: String(values.get("contactHandle") || "").trim() || null,
      pickupOrDelivery: String(values.get("pickupOrDelivery")),
      preferredPickupDate: String(values.get("preferredPickupDate") || "") || null,
      customerNotes: String(values.get("customerNotes") || "").trim() || null,
      estimatedTotal: estimate.hasSelections && !estimate.incomplete ? estimate.total : null,
      termsAcceptedAt: new Date().toISOString(),
      items: buildOrderItems(uploaded)
    });
    document.querySelector("#confirmed-number").textContent = order.order_number;
    document.querySelector("#track-order-link").href = `track.html?order=${encodeURIComponent(order.order_number)}`;
    setStep(4);
  } catch (problem) {
    console.error("Unable to submit quote request.", problem);
    if (uploaded.length && !orderWriteStarted) {
      try {
        await requireSupabase().storage.from("order-files").remove(uploaded.map((file) => file.path));
      } catch (cleanupError) {
        console.error("Unable to clean up files from the failed quote request.", cleanupError);
      }
    }
    error.textContent = orderWriteStarted
      ? "We couldn’t confirm the request was saved. You can retry safely; this form reuses the same request reference."
      : userFacingUploadError(problem);
  } finally {
    submitting = false;
    button.disabled = false;
    button.innerHTML = 'Send quote request <span aria-hidden="true">→</span>';
  }
});

const menuToggle = document.querySelector(".menu-toggle");
const navLinks = document.querySelector("#primary-nav");
menuToggle?.addEventListener("click", () => {
  const expanded = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!expanded));
  navLinks?.classList.toggle("is-open", !expanded);
});
navLinks?.addEventListener("click", (event) => {
  if (!event.target.closest("a")) return;
  menuToggle?.setAttribute("aria-expanded", "false");
  navLinks.classList.remove("is-open");
});

const pickupDateMin = new Date();
pickupDateMin.setMinutes(pickupDateMin.getMinutes() - pickupDateMin.getTimezoneOffset());
detailsForm.elements.preferredPickupDate.min = pickupDateMin.toISOString().slice(0, 10);
document.querySelector("#upload-limits").textContent =
  `Up to ${orderLimits.maxFiles} files, ${orderLimits.maxFileSizeMB} MB each and ${orderLimits.maxTotalSizeMB} MB total. We welcome any file type.`;
getPublicPriceData().then(({ services: availableServices }) => {
  services = availableServices;
  if (!services.length) document.querySelector("#service-guide-error").textContent =
    "No published services are available right now. You can still submit a custom job for a staff quote.";
  if (!document.querySelector('[data-panel="2"]').hidden) renderServiceGuide();
}).catch((error) => {
  console.error("Unable to load current service prices.", error);
  document.querySelector("#service-guide-error").textContent =
    "The price list is temporarily unavailable. You can still submit a custom job for a staff quote.";
  if (!document.querySelector('[data-panel="2"]').hidden) renderServiceGuide();
});
renderFileList();
