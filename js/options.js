import { extension, escapeHtml } from "./preview.js";
import { getSmartDefaults } from "./smart-defaults.js";

const PAPER = {
  short: { label: "Short", dimensions: "8.5x11 in" },
  a4: { label: "A4", dimensions: "8.27x11.69 in" },
  long: { label: "Long", dimensions: "8.5x13 in" },
  a3: { label: "A3", dimensions: "11.69x16.54 in" }
};
const currency = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function normalizePaper(value) {
  const normalized = String(value || "").toLowerCase();
  return PAPER[normalized] ? normalized : "short";
}
function categoryKey(service) {
  const text = `${service?.category || ""} ${service?.name || ""}`.toLowerCase();
  if (text.includes("photo")) return "photo";
  if (text.includes("id") || text.includes("picture")) return "id";
  if (text.includes("document") || text.includes("printing") || text.includes("photocopy") || text.includes("digital")) return "document";
  return "other";
}
function selectedService(entry, services) {
  return services.find((service) => String(service.id) === String(entry.options.service));
}

export async function initializeOptions(files, services, context) {
  for (const entry of files) {
    if (entry.smartInitialized) continue;
    entry.manual = {};
    entry.suggestions = {};
    entry.options = entry.options || {};
    const defaults = await getSmartDefaults(entry, services);
    entry.options.paper = normalizePaper(defaults.paper);
    entry.options.color = defaults.color;
    entry.options.copies = Math.max(1, Number(entry.options.copies || 1));
    entry.options.notes = entry.options.notes || "";
    entry.options.pageCount = entry.pdf?.numPages || entry.options.pageCount || "";
    entry.options.pageRange = entry.options.pageRange || "";
    entry.options.category = categoryKey(defaults.service);
    entry.options.service = defaults.service?.id ? String(defaults.service.id) : "";
    entry.options.variantLabel = defaults.variant?.label || "";
    entry.options.addons = [];
    entry.suggestions.service = entry.options.service;
    entry.suggestions.variantLabel = entry.options.variantLabel;
    entry.inlineNotice = "";
    entry.smartInitialized = true;
  }
  files.forEach((entry) => { entry.isActive = false; });
  const active = files[context.activeIndex] || files[0];
  if (active) active.isActive = true;
  renderOptions(active, context.activeIndex, files, services, context);
  updateLiveSummary(files, services);
}

export function renderOptions(entry, index, files, services, context) {
  const container = document.querySelector("#preview-options");
  if (!container || !entry) return;
  const service = selectedService(entry, services);
  const groups = new Map();
  for (const item of services) {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category).push(item);
  }
  const serviceOptions = [...groups].map(([category, items]) => `
    <optgroup label="${escapeHtml(category)}">${items.map((item) => `
      <option value="${escapeHtml(item.id)}" ${String(item.id) === String(entry.options.service) ? "selected" : ""}>${escapeHtml(item.name)}</option>
    `).join("")}</optgroup>
  `).join("");
  const variants = Array.isArray(service?.variants) ? service.variants : [];
  const variantOptions = `<option value="" ${entry.options.variantLabel ? "" : "selected"}>Choose an option</option>${variants.map((variant) => {
    const price = variant.price === null || variant.price === undefined || variant.price === ""
      ? "Price to be confirmed"
      : `₱${currency.format(Number(variant.price))}`;
    return `<option value="${escapeHtml(variant.label)}" ${variant.label === entry.options.variantLabel ? "selected" : ""}>${escapeHtml(variant.label)} — ${price}</option>`;
  }).join("")}`;
  const addOns = (service?.addons || []).length
    ? `<section class="option-card"><div class="option-card-heading"><span>Optional add-ons</span></div><div class="option-addons">${service.addons.map((addon) => `
        <label class="addon-choice"><input type="checkbox" data-addon="${escapeHtml(addon.id)}" ${entry.options.addons.includes(addon.id) ? "checked" : ""}><span>${escapeHtml(addon.label)}</span><strong>${addon.price === null || addon.price === undefined ? "To be confirmed" : `+₱${currency.format(Number(addon.price))}`}</strong></label>
      `).join("")}</div></section>`
    : "";
  const isPdf = extension(entry.file.name) === "pdf";
  const pdfPages = entry.pdf?.numPages || Number(entry.options.pageCount || 0);
  const pageOptions = service?.billing === "page" ? (isPdf
    ? `<div class="pages-detected"><span>${pdfPages || "Detecting"} ${pdfPages === 1 ? "page" : "pages"}</span><small>Page count detected from PDF</small></div>`
    : `<label class="option-field"><span>Number of pages</span><input class="at-control" type="number" min="1" max="1000" value="${escapeHtml(entry.options.pageCount || "")}" data-option="pageCount" data-index="${index}" placeholder="Enter number of pages"><small>Used to calculate the live price</small></label>`)
    : "";
  const pageRange = service?.billing === "page"
    ? `<label class="option-field page-range-field"><span>Page range <small>Optional</small></span><input class="at-control" type="text" maxlength="100" value="${escapeHtml(entry.options.pageRange || "")}" data-option="pageRange" data-index="${index}" placeholder="e.g. 1-3, 5"><small id="page-range-helper"></small></label>`
    : "";

  container.innerHTML = `
    <div class="options-heading"><div><p class="options-eyebrow">Print setup</p><h3>${escapeHtml(entry.file.name)}</h3></div><button class="at-icon-btn" type="button" data-options-action="apply-all" aria-label="Apply these options to all files" title="Apply to all files">✓</button></div>
    <section class="option-card">
      <div class="option-card-heading"><span>Service</span>${entry.manual.service ? "" : suggestedChip()}</div>
      <label class="option-field"><span>Choose a service</span><select class="at-control" data-option="service">${serviceOptions}</select></label>
    </section>
    ${variants.length ? `<section class="option-card">
      <div class="option-card-heading"><span>Print option</span>${entry.suggestions.variantLabel && !entry.manual.variant ? suggestedChip() : ""}</div>
      <label class="option-field"><span>Select size, style, or finish</span><select class="at-control" data-option="variantLabel">${variantOptions}</select></label>
    </section>` : ""}
    ${addOns}
    <section class="option-card">
      <div class="option-card-heading"><span>Quantity</span></div>
      <div class="copy-stepper"><button type="button" data-copies="decrease" data-index="${index}" aria-label="Decrease copies">−</button><input class="at-control" type="number" min="1" max="500" value="${Math.max(1, Number(entry.options.copies || 1))}" data-option="copies" data-index="${index}" aria-label="Number of copies"><button type="button" data-copies="increase" data-index="${index}" aria-label="Increase copies">+</button></div>
    </section>
    ${pageOptions || pageRange ? `<section class="option-card"><div class="option-card-heading"><span>Pages</span></div>${pageOptions}${pageRange}</section>` : ""}
    <section class="option-card">
      <div class="option-card-heading"><span>Notes</span></div>
      <textarea class="at-control" rows="3" maxlength="500" data-option="notes" data-index="${index}" placeholder="Special instructions">${escapeHtml(entry.options.notes || "")}</textarea>
    </section>
    <div class="live-summary" aria-live="polite"><div class="live-summary-row"><span>Live total</span><strong id="live-total-${index}">₱0.00</strong></div><p class="live-summary-note" id="live-summary-note-${index}"></p></div>
    ${renderInlineNotice(entry)}
  `;
  attachEvents(container, entry, index, files, services, context);
}

function suggestedChip() {
  return `<span class="at-tooltip-wrap"><span class="suggested-chip">✦ Suggested</span><span class="at-tooltip" role="tooltip">Auto-detected from your file. You can change this.</span></span>`;
}
function renderInlineNotice(entry) {
  if (!entry.inlineNotice) return "";
  return `<div class="inline-notice" role="status">${escapeHtml(entry.inlineNotice)}</div>`;
}

function attachEvents(container, entry, index, files, services, context) {
  container.querySelectorAll("[data-option]").forEach((control) => {
    control.addEventListener("change", () => handleControl(control, entry, index, files, services, context));
    if (control.dataset.option === "copies" || control.dataset.option === "pageCount") {
      control.addEventListener("input", () => {
        const value = Number(control.value);
        if (control.dataset.option === "copies") {
          entry.options.copies = control.value
            ? Math.max(1, Math.min(500, value || 1))
            : 1;
        } else {
          entry.options.pageCount = control.value && Number.isFinite(value)
            ? Math.max(1, Math.min(1000, Math.floor(value)))
            : "";
        }
        updateLiveSummary(files, services);
      });
    }
  });
  container.querySelectorAll("[data-addon]").forEach((control) => control.addEventListener("change", () => {
    const selected = new Set(entry.options.addons || []);
    if (control.checked) selected.add(control.dataset.addon);
    else selected.delete(control.dataset.addon);
    entry.options.addons = [...selected];
    updateLiveSummary(files, services);
  }));
  container.querySelectorAll("[data-copies]").forEach((button) => button.addEventListener("click", () => {
    entry.manual.copies = true;
    const input = container.querySelector('[data-option="copies"]');
    entry.options.copies = Math.max(1, Math.min(500, Number(entry.options.copies || 1) + (button.dataset.copies === "increase" ? 1 : -1)));
    if (input) input.value = String(entry.options.copies);
    updateLiveSummary(files, services);
  }));
  container.querySelectorAll('[data-options-action="apply-all"]').forEach((button) => button.addEventListener("click", () => {
    for (const target of files) {
      if (target === entry) continue;
      target.options = {
        ...target.options,
        category: entry.options.category,
        service: entry.options.service,
        variantLabel: entry.options.variantLabel,
        addons: [...entry.options.addons],
        paper: entry.options.paper,
        color: entry.options.color,
        copies: entry.options.copies,
        pageCount: entry.options.pageCount,
        pageRange: entry.options.pageRange,
        notes: entry.options.notes
      };
      target.manual = { ...entry.manual };
      target.inlineNotice = entry.inlineNotice;
    }
    showToast("These options were applied to all files.");
    updateLiveSummary(files, services);
  }));
}

function handleControl(control, entry, index, files, services, context) {
  const key = control.dataset.option;
  if (key === "service") {
    const service = services.find((item) => String(item.id) === control.value);
    entry.manual.service = true;
    entry.options.service = service ? String(service.id) : "";
    entry.options.category = categoryKey(service);
    entry.options.variantLabel = service?.suggested_variant
      || (service?.variants?.length === 1 ? service.variants[0].label : "");
    entry.options.addons = [];
    entry.options.pageCount = service?.billing === "page" ? (entry.pdf?.numPages || entry.options.pageCount || "") : "";
    entry.options.pageRange = "";
    entry.suggestions.variantLabel = "";
    const variant = service?.variants?.find((item) => item.label === entry.options.variantLabel);
    if (variant?.paper) entry.options.paper = normalizePaper(variant.paper);
    if (variant?.color) entry.options.color = variant.color;
  } else if (key === "variantLabel") {
    entry.manual.variant = true;
    entry.options.variantLabel = control.value;
    const variant = selectedService(entry, services)?.variants?.find((item) => item.label === control.value);
    if (variant?.paper) entry.options.paper = normalizePaper(variant.paper);
    if (variant?.color) entry.options.color = variant.color;
  } else if (key === "copies") {
    entry.manual.copies = true;
    entry.options.copies = Math.max(1, Math.min(500, Number(control.value) || 1));
  } else if (key === "pageCount") {
    const pageCount = Number(control.value);
    entry.options.pageCount = Number.isFinite(pageCount) && pageCount > 0 ? Math.min(1000, pageCount) : "";
  } else if (key === "pageRange") {
    entry.options.pageRange = control.value.trim();
  } else if (key === "notes") {
    entry.options.notes = control.value;
  }

  validatePageRange(entry);
  renderOptions(entry, index, files, services, context);
  updateLiveSummary(files, services);
  if (key === "service" || key === "variantLabel") updateSheetPaper(entry.options.paper);
}

export function getLinePrice(entry, services) {
  const service = selectedService(entry, services);
  if (!service) return { confirmed: false, price: 0, service: null, variant: null, addons: [], reason: "Choose a service to see its price." };
  const variants = Array.isArray(service.variants) ? service.variants : [];
  const variant = variants.find((item) => item.label === entry.options.variantLabel) || null;
  const addons = (service.addons || []).filter((addon) => (entry.options.addons || []).includes(addon.id));
  if (variants.length && !variant) {
    return { confirmed: false, price: 0, service, variant: null, addons, reason: "Choose an option to see its price." };
  }
  const basePrice = variant ? variant.price : service.price;
  if (basePrice === null || basePrice === undefined || basePrice === "" || !Number.isFinite(Number(basePrice)) || Number(basePrice) < 0) {
    return { confirmed: false, price: 0, service, variant, addons, reason: "Price to be confirmed by the shop." };
  }
  if (addons.some((addon) => addon.price === null || addon.price === undefined || !Number.isFinite(Number(addon.price)))) {
    return { confirmed: false, price: 0, service, variant, addons, reason: "Add-on price to be confirmed by the shop." };
  }
  const price = Number(basePrice) + addons.reduce((total, addon) => total + Number(addon.price), 0);
  return { confirmed: true, price, service, variant, addons };
}

export function getPageCount(entry) {
  const count = extension(entry.file.name) === "pdf"
    ? visiblePdfPages(entry).length
    : Number(entry.options.pageCount || 0);
  if (!count) return 0;
  if (entry.options.pageRange) {
    const rangeCount = countExpandedRange(entry.options.pageRange);
    if (rangeCount > 0) return rangeCount;
  }
  return count;
}
function visiblePdfPages(entry) {
  const pageOrder = entry.pdfOrder || Array.from({ length: entry.pdf?.numPages || 0 }, (_, index) => index);
  return pageOrder.filter((page) => !entry.pdfDeleted?.has(page));
}
export function getPageIndices(entry) {
  const pages = visiblePdfPages(entry);
  const range = String(entry.options.pageRange || "").trim();
  if (!range) return pages;
  const positions = new Set();
  for (const part of range.split(",")) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) return pages;
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (start < 1 || end > pages.length || end < start) return pages;
    for (let position = start; position <= end; position++) positions.add(position);
  }
  return [...positions].sort((a, b) => a - b).map((position) => pages[position - 1]);
}
function countExpandedRange(range) {
  const numbers = new Set();
  for (const part of String(range).split(",")) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) return 0;
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (end < start) return 0;
    for (let page = start; page <= end; page++) numbers.add(page);
  }
  return numbers.size;
}
export function validatePages(entry) { return validatePageRange(entry); }
function validatePageRange(entry) {
  const range = String(entry.options.pageRange || "").trim();
  entry.pageRangeValid = true;
  entry.pageRangeError = "";
  if (!range) return true;
  const count = extension(entry.file.name) === "pdf"
    ? visiblePdfPages(entry).length
    : Number(entry.options.pageCount || 0);
  if (!count) {
    entry.pageRangeValid = false;
    entry.pageRangeError = "Enter number of pages.";
    return false;
  }
  for (const part of range.split(",")) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) {
      entry.pageRangeValid = false;
      entry.pageRangeError = "Use a format like 1-3, 5.";
      return false;
    }
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (start < 1 || end > count || end < start) {
      entry.pageRangeValid = false;
      entry.pageRangeError = `Enter pages from 1 to ${count}.`;
      return false;
    }
  }
  return true;
}
export function calculateEstimate(files, services) {
  return files.reduce((total, entry) => {
    const line = getLinePrice(entry, services);
    if (!line.confirmed) return total;
    const units = line.service.billing === "page" ? getPageCount(entry) : 1;
    if (!units) return total;
    return total + line.price * units * Math.max(1, Number(entry.options.copies || 1));
  }, 0);
}
export function updateLiveSummary(files, services) {
  const total = calculateEstimate(files, services);
  const mobile = document.querySelector("#mobile-live-total");
  const needsQuote = files.some((entry) => !getLinePrice(entry, services).confirmed);
  if (mobile) {
    mobile.textContent = needsQuote
      ? total ? `₱${total.toFixed(2)} + quote` : "Price to be confirmed"
      : `₱${total.toFixed(2)}`;
  }
  const count = document.querySelector("#step2-file-count");
  if (count) count.textContent = `${files.length} file${files.length === 1 ? "" : "s"}`;
  files.forEach((entry, index) => {
    if (!entry.isActive) return;
    const line = getLinePrice(entry, services);
    const target = document.querySelector(`#live-total-${index}`);
    if (!target) return;
    if (!line.confirmed) {
      target.textContent = "To be confirmed";
      const note = document.querySelector(`#live-summary-note-${index}`);
      if (note) note.textContent = line.reason;
      return;
    }
    const units = line.service.billing === "page" ? getPageCount(entry) : 1;
    if (line.service.billing === "page" && !units) {
      target.textContent = "Enter number of pages";
      const note = document.querySelector(`#live-summary-note-${index}`);
      if (note) note.textContent = "The live total will update when the page count is entered.";
      return;
    }
    const copies = Math.max(1, Number(entry.options.copies || 1));
    target.textContent = `₱${(line.price * units * copies).toFixed(2)}`;
    const note = document.querySelector(`#live-summary-note-${index}`);
    if (note) {
      const option = line.variant ? ` · ${line.variant.label}` : "";
      const addonLabels = line.addons.map((addon) => addon.label).join(", ");
      const addons = addonLabels ? ` · ${addonLabels}` : "";
      const unit = line.service.billing === "page" ? `${units} page(s)` : `${copies} ${line.service.unit || "item(s)"}`;
      note.textContent = `${line.service.name}${option}${addons}: ₱${line.price.toFixed(2)} × ${unit}`;
    }
  });
}
function updateSheetPaper(paper) {
  const sheet = document.querySelector("#preview-sheet");
  if (sheet) sheet.dataset.paper = normalizePaper(paper);
}
export function showToast(message) {
  let toast = document.querySelector(".at-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "at-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("is-visible"), 2800);
}
