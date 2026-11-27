export function mountSectionLinks(links) {
  for (const link of links) {
    link.addEventListener("click", (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const section = document.getElementById(link.hash.slice(1));
      if (!section) return;
      event.preventDefault();
      const heading = section.querySelector("h2, h3");
      heading.tabIndex = -1;
      section.scrollIntoView();
      heading.focus({ preventScroll: true });
    });
  }
}
