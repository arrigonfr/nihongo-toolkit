// Legacy flows accept confirmations; dedicated dialog tests exercise each choice.
export async function acceptStudyDialogs(page) {
  await page.addInitScript(() => {
    new MutationObserver(() => {
      document.querySelectorAll(".study-confirm-dialog[open]").forEach((dialog) => {
        dialog.querySelector(".study-pills button:nth-child(2)")?.click();
      });
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
  });
}

export function toolPage(page) {
  return page;
}
