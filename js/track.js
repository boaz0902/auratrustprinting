import { trackCustomerOrder } from "./firebase.js";

const statuses = ["Received","Payment Checking","Paid","Printing","Ready for Pickup","Completed"];
const form = document.querySelector("#track-form");
const error = document.querySelector("#track-error");
const result = document.querySelector("#track-result");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.textContent = "";
  result.hidden = true;
  try {
    const order = await trackCustomerOrder(form.elements.orderNumber.value, form.elements.mobile.value);
    const current = statuses.includes(order.status) ? statuses.indexOf(order.status) : 0;
    result.innerHTML = `<div class="tracked-card"><p class="eyebrow">Order ${String(order.orderNumber).replace(/[<>]/g,"")}</p><h2>${order.status || "Received"}</h2><ol class="status-timeline">${statuses.map((status,index)=>`<li class="${index <= current ? "done":""} ${index === current ? "current":""}"><span>${index + 1}</span>${status}</li>`).join("")}</ol></div>`;
    result.hidden = false;
  } catch (err) {
    error.textContent = err.message;
  }
});

const params = new URLSearchParams(location.search);
if (params.has("order")) form.elements.orderNumber.value = params.get("order");
