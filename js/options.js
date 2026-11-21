import { extension, escapeHtml, formatSize } from "./preview.js";
import { getSmartDefaults } from "./smart-defaults.js";

const paperLabels = { short: "Short", a4: "A4", long: "Long", a3: "A3" };
const colorLabels = { color: "Color", bw: "B&W" };

export async function initializeOptions(files, services, context) {
  for (const entry of files) {
    if (entry.smartInitialized) continue;
    entry.manual = entry.manual || {};
    entry.suggestions = entry.suggestions || {};
    const defaults = await getSmartDefaults(entry, services);
    entry.suggestions.paper = defaults.paper;
    entry.suggestions.color = defaults.color;
    entry.suggestions.service = defaults.service?.id ? String(defaults.service.id) : null;
    entry.options.paper = paperLabels[defaults.paper].toLowerCase();
    entry.options.color = defaults.color === "bw" ? "B&W" : "Color";
    entry.options.service = entry.suggestions.service;
    entry.smartInitialized = true;
  }
  renderOptions(files[context.activeIndex] || files[0], context.activeIndex, files, services, context);
  updateLiveSummary(files, services);
}

export function renderOptions(entry, index, files, services, context) {
  const container = document.querySelector("#preview-options");
  if (!container || !entry) return;
  const paper = normalizePaper(entry.options.paper);
  const color = normalizeColor(entry.options.color);
  const notice = entry.inlineNotice ? `<div class="inline-notice" role="status">${escapeHtml(entry.inlineNotice)}</div>` : "";
  const isImage = ["jpg", "jpeg", "png", "webp"].includes(extension(entry.file.name));
  const quickImage = isImage ? `
    <div class="option-block"><span class="option-label">Image alternatives</span><div class="quick-image-chips">
      ${renderQuickChip("ID Picture", services, ["id"], entry)}
      ${renderQuickChip("Photo Print", services, ["photo"], entry)}
      ${renderQuickChip("Sticker", services, ["sticker"], entry)}
    </div></div>` : "";
  const serviceVariants = Array.isArray(selectedService(entry, services)?.variants)
    ? selectedService(entry, services).variants : [];

  container.innerHTML = `
    <div class="options-heading"><div><p class="eyebrow" style="margin-bottom:5px">Print setup</p><h3>${escapeHtml(entry.file.name)}</h3></div><button class="at-icon-btn" type="button" data-options-action="apply-all" aria-label="Apply these options to all files" title="Apply to all">✓</button></div>
    ${quickImage}
    <div class="option-block">
      <div class="option-label-row"><label class="option-label" for="service-select-${index}">Service</label>${suggestionChip(entry, "service")}</div>
      <select id="service-select-${index}" class="at-control" data-option="service" data-index="${index}">
        <option value="">Choose service</option>
        ${services.map((service) => `<option value="${escapeHtml(String(service.id))}" ${String(entry.options.service) === String(service.id) ? "selected" : ""}>${escapeHtml(service.name)} — ${escapeHtml(service.category || "")}</option>`).join("")}
      </select>
      ${serviceVariants.length ? `<select class="at-control" data-option="variantLabel" data-index="${index}" aria-label="Price variant"><option value="">Choose a price option</option>${serviceVariants.map((variant) => `<option value="${escapeHtml(variant.label)}" ${entry.options.variantLabel === variant.label ? "selected" : ""}>${escapeHtml(variant.label)} — ₱${Number(variant.price).toFixed(2)}</option>`).join("")}</select>` : ""}
    </div>
    <div class="option-block">
      <div class="option-label-row"><span class="option-label">Paper size</span>${suggestionChip(entry, "paper")}</div>
      <div class="paper-size-grid" role="group" aria-label="Paper size">
        ${["short", "a4", "long", "a3"].map((paperKey) => `<button class="paper-choice" type="button" data-option="paper" data-paper="${paperKey}" data-index="${index}" aria-pressed="${paper === paperKey}" aria-label="${paperLabels[paperKey]} paper"><span class="paper-icon"></span>${paperLabels[paperKey]}</button>`).join("")}
      </div>
    </div>
    <div class="option-block">
      <div class="option-label-row"><span class="option-label">Print mode</span>${suggestionChip(entry, "color")}</div>
      <div class="at-segment" role="group" aria-label="Print in color or black and white">
        <button type="button" data-option="color" data-value="color" data-index="${index}" aria-pressed="${color === "color"}">Color</button>
        <button type="button" data-option="color" data-value="bw" data-index="${index}" aria-pressed="${color === "bw"}">B&amp;W</button>
      </div>
    </div>
    <div class="option-block">
      <span class="option-label">Sides</span>
      <div class="at-segment" role="group" aria-label="Print sides">
        <button type="button" data-option="sides" data-value="single" data-index="${index}" aria-pressed="${entry.options.sides !== "Double-sided"}">Single-sided</button>
        <button type="button" data-option="sides" data-value="double" data-index="${index}" aria-pressed="${entry.options.sides === "Double-sided"}">Double-sided</button>
      </div>
    </div>
    <div class="option-block">
      <div class="option-label-row"><span class="option-label">Copies</span></div>
      <div class="copy-stepper"><button type="button" data-copies="decrease" data-index="${index}" aria-label="Decrease copies">−</button><input class="at-control" type="number" min="1" max="500" value="${Math.max(1, Number(entry.options.copies || 1))}" data-option="copies" data-index="${index}" aria-label="Number of copies"><button type="button" data-copies="increase" data-index="${index}" aria-label="Increase copies">+</button></div>
    </div>
    <div class="option-block"><label class="option-label" for="pages-${index}">Page range <span id="page-count-note">${pageCountLabel(entry)}</span></label><input id="pages-${index}" class="at-control" type="text" maxlength="100" value="${escapeHtml(entry.options.pages || "All")}" data-option="pages" data-index="${index}" placeholder="All or 1-3, 5"><small id="page-range-error" style="color:#b45b61"></small></div>
    <div class="option-block"><label class="option-label" for="notes-${index}">Notes</label><textarea id="notes-${index}" class="at-control" rows="3" maxlength="500" data-option="notes" data-index="${index}" placeholder="Special instructions">${escapeHtml(entry.options.notes || "")}</textarea></div>
    ${notice}
    <div class="live-summary" aria-live="polite"><div class="live-summary-row"><span>Live total</span><strong id="live-total-${index}">${escapeHtml(formatEstimate(entry, services))}</strong></div><p class="live-summary-note" id="live-summary-note-${index}">${escapeHtml(summaryNote(entry, services))}</p></div>
    <button class="at-btn at-btn-secondary apply-all" type="button" data-options-action="apply-all">Apply these options to all files</button>
  `;
  attachOptionEvents(container, entry, index, files, services, context);
}

function renderQuickChip(label, services, words, entry) {
  const service = findService(services, words);
  if (!service) return "";
  return `<button class="at-chip" type="button" data-image-service="${escapeHtml(String(service.id))}" data-index="${escapeHtml(String(entry.options._index || 0))}">${escapeHtml(label)}</button>`;
}

function suggestionChip(entry, key) {
  if (entry.manual?.[key]) return "";
  const labels = { paper: "Suggested", color: "Suggested", service: "Suggested" };
  return `<span class="at-tooltip-wrap"><span class="suggested-chip">✦ ${labels[key]}</span><span class="at-tooltip" role="tooltip">Auto-detected from your file. You can change this.</span></span>`;
}

function attachOptionEvents(container, entry, index, files, services, context) {
  container.querySelectorAll("[data-option]").forEach((control) => {
    const eventName = control.tagName === "SELECT" || control.tagName === "TEXTAREA" || control.type === "number" || control.type === "text" ? "change" : "click";
    control.addEventListener(eventName, () => handleControl(control, entry, index, files, services, context));
  });
  container.querySelectorAll("[data-copies]").forEach((button) => button.addEventListener("click", () => {
    entry.manual.copies = true;
    const input = container.querySelector('[data-option="copies"]');
    const next = Math.max(1, Math.min(500, Number(entry.options.copies || 1) + (button.dataset.copies === "increase" ? 1 : -1)));
    entry.options.copies = next;
    input.value = String(next);
    updateLiveSummary(files, services);
  }));
  container.querySelectorAll("[data-options-action=\"apply-all\"]").forEach((button) => button.addEventListener("click", () => {
    for (const target of files) {
      if (target === entry) continue;
      target.options = { ...target.options, service: entry.options.service, variantLabel: entry.options.variantLabel, paper: entry.options.paper, color: entry.options.color, sides: entry.options.sides, copies: entry.options.copies, pages: entry.options.pages, notes: entry.options.notes };
      target.manual = { ...entry.manual };
    }
    showToast("These options were applied to all files.");
    updateLiveSummary(files, services);
  }));
  container.querySelectorAll("[data-image-service]").forEach((button) => button.addEventListener("click", () => {
    entry.manual.service = true;
    entry.options.service = button.dataset.imageService;
    const service = selectedService(entry, services);
    applyServiceDefaults(entry, service);
    renderOptions(entry, index, files, services, context);
    updateLiveSummary(files, services);
  }));
}

function handleControl(control, entry, index, files, services, context) {
  const key = control.dataset.option;
  if (key === "paper") entry.manual.paper = true;
  if (key === "color") entry.manual.color = true;
  if (key === "service") entry.manual.service = true;
  if (key === "sides") entry.manual.sides = true;
  if (key === "copies") entry.manual.copies = true;
  if (key === "pages") entry.manual.pages = true;
  if (key === "notes") entry.manual.notes = true;

  let value = control.dataset.value || control.dataset.paper || control.value;
  if (key === "color") value = value === "bw" ? "B&W" : "Color";
  if (key === "paper") value = normalizePaper(value);
  if (key === "sides") value = value === "double" ? "Double-sided" : "Single-sided";
  if (key === "copies") value = Math.max(1, Math.min(500, Number(value) || 1));
  entry.options[key] = value;

  if (key === "service") {
    entry.manual.variantLabel = true;
    entry.options.variantLabel = "";
    entry.inlineNotice = "";
    applyServiceDefaults(entry, selectedService(entry, services));
  } else if (key === "paper" || key === "color") {
    const sibling = findSibling(entry, key, value, services);
    if (sibling) {
      entry.options.service = String(sibling.id);
      entry.options.paper = normalizePaper(sibling.paper_size || value);
      entry.options.color = normalizeColor(sibling.color_mode || normalizeColor(value));
      entry.inlineNotice = "";
      applyServiceDefaults(entry, sibling);
    } else {
      entry.inlineNotice = "We don't have a listed price for this combination. We'll confirm the price after review.";
      showToast("No listed price for this combination. Marked for confirmation.");
    }
  }

  if (key === "pages") validatePages(entry);
  renderOptions(entry, index, files, services, context);
  updateLiveSummary(files, services);
}

function applyServiceDefaults(entry, service) {
  if (!service) return;
  if (service.paper_size) entry.options.paper = normalizePaper(service.paper_size);
  if (service.color_mode) entry.options.color = normalizeColor(service.color_mode);
  entry.options.service = String(service.id);
  entry.inlineNotice = "";
}

function findSibling(entry, changedKey, value, services) {
  const current = selectedService(entry, services);
  if (!current) return null;
  const paper = changedKey === "paper" ? normalizePaper(value) : normalizePaper(entry.options.paper);
  const color = changedKey === "color" ? normalizeColor(value) : normalizeColor(entry.options.color);
  return services.find((service) =>
    service.category === current.category
    && normalizePaper(service.paper_size) === paper
    && normalizeColor(service.color_mode) === color
  ) || null;
}

function findService(services, words) {
  return services.find((service) => {
    const text = `${service.category || ""} ${service.name || ""}`.toLowerCase();
    return words.every((word) => text.includes(word));
  }) || services.find((service) => {
    const text = `${service.category || ""} ${service.name || ""}`.toLowerCase();
    return words.some((word) => text.includes(word));
  });
}

function selectedService(entry, services) {
  return services.find((service) => String(service.id) === String(entry.options.service));
}

function normalizePaper(value) {
  const paper = String(value || "").toLowerCase();
  return ["short", "a4", "long", "a3"].includes(paper) ? paper : "short";
}

function normalizeColor(value) {
  return String(value || "").toLowerCase().startsWith("b") ? "bw" : "color";
}

export function validatePages(entry) {
  const raw = String(entry.options.pages || "All").trim();
  if (!raw || raw.toLowerCase() === "all") return true;
  const knownCount = entry.pdf?.numPages || entry.pageCount || null;
  const numbers = new Set();
  for (const part of raw.split(",")) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) return false;
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (start < 1 || end < start || (knownCount && end > knownCount)) return false;
    for (let page = start; page <= end; page++) numbers.add(page);
  }
  entry.pageRangeValid = true;
  return true;
}

export function getPageCount(entry) {
  const raw = String(entry.options.pages || "All").trim();
  if (raw && raw.toLowerCase() !== "all") {
    if (!validatePages(entry)) return 0;
    const numbers = new Set();
    for (const part of raw.split(",")) {
      const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!match) continue;
      const end = Number(match[2] || match[1]);
      for (let page = Number(match[1]); page <= end; page++) numbers.add(page);
    }
    return numbers.size;
  }
  if (entry.pdf) return entry.pdfOrder?.filter((page) => !entry.pdfDeleted?.has(page)).length || entry.pdf.numPages;
  return Math.max(1, Number(entry.pageCount || 1));
}

export function calculateEstimate(files, services) {
  return files.reduce((total, entry) => {
    const line = getLinePrice(entry, services);
    if (!line.confirmed) return total;
    return total + line.price * getPageCount(entry) * Math.max(1, Number(entry.options.copies || 1));
  }, 0);
}

export function getLinePrice(entry, services) {
  const service = selectedService(entry, services);
  if (!service) return { confirmed: false, price: 0 };
  if (entry.inlineNotice) return { confirmed: false, price: 0 };
  const variants = Array.isArray(service.variants) ? service.variants : [];
  const variant = variants.find((item) => item.label === entry.options.variantLabel);
  if (variants.length && !variant) return { confirmed: false, price: 0 };
  const price = variants.length ? Number(variant.price) : Number(service.price);
  return Number.isFinite(price) ? { confirmed: true, price } : { confirmed: false, price: 0 };
}

export function formatEstimate(entry, services) {
  const line = getLinePrice(entry, services);
  if (!line.confirmed) return "To be confirmed";
  const total = line.price * getPageCount(entry) * Math.max(1, Number(entry.options.copies || 1));
  return `₱${total.toFixed(2)}`;
}

export function summaryNote(entry, services) {
  const line = getLinePrice(entry, services);
  if (!line.confirmed) return "We'll confirm this price after review.";
  return `${getPageCount(entry)} page(s) × ${Math.max(1, Number(entry.options.copies || 1))} copy/copies`;
}

export function updateLiveSummary(files, services) {
  const total = calculateEstimate(files, services);
  const activeIndex = files.findIndex((entry) => entry.isActive);
  const mobile = document.querySelector("#mobile-live-total");
  if (mobile) mobile.textContent = `₱${total.toFixed(2)}`;
  if (activeIndex >= 0) {
    const label = document.querySelector(`#live-total-${activeIndex}`);
    if (label) label.textContent = formatEstimate(files[activeIndex], services);
  }
}

export function pageCountLabel(entry) {
  const count = entry.pdf?.numPages || entry.pageCount;
  return count ? `<span style="font-weight:500;color:#8b98a8">(${count} page${count === 1 ? "" : "s"})</span>` : "<span style=\"font-weight:500;color:#8b98a8\">(enter count)</span>";
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
