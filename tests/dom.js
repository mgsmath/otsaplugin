/* Minimal DOM stub — just enough for the plugin's renderers to run under Node.
 *
 * This is a test double, not a browser. It records the tree so tests can assert
 * on structure, and it deliberately does NOT implement innerHTML: the plugin's
 * renderers must build nodes, and a missing innerHTML makes any accidental use
 * throw instead of silently working.
 */
'use strict';

/** data-index ←→ index, in both directions, as the DOM reflects it. */
function dataAttribute(key) {
  return 'data-' + String(key).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}
function datasetKey(attribute) {
  return attribute.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

class ClassList {
  constructor(el) {
    this.el = el;
    this.set = new Set();
  }
  add(...names) {
    names.forEach((n) => n && this.set.add(n));
  }
  remove(...names) {
    names.forEach((n) => this.set.delete(n));
  }
  contains(n) {
    return this.set.has(n);
  }
  toggle(n, force) {
    const on = force === undefined ? !this.set.has(n) : !!force;
    if (on) this.set.add(n);
    else this.set.delete(n);
    return on;
  }
  toString() {
    return [...this.set].join(' ');
  }
}

class Node {
  constructor(tag) {
    this.tagName = String(tag || '').toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this.attributes = {};
    // A real element's dataset *is* its data-* attributes in both directions:
    // `el.dataset.index = 3` makes `[data-index="3"]` match, which is how the
    // plugin scrolls to a passage. A plain object here would hide that.
    this.dataset = new Proxy(
      {},
      {
        get: (_, key) => (typeof key === 'string' ? this.attributes[dataAttribute(key)] : undefined),
        set: (_, key, value) => {
          if (typeof key === 'string') this.attributes[dataAttribute(key)] = String(value);
          return true;
        },
        has: (_, key) => typeof key === 'string' && dataAttribute(key) in this.attributes,
        deleteProperty: (_, key) => {
          if (typeof key === 'string') delete this.attributes[dataAttribute(key)];
          return true;
        },
        ownKeys: () =>
          Object.keys(this.attributes)
            .filter((k) => k.startsWith('data-'))
            .map(datasetKey),
        getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
      }
    );
    this.listeners = {};
    this.style = { setProperty() {}, removeProperty() {} };
    this._classList = new ClassList(this);
    this._text = '';
  }
  get className() {
    return this._classList.toString();
  }
  set className(v) {
    this._classList = new ClassList(this);
    String(v || '')
      .split(/\s+/)
      .filter(Boolean)
      .forEach((n) => this._classList.add(n));
  }
  get classList() {
    return this._classList;
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
  }
  getAttribute(k) {
    return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null;
  }
  removeAttribute(k) {
    delete this.attributes[k];
  }
  appendChild(child) {
    if (!child) throw new Error('appendChild(null)');
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  insertBefore(child, ref) {
    child.parentNode = this;
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) this.childNodes.push(child);
    else this.childNodes.splice(i, 0, child);
    return child;
  }
  get firstChild() {
    return this.childNodes[0] || null;
  }
  get children() {
    return this.childNodes.filter((n) => n instanceof Node && n.tagName);
  }
  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  }
  dispatch(type, ev) {
    (this.listeners[type] || []).forEach((fn) => fn(ev || { preventDefault() {}, target: this }));
  }
  set textContent(v) {
    this.childNodes = [];
    this._text = v === null || v === undefined ? '' : String(v);
  }
  get textContent() {
    if (this.childNodes.length === 0) return this._text;
    return this.childNodes.map((n) => n.textContent).join('');
  }
  set innerHTML(v) {
    throw new Error('innerHTML must not be used — build nodes instead');
  }
  get innerHTML() {
    throw new Error('innerHTML must not be used');
  }
  querySelectorAll(selector) {
    const out = [];
    const match = (el) => {
      if (selector.startsWith('.')) return el.classList.contains(selector.slice(1));
      if (selector.startsWith('[') && selector.endsWith(']')) {
        const inner = selector.slice(1, -1);
        const eq = inner.indexOf('=');
        if (eq < 0) return el.getAttribute(inner) !== null;
        const name = inner.slice(0, eq);
        const val = inner.slice(eq + 1).replace(/^["']|["']$/g, '');
        return el.getAttribute(name) === val;
      }
      return el.tagName === selector.toUpperCase();
    };
    const walk = (el) => {
      el.childNodes.forEach((c) => {
        if (c instanceof Node && c.tagName) {
          if (match(c)) out.push(c);
          walk(c);
        }
      });
    };
    walk(this);
    return out;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  scrollIntoView() {}
  /** Serialise the subtree, for readable failure messages. */
  dump(depth) {
    depth = depth || 0;
    const pad = '  '.repeat(depth);
    const attrs = Object.keys(this.attributes)
      .map((k) => ` ${k}="${this.attributes[k]}"`)
      .join('');
    const cls = this.className ? ` class="${this.className}"` : '';
    const kids = this.childNodes.filter((n) => n instanceof Node && n.tagName);
    if (!kids.length) return `${pad}<${this.tagName.toLowerCase()}${cls}${attrs}>${this.textContent}\n`;
    let s = `${pad}<${this.tagName.toLowerCase()}${cls}${attrs}>\n`;
    kids.forEach((k) => (s += k.dump(depth + 1)));
    return s;
  }
}

class TextNode {
  constructor(text) {
    this.data = String(text);
    this.childNodes = [];
    this.parentNode = null;
  }
  get textContent() {
    return this.data;
  }
  set textContent(v) {
    this.data = String(v);
  }
  get tagName() {
    return null;
  }
}

function makeDocument() {
  const doc = {
    documentElement: new Node('html'),
    head: new Node('head'),
    body: new Node('body'),
    _byId: {},
    createElement(tag) {
      return new Node(tag);
    },
    createTextNode(text) {
      return new TextNode(text);
    },
    getElementById(id) {
      if (doc._byId[id]) return doc._byId[id];
      // Elements the plugin creates and gives an id to are found in the tree.
      const find = (node) => {
        if (!node || !node.childNodes) return null;
        for (const child of node.childNodes) {
          if (child instanceof Node && child.getAttribute('id') === id) return child;
          const hit = child instanceof Node ? find(child) : null;
          if (hit) return hit;
        }
        return null;
      };
      return find(doc.body);
    },
    register(id, node) {
      node.setAttribute('id', id);
      doc._byId[id] = node;
      return node;
    },
    querySelectorAll(sel) {
      // Search the registered fixtures, which is all the plugin touches.
      const out = [];
      Object.values(doc._byId).forEach((n) => {
        if (sel.startsWith('.')) {
          if (n.classList.contains(sel.slice(1))) out.push(n);
          out.push(...n.querySelectorAll(sel));
        }
      });
      return out;
    },
  };
  doc.body.appendChild(doc.head);
  return doc;
}

/** The element ids index.html provides. */
function makeFixture() {
  const document = makeDocument();
  const ids = [
    'bar-title',
    'bar-subtitle',
    'topbar-actions',
    'btn-reader',
    'btn-follow',
    'btn-options',
    'page-tabs',
    'view-tabs',
    'app-content',
    'notice',
    'status',
    'render-host',
    'scrim',
    'panel-options',
    'panel-close',
    'pack-info',
    'opt-split-default',
    'opt-numbers',
    'opt-order',
    'opt-import',
    'opt-bundled',
  ];
  // Created by the plugin itself (see js/app.js bindChrome): found by searching the tree.
  ids.forEach((id) => {
    const tag = id === 'opt-order'
      ? 'select'
      : id === 'opt-numbers' || id === 'opt-split-default'
        ? 'input'
        : 'div';
    const node = document.register(id, new Node(tag));
    document.body.appendChild(node);
  });
  return { document, Node, TextNode };
}

module.exports = { makeDocument, makeFixture, Node, TextNode, ClassList };
