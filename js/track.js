import { trackCustomerOrder } from "./supabase.js";

const statuses = ["Received", "Payment Checking", "Paid", "Printing", "Ready for Pickup", "Completed"];
const form = document.querySelector("#track-form");
const error = document.querySelector("#track-error");
const result = document.querySelector("#track-result");

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.textContent = "";
  result.hidden = true;
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  submit.textContent = "Checking…";
  try {
    const order = await trackCustomerOrder(form.elements.orderNumber.value, form.elements.mobile.value);
    const current = statuses.indexOf(order.status);
    result.innerHTML = `<div class="tracked-card"><p class="eyebrow">Order ${escapeHtml(order.order_number || form.elements.orderNumber.value.trim())}</p><h2>${escapeHtml(order.status || "Received")}</h2><ol class="status-timeline" aria-label="Order progress">${statuses.map((status, index) => `<li class="${index <= Math.max(current, 0) ? "done" : ""} ${index === current ? "current" : ""}"><span>${index + 1}</span>${escapeHtml(status)}</li>`).join("")}</ol></div>`;
    result.hidden = false;
  } catch (err) {
    console.error("Unable to track order.", err);
    error.textContent = err.message || "Could not check the order. Please verify the details and try again.";
  } finally {
    submit.disabled = false;
    submit.textContent = "Check status →";
  }
});

const params = new URLSearchParams(location.search);
if (params.has("order")) form.elements.orderNumber.value = params.get("order");
