import { adminEmail } from "./config.js";
import {
  getAllServices,
  isAdminEmailConfigured,
  isFirebaseConfigured,
  observeAuth,
  reloadAdminUser,
  removeService,
  saveService,
  sendAdminVerificationEmail,
  signInAdmin,
  signOutAdmin,
  observeAllOrders,
  updateOrderStatus,
  getDownloadUrl
} from "./firebase.js";

const loginView = document.querySelector("#login-view");
const dashboardView = document.querySelector("#dashboard-view");
const loginForm = document.querySelector("#login-form");
const loginStatus = document.querySelector("#login-status");
const verificationActions = document.querySelector("#verification-actions");
const dashboardStatus = document.querySelector("#dashboard-status");
const serviceForm = document.querySelector("#service-form");
const tableBody = document.querySelector("#services-table-body");
const toast = document.querySelector("#toast");
const currency = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let services = [];
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
  showMessage(dashboardStatus, "Loading services…");
  try {
    services = await getAllServices();
    showMessage(dashboardStatus, "");
    renderServices();
    return true;
  } catch (error) {
    console.error("Unable to load services.", error);
    showMessage(dashboardStatus, "Could not load services. Check your connection and Firestore rules, then refresh.", true);
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
  serviceForm.elements.sortOrder.value = Number(service.sortOrder || 0);
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
    sortOrder
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
    showMessage(loginStatus, "Sign-in failed. Check your email and password, and confirm the admin account is enabled.", true);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#send-verification").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await sendAdminVerificationEmail();
    showMessage(loginStatus, "Verification email sent. Check your inbox and spam folder, click the link, then return and select “I've verified — check again”.");
  } catch (error) {
    console.error("Unable to send admin verification email.", error);
    showMessage(loginStatus, "Could not send the verification email. Sign in again or wait a few minutes before requesting another.", true);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#check-verification").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const user = await reloadAdminUser();
    if (!user) {
      showLogin("Your sign-in expired. Sign in again to continue.");
      return;
    }
    await handleAuthState(user);
  } catch (error) {
    console.error("Unable to refresh admin verification status.", error);
    showMessage(loginStatus, "Could not check verification status. Reload the page and try again.", true);
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
    showToast(refreshed ? "Service saved." : "Service saved, but the list could not refresh. Use Refresh list to try again.", !refreshed);
  } catch (error) {
    console.error("Unable to save service.", error);
    showToast(error.message || "Could not save this service. Check the form and Firestore rules.", true);
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
    showToast(refreshed ? "Service deleted." : "Service deleted, but the list could not refresh. Use Refresh list to try again.", !refreshed);
  } catch (error) {
    console.error("Unable to delete service.", error);
    showToast("Could not delete this service. Check your connection and Firestore rules.", true);
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

function showLogin(message = "", isError = true) {
  dashboardView.hidden = true;
  loginView.hidden = false;
  if (message) showMessage(loginStatus, message, isError);
}

function isConfiguredAdmin(user) {
  return isAdminEmailConfigured()
    && typeof user.email === "string"
    && user.email.trim().toLowerCase() === adminEmail.trim().toLowerCase();
}

async function handleAuthState(user) {
  if (!user) {
    verificationActions.hidden = true;
    showLogin();
    return;
  }
  if (!isConfiguredAdmin(user)) {
    verificationActions.hidden = true;
    const signedInAs = user.email || "an account without an email address";
    const expected = isAdminEmailConfigured()
      ? ` The configured admin email is ${adminEmail}.`
      : " The admin email is not configured in js/config.js.";
    console.warn("Admin access denied by the client email check.", {
      signedInEmail: user.email,
      configuredAdminEmail: adminEmail
    });
    await signOutAdmin();
    showLogin(`You are signed in as ${signedInAs}, which does not match the admin account.${expected} Check the account and deployed configuration.`);
    return;
  }
  if (!user.emailVerified) {
    showLogin(`Your email (${user.email}) is not verified yet. Send a verification link to your inbox, click it, then return here to check again.`, false);
    verificationActions.hidden = false;
    return;
  }
  verificationActions.hidden = true;
  loginView.hidden = true;
  dashboardView.hidden = false;
  document.querySelector("#admin-email-label").textContent = user.email;
  await loadServices();
}

if (!isFirebaseConfigured() || !isAdminEmailConfigured()) {
  showMessage(loginStatus, "Before signing in, configure your Firebase web app settings and admin email in js/config.js.", true);
  loginForm.querySelector("button[type=submit]").disabled = true;
} else {
  observeAuth((user) => {
    handleAuthState(user).catch((error) => {
      console.error("Unable to initialize the admin dashboard.", error);
      showLogin("Could not open the admin dashboard. Check your Firebase settings and Firestore rules.");
    });
  }, (error) => {
    console.error("Unable to observe admin authentication state.", error);
    showLogin("Could not check the current sign-in. Reload the page and try again.");
  }).catch((error) => {
    console.error("Firebase admin initialization failed.", error);
    showMessage(loginStatus, "Could not connect to Firebase. Check your configuration and network connection.", true);
  });
}

let allOrders = [];
const orderList = document.querySelector("#orders-list");
const statusFilter = document.querySelector("#order-status-filter");

function formatOrderDate(value) {
  const date = value && typeof value.toDate === "function" ? value.toDate() : null;
  return date ? new Intl.DateTimeFormat("en-PH",{dateStyle:"medium",timeStyle:"short"}).format(date) : "Just now";
}

function renderOrders() {
  const filter = statusFilter.value;
  const filtered = filter === "All" ? allOrders : allOrders.filter((order) => order.status === filter);
  if (!filtered.length) {
    orderList.innerHTML = '<div class="table-empty">No orders match this view.</div>';
    return;
  }
  orderList.innerHTML = filtered.map((order) => `
    <article class="order-card">
      <div class="order-card-head"><div><h3>${escapeHtml(order.orderNumber)}</h3><p class="order-card-meta">${escapeHtml(order.customerName)} · ${escapeHtml(order.mobile)} · ${escapeHtml(order.pickupOrDelivery)} · ${escapeHtml(formatOrderDate(order.createdAt))}</p></div><select class="order-status-select" data-order-status="${escapeHtml(order.id)}" aria-label="Change status">${["Received","Payment Checking","Paid","Printing","Ready for Pickup","Completed"].map((status)=>`<option ${status===order.status?"selected":""}>${status}</option>`).join("")}</select></div>
      <div class="order-items">${(order.items || []).map((item)=>`<div class="order-item-row"><strong>${escapeHtml(item.fileName)}</strong><span>${escapeHtml(item.options?.service || "Service")} · ${escapeHtml(item.options?.paper || "A4")} · ${escapeHtml(item.options?.copies || 1)} copy · ${escapeHtml(item.options?.color || "")} · ${escapeHtml(item.options?.pages || "All")}</span><button class="text-button" type="button" data-open-file="${escapeHtml(item.storagePath)}">Open / download</button></div>`).join("")}</div>
      <p class="order-card-meta">GCash ref: ${escapeHtml(order.gcashRef)} · Estimated total: ₱${currency.format(Number(order.estimatedTotal || 0))}</p>
      <div class="order-admin-actions"><button class="button button-outline" type="button" data-open-receipt="${escapeHtml(order.receiptPath)}">View receipt</button><button class="button button-gradient" type="button" data-verify-payment="${escapeHtml(order.id)}" ${order.paymentVerified?"disabled":""}>${order.paymentVerified?"Payment verified":"Mark Payment as Verified"}</button></div>
    </article>
  `).join("");
}

document.querySelectorAll("[data-admin-tab]").forEach((tab) => tab.addEventListener("click", () => {
  document.querySelectorAll("[data-admin-tab]").forEach((item)=>item.classList.toggle("active",item===tab));
  document.querySelectorAll("[data-admin-panel]").forEach((panel)=>panel.hidden=panel.dataset.adminPanel!==tab.dataset.adminTab);
}));
statusFilter.addEventListener("change", renderOrders);
orderList.addEventListener("change", async (event) => {
  const select = event.target.closest("[data-order-status]");
  if (!select) return;
  try { await updateOrderStatus(select.dataset.orderStatus, select.value); showToast("Order status updated."); }
  catch (error) { console.error(error); showToast("Could not update order status.",true); }
});
orderList.addEventListener("click", async (event) => {
  const fileButton = event.target.closest("[data-open-file]");
  const receiptButton = event.target.closest("[data-open-receipt]");
  const verifyButton = event.target.closest("[data-verify-payment]");
  try {
    if (fileButton) window.open(await getDownloadUrl(fileButton.dataset.openFile), "_blank","noopener");
    if (receiptButton) window.open(await getDownloadUrl(receiptButton.dataset.openReceipt), "_blank","noopener");
    if (verifyButton) {
      await updateOrderStatus(verifyButton.dataset.verifyPayment, "Payment Checking", true);
      showToast("Payment marked as verified.");
    }
  } catch (error) { console.error(error); showToast("Could not open or update this order.",true); }
});

observeAuth(async (user) => {
  if (user && user.emailVerified && isConfiguredAdmin(user)) {
    observeAllOrders((orders) => { allOrders = orders; renderOrders(); }, (error) => {
      console.error("Unable to observe orders.",error);
      showToast("Could not load live orders.",true);
    });
  }
}).catch(()=>{});
