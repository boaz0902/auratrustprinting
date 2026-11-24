import { trackCustomerOrder } from "./supabase.js";

const statuses = ["New", "Quoted", "Awaiting payment", "Paid", "Printing", "Ready for pickup", "Completed"];
const form = document.querySelector("#track-form");
const error = document.querySelector("#track-error");
const result = document.querySelector("#track-result");
const currency = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function renderOrder(order, requestedNumber) {
  const current = statuses.indexOf(order.status);
  const items = Array.isArray(order.items) ? order.items : [];
  const finalPrice = order.final_total == null
    ? "Our staff will confirm your final price."
    : `₱${currency.format(Number(order.final_total))}`;
  const timeline = order.status === "Cancelled"
    ? `<p class="tracked-cancelled">This order was cancelled.</p>`
    : `<ol class="status-timeline" aria-label="Order progress">${statuses.map((status, index) => `<li class="${index <= current ? "done" : ""} ${index === current ? "current" : ""}"><span>${index + 1}</span>${escapeHtml(status)}</li>`).join("")}</ol>`;
  const fileList = items.map((item) => `<div class="tracked-file"><strong>${escapeHtml(item.fileName || "Order file")}</strong><span>${escapeHtml(item.notes || "")}</span></div>`).join("");
  result.innerHTML = `<article class="tracked-card">
    <p class="eyebrow">Order ${escapeHtml(order.order_number || requestedNumber)}</p>
    <h2>${escapeHtml(order.status || "New")}</h2>
    ${timeline}
    ${fileList ? `<div class="tracked-order-details"><h3>Files</h3>${fileList}</div>` : ""}
    <div class="tracked-total"><span>${order.final_total == null ? "Quote status" : "Final price"}</span><strong>${escapeHtml(finalPrice)}</strong></div>
    ${order.customer_notes ? `<div class="tracked-notes"><h3>Your notes</h3><p>${escapeHtml(order.customer_notes)}</p></div>` : ""}
  </article>`;
  result.hidden = false;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.textContent = "";
  result.hidden = true;
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  submit.textContent = "Checking…";
  try {
    const orderNumber = form.elements.orderNumber.value.trim();
    const order = await trackCustomerOrder(orderNumber, form.elements.mobile.value);
    renderOrder(order, orderNumber);
  } catch (problem) {
    console.error("Unable to track order.", problem);
    error.textContent = problem.message || "Could not check the order. Verify your reference and contact number, then try again.";
  } finally {
    submit.disabled = false;
    submit.textContent = "Check status →";
  }
});

const params = new URLSearchParams(location.search);
if (params.has("order")) form.elements.orderNumber.value = params.get("order");
