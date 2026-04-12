(() => {
  const meta = window.__CHAT_VIEWER_META__;
  const chunkStore = window.__CHAT_VIEWER_CHUNKS__ = window.__CHAT_VIEWER_CHUNKS__ || {};
  const searchMonthStore = window.__CHAT_VIEWER_SEARCH_MONTHS__ = window.__CHAT_VIEWER_SEARCH_MONTHS__ || {};
  const chunkPromises = new Map();
  const searchMonthPromises = new Map();
  const DISPLAY_ME = "可爱飞飞";
  const DISPLAY_OTHER = "可爱白白";
  const state = {
    loadedChunks: new Set(),
    renderedChunks: [],
    highlightedId: null,
    searchTimer: null,
    activeType: "",
    scrollTicking: false,
    loadingPrev: false,
    loadingNext: false,
    activeAudio: null,
    activeAudioUi: null,
    searchRunId: 0,
  };

  const el = {
    title: document.getElementById("chatTitle"),
    stats: document.getElementById("chatStats"),
    controlToggle: document.getElementById("controlToggle"),
    controlPanel: document.getElementById("controlPanel"),
    panelBackdrop: document.getElementById("panelBackdrop"),
    timelineWrapper: document.getElementById("timelineWrapper"),
    timeline: document.getElementById("timeline"),
    searchInput: document.getElementById("searchInput"),
    searchResults: document.getElementById("searchResults"),
    jumpDate: document.getElementById("jumpDate"),
    jumpDateBtn: document.getElementById("jumpDateBtn"),
    typePicker: document.getElementById("typePicker"),
    typeSummary: document.getElementById("typeSummary"),
    lightbox: document.getElementById("lightbox"),
    lightboxBody: document.getElementById("lightboxBody"),
    lightboxClose: document.getElementById("lightboxClose"),
  };

  function setupHeader() {
    el.title.textContent = "白白 & 飞飞";
    el.stats.textContent = `${meta.messageCount.toLocaleString()} 条消息 · ${meta.firstDay} 到 ${meta.lastDay}`;
    el.typeSummary.textContent = "当前显示全部消息";
  }

  function chunkSrc(chunkId) {
    return `viewer-data/chunks/chunk-${String(chunkId).padStart(4, "0")}.js`;
  }

  function searchMonthSrc(entry) {
    return `viewer-data/search/${entry.file}`;
  }

  function ensureChunk(chunkId) {
    if (chunkStore[chunkId]) return Promise.resolve(chunkStore[chunkId]);
    if (chunkPromises.has(chunkId)) return chunkPromises.get(chunkId);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = chunkSrc(chunkId);
      script.onload = () => resolve(chunkStore[chunkId] || []);
      script.onerror = () => reject(new Error(`failed to load chunk ${chunkId}`));
      document.body.appendChild(script);
    });
    chunkPromises.set(chunkId, promise);
    return promise;
  }

  function ensureSearchMonth(entry) {
    if (searchMonthStore[entry.month]) return Promise.resolve(searchMonthStore[entry.month]);
    if (searchMonthPromises.has(entry.month)) return searchMonthPromises.get(entry.month);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = searchMonthSrc(entry);
      script.onload = () => resolve(searchMonthStore[entry.month] || []);
      script.onerror = () => reject(new Error(`failed to load search month ${entry.month}`));
      document.body.appendChild(script);
    });
    searchMonthPromises.set(entry.month, promise);
    return promise;
  }

  function senderClass(sender) {
    if (sender === "我") return "other";
    if (sender === meta.contactName || sender === "救命恩人唐白白") return "me";
    if (!sender) return "system";
    return "other";
  }

  function displaySenderName(sender) {
    if (sender === "我") return DISPLAY_ME;
    if (sender === meta.contactName || sender === "救命恩人唐白白") return DISPLAY_OTHER;
    return sender || "";
  }

  function isTextualType(type) {
    return type === "text" || type === "quote";
  }

  function matchesActiveType(message) {
    if (!state.activeType) return true;
    if (state.activeType === "text") return isTextualType(message.type);
    return message.type === state.activeType;
  }

  function firstVisibleChunkForType(type) {
    return meta.typeStartChunks?.[type] ?? meta.chunkCount - 1;
  }

  function renderMessage(message, previousDay) {
    const fragment = document.createDocumentFragment();
    if (message.day !== previousDay) {
      const day = document.createElement("div");
      day.className = "day-separator";
      day.textContent = message.day;
      fragment.appendChild(day);
    }

    const row = document.createElement("article");
    row.className = `message-row ${senderClass(message.sender)}`;
    row.dataset.messageId = message.id;
    row.dataset.day = message.day;

    const metaLine = document.createElement("div");
    metaLine.className = "message-meta";
    metaLine.textContent = message.sender ? `${displaySenderName(message.sender)} · ${message.time}` : message.time;
    row.appendChild(metaLine);

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    if (message.quote) {
      const quote = document.createElement("button");
      quote.className = "quote-card";
      quote.type = "button";
      quote.innerHTML = `
        <div class="quote-sender">${escapeHtml(displaySenderName(message.quote.sender) || "引用消息")}</div>
        <div class="quote-preview">${escapeHtml(message.quote.preview || "点击查看原消息")}</div>
      `;
      quote.addEventListener("click", () => {
        if (message.quote.targetId) {
          jumpToMessage(message.quote.targetId, {
            highlight: true,
            clearType: true,
            chunkHint: message.quote.targetChunk,
          });
        } else {
          showLightbox(`<div class="bubble"><div class="message-text">${escapeHtml(message.quote.preview || "未能定位到原消息")}</div></div>`);
        }
      });
      bubble.appendChild(quote);
    }

    if (message.text) {
      const text = document.createElement("div");
      text.className = "message-text";
      text.textContent = message.text;
      bubble.appendChild(text);
    }

    const mediaPlaceholder = mediaPlaceholderText(message);
    if (mediaPlaceholder) {
      const placeholder = document.createElement("div");
      placeholder.className = "message-text";
      placeholder.textContent = mediaPlaceholder;
      bubble.appendChild(placeholder);
    }

    if (!message.text && !mediaPlaceholder) {
      const chip = document.createElement("div");
      chip.className = "status-chip";
      chip.textContent = message.typeLabel || message.type;
      bubble.appendChild(chip);
    }

    row.appendChild(bubble);
    fragment.appendChild(row);
    return fragment;
  }

  function mediaPlaceholderText(message) {
    const labels = [];
    for (const media of message.media || []) {
      if (media.kind === "image") labels.push("[图片]");
      else if (media.kind === "voice") labels.push("[语音]");
      else if (media.kind === "video") labels.push("[视频]");
    }
    if (labels.length) return labels.join(" ");
    if (message.type === "image") return "[图片]";
    if (message.type === "voice") return "[语音]";
    if (message.type === "video") return "[视频]";
    return "";
  }

  function formatVoiceDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return "语音";
    const total = Math.max(1, Math.round(seconds));
    const minutes = Math.floor(total / 60);
    const remain = total % 60;
    if (!minutes) return `${remain}"`;
    return `${minutes}:${String(remain).padStart(2, "0")}`;
  }

  function setVoiceUi(ui, mode) {
    if (!ui) return;
    ui.wrap.dataset.state = mode;
    if (mode === "playing") {
      ui.icon.textContent = "❚❚";
      ui.label.textContent = "正在播放";
    } else if (mode === "error") {
      ui.icon.textContent = "!";
      ui.label.textContent = "暂时无法播放";
    } else {
      ui.icon.textContent = "▶";
      ui.label.textContent = "点击播放";
    }
  }

  function stopActiveAudio() {
    if (!state.activeAudio) return;
    state.activeAudio.pause();
    state.activeAudio.currentTime = 0;
    setVoiceUi(state.activeAudioUi, "idle");
    state.activeAudio = null;
    state.activeAudioUi = null;
  }

  function renderVoicePlayer(media) {
    const wrap = document.createElement("div");
    wrap.className = "voice-player";
    wrap.dataset.state = "idle";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "voice-button";

    const icon = document.createElement("span");
    icon.className = "voice-icon";
    icon.textContent = "▶";

    const metaBox = document.createElement("span");
    metaBox.className = "voice-meta";

    const label = document.createElement("span");
    label.className = "voice-label";
    label.textContent = "点击播放";

    const duration = document.createElement("span");
    duration.className = "voice-duration";
    duration.textContent = "语音";

    metaBox.append(label, duration);
    button.append(icon, metaBox);

    const audio = document.createElement("audio");
    audio.className = "media-audio";
    audio.preload = "metadata";
    audio.src = media.src;
    audio.setAttribute("playsinline", "");
    audio.hidden = true;

    const ui = { wrap, icon, label, duration };

    audio.addEventListener("loadedmetadata", () => {
      duration.textContent = formatVoiceDuration(audio.duration);
    });
    audio.addEventListener("play", () => {
      if (state.activeAudio && state.activeAudio !== audio) {
        stopActiveAudio();
      }
      state.activeAudio = audio;
      state.activeAudioUi = ui;
      setVoiceUi(ui, "playing");
    });
    audio.addEventListener("pause", () => {
      if (audio.ended) return;
      if (state.activeAudio === audio) {
        state.activeAudio = null;
        state.activeAudioUi = null;
      }
      setVoiceUi(ui, "idle");
    });
    audio.addEventListener("ended", () => {
      if (state.activeAudio === audio) {
        state.activeAudio = null;
        state.activeAudioUi = null;
      }
      audio.currentTime = 0;
      setVoiceUi(ui, "idle");
    });
    audio.addEventListener("error", () => {
      setVoiceUi(ui, "error");
    });

    button.addEventListener("click", async () => {
      if (audio.paused) {
        if (state.activeAudio && state.activeAudio !== audio) {
          stopActiveAudio();
        }
        try {
          await audio.play();
        } catch (error) {
          console.error(error);
          setVoiceUi(ui, "error");
        }
      } else {
        audio.pause();
      }
    });

    wrap.append(button, audio);
    return wrap;
  }

  function renderLoadedChunks() {
    const sorted = Array.from(state.loadedChunks).sort((a, b) => a - b);
    state.renderedChunks = sorted;
    const fragment = document.createDocumentFragment();
    let previousDay = "";
    let visibleCount = 0;
    const firstChunk = sorted.length ? sorted[0] : 0;
    const lastChunk = sorted.length ? sorted[sorted.length - 1] : 0;

    fragment.appendChild(renderInlineLoader("top", firstChunk > 0));

    for (const chunkId of sorted) {
      const messages = chunkStore[chunkId] || [];
      for (const message of messages) {
        if (!matchesActiveType(message)) continue;
        fragment.appendChild(renderMessage(message, previousDay));
        previousDay = message.day;
        visibleCount += 1;
      }
    }

    if (!visibleCount) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = state.activeType ? `当前加载范围内没有${typeLabel(state.activeType)}消息` : "当前没有可显示的消息";
      fragment.appendChild(empty);
    }

    fragment.appendChild(renderInlineLoader("bottom", lastChunk < meta.chunkCount - 1));

    el.timeline.replaceChildren(fragment);
    if (state.highlightedId) highlightMessage(state.highlightedId);
  }

  function renderInlineLoader(position, canLoad) {
    const wrap = document.createElement("div");
    wrap.className = `inline-loader ${canLoad ? "" : "is-end"}`.trim();
    wrap.dataset.position = position;

    const line = document.createElement("div");
    line.className = "inline-loader-line";
    wrap.appendChild(line);

    const center = document.createElement(canLoad ? "button" : "div");
    center.className = "inline-loader-label";
    if (canLoad) {
      center.type = "button";
      center.textContent = "继续加载";
      center.addEventListener("click", () => {
        if (position === "top") {
          loadPreviousChunk().catch(console.error);
        } else {
          loadNextChunk().catch(console.error);
        }
      });
    } else {
      center.textContent = position === "top" ? "已经到最早" : "已经到底";
    }
    wrap.appendChild(center);

    const line2 = document.createElement("div");
    line2.className = "inline-loader-line";
    wrap.appendChild(line2);

    return wrap;
  }

  function captureVisibleAnchor() {
    const rows = [...el.timeline.querySelectorAll(".message-row")];
    const wrapperTop = el.timelineWrapper.getBoundingClientRect().top;
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      if (rect.bottom > wrapperTop + 24) {
        return {
          id: row.dataset.messageId,
          offset: rect.top - wrapperTop,
        };
      }
    }
    return null;
  }

  function restoreVisibleAnchor(anchor) {
    if (!anchor) return;
    const correct = () => {
      const node = el.timeline.querySelector(`[data-message-id="${CSS.escape(anchor.id)}"]`);
      if (!node) return;
      const wrapperTop = el.timelineWrapper.getBoundingClientRect().top;
      const rect = node.getBoundingClientRect();
      const delta = rect.top - wrapperTop - anchor.offset;
      if (Math.abs(delta) > 1) {
        el.timelineWrapper.scrollTop += delta;
      }
    };
    requestAnimationFrame(() => {
      correct();
      window.setTimeout(correct, 60);
      window.setTimeout(correct, 180);
    });
  }

  function renderMessagesFragment(messages, previousDay = "") {
    const fragment = document.createDocumentFragment();
    let dayCursor = previousDay;
    for (const message of messages) {
      if (!matchesActiveType(message)) continue;
      fragment.appendChild(renderMessage(message, dayCursor));
      dayCursor = message.day;
    }
    return { fragment, lastDay: dayCursor };
  }

  function findBoundary(separatorDirection) {
    const nodes = [...el.timeline.children].filter((node) => !node.classList.contains("inline-loader"));
    if (!nodes.length) return null;
    if (separatorDirection === "first") {
      const firstRow = nodes.find((node) => node.classList.contains("message-row"));
      const firstSeparator = nodes.find((node) => node.classList.contains("day-separator"));
      return { firstRow, firstSeparator };
    }
    const reversed = [...nodes].reverse();
    const lastRow = reversed.find((node) => node.classList.contains("message-row"));
    return { lastRow };
  }

  function updateInlineLoaders() {
    const sorted = state.renderedChunks;
    const firstChunk = sorted.length ? sorted[0] : 0;
    const lastChunk = sorted.length ? sorted[sorted.length - 1] : 0;
    const top = el.timeline.querySelector('.inline-loader[data-position="top"]');
    const bottom = el.timeline.querySelector('.inline-loader[data-position="bottom"]');
    const topFresh = renderInlineLoader("top", firstChunk > 0);
    const bottomFresh = renderInlineLoader("bottom", lastChunk < meta.chunkCount - 1);
    if (top) {
      top.className = topFresh.className;
      top.innerHTML = topFresh.innerHTML;
      const freshBtn = topFresh.querySelector(".inline-loader-label");
      const topBtn = top.querySelector(".inline-loader-label");
      if (freshBtn && topBtn) {
        topBtn.className = freshBtn.className;
        if (firstChunk > 0) {
          topBtn.textContent = "继续加载";
          topBtn.addEventListener("click", () => loadPreviousChunk().catch(console.error), { once: true });
        } else {
          topBtn.textContent = "已经到最早";
        }
      }
    }
    if (bottom) {
      bottom.className = bottomFresh.className;
      bottom.innerHTML = bottomFresh.innerHTML;
      const freshBtn = bottomFresh.querySelector(".inline-loader-label");
      const bottomBtn = bottom.querySelector(".inline-loader-label");
      if (freshBtn && bottomBtn) {
        bottomBtn.className = freshBtn.className;
        if (lastChunk < meta.chunkCount - 1) {
          bottomBtn.textContent = "继续加载";
          bottomBtn.addEventListener("click", () => loadNextChunk().catch(console.error), { once: true });
        } else {
          bottomBtn.textContent = "已经到底";
        }
      }
    }
  }

  function captureViewportAnchor() {
    const rows = [...el.timeline.querySelectorAll(".message-row")];
    for (const row of rows) {
      const topInViewport = row.offsetTop - el.timelineWrapper.scrollTop;
      const bottomInViewport = topInViewport + row.offsetHeight;
      if (bottomInViewport > 24) {
        return {
          id: row.dataset.messageId,
          offset: topInViewport,
        };
      }
    }
    return null;
  }

  function restoreViewportAnchor(anchor) {
    if (!anchor) return;
    const apply = () => {
      const node = el.timeline.querySelector(`[data-message-id="${CSS.escape(anchor.id)}"]`);
      if (!node) return;
      const desiredTop = node.offsetTop - anchor.offset;
      el.timelineWrapper.scrollTop = Math.max(0, desiredTop);
    };
    requestAnimationFrame(() => {
      apply();
      window.setTimeout(apply, 60);
      window.setTimeout(apply, 180);
    });
  }

  function scrollToNode(node, behavior = "smooth") {
    const top = node.offsetTop - Math.max(120, Math.round(el.timelineWrapper.clientHeight * 0.28));
    el.timelineWrapper.scrollTo({
      top: Math.max(0, top),
      behavior,
    });
  }

  async function resetAroundChunk(chunkId, options = {}) {
    const anchorChunk = Math.max(0, Math.min(meta.chunkCount - 1, chunkId));
    state.loadedChunks.clear();
    await ensureChunk(anchorChunk);
    state.loadedChunks.add(anchorChunk);
    renderLoadedChunks();
    if (options.scrollBottom) {
      requestAnimationFrame(() => {
        el.timelineWrapper.scrollTop = el.timelineWrapper.scrollHeight;
      });
    }
    if (options.targetId) {
      requestAnimationFrame(() => jumpToMessage(options.targetId, { highlight: true, chunkHint: anchorChunk }));
    }
  }

  async function loadPreviousChunk() {
    if (state.loadingPrev) return;
    const sorted = state.renderedChunks;
    if (!sorted.length) return;
    const prev = sorted[0] - 1;
    if (prev < 0 || state.loadedChunks.has(prev)) return;
    state.loadingPrev = true;
    document.activeElement?.blur?.();
    const anchor = captureVisibleAnchor();
    try {
      await ensureChunk(prev);
      const topLoader = el.timeline.querySelector('.inline-loader[data-position="top"]');
      const currentBoundary = findBoundary("first");
      const existingFirstDay = currentBoundary?.firstRow?.dataset.day || "";
      const { fragment, lastDay } = renderMessagesFragment(chunkStore[prev] || [], "");
      if (topLoader) {
        topLoader.after(fragment);
      } else {
        el.timeline.prepend(fragment);
      }
      if (existingFirstDay && lastDay === existingFirstDay && currentBoundary?.firstSeparator?.isConnected) {
        currentBoundary.firstSeparator.remove();
      }
      state.loadedChunks.add(prev);
      state.renderedChunks = Array.from(state.loadedChunks).sort((a, b) => a - b);
      updateInlineLoaders();
      restoreVisibleAnchor(anchor);
    } finally {
      state.loadingPrev = false;
    }
  }

  async function loadNextChunk() {
    if (state.loadingNext) return;
    const sorted = state.renderedChunks;
    if (!sorted.length) return;
    const next = sorted[sorted.length - 1] + 1;
    if (next >= meta.chunkCount || state.loadedChunks.has(next)) return;
    state.loadingNext = true;
    document.activeElement?.blur?.();
    const anchor = captureVisibleAnchor();
    try {
      await ensureChunk(next);
      const bottomLoader = el.timeline.querySelector('.inline-loader[data-position="bottom"]');
      const boundary = findBoundary("last");
      const previousDay = boundary?.lastRow?.dataset.day || "";
      const { fragment } = renderMessagesFragment(chunkStore[next] || [], previousDay);
      if (bottomLoader) {
        bottomLoader.before(fragment);
      } else {
        el.timeline.append(fragment);
      }
      state.loadedChunks.add(next);
      state.renderedChunks = Array.from(state.loadedChunks).sort((a, b) => a - b);
      updateInlineLoaders();
      restoreVisibleAnchor(anchor);
    } finally {
      state.loadingNext = false;
    }
  }

  function clearSearchResults() {
    el.searchResults.replaceChildren();
  }

  function clearTypeMode() {
    state.activeType = "";
    el.typePicker.value = "";
    el.typeSummary.textContent = "当前显示全部消息";
  }

  function openPanel() {
    el.controlPanel.classList.remove("hidden");
    el.panelBackdrop.classList.remove("hidden");
  }

  function closePanel() {
    el.controlPanel.classList.add("hidden");
    el.panelBackdrop.classList.add("hidden");
  }

  async function jumpToMessage(messageId, options = {}) {
    const chunkHint = options.chunkHint ?? meta.messageMap?.[messageId]?.chunk;
    if (chunkHint == null) {
      const node = el.timeline.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
      if (!node) return;
      node.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      highlightMessage(messageId);
      return;
    }
    if (options.clearType) clearTypeMode();
    if (!state.loadedChunks.has(chunkHint)) {
      await resetAroundChunk(chunkHint, { targetId: messageId });
      return;
    }
    requestAnimationFrame(() => {
      const node = el.timeline.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
      if (!node) return;
      node.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      window.setTimeout(() => {
        const again = el.timeline.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
        if (again) again.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
      }, 120);
      highlightMessage(messageId);
    });
  }

  function highlightMessage(messageId) {
    if (state.highlightedId) {
      const old = el.timeline.querySelector(`[data-message-id="${CSS.escape(state.highlightedId)}"]`);
      if (old) old.classList.remove("highlight");
    }
    state.highlightedId = messageId;
    const node = el.timeline.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
    if (!node) return;
    node.classList.add("highlight");
    window.setTimeout(() => node.classList.remove("highlight"), 2600);
  }

  function makeSnippet(text, query) {
    const source = String(text || "").trim();
    if (!source) return "";
    const lower = source.toLowerCase();
    const needle = query.toLowerCase();
    const pos = lower.indexOf(needle);
    if (source.length <= 72) return source;
    if (pos === -1) return `${source.slice(0, 72)}...`;
    const start = Math.max(0, pos - 18);
    const end = Math.min(source.length, pos + needle.length + 22);
    const prefix = start > 0 ? "..." : "";
    const suffix = end < source.length ? "..." : "";
    return `${prefix}${source.slice(start, end)}${suffix}`;
  }

  function renderSearchLoading() {
    el.searchResults.replaceChildren();
    const loading = document.createElement("div");
    loading.className = "search-empty";
    loading.textContent = "正在搜索正文内容...";
    el.searchResults.appendChild(loading);
  }

  async function searchAcrossMonths(query) {
    const entries = meta.searchMonths || [];
    const loadedMonths = await Promise.all(entries.map((entry) => ensureSearchMonth(entry)));
    const results = [];
    for (const monthRecords of loadedMonths) {
      for (const record of monthRecords) {
        if (record[5].includes(query)) {
          results.push(record);
        }
      }
    }
    results.sort((a, b) => b[2] - a[2]);
    return results;
  }

  function renderSearchResults(records, query) {
    el.searchResults.replaceChildren();
    if (!query) {
      clearSearchResults();
      return;
    }
    if (!records.length) {
      const empty = document.createElement("div");
      empty.className = "search-empty";
      empty.textContent = "没有找到匹配的正文内容";
      el.searchResults.appendChild(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const record of records.slice(0, 120)) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "search-item";
      item.innerHTML = `
        <div class="meta">${escapeHtml(formatTimestamp(record[2]))} · ${escapeHtml(displaySenderName(record[3]))}</div>
        <div class="body">${escapeHtml(makeSnippet(record[4], query))}</div>
      `;
      item.addEventListener("click", async () => {
        closePanel();
        await jumpToMessage(record[0], { highlight: true, clearType: true, chunkHint: record[1] });
      });
      fragment.appendChild(item);
    }
    el.searchResults.appendChild(fragment);
  }

  async function runSearch() {
    const query = el.searchInput.value.trim();
    if (!query) {
      clearSearchResults();
      return;
    }
    const runId = ++state.searchRunId;
    renderSearchLoading();
    try {
      const results = await searchAcrossMonths(query.toLowerCase());
      if (runId !== state.searchRunId) return;
      renderSearchResults(results, query);
    } catch (error) {
      if (runId !== state.searchRunId) return;
      console.error(error);
      const empty = document.createElement("div");
      empty.className = "search-empty";
      empty.textContent = "搜索索引加载失败，请稍后再试";
      el.searchResults.replaceChildren(empty);
    }
  }

  function formatTimestamp(ts) {
    const date = new Date(ts * 1000);
    const parts = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ];
    const time = [
      String(date.getHours()).padStart(2, "0"),
      String(date.getMinutes()).padStart(2, "0"),
    ].join(":");
    return `${parts.join("-")} ${time}`;
  }

  function typeLabel(type) {
    return {
      text: "文本",
      image: "图片",
      voice: "语音",
      video: "视频",
    }[type] || type;
  }

  function showLightbox(content) {
    el.lightboxBody.innerHTML = content;
    el.lightbox.classList.remove("hidden");
  }

  function hideLightbox() {
    el.lightbox.classList.add("hidden");
    el.lightboxBody.innerHTML = "";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll("'", "&#39;");
  }

  function bindEvents() {
    el.timelineWrapper.addEventListener("scroll", () => {
      if (state.scrollTicking) return;
      state.scrollTicking = true;
      requestAnimationFrame(() => {
        state.scrollTicking = false;
      });
    });

    el.searchInput.addEventListener("input", () => {
      clearTimeout(state.searchTimer);
      state.searchRunId += 1;
      el.jumpDate.value = "";
      if (state.activeType) {
        clearTypeMode();
        resetAroundChunk(meta.chunkCount - 1, { scrollBottom: true }).catch(console.error);
      }
      state.searchTimer = window.setTimeout(() => {
        runSearch().catch(console.error);
      }, 120);
    });

    const jumpByDate = async () => {
      const day = el.jumpDate.value;
      if (!day) return;
      el.searchInput.value = "";
      clearSearchResults();
      clearTypeMode();
      const info = meta.days.find((item) => item.day === day);
      if (!info) {
        return;
      }
      await resetAroundChunk(info.startChunk, { targetId: info.startId });
      closePanel();
    };

    el.jumpDateBtn.addEventListener("click", () => jumpByDate().catch(console.error));
    el.jumpDate.addEventListener("change", () => jumpByDate().catch(console.error));

    el.typePicker.addEventListener("change", async () => {
      const type = el.typePicker.value;
      el.searchInput.value = "";
      clearSearchResults();
      el.jumpDate.value = "";
      state.activeType = type;
      if (!type) {
        clearTypeMode();
        await resetAroundChunk(meta.chunkCount - 1, { scrollBottom: true });
        closePanel();
        return;
      }
      el.typeSummary.textContent = `当前只显示${typeLabel(type)}消息`;
      await resetAroundChunk(firstVisibleChunkForType(type), { scrollBottom: true });
      closePanel();
    });

    el.controlToggle.addEventListener("click", () => {
      if (el.controlPanel.classList.contains("hidden")) {
        openPanel();
      } else {
        closePanel();
      }
    });
    el.panelBackdrop.addEventListener("click", closePanel);
    el.lightboxClose.addEventListener("click", hideLightbox);
    el.lightbox.addEventListener("click", (event) => {
      if (event.target === el.lightbox) hideLightbox();
    });
  }

  async function init() {
    setupHeader();
    bindEvents();
    clearSearchResults();
    await resetAroundChunk(meta.chunkCount - 1, { scrollBottom: true });
  }

  init().catch((error) => {
    console.error(error);
  });
})();
