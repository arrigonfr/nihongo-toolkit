import { setHTML } from "./html.js";

const messages = ["Coffee?", "Pizza?", "Sushi?", "Beer?", "Tip?", "Thanks"];

export function createSupportButton() {
  const support = document.createElement("aside");
  support.className = "study-support";
  support.setAttribute("aria-label", "Support these tools");
  const message = messages[Math.floor(Math.random() * messages.length)];
  setHTML(
    support,
    `<form action="https://www.paypal.com/ncp/payment/BGUN4RBRVZKKJ" method="post" target="_blank" rel="noopener noreferrer"><button class="pp-BGUN4RBRVZKKJ" type="submit">${message}<img src="https://www.paypalobjects.com/paypal-ui/logos/svg/paypal-mark-color.svg" alt="PayPal"></button></form>`,
  );
  return support;
}
