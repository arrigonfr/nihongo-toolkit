/// <reference types="vite/client" />

declare const process: {
  env: Record<string, string | undefined>;
  on?(event: string, listener: (...args: any[]) => void): void;
};

interface CacheStorage {
  default?: Cache;
}

interface Error {
  status?: number;
}

interface Window {
  turnstile?: {
    render(container: Element | string, options: Record<string, any>): string;
    reset(widgetId?: string): void;
  };
}

interface HTMLElement {
  chipsApi?: { sync(): void; current?: () => any; codec?: any };
  value?: any;
  disabled?: boolean;
  checked?: boolean;
  open?: boolean;
  type?: string;
  href?: string;
  src?: string;
  selected?: boolean;
  options?: HTMLOptionsCollection;
  elements?: HTMLFormControlsCollection & Record<string, any>;
  selectionStart?: number | null;
  selectionEnd?: number | null;
  showModal?(): void;
  close?(returnValue?: string): void;
  reset?(): void;
  checkValidity?(): boolean;
  reportValidity?(): boolean;
  setSelectionRange?(start: number | null, end: number | null): void;
  select?(): void;
  add?(element: HTMLOptionElement | HTMLOptGroupElement, before?: HTMLElement | number | null): void;
  contentWindow?: Window | null;
  contentDocument?: Document | null;
  decode?(): Promise<void>;
  getContext?(contextId: string, options?: any): any;
  toBlob?(callback: BlobCallback, type?: string, quality?: any): void;
  files?: FileList | null;
}

interface Element {
  readonly dataset: DOMStringMap;
  hidden: any;
  lang: string;
  title: string;
  content?: string;
  value?: any;
  disabled?: boolean;
  checked?: boolean;
  open?: boolean;
  type?: string;
  href?: string;
  alt?: string;
  tabIndex: number;
  options?: HTMLOptionsCollection;
  labels?: NodeListOf<HTMLLabelElement> | null;
  selectionStart?: number | null;
  selectionEnd?: number | null;
  readonly offsetTop: number;
  readonly offsetLeft: number;
  readonly offsetWidth: number;
  readonly offsetHeight: number;
  onclick: any;
  focus(options?: FocusOptions): void;
  click(): void;
  showModal?(): void;
  close?(returnValue?: string): void;
  checkValidity?(): boolean;
  setSelectionRange?(start: number | null, end: number | null): void;
  add?(element: HTMLOptionElement | HTMLOptGroupElement, before?: HTMLElement | number | null): void;
  chipsApi?: { sync(): void; current?: () => any; codec?: any };
}

interface HTMLFormControlsCollection {
  [name: string]: any;
}

interface EventTarget {
  closest?(selectors: string): Element | null;
  matches?(selectors: string): boolean;
  dataset?: DOMStringMap;
  value?: any;
  valueAsNumber?: number;
  checked?: boolean;
  disabled?: boolean;
  type?: string;
  id?: string;
  tagName?: string;
  name?: string;
  files?: FileList | null;
  textContent?: string | null;
  isConnected?: boolean;
  isContentEditable?: boolean;
  checkValidity?(): boolean;
  getAttribute?(qualifiedName: string): string | null;
  setAttribute?(qualifiedName: string, value: string): void;
}

interface Event {
  detail?: any;
  key?: string;
  isComposing?: boolean;
}
