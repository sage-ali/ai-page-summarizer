// All DOM writes go through this module. Never use innerHTML with user or API data.

export function setTextContent(element: HTMLElement, text: string): void {
  element.textContent = text;
}

export function createTextElement(tag: keyof HTMLElementTagNameMap, text: string): HTMLElement {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
}

export function clearElement(element: HTMLElement): void {
  while (element.firstChild !== null) {
    element.removeChild(element.firstChild);
  }
}
