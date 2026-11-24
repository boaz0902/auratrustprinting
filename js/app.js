import { businessInfo } from "./config.js";
import { getPublicPriceData } from "./supabase.js";

const categoryTabs = document.querySelector("#category-tabs");
const categoryContainer = document.querySelector("#price-categories");
const searchInput = document.querySelector("#service-search");
const statusMessage = document.querySelector("#prices-status");
const lastUpdated = document.querySelector("#last-updated");
const currency = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let selectedCategory = "All";
let services = [];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function formatPrice(price) {
  return `₱${currency.format(price)}`;
}

function hasPrice(price) {
  return price !== null && price !== undefined && price !== "" && Number.isFinite(Number(price));
}

function renderTabs() {
  const categories = ["All", ...new Set(services.map((service) => service.category).filter(Boolean))];
  if (!categories.includes(selectedCategory)) selectedCategory = "All";
  categoryTabs.innerHTML = categories.map((category) => `
    <button class="category-chip" type="button" data-category="${escapeHtml(category)}" aria-pressed="${category === selectedCategory}">
      ${escapeHtml(category)}
    </button>
  `).join("");
}

function renderService(service) {
  const variants = Array.isArray(service.variants) ? service.variants : [];
  const prices = variants.map((variant) => variant.price).filter(hasPrice).map(Number);
  const priceContent = `
    ${prices.length ? `<div class="service-price-row"><span class="starting-label">Starting at</span><span class="service-price"><span class="currency">₱</span>${currency.format(Math.min(...prices))}</span></div>` : ""}
    ${hasPrice(service.price) ? `<div class="service-price-row"><span class="service-price"><span class="currency">₱</span>${currency.format(Number(service.price))}</span><span class="service-unit">${escapeHtml(service.unit)}</span></div>` : ""}
    ${variants.length ? `<div class="variant-list">${variants.map((variant) => `
      <div class="variant-row"><span>${escapeHtml(variant.label)}</span><strong>${hasPrice(variant.price) ? formatPrice(Number(variant.price)) : "Price to be confirmed"}</strong></div>
    `).join("")}</div>` : ""}
    ${(service.addons || []).length ? `<div class="variant-list addon-list">${service.addons.map((addon) => `
      <div class="variant-row"><span>${escapeHtml(addon.label)}</span><strong>${hasPrice(addon.price) ? `+${formatPrice(Number(addon.price))}` : "Price to be confirmed"}</strong></div>
    `).join("")}</div>` : ""}
    ${!prices.length && !hasPrice(service.price) && !variants.length ? `<div class="service-price-row"><span class="service-unit">Price to be confirmed</span></div>` : ""}
  `;

  return `<article class="service-card">
    <div class="service-card-top"><h4>${escapeHtml(service.name)}</h4>${service.popular ? '<span class="popular-badge">Popular</span>' : ""}</div>
    <p class="service-description">${escapeHtml(service.description)}</p>
    ${priceContent}
  </article>`;
}

function renderPrices() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const filtered = services.filter((service) => {
    const matchesCategory = selectedCategory === "All" || service.category === selectedCategory;
    const searchable = `${service.name} ${service.category} ${service.description} ${service.unit} ${(service.variants || []).map((variant) => variant.label).join(" ")} ${(service.addons || []).map((addon) => addon.label).join(" ")}`.toLocaleLowerCase();
    return matchesCategory && searchable.includes(query);
  });

  if (!filtered.length) {
    categoryContainer.innerHTML = `<div class="empty-state"><strong>No results found</strong><p>Try a different search or choose another category.</p></div>`;
    return;
  }

  const categories = selectedCategory === "All"
    ? [...new Set(filtered.map((service) => service.category))]
    : [selectedCategory];
  categoryContainer.innerHTML = categories.map((category) => {
    const categoryServices = filtered.filter((service) => service.category === category)
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    if (!categoryServices.length) return "";
    return `<section class="category-section" aria-label="${escapeHtml(category)}">
      <h3 class="category-title">${escapeHtml(category)}</h3>
      <div class="service-grid">${categoryServices.map(renderService).join("")}</div>
    </section>`;
  }).join("");
}

async function loadPrices() {
  statusMessage.textContent = "Loading the current price list…";
  try {
    const data = await getPublicPriceData();
    services = data.services;
    statusMessage.textContent = services.length
      ? "Options without a posted rate are marked “Price to be confirmed.”"
      : "No published services are available yet. Please contact AuraTrust for a quote.";
    if (data.lastUpdated) {
      lastUpdated.textContent = `Prices last updated ${new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(data.lastUpdated))}`;
    } else {
      lastUpdated.innerHTML = "Prices supplied by <span>AuraTrust</span>";
    }
    renderTabs();
    renderPrices();
  } catch (error) {
    console.error("Unable to load public price list.", error);
    statusMessage.textContent = "The price list is temporarily unavailable. Please try again later or contact AuraTrust.";
    statusMessage.classList.add("error");
    categoryTabs.innerHTML = "";
    categoryContainer.innerHTML = `<div class="empty-state"><strong>Price list unavailable</strong><p>Please try again later or contact AuraTrust for a quote.</p></div>`;
  }
}

function renderContact() {
  const entries = [
    ["Visit us", escapeHtml(businessInfo.address)],
    ["Call / Viber", `<a href="tel:${escapeHtml(businessInfo.phone.replace(/[^\d+]/g, ""))}">${escapeHtml(businessInfo.phone)}</a>`],
    ["Email", `<a href="mailto:${escapeHtml(businessInfo.email)}">${escapeHtml(businessInfo.email)}</a>`],
    ["Find us", `<a href="${escapeHtml(businessInfo.facebookUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(businessInfo.facebookName)} ↗</a>`],
    ["Business hours", escapeHtml(businessInfo.hours)]
  ];
  document.querySelector("#contact-details").innerHTML = entries.map(([label, value]) => `
    <div class="contact-item"><p class="contact-item-label">${label}</p><div class="contact-item-value">${value}</div></div>
  `).join("");
  document.querySelectorAll("[data-contact-link]").forEach((link) => {
    link.href = businessInfo.facebookUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  });
}

categoryTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  selectedCategory = button.dataset.category;
  renderTabs();
  renderPrices();
});
searchInput.addEventListener("input", renderPrices);
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    searchInput.focus();
  }
});

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

document.querySelector("#copyright-year").textContent = String(new Date().getFullYear());
lastUpdated.innerHTML = "Prices supplied by <span>AuraTrust</span>";
renderContact();
loadPrices();

if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document.documentElement.classList.add("reveal-ready");
  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        currentObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll(".hero-copy, .section-heading, .why-intro, .benefit-card, .contact-heading, .contact-details").forEach((element) => {
    element.classList.add("reveal");
    observer.observe(element);
  });
}
