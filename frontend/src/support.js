const messages = ["Buy me a coffee", "Buy me a beer", "Buy me a slice of pizza", "Keep me caffeinated", "Fuel my creative engine", "Drop a tip", "Tip jar", "Show some love", "Send a thank you", "Back this creator", "Feed the tip jar", "Become a patron"];

export function createSupportButton() {
  const support = document.createElement("aside");
  support.className = "study-support";
  support.setAttribute("aria-label", "Support these tools");
  const message = messages[Math.floor(Math.random() * messages.length)];
  support.innerHTML = `<form action="https://www.paypal.com/ncp/payment/BGUN4RBRVZKKJ" method="post" target="_blank" rel="noopener noreferrer"><button class="pp-BGUN4RBRVZKKJ" type="submit">${message}<img src="https://www.paypalobjects.com/paypal-ui/logos/svg/paypal-mark-color.svg" alt="PayPal"></button></form>`;
  return support;
}