import { isSupabaseConfigured } from "./supabase.js";
import {
  deleteOldOrderFiles,
  getAllOrders,
  getAllServices,
  getSignedUrl,
  observeAuth,
  removeService,
  saveService,
  signInAdmin,
  signOutAdmin,
  updateOrderStatus
} from "./supabase.js";

const loginView = document.querySelector("#login-view");
const dashboardView = document.querySelector("#dashboard-view");
const loginForm = document.querySelector("#login-form");
const loginStatus = document.querySelector("#login-status");
const dashboardStatus = document.querySelector("#dashboard-status");
const serviceForm = document.querySelector("#service-form");
const tableBody = document.querySelector("#services-table-body");
const toast = document.querySelector("#toast");
const currency = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const statuses = ["Received", "Payment Checking", "Paid", "Printing", "Ready for Pickup", "Completed"];
let services = [];
let orders = [];
let toastTimeout;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function showMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("is-visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

function priceSummary(service) {
  const variants = Array.isArray(service.variants) ? service.variants : [];
  if (variants.length) {
    const prices = variants.map((variant) => Number(variant.price)).filter(Number.isFinite);
    return prices.length ? `From ₱${currency.format(Math.min(...prices))}` : "Variants";
  }
  return Number.isFinite(Number(service.price)) ? `₱${currency.format(Number(service.price))}` : "—";
}

function renderServices() {
  document.querySelector("#service-count").textContent = `(${services.length})`;
  document.querySelector("#table-empty").hidden = services.length > 0;
  tableBody.innerHTML = services.map((service) => `
    <tr>
      <td><strong>${escapeHtml(service.name)}</strong>${service.popular ? '<span class="table-popular">Popular</span>' : ""}</td>
      <td>${escapeHtml(service.category)}</td>
      <td>${priceSummary(service)}</td>
      <td><span class="visibility-pill ${service.visible ? "is-visible" : ""}">${service.visible ? "Visible" : "Hidden"}</span></td>
      <td class="table-actions">
        <button class="text-button" type="button" data-edit="${escapeHtml(service.id)}">Edit</button>
        <button class="text-button danger-button" type="button" data-delete="${escapeHtml(service.id)}">Delete</button>
      </td>
    </tr>
  `).join("");
}

async function loadServices() {
  showMessage(dashboardStatus, "Loading prices…");
  try {
    services = await getAllServices();
    showMessage(dashboardStatus, "");
    renderServices();
    return true;
  } catch (error) {
    console.error("Unable to load services.", error);
    showMessage(dashboardStatus, "Could not load prices. Check the Supabase services table and row-level security, then refresh.", true);
    return false;
  }
}

function startEditing(serviceId) {
  const service = services.find((item) => item.id === serviceId);
  if (!service) return;
  serviceForm.elements.serviceId.value = service.id;
  serviceForm.elements.name.value = service.name || "";
  serviceForm.elements.category.value = service.category || "";
  serviceForm.elements.description.value = service.description || "";
  serviceForm.elements.unit.value = service.unit || "";
  serviceForm.elements.price.value = service.price ?? "";
  serviceForm.elements.sortOrder.value = Number(service.sort_order || 0);
  serviceForm.elements.variants.value = (service.variants || [])
    .map((variant) => `${variant.label} | ${variant.price}`).join("\n");
  serviceForm.elements.popular.checked = Boolean(service.popular);
  serviceForm.elements.visible.checked = Boolean(service.visible);
  document.querySelector("#editor-title").textContent = "Edit service";
  document.querySelector("#save-service").innerHTML = 'Update service <span aria-hidden="true">→</span>';
  document.querySelector("#cancel-edit").hidden = false;
  serviceForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetForm() {
  serviceForm.reset();
  serviceForm.elements.serviceId.value = "";
  serviceForm.elements.sortOrder.value = "0";
  serviceForm.elements.visible.checked = true;
  document.querySelector("#editor-title").textContent = "Add a service";
  document.querySelector("#save-service").innerHTML = 'Save service <span aria-hidden="true">→</span>';
  document.querySelector("#cancel-edit").hidden = true;
}

function readFormValues() {
  const form = serviceForm.elements;
  const variants = form.variants.value.trim()
    ? form.variants.value.trim().split(/\r?\n/).map((line, index) => {
      const separator = line.lastIndexOf("|");
      if (separator < 1) throw new Error(`Variant line ${index + 1} must use the format label | price.`);
      const label = line.slice(0, separator).trim();
      const price = Number(line.slice(separator + 1).trim());
      if (!label || !Number.isFinite(price) || price <= 0) throw new Error(`Variant line ${index + 1} needs a label and a price greater than zero.`);
      return { label, price };
    })
    : [];
  const price = form.price.value.trim() ? Number(form.price.value) : null;
  if (!variants.length && (!Number.isFinite(price) || price <= 0)) {
    throw new Error("Enter a single price greater than zero, or add at least one valid price variant.");
  }
  const sortOrder = Number(form.sortOrder.value);
  if (!Number.isInteger(sortOrder)) throw new Error("Sort order must be a whole number.");
  return {
    name: form.name.value.trim(),
    category: form.category.value.trim(),
    description: form.description.value.trim(),
    unit: form.unit.value.trim(),
    price: variants.length ? null : price,
    variants,
    popular: form.popular.checked,
    visible: form.visible.checked,
    sort_order: sortOrder
  };
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector("button[type=submit]");
  button.disabled = true;
  showMessage(loginStatus, "");
  try {
    await signInAdmin(loginForm.elements.email.value.trim(), loginForm.elements.password.value);
  } catch (error) {
    console.error("Admin sign-in failed.", error);
    showMessage(loginStatus, "Sign-in failed. Check your email and password and confirm the account is enabled in Supabase Auth.", true);
  } finally {
    button.disabled = false;
  }
});

serviceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector("#save-service");
  button.disabled = true;
  try {
    await saveService(serviceForm.elements.serviceId.value || null, readFormValues());
    resetForm();
    const refreshed = await loadServices();
    showToast(refreshed ? "Price saved." : "Price saved, but the list could not refresh. Use Refresh list to try again.", !refreshed);
  } catch (error) {
    console.error("Unable to save service.", error);
    showToast(error.message || "Could not save this price. Check the form and Supabase row-level security.", true);
  } finally {
    button.disabled = false;
  }
});

tableBody.addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-edit]");
  if (editButton) {
    startEditing(editButton.dataset.edit);
    return;
  }
  const deleteButton = event.target.closest("[data-delete]");
  if (!deleteButton) return;
  const service = services.find((item) => item.id === deleteButton.dataset.delete);
  if (!service || !window.confirm(`Delete "${service.name}" from the price list?`)) return;
  deleteButton.disabled = true;
  try {
    await removeService(service.id);
    const refreshed = await loadServices();
    showToast(refreshed ? "Price deleted." : "Price deleted, but the list could not refresh.", !refreshed);
  } catch (error) {
    console.error("Unable to delete service.", error);
    showToast("Could not delete this price. Check your connection and Supabase row-level security.", true);
  } finally {
    deleteButton.disabled = false;
  }
});

document.querySelector("#cancel-edit").addEventListener("click", resetForm);
document.querySelector("#refresh-services").addEventListener("click", loadServices);
document.querySelector("#logout-button").addEventListener("click", async () => {
  try {
    await signOutAdmin();
    resetForm();
  } catch (error) {
    console.error("Admin sign-out failed.", error);
    showToast("Could not sign out. Please try again.", true);
  }
});

function showLogin(message = "") {
  dashboardView.hidden = true;
  loginView.hidden = false;
  if (message) showMessage(loginStatus, message, true);
}

function formatOrderDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(date)
    : "Date unavailable";
}

function renderOrders() {
  const filter = document.querySelector("#order-status-filter").value;
  const filtered = filter === "All" ? orders : orders.filter((order) => order.status === filter);
  const orderList = document.querySelector("#orders-list");
  if (!filtered.length) {
    orderList.innerHTML = '<div class="table-empty">No orders match this view.</div>';
    return;
  }
  orderList.innerHTML = filtered.map((order) => `
    <article class="order-card">
      <div class="order-card-head">
        <div><h3>${escapeHtml(order.order_number)}</h3><p class="order-card-meta">${escapeHtml(order.customer_name)} · ${escapeHtml(order.mobile)} · ${escapeHtml(order.pickup_or_delivery)} · ${escapeHtml(formatOrderDate(order.created_at))}</p></div>
        <label class="sr-only" for="status-${escapeHtml(order.id)}">Order status</label>
        <select id="status-${escapeHtml(order.id)}" class="order-status-select" data-order-status="${escapeHtml(order.id)}" aria-label="Change status for ${escapeHtml(order.order_number)}">${statuses.map((status) => `<option ${status === order.status ? "selected" : ""}>${status}</option>`).join("")}</select>
      </div>
      <div class="order-items">${(Array.isArray(order.items) ? order.items : []).map((item) => `
        <div class="order-item-row"><strong>${escapeHtml(item.fileName || "Order file")}</strong><span>${escapeHtml(item.options?.service || "Service")} · ${escapeHtml(item.options?.paper || "A4")} · ${escapeHtml(item.options?.copies || 1)} copy · ${escapeHtml(item.options?.color || "")} · ${escapeHtml(item.options?.pages || "All")}</span>
        ${item.storagePath ? `<button class="text-button" type="button" data-open-file="${escapeHtml(item.storagePath)}">Open / download</button>` : "<span>File removed</span>"}</div>
      `).join("")}</div>
      <p class="order-card-meta">GCash ref: ${escapeHtml(order.gcash_ref)} · Estimated total: ₱${currency.format(Number(order.estimated_total || 0))}</p>
      ${order.receipt_path ? `<div class="order-admin-actions"><button class="button button-outline" type="button" data-open-receipt="${escapeHtml(order.receipt_path)}">View receipt</button></div>` : '<p class="order-card-meta">Receipt file removed.</p>'}
    </article>
  `).join("");
}

async function loadOrders() {
  try {
    orders = await getAllOrders();
    renderOrders();
  } catch (error) {
    console.error("Unable to load orders.", error);
    showToast("Could not load orders. Check the Supabase orders policies.", true);
  }
}

if (!isSupabaseConfigured()) {
  showMessage(loginStatus, "Before signing in, configure your Supabase project URL and anon key in js/config.js.", true);
  loginForm.querySelector("button[type=submit]").disabled = true;
} else {
  observeAuth(async (user) => {
    if (!user || user.is_anonymous) {
      showLogin();
      return;
    }
    loginView.hidden = true;
    dashboardView.hidden = false;
    document.querySelector("#admin-email-label").textContent = user.email || "Signed in";
    await loadServices();
    await loadOrders();
  }, (error) => {
    console.error("Unable to observe Supabase authentication state.", error);
    showLogin("Could not check the current sign-in. Reload the page and try again.");
  }).catch((error) => {
    console.error("Supabase admin initialization failed.", error);
    showMessage(loginStatus, "Could not connect to Supabase. Check your configuration and network connection.", true);
  });
}

document.querySelectorAll("[data-admin-tab]").forEach((tab) => tab.addEventListener("click", () => {
  document.querySelectorAll("[data-admin-tab]").forEach((item) => {
    item.classList.toggle("active", item === tab);
    item.setAttribute("aria-selected", String(item === tab));
  });
  document.querySelectorAll("[data-admin-panel]").forEach((panel) => { panel.hidden = panel.dataset.adminPanel !== tab.dataset.adminTab; });
  if (tab.dataset.adminTab === "orders") loadOrders();
}));

document.querySelector("#order-status-filter").addEventListener("change", renderOrders);
document.querySelector("#refresh-orders").addEventListener("click", loadOrders);
document.querySelector("#delete-old-files").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  if (!window.confirm("Delete order files from orders older than 30 days? This cannot be undone.")) return;
  button.disabled = true;
  try {
    const result = await deleteOldOrderFiles(orders);
    showToast(`Removed ${result.files} file(s) from ${result.orders} old order(s).`);
    await loadOrders();
  } catch (error) {
    console.error("Unable to delete old order files.", error);
    showToast("Could not finish file cleanup. Check storage and orders row-level security.", true);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#orders-list").addEventListener("change", async (event) => {
  const select = event.target.closest("[data-order-status]");
  if (!select) return;
  try {
    await updateOrderStatus(select.dataset.orderStatus, select.value);
    const order = orders.find((item) => item.id === select.dataset.orderStatus);
    if (order) order.status = select.value;
    renderOrders();
    showToast("Order status updated.");
  } catch (error) {
    console.error("Unable to update order status.", error);
    showToast("Could not update order status.", true);
    await loadOrders();
  }
});

document.querySelector("#orders-list").addEventListener("click", async (event) => {
  const fileButton = event.target.closest("[data-open-file]");
  const receiptButton = event.target.closest("[data-open-receipt]");
  const button = fileButton || receiptButton;
  if (!button) return;
  button.disabled = true;
  const popup = window.open("about:blank", "_blank");
  if (popup) popup.opener = null;
  try {
    const url = await getSignedUrl(button.dataset.openFile || button.dataset.openReceipt);
    if (!popup) throw new Error("The browser blocked the new tab.");
    popup.location.href = url;
  } catch (error) {
    popup?.close();
    console.error("Unable to create a signed file URL.", error);
    showToast(popup ? "Could not open this file. It may have been removed or your storage access was denied." : "Allow pop-ups to open order files.", true);
  } finally {
    button.disabled = false;
  }
});
