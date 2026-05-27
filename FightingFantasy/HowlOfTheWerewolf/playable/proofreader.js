(function () {
  "use strict";

  const data = window.GAMEBOOK_DATA || {};
  const sections = data.sections || {};
  const storageKey = "howl-of-the-werewolf-proofreader-state-v1";
  const state = loadState();
  let entries = [];

  const refs = {
    prevPageBtn: document.getElementById("prevPageBtn"),
    nextPageBtn: document.getElementById("nextPageBtn"),
    pageCount: document.getElementById("pageCount"),
    suspectCount: document.getElementById("suspectCount"),
    markedCount: document.getElementById("markedCount"),
    reviewedCount: document.getElementById("reviewedCount"),
    pageSearch: document.getElementById("pageSearch"),
    pageList: document.getElementById("pageList"),
    sourceKind: document.getElementById("sourceKind"),
    pageTitle: document.getElementById("pageTitle"),
    pageMeta: document.getElementById("pageMeta"),
    sourceBtn: document.getElementById("sourceBtn"),
    openPdfLink: document.getElementById("openPdfLink"),
    proofEditor: document.getElementById("proofEditor"),
    correctionInput: document.getElementById("correctionInput"),
    noteInput: document.getElementById("noteInput"),
    boldBtn: document.getElementById("boldBtn"),
    italicBtn: document.getElementById("italicBtn"),
    markBtn: document.getElementById("markBtn"),
    clearMarkBtn: document.getElementById("clearMarkBtn"),
    reviewedToggle: document.getElementById("reviewedToggle"),
    saveBtn: document.getElementById("saveBtn"),
    resetPageBtn: document.getElementById("resetPageBtn"),
    saveStatus: document.getElementById("saveStatus"),
    suspectList: document.getElementById("suspectList"),
    exportJsonBtn: document.getElementById("exportJsonBtn"),
    exportMarkdownBtn: document.getElementById("exportMarkdownBtn"),
    sourceView: document.getElementById("sourceView"),
    pdfPageNumber: document.getElementById("pdfPageNumber"),
    pdfFrame: document.getElementById("pdfFrame")
  };

  let currentIndex = 0;
  let saveTimer = null;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved && typeof saved === "object") {
        return {
          pages: saved.pages && typeof saved.pages === "object" ? saved.pages : {},
          filter: saved.filter || "all",
          showPdf: Boolean(saved.showPdf)
        };
      }
    } catch (error) {
      console.warn(error);
    }
    return { pages: {}, filter: "all", showPdf: false };
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function buildEntries() {
    const output = [];
    const introText = data.intro?.text || "";
    const introStartPage = Number.isInteger(data.intro?.page) ? data.intro.page : 1;
    splitSourcePages(introText).forEach((text, index) => {
      const cleaned = text.trim();
      if (!cleaned) return;
      const pdfPage = introStartPage + index;
      output.push(makeEntry({
        id: `intro-${index + 1}`,
        kind: index >= 6 ? "Background" : "Introduction",
        label: `Intro ${index + 1}`,
        title: index >= 6 ? `Background Page ${index - 5}` : `Introduction Page ${index + 1}`,
        pdfPage,
        sourceCount: 0,
        text: cleaned
      }));
    });

    const grouped = new Map();
    Object.values(sections)
      .filter((section) => section && Number.isInteger(section.page) && Number.isInteger(section.number))
      .sort((a, b) => a.page - b.page || a.number - b.number)
      .forEach((section) => {
        const group = grouped.get(section.page) || [];
        group.push(section);
        grouped.set(section.page, group);
      });

    for (const [pdfPage, pageSections] of grouped) {
      const text = pageSections
        .map((section) => `SECTION ${section.number}\n${section.text || ""}`.trim())
        .join("\n\n");
      output.push(makeEntry({
        id: `pdf-${pdfPage}`,
        kind: "Adventure",
        label: `PDF ${pdfPage}`,
        title: `PDF Page ${pdfPage}`,
        pdfPage,
        sourceCount: pageSections.length,
        text
      }));
    }

    return output;
  }

  function makeEntry(entry) {
    return {
      ...entry,
      searchText: `${entry.label} ${entry.title} ${entry.kind} ${entry.text}`.toLowerCase(),
      suspects: findSuspects(entry.text)
    };
  }

  function splitSourcePages(text) {
    return String(text || "")
      .replace(/\r/g, "")
      .split(/\n\s*--- PAGE BREAK ---\s*\n/g);
  }

  const suspectRules = [
    {
      label: "OCR word",
      pattern: /\b(?:Jn|skiii|sKIL1|SKIL1|skILt|Adventire|rojled|roiled|piving|smal\]|mub|samt|skIL\.|tts|eppo-?\s*nent's|Bepin|AHtack|siart|Somehmes|ata|setile|Thay|Lising|Lueky|alwaya|deducl|Tf|nornal|anly|bry|austain|Unducky|Hime|favows|curtent|TesHig|Skil|Stoming|poimts|enpaped|batile|awn|appropniate|mstructs|occasianally|nole|Adwatare|translormation|cannol|atmour|olher|lanicm|Aditeuiire|YOUT|qurst|slopping|ona|ordy|lotal|thenext|zoobs|hape|arumal|raang|Jean|gfey|Jow|ther|lps|ciled|Gght|beretfytngly|pourice|Camivale|vour|vou|lhe|ihe|thal|beasl|turow|grume|chau|wamior|bedy|Crudus|dreular)\b/gi
    },
    {
      label: "Unexpected glyph",
      pattern: /[\u00a7\u00a9\u00c2\u00c3\u00ef\u00bf\u00bd@#]/g
    },
    {
      label: "Digit inside word",
      pattern: /\b(?:[A-Za-z]+[0-9][A-Za-z]*|[A-Za-z]*[0-9][A-Za-z]+)\b/g
    },
    {
      label: "Possible missing sentence break",
      pattern: /\b(?:attributes|adventures|below|Sheet|Strength|section|character|time|separately|disastrous|penalised|Luck|favour|again|darkness|fingers|life|real|night)\s+(?=(?:You|Enter|Roll|If|Then|The|This|Your|Although|Sometimes|When|Of|At|But|In|Growling|Suddenly|A)\b)/g
    },
    {
      label: "Comma may be full stop",
      pattern: /,\s+(?=(?:You|Divide|As|Pushing|The|Your|This)\b)/g
    },
    {
      label: "Unclosed parenthesis",
      pattern: /\([^)\n]{28,}(?=$|\n)/gm
    },
    {
      label: "Page residue",
      pattern: /^(?:[=_'"`., |\\/()%#;:a-z0-9-]{10,})$/gim
    }
  ];

  function findSuspects(text) {
    const ranges = [];
    for (const rule of suspectRules) {
      const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
      for (const match of String(text || "").matchAll(pattern)) {
        const value = match[0];
        if (!value || match.index === undefined) continue;
        if (rule.label === "Page residue" && /[A-Z]/.test(value)) continue;
        ranges.push({
          start: match.index,
          end: match.index + value.length,
          label: rule.label,
          text: value.replace(/\s+/g, " ").trim()
        });
      }
    }

    ranges.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    const accepted = [];
    for (const range of ranges) {
      if (accepted.some((item) => rangesOverlap(item, range))) continue;
      accepted.push(range);
    }
    return accepted;
  }

  function rangesOverlap(a, b) {
    return a.start < b.end && b.start < a.end;
  }

  function initialIndex() {
    const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
    const hashIndex = entries.findIndex((entry) => entry.id === hash);
    return hashIndex >= 0 ? hashIndex : 0;
  }

  function currentEntry() {
    return entries[currentIndex] || entries[0];
  }

  function pageState(entry = currentEntry()) {
    if (!state.pages[entry.id]) {
      state.pages[entry.id] = {};
    }
    return state.pages[entry.id];
  }

  function generatedHtml(entry) {
    const suspects = entry.suspects;
    let html = "";
    let cursor = 0;

    for (const suspect of suspects) {
      html += escapeHtml(entry.text.slice(cursor, suspect.start));
      html += `<span class="auto-suspect" data-reason="${escapeHtml(suspect.label)}" title="${escapeHtml(suspect.label)}">${escapeHtml(entry.text.slice(suspect.start, suspect.end))}</span>`;
      cursor = suspect.end;
    }

    html += escapeHtml(entry.text.slice(cursor));
    return html;
  }

  function render() {
    const entry = currentEntry();
    const saved = pageState(entry);

    refs.sourceKind.textContent = entry.kind;
    refs.pageTitle.textContent = entry.title;
    refs.pageMeta.textContent = pageMeta(entry);
    refs.pdfPageNumber.textContent = entry.pdfPage;
    refs.openPdfLink.href = sourceUrl(entry);
    refs.proofEditor.innerHTML = saved.html || generatedHtml(entry);
    refs.reviewedToggle.checked = Boolean(saved.reviewed);
    refs.prevPageBtn.disabled = currentIndex <= 0;
    refs.nextPageBtn.disabled = currentIndex >= entries.length - 1;
    refs.correctionInput.value = "";
    refs.noteInput.value = "";

    renderSourcePanel();
    renderPageList();
    renderSummary();
    renderSuspectList();
    setActiveFilter();
    setStatus("Ready");
  }

  function pageMeta(entry) {
    const source = entry.sourceCount ? `${entry.sourceCount} sections` : "source text";
    return `PDF page ${entry.pdfPage} | ${source} | ${entry.suspects.length} automatic flags`;
  }

  function sourceUrl(entry = currentEntry()) {
    return `${data.sourcePdf || ""}#page=${entry.pdfPage || 1}`;
  }

  function renderSourcePanel() {
    refs.sourceView.classList.toggle("is-open", state.showPdf);
    refs.sourceBtn.textContent = state.showPdf ? "Hide PDF" : "Show PDF";
    refs.sourceBtn.setAttribute("aria-expanded", String(state.showPdf));

    if (state.showPdf) {
      refs.pdfFrame.src = sourceUrl();
    } else {
      refs.pdfFrame.removeAttribute("src");
    }
  }

  function renderSummary() {
    const reviewed = entries.filter((entry) => Boolean(state.pages[entry.id]?.reviewed)).length;
    const marked = entries.reduce((sum, entry) => sum + humanMarkCount(entry), 0);
    const suspects = entries.reduce((sum, entry) => sum + entry.suspects.length, 0);
    refs.pageCount.value = `${entries.length} pages`;
    refs.suspectCount.value = `${suspects} suspects`;
    refs.markedCount.value = `${marked} marked`;
    refs.reviewedCount.value = `${reviewed} reviewed`;
  }

  function renderPageList() {
    refs.pageList.innerHTML = "";
    const visible = filteredEntries();

    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "empty-text";
      empty.textContent = "No pages";
      refs.pageList.append(empty);
      return;
    }

    for (const { entry, index } of visible) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `proof-page-button${index === currentIndex ? " is-active" : ""}`;
      button.dataset.index = String(index);
      const marked = humanMarkCount(entry);
      const reviewed = state.pages[entry.id]?.reviewed ? "reviewed" : "open";
      button.innerHTML = `<strong>${escapeHtml(entry.label)}</strong><span>${entry.suspects.length} auto / ${marked} marked / ${reviewed}</span>`;
      refs.pageList.append(button);
    }
  }

  function filteredEntries() {
    const query = refs.pageSearch.value.trim().toLowerCase();
    return entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => {
        if (query && !entry.searchText.includes(query)) return false;
        if (state.filter === "suspects") return entry.suspects.length > 0;
        if (state.filter === "marked") return humanMarkCount(entry) > 0;
        if (state.filter === "reviewed") return Boolean(state.pages[entry.id]?.reviewed);
        return true;
      });
  }

  function setActiveFilter() {
    document.querySelectorAll("[data-filter]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.filter === state.filter);
    });
  }

  function renderSuspectList() {
    refs.suspectList.innerHTML = "";
    const suspects = Array.from(refs.proofEditor.querySelectorAll(".auto-suspect"));
    const humanMarks = Array.from(refs.proofEditor.querySelectorAll(".human-mark"));

    if (!suspects.length && !humanMarks.length) {
      const empty = document.createElement("div");
      empty.className = "empty-text";
      empty.textContent = "No flags";
      refs.suspectList.append(empty);
      return;
    }

    humanMarks.forEach((mark, index) => {
      refs.suspectList.append(flagButton({
        index,
        type: "human",
        label: "Human mark",
        text: mark.textContent,
        note: mark.dataset.correction || mark.dataset.note || ""
      }));
    });

    suspects.slice(0, 90).forEach((suspect, index) => {
      refs.suspectList.append(flagButton({
        index,
        type: "auto",
        label: suspect.dataset.reason || "Automatic flag",
        text: suspect.textContent,
        note: ""
      }));
    });
  }

  function flagButton(flag) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "proof-suspect-button";
    button.dataset.flagType = flag.type;
    button.dataset.flagIndex = String(flag.index);
    const note = flag.note ? ` | ${flag.note}` : "";
    button.innerHTML = `<strong>${escapeHtml(flag.label)}</strong><span>${escapeHtml(truncate(flag.text, 60) + note)}</span>`;
    return button;
  }

  function persistCurrentPage() {
    const entry = currentEntry();
    const saved = pageState(entry);
    saved.html = refs.proofEditor.innerHTML;
    saved.text = refs.proofEditor.innerText;
    saved.reviewed = refs.reviewedToggle.checked;
    saved.updatedAt = new Date().toISOString();
    saveState();
    renderSummary();
    renderPageList();
    renderSuspectList();
    setStatus("Saved");
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    setStatus("Editing");
    saveTimer = setTimeout(persistCurrentPage, 400);
  }

  function setStatus(text) {
    refs.saveStatus.value = text;
  }

  function gotoIndex(index) {
    if (index < 0 || index >= entries.length || index === currentIndex) return;
    persistCurrentPage();
    currentIndex = index;
    location.hash = entries[currentIndex].id;
    render();
  }

  function markSelection() {
    const range = editorRange();
    if (!range || range.collapsed) return;

    const mark = document.createElement("mark");
    mark.className = "human-mark";
    const correction = refs.correctionInput.value.trim();
    const note = refs.noteInput.value.trim();
    if (correction) mark.dataset.correction = correction;
    if (note) mark.dataset.note = note;
    if (correction || note) mark.title = [correction, note].filter(Boolean).join(" | ");

    mark.append(range.extractContents());
    range.insertNode(mark);
    window.getSelection().removeAllRanges();
    refs.correctionInput.value = "";
    refs.noteInput.value = "";
    persistCurrentPage();
  }

  function clearSelectedMarks() {
    const marks = selectedHumanMarks();
    if (!marks.length) return;

    for (const mark of marks) {
      const parent = mark.parentNode;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
    }
    persistCurrentPage();
  }

  function selectedHumanMarks() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return [];
    const range = selection.getRangeAt(0);
    if (!refs.proofEditor.contains(range.commonAncestorContainer)) return [];

    if (range.collapsed) {
      const element = range.startContainer.nodeType === Node.ELEMENT_NODE
        ? range.startContainer
        : range.startContainer.parentElement;
      const mark = element?.closest?.(".human-mark");
      return mark && refs.proofEditor.contains(mark) ? [mark] : [];
    }

    return Array.from(refs.proofEditor.querySelectorAll(".human-mark"))
      .filter((mark) => range.intersectsNode(mark));
  }

  function editorRange() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    return refs.proofEditor.contains(range.commonAncestorContainer) ? range : null;
  }

  function focusFlag(type, index) {
    const selector = type === "human" ? ".human-mark" : ".auto-suspect";
    const element = refs.proofEditor.querySelectorAll(selector)[index];
    if (!element) return;
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    element.classList.add("is-focused");
    setTimeout(() => element.classList.remove("is-focused"), 1200);
  }

  function resetCurrentPage() {
    const entry = currentEntry();
    if (!window.confirm(`Reset ${entry.title}?`)) return;
    delete state.pages[entry.id];
    saveState();
    render();
  }

  function collectReview() {
    return {
      title: data.title || "Howl of the Werewolf",
      exportedAt: new Date().toISOString(),
      pages: entries
        .map((entry) => {
          const saved = state.pages[entry.id];
          if (!saved) return null;

          const div = document.createElement("div");
          div.innerHTML = saved.html || "";
          const marks = Array.from(div.querySelectorAll(".human-mark")).map((mark, index) => ({
            index: index + 1,
            text: mark.textContent.replace(/\s+/g, " ").trim(),
            correction: mark.dataset.correction || "",
            note: mark.dataset.note || ""
          }));

          const editedText = div.innerText || div.textContent || "";
          const hasEditedText = editedText.trim() && normalizeSpaces(editedText) !== normalizeSpaces(entry.text);
          if (!marks.length && !saved.reviewed && !hasEditedText) return null;

          return {
            id: entry.id,
            title: entry.title,
            kind: entry.kind,
            pdfPage: entry.pdfPage,
            reviewed: Boolean(saved.reviewed),
            updatedAt: saved.updatedAt || "",
            marks,
            editedText: hasEditedText ? editedText : ""
          };
        })
        .filter(Boolean)
    };
  }

  function exportJson() {
    const review = collectReview();
    downloadFile("howl-proofreading-review.json", "application/json", `${JSON.stringify(review, null, 2)}\n`);
  }

  function exportMarkdown() {
    const review = collectReview();
    const lines = [
      `# ${review.title} Proofreading Review`,
      "",
      `Exported: ${review.exportedAt}`,
      ""
    ];

    for (const page of review.pages) {
      lines.push(`## ${page.title}`);
      lines.push("");
      lines.push(`PDF page: ${page.pdfPage}`);
      lines.push(`Status: ${page.reviewed ? "reviewed" : "open"}`);
      lines.push("");

      if (page.marks.length) {
        for (const mark of page.marks) {
          const correction = mark.correction ? ` -> ${mark.correction}` : "";
          const note = mark.note ? ` (${mark.note})` : "";
          lines.push(`- ${mark.text}${correction}${note}`);
        }
        lines.push("");
      }

      if (page.editedText) {
        lines.push("```text");
        lines.push(page.editedText.trim());
        lines.push("```");
        lines.push("");
      }
    }

    downloadFile("howl-proofreading-review.md", "text/markdown", `${lines.join("\n").trim()}\n`);
  }

  function downloadFile(name, type, contents) {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function humanMarkCount(entry) {
    const html = state.pages[entry.id]?.html;
    if (!html) return 0;
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.querySelectorAll(".human-mark").length;
  }

  function normalizeSpaces(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function truncate(value, length) {
    const text = normalizeSpaces(value);
    return text.length > length ? `${text.slice(0, length - 3)}...` : text;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  refs.prevPageBtn.addEventListener("click", () => gotoIndex(currentIndex - 1));
  refs.nextPageBtn.addEventListener("click", () => gotoIndex(currentIndex + 1));

  refs.pageList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-index]");
    if (!button) return;
    gotoIndex(Number.parseInt(button.dataset.index, 10));
  });

  refs.pageSearch.addEventListener("input", renderPageList);

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      saveState();
      renderPageList();
      setActiveFilter();
    });
  });

  refs.sourceBtn.addEventListener("click", () => {
    state.showPdf = !state.showPdf;
    saveState();
    renderSourcePanel();
  });

  refs.proofEditor.addEventListener("input", scheduleSave);
  refs.saveBtn.addEventListener("click", persistCurrentPage);
  refs.reviewedToggle.addEventListener("change", persistCurrentPage);
  refs.resetPageBtn.addEventListener("click", resetCurrentPage);
  refs.markBtn.addEventListener("click", markSelection);
  refs.clearMarkBtn.addEventListener("click", clearSelectedMarks);
  refs.boldBtn.addEventListener("click", () => document.execCommand("bold"));
  refs.italicBtn.addEventListener("click", () => document.execCommand("italic"));
  refs.exportJsonBtn.addEventListener("click", exportJson);
  refs.exportMarkdownBtn.addEventListener("click", exportMarkdown);

  refs.suspectList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-flag-type]");
    if (!button) return;
    focusFlag(button.dataset.flagType, Number.parseInt(button.dataset.flagIndex, 10));
  });

  window.addEventListener("hashchange", () => {
    const nextIndex = initialIndex();
    if (nextIndex !== currentIndex) {
      persistCurrentPage();
      currentIndex = nextIndex;
      render();
    }
  });

  entries = buildEntries();
  currentIndex = initialIndex();
  render();
})();
