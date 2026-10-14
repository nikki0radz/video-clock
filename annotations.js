(function () {
  "use strict";

  const STORAGE_KEY = "videoClockAnnotations";
  const canvas = document.createElement("canvas");
  canvas.id = "annotationCanvas";
  canvas.setAttribute("aria-label", "Drawing and text overlay");

  const selection = document.createElement("div");
  selection.id = "annotationSelection";
  selection.hidden = true;
  selection.setAttribute("aria-label", "Selected drawing or text. Drag to move.");
  selection.innerHTML = '<button type="button" id="annotationResize" aria-label="Drag to resize the selected object" title="Drag to resize">↘</button>';

  const toggle = document.createElement("button");
  toggle.id = "annotationToggle";
  toggle.type = "button";
  toggle.textContent = "✎";
  toggle.title = "Draw or write on screen";
  toggle.setAttribute("aria-label", "Draw or write on screen");
  toggle.setAttribute("aria-expanded", "false");

  const toolbar = document.createElement("section");
  toolbar.id = "annotationToolbar";
  toolbar.hidden = true;
  toolbar.setAttribute("aria-label", "Drawing tools");
  toolbar.innerHTML =
    '<div class="annotation-heading"><span>✎ Draw &amp; write</span><button type="button" id="annotationDone">Done</button></div>' +
    '<div class="annotation-tool-row">' +
      '<button type="button" class="annotation-tool selected" data-annotation-mode="select">↖ Move</button>' +
      '<button type="button" class="annotation-tool" data-annotation-mode="draw">✎ Draw</button>' +
      '<button type="button" class="annotation-tool" data-annotation-mode="text">T Text</button>' +
      '<button type="button" class="annotation-tool" data-annotation-mode="erase">⌫ Erase</button>' +
    '</div>' +
    '<div class="annotation-options">' +
      '<label for="annotationColor">Colour</label><input id="annotationColor" type="color" value="#ffffff">' +
      '<label for="annotationSize">Size</label><input id="annotationSize" type="range" min="2" max="24" value="8">' +
    '</div>' +
    '<div id="annotationDrawHelp" class="annotation-hint">Tap Draw to sketch or Text to add a message. Select an object to move or resize it.</div>' +
    '<div id="annotationDraftActions" class="annotation-draft-actions" hidden>' +
      '<span class="annotation-hint">Your strokes will become one movable doodle.</span>' +
      '<button type="button" class="annotation-action" id="annotationFinishDoodle">✓ Finish doodle</button>' +
    '</div>' +
    '<div class="annotation-text-row">' +
      '<textarea id="annotationText" maxlength="500" placeholder="Write your message here..."></textarea>' +
      '<div class="annotation-hint" id="annotationTextHelp">Type a message, then tap the screen to place it.</div>' +
      '<button type="button" class="annotation-action annotation-save-text" id="annotationSaveText" hidden>Save text changes</button>' +
    '</div>' +
    '<div class="annotation-actions">' +
      '<button type="button" class="annotation-action" id="annotationUndo">↶ Undo</button>' +
      '<button type="button" class="annotation-action" id="annotationEditSelected" hidden>✎ Edit text</button>' +
      '<button type="button" class="annotation-action" id="annotationDeleteSelected" hidden>Delete selected</button>' +
      '<button type="button" class="annotation-action" id="annotationClear">Clear all</button>' +
    '</div>';

  document.body.append(canvas, selection, toolbar, toggle);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    toggle.hidden = true;
    return;
  }

  const colorInput = document.getElementById("annotationColor");
  const sizeInput = document.getElementById("annotationSize");
  const textInput = document.getElementById("annotationText");
  const clearButton = document.getElementById("annotationClear");
  const finishButton = document.getElementById("annotationFinishDoodle");
  const saveTextButton = document.getElementById("annotationSaveText");
  const editButton = document.getElementById("annotationEditSelected");
  const deleteButton = document.getElementById("annotationDeleteSelected");
  const toolButtons = Array.from(toolbar.querySelectorAll("[data-annotation-mode]"));
  const resizeHandle = document.getElementById("annotationResize");
  const vw = () => Math.max(window.innerWidth, 1);
  const vh = () => Math.max(window.innerHeight, 1);
  const clamp = (x, low, high) => Math.min(Math.max(x, low), Math.max(low, high));

  let mode = "select";
  let actions = [];
  let draft = [];
  let selectedIndex = -1;
  let editingIndex = -1;
  let gesture = null;
  let clearArmed = false;
  let history = [];
  const active = () => document.body.classList.contains("annotation-mode");
  const deepCopy = (value) => JSON.parse(JSON.stringify(value));

  function rememberUndo() {
    history.push(deepCopy(actions));
    if (history.length > 35) history.shift();
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(actions));
    } catch (error) {
      console.warn("Drawing changes could not be saved.", error);
    }
  }

  // Each drawing is one object. Relative stroke coordinates keep drawings
  // attached to their movable and resizable bounding rectangle.
  function doodleFromStrokes(strokes) {
    if (!strokes.length) return null;
    const all = strokes.flatMap((stroke) => stroke.points || []);
    if (!all.length) return null;
    const minX = clamp(Math.min(...all.map(p => p[0])), 0, 1);
    const maxX = clamp(Math.max(...all.map(p => p[0])), 0, 1);
    const minY = clamp(Math.min(...all.map(p => p[1])), 0, 1);
    const maxY = clamp(Math.max(...all.map(p => p[1])), 0, 1);
    const w = Math.max(0.001, maxX - minX);
    const h = Math.max(0.001, maxY - minY);
    return {
      type: "doodle", x: minX, y: minY, w, h, baseW: w,
      strokes: strokes.map(stroke => ({
        color: stroke.color || "#ffffff",
        width: Number(stroke.width) || 8,
        points: stroke.points.map(p => [(p[0] - minX) / w, (p[1] - minY) / h])
      }))
    };
  }

  function fontFor(item) {
    return '500 ' + (item.size || 34) + 'px "Caveat", cursive';
  }

  function textDimensions(text, size) {
    ctx.font = '500 ' + size + 'px "Caveat", cursive';
    const lines = (text || "").split("\n");
    return {
      w: Math.max(30, ...lines.map(line => ctx.measureText(line).width + 10)),
      h: Math.max(size * 1.25, size * 1.2 * lines.length + 6)
    };
  }

  function normalizeText(item) {
    const size = clamp(Number(item.size) || 34, 8, 350);
    const dims = textDimensions(item.text || "", size);
    return {
      type: "text",
      text: String(item.text || "").slice(0, 500),
      x: clamp(Number(item.x) || 0, 0, 1),
      y: clamp(Number(item.y) || 0, 0, 1),
      w: Number(item.w) > 0 ? Number(item.w) : dims.w / vw(),
      h: Number(item.h) > 0 ? Number(item.h) : dims.h / vh(),
      size,
      color: item.color || "#ffffff"
    };
  }

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(saved)) {
      actions = saved.flatMap(function (item) {
        if (!item || typeof item !== "object") return [];
        if (item.type === "text") return [normalizeText(item)];
        if (item.type === "doodle" && Array.isArray(item.strokes)) return [item];
        if (item.type === "stroke" && Array.isArray(item.points)) {
          // Preserve old eraser operations in place, and migrate old drawn lines.
          if (item.erase) return [item];
          const group = doodleFromStrokes([item]);
          return group ? [group] : [];
        }
        return [];
      });
    }
  } catch (error) {
    console.warn("Saved annotations could not be loaded.", error);
  }

  function paintStroke(stroke, pointToPixel, scale) {
    if (!stroke.points || !stroke.points.length) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = stroke.color || "#ffffff";
    ctx.lineWidth = Math.max(1, (Number(stroke.width) || 8) * scale);
    ctx.beginPath();
    const p = pointToPixel(stroke.points[0]);
    ctx.moveTo(p[0], p[1]);
    if (stroke.points.length === 1) {
      ctx.lineTo(p[0] + 0.01, p[1]);
    } else {
      for (let i = 1; i < stroke.points.length; i++) {
        const q = pointToPixel(stroke.points[i]);
        ctx.lineTo(q[0], q[1]);
      }
    }
    ctx.stroke();
  }

  function renderDoodle(item) {
    const scale = item.baseW > 0 ? item.w / item.baseW : 1;
    item.strokes.forEach(stroke => {
      paintStroke(stroke, p => [
        (item.x + p[0] * item.w) * vw(),
        (item.y + p[1] * item.h) * vh()
      ], scale);
    });
  }

  function renderText(item) {
    ctx.font = fontFor(item);
    ctx.textBaseline = "top";
    ctx.fillStyle = item.color || "#ffffff";
    const step = item.size * 1.2;
    (item.text || "").split("\n").forEach((line, i) => {
      ctx.fillText(line, item.x * vw(), item.y * vh() + step * i);
    });
  }

  function renderLegacyEraser(item) {
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    paintStroke(item, p => [p[0] * vw(), p[1] * vh()], 1);
    ctx.restore();
  }

  function rectFor(item) {
    return { left: item.x * vw(), top: item.y * vh(),
      width: item.w * vw(), height: item.h * vh() };
  }

  function updateSelection() {
    const item = actions[selectedIndex];
    const visible = active() && mode === "select" &&
      item && (item.type === "text" || item.type === "doodle");
    selection.hidden = !visible;
    editButton.hidden = !(visible && item.type === "text");
    deleteButton.hidden = !visible;
    if (!visible) return;
    const r = rectFor(item);
    const pad = 10;
    selection.style.left = (r.left - pad) + "px";
    selection.style.top = (r.top - pad) + "px";
    selection.style.width = Math.max(26, r.width + pad * 2) + "px";
    selection.style.height = Math.max(26, r.height + pad * 2) + "px";
  }

  function redraw() {
    ctx.clearRect(0, 0, vw(), vh());
    actions.forEach(item => {
      if (item.type === "doodle") renderDoodle(item);
      else if (item.type === "text") renderText(item);
      else if (item.type === "stroke" && item.erase) renderLegacyEraser(item);
    });
    draft.forEach(stroke => paintStroke(stroke,
      p => [p[0] * vw(), p[1] * vh()], 1));
    updateSelection();
  }

  function resizeCanvas() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(vw() * ratio);
    canvas.height = Math.round(vh() * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    redraw();
  }

  function pointFrom(event) {
    return [clamp(event.clientX / vw(), 0, 1), clamp(event.clientY / vh(), 0, 1)];
  }

  function findAt(x, y) {
    for (let i = actions.length - 1; i >= 0; i--) {
      const item = actions[i];
      if (item.type !== "doodle" && item.type !== "text") continue;
      const rect = rectFor(item);
      const pad = Math.max(9, item.type === "doodle" ? 14 : 6);
      if (x >= rect.left - pad && x <= rect.left + Math.max(15, rect.width) + pad &&
          y >= rect.top - pad && y <= rect.top + Math.max(15, rect.height) + pad) return i;
    }
    return -1;
  }

  function disarmClear() {
    clearArmed = false;
    clearButton.textContent = "Clear all";
    clearButton.classList.remove("warn");
  }

  function updateDraftUI() {
    document.getElementById("annotationDraftActions").hidden = !draft.length;
    document.getElementById("annotationDrawHelp").hidden = mode === "text";
  }

  function finishDoodle() {
    if (!draft.length) return;
    const group = doodleFromStrokes(draft);
    draft = [];
    if (group) {
      rememberUndo();
      actions.push(group);
      selectedIndex = actions.length - 1;
      persist();
    }
    updateDraftUI();
    redraw();
  }

  function setMode(next) {
    if (mode === "draw" && next !== "draw") finishDoodle();
    mode = next;
    if (next !== "text") editingIndex = -1;
    toolButtons.forEach(button => {
      const selected = button.dataset.annotationMode === next;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    toolbar.classList.toggle("text-mode", next === "text");
    toolbar.classList.toggle("select-mode", next === "select");
    saveTextButton.hidden = !(next === "text" && editingIndex >= 0);
    if (next === "text") textInput.focus();
    disarmClear();
    updateDraftUI();
    updateSelection();
  }

  function showTools(show) {
    if (!show && mode === "draw") finishDoodle();
    if (show) {
      if (document.body.classList.contains("design-mode")) {
        document.getElementById("doneDesignButton").click();
      }
      document.getElementById("settingsPanel").classList.remove("show");
    }
    document.body.classList.toggle("annotation-mode", show);
    toolbar.hidden = !show;
    toggle.setAttribute("aria-expanded", String(show));
    toggle.setAttribute("aria-label", show ? "Close drawing tools" : "Draw or write on screen");
    if (!show) { selectedIndex = -1; setMode("select"); }
    disarmClear();
    updateSelection();
  }

  function createText(point) {
    const message = textInput.value.trim();
    if (!message) { textInput.focus(); return; }
    const size = 18 + Number(sizeInput.value) * 2;
    const dimensions = textDimensions(message, size);
    const item = {
      type: "text", text: message, x: point[0], y: point[1],
      w: dimensions.w / vw(), h: dimensions.h / vh(),
      size, color: colorInput.value
    };
    item.x = clamp(item.x, 0, Math.max(0, 1 - item.w));
    item.y = clamp(item.y, 0, Math.max(0, 1 - item.h));
    rememberUndo();
    actions.push(item);
    selectedIndex = actions.length - 1;
    textInput.value = "";
    editingIndex = -1;
    persist();
    setMode("select");
    redraw();
  }

  function startObjectMove(event, source, kind) {
    const item = actions[selectedIndex];
    if (!item || (item.type !== "doodle" && item.type !== "text")) return;
    if (gesture) return;
    event.preventDefault();
    event.stopPropagation();
    const original = { x:item.x, y:item.y, w:item.w, h:item.h, size:item.size };
    gesture = { pointerId:event.pointerId, kind, startX:event.clientX,
      startY:event.clientY, original, changed:false, before:deepCopy(actions) };
    source.setPointerCapture(event.pointerId);
  }

  function completeGesture(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const previous = gesture;
    gesture = null;
    if (previous.changed) {
      history.push(previous.before);
      if (history.length > 35) history.shift();
      persist();
    }
    redraw();
  }

  toggle.addEventListener("click", () => showTools(!active()));
  document.getElementById("annotationDone").addEventListener("click", () => showTools(false));
  toolButtons.forEach(button => {
    button.addEventListener("click", () => setMode(button.dataset.annotationMode));
  });
  finishButton.addEventListener("click", () => { finishDoodle(); setMode("select"); redraw(); });

  selection.addEventListener("pointerdown", event => {
    if (event.target === resizeHandle) return;
    if (mode === "select") startObjectMove(event, selection, "move");
  });
  resizeHandle.addEventListener("pointerdown", event => startObjectMove(event, resizeHandle, "resize"));

  editButton.addEventListener("click", () => {
    if (!actions[selectedIndex] || actions[selectedIndex].type !== "text") return;
    const index = selectedIndex;
    const item = actions[index];
    setMode("text");
    editingIndex = index;
    textInput.value = item.text;
    saveTextButton.hidden = false;
    document.getElementById("annotationTextHelp").textContent =
      "Edit the words, then tap Save text changes.";
    textInput.focus();
  });
  saveTextButton.addEventListener("click", () => {
    const item = actions[editingIndex];
    if (!item || item.type !== "text") return;
    const message = textInput.value.trim();
    if (!message) { textInput.focus(); return; }
    rememberUndo();
    item.text = message;
    const dims = textDimensions(message, item.size);
    item.w = dims.w / vw();
    item.h = dims.h / vh();
    item.x = clamp(item.x, 0, Math.max(0, 1 - item.w));
    item.y = clamp(item.y, 0, Math.max(0, 1 - item.h));
    selectedIndex = editingIndex;
    editingIndex = -1;
    textInput.value = "";
    document.getElementById("annotationTextHelp").textContent =
      "Type a message, then tap the screen to place it.";
    persist();
    setMode("select");
    redraw();
  });

  deleteButton.addEventListener("click", () => {
    if (selectedIndex < 0 || !actions[selectedIndex]) return;
    rememberUndo();
    actions.splice(selectedIndex, 1);
    selectedIndex = -1;
    persist();
    redraw();
  });

  function undo() {
    if (draft.length) {
      draft.pop();
      updateDraftUI();
    } else if (history.length) {
      actions = history.pop();
      selectedIndex = -1;
      editingIndex = -1;
      persist();
    } else if (actions.length) {
      // Still allow undoing an annotation created in a prior session.
      actions.pop();
      selectedIndex = -1;
      persist();
    }
    redraw();
    disarmClear();
  }

  document.getElementById("annotationUndo").addEventListener("click", undo);
  clearButton.addEventListener("click", () => {
    if (!clearArmed) {
      clearArmed = true;
      clearButton.textContent = "Clear all?";
      clearButton.classList.add("warn");
      return;
    }
    rememberUndo();
    actions = [];
    draft = [];
    selectedIndex = -1;
    persist();
    redraw();
    updateDraftUI();
    disarmClear();
  });

  canvas.addEventListener("pointerdown", event => {
    if (!active() || gesture) return;
    event.preventDefault();
    disarmClear();
    const point = pointFrom(event);
    if (mode === "select") {
      selectedIndex = findAt(event.clientX, event.clientY);
      if (selectedIndex !== -1) startObjectMove(event, canvas, "move");
      redraw();
      return;
    }
    if (mode === "text") { createText(point); return; }
    const stroke = {
      type:"stroke", erase: mode === "erase",
      color: colorInput.value,
      width: Number(sizeInput.value) * (mode === "erase" ? 3 : 1),
      points: [point]
    };
    if (mode === "draw") {
      draft.push(stroke);
      updateDraftUI();
    } else {
      rememberUndo();
      actions.push(stroke);
      persist();
    }
    gesture = { pointerId:event.pointerId, kind:"paint", stroke, changed:false };
    canvas.setPointerCapture(event.pointerId);
    redraw();
  });

  window.addEventListener("pointermove", event => {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const g = gesture;
    event.preventDefault();
    if (g.kind === "paint") {
      g.stroke.points.push(pointFrom(event));
      g.changed = true;
    } else {
      const item = actions[selectedIndex];
      if (!item) return;
      const dx = event.clientX - g.startX;
      const dy = event.clientY - g.startY;
      if (g.kind === "move") {
        item.x = clamp(g.original.x + dx / vw(), 0, 1 - item.w);
        item.y = clamp(g.original.y + dy / vh(), 0, 1 - item.h);
      } else {
        const rectW = Math.max(35, g.original.w * vw());
        const rectH = Math.max(35, g.original.h * vh());
        const factor = clamp(1 + (dx + dy) / (rectW + rectH), 0.25, 8);
        const maximum = Math.min(
          8,
          (1 - item.x) / Math.max(0.001, g.original.w),
          (1 - item.y) / Math.max(0.001, g.original.h)
        );
        const finalScale = clamp(factor, 0.25, Math.max(0.25, maximum));
        item.w = g.original.w * finalScale;
        item.h = g.original.h * finalScale;
        if (item.type === "text") item.size = g.original.size * finalScale;
      }
      g.changed = g.changed || Math.abs(dx) + Math.abs(dy) > 1;
    }
    redraw();
  }, { passive:false });

  window.addEventListener("pointerup", event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (gesture.kind === "paint") {
      if (gesture.stroke.erase) persist();
      gesture = null;
      redraw();
    } else completeGesture(event);
  });
  window.addEventListener("pointercancel", event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (gesture.kind === "paint") {
      if (gesture.stroke.erase) persist();
      gesture = null;
      redraw();
    } else completeGesture(event);
  });

  document.addEventListener("keydown", event => {
    if (!active()) return;
    if (event.key === "Escape") { showTools(false); return; }
    const input = event.target.closest && event.target.closest("input, textarea");
    if (!input && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
    }
    if (!input && (event.key === "Delete" || event.key === "Backspace") &&
        selectedIndex >= 0 && mode === "select") {
      event.preventDefault();
      deleteButton.click();
    }
  });

  window.addEventListener("resize", resizeCanvas);
  window.videoClockAnnotations = { close: () => showTools(false) };
  resizeCanvas();
  setMode("select");
})();
