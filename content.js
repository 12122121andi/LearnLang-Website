// file: translator-fix.js
// Fixes: preserve exact whitespace when merging/restoring clusters; fully reconstruct original nodes on restore

// ---------- Helpers ----------
function isWhitespace(node) {
  return node && node.nodeType === Node.TEXT_NODE && /^\s+$/.test(node.nodeValue);
}

function isWordEl(node) {
  return node && node.nodeType === Node.ELEMENT_NODE && node.classList?.contains("word");
}

function getNodesBetween(start, end) {
  const nodes = [];
  let n = start;
  while (n) {
    nodes.push(n);
    if (n === end) break;
    n = n.nextSibling;
  }
  return nodes;
}

function getTextBetween(start, end) {
  const nodes = getNodesBetween(start, end);
  const parts = nodes.map(n => {
    if (isWordEl(n)) return n.dataset.original ?? n.textContent;
    if (n.nodeType === Node.TEXT_NODE) return n.nodeValue;
    return n.textContent;
  });
  return parts.join("");
}

function replaceRangeWithFragment(start, end, frag) {
  const parent = start.parentNode;
  const after = end.nextSibling;
  let n = start;
  while (n && n !== after) {
    const next = n.nextSibling;
    n.remove();
    n = next;
  }
  parent.insertBefore(frag, after);
}

// ---------- Node wrapping ----------
function wrapWords(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.nodeValue;
    if (!text.trim()) return;

    const frag = document.createDocumentFragment();
    const parts = text.split(/(\s+)/);

    parts.forEach(part => {
      if (part === "") return;
      if (/\s+/.test(part)) {
        frag.appendChild(document.createTextNode(part));
      } else {
        const span = document.createElement("span");
        span.className = "word";
        span.textContent = part;
        span.dataset.original = part;
        frag.appendChild(span);
      }
    });

    node.replaceWith(frag);
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    if (["SCRIPT", "STYLE"].includes(node.tagName)) return;
    Array.from(node.childNodes).forEach(wrapWords);
  }
}

// ---------- Cluster collection ----------
function collectCluster(span, mode) {
  const includeNeighbor = (el) => isWordEl(el) && el.classList.contains("translated");

  const left = [];
  let n = span.previousSibling;
  while (n) {
    if (isWhitespace(n)) {
      left.push(n);
      n = n.previousSibling;
      continue;
    }
    if ((mode === "translate" || mode === "restore") && includeNeighbor(n)) {
      left.push(n);
      n = n.previousSibling;
      continue;
    }
    break;
  }

  const right = [];
  n = span.nextSibling;
  while (n) {
    if (isWhitespace(n)) {
      right.push(n);
      n = n.nextSibling;
      continue;
    }
    if ((mode === "translate" || mode === "restore") && includeNeighbor(n)) {
      right.push(n);
      n = n.nextSibling;
      continue;
    }
    break;
  }

  const leftWords = left.filter(isWordEl).reverse();
  const leftSpaces = left.filter(isWhitespace).reverse();
  const rightWords = right.filter(isWordEl);
  const rightSpaces = right.filter(isWhitespace);

  return {
    words: [...leftWords, span, ...rightWords],
    spaces: [...leftSpaces, ...rightSpaces]
  };
}

// ---------- Actions ----------

async function translateCluster(span) {
  const { words, spaces } = collectCluster(span, "translate");
  if (words.some(w => w.dataset.busy === "true")) return;

  const base = words[0];
  base.dataset.busy = "true";

  try {
    const end = words.at(-1);
    const combinedOriginal = getTextBetween(base, end);

    const res = await fetch("https://lucky-laser-ka-easier.trycloudflare.com/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: combinedOriginal, lang: "fr" })
    });
    const data = await res.json();

    const nodes = getNodesBetween(base, end);
    for (let i = 1; i < nodes.length; i++) {
      const node = nodes[i];
      if (node && node.parentNode) node.remove();
    }

    base.dataset.original = combinedOriginal;
    base.dataset.translation = data.message ?? "";
    // Show translation first, then the original (arrow points to original)
    base.textContent = `${data.message ?? ""} ← ${combinedOriginal}`;
    base.classList.add("translated");
  } catch (err) {
    console.error("Translation error:", err);
  } finally {
    base.dataset.busy = "false";
  }
}

function restoreCluster(span) {
  const { words } = collectCluster(span, "restore");
  if (words.some(w => w.dataset.busy === "true")) return;

  const start = words[0];
  const end = words.at(-1);
  start.dataset.busy = "true";

  try {
    const combinedOriginal = getTextBetween(start, end);

    const frag = document.createDocumentFragment();
    const parts = combinedOriginal.split(/(\s+)/);
    parts.forEach(part => {
      if (part === "") return;
      if (/\s+/.test(part)) {
        frag.appendChild(document.createTextNode(part));
      } else {
        const s = document.createElement("span");
        s.className = "word";
        s.textContent = part;
        s.dataset.original = part;
        setupWordEvents(s);
        frag.appendChild(s);
      }
    });

    replaceRangeWithFragment(start, end, frag);
  } catch (err) {
    console.error("Restore error:", err);
  } finally {
    const maybeWord = start.previousSibling && isWordEl(start.previousSibling) ? start.previousSibling : (start.nextSibling && isWordEl(start.nextSibling) ? start.nextSibling : null);
    if (maybeWord) maybeWord.dataset.busy = "false";
  }
}

// ---------- Events ----------

async function toggleTranslation(span) {
  if (span.dataset.busy === "true") return;
  if (!span.classList.contains("translated")) {
    await translateCluster(span);
  } else {
    restoreCluster(span);
  }
}

function setupWordEvents(span) {
  span.addEventListener("click", () => toggleTranslation(span));
}

function initTranslator() {
  wrapWords(document.body);
  document.querySelectorAll(".word").forEach(setupWordEvents);
}

// Auto-start
initTranslator();
