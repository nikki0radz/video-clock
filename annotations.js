(function () {
  "use strict";

  const STORAGE_KEY = "videoClockAnnotations";
  const canvas = document.createElement("canvas");
  canvas.id = "annotationCanvas";
  canvas.setAttribute("aria-label", "Draw or position a message on the screen");

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
      '<button type="button" class="annotation-tool selected" data-annotation-mode="draw">✎ Draw</button>' +
      '<button type="button" class="annotation-tool" data-annotation-mode="text">T Text</button>' +
      '<button type="button" class="annotation-tool" data-annotation-mode="erase">◻ Erase</button>' +
    '</div>' +
    '<div class="annotation-options">' +
      '<label for="annotationColor">Colour</label><input id="annotationColor" type="color" value="#ffffff">' +
      '<label for="annotationSize">Size</label><input id="annotationSize" type="range" min="2" max="24" value="8">' +
    '</div>' +
    '<div class="annotation-text-row">' +
      '<textarea id="annotationText" maxlength="220" placeholder="Write your message here..."></textarea>' +
      '<div class="annotation-hint">Tap the screen to place your message. Drag an existing message to move it.</div>' +
    '</div>' +
    '<div class="annotation-actions">' +
      '<button type="button" class="annotation-action" id="annotationUndo">↶ Undo</button>' +
      '<button type="button" class="annotation-action" id="annotationClear">Clear all</button>' +
    '</div>';

  document.body.append(canvas, toolbar, toggle);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    toggle.hidden = true;
    return;
  }

  const colorInput = document.getElementById("annotationColor");
  const sizeInput = document.getElementById("annotationSize");
  const textInput = document.getElementById("annotationText");
  const clearButton = document.getElementById("annotationClear");
  const toolButtons = Array.from(toolbar.querySelectorAll("[data-annotation-mode]"));

  let mode = "draw";
  let actions = [];
  let activePointer = null;
  let activeStroke = null;
  let movingText = null;
  let clearArmed = false;

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(saved)) {
      actions = saved.filter(function (item) {
        return item && (item.type === "stroke" || item.type === "text");
      });
    }
  } catch (error) {
    actions = [];
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(actions));
    } catch (error) {
      console.warn("Drawings could not be saved in this browser.", error);
    }
  }

  function fontFor(item) {
    return '500 ' + (item.size || 34) + 'px "Caveat", cursive';
  }

  function renderStroke(item) {
    if (!Array.isArray(item.points) || !item.points.length) return;
    ctx.globalCompositeOperation = item.erase ? "destination-out" : "source-over";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = item.erase ? "#000000" : item.color;
    ctx.lineWidth = item.width || 8;
    ctx.beginPath();
    const first = item.points[0];
    ctx.moveTo(first[0] * window.innerWidth, first[1] * window.innerHeight);
    if (item.points.length === 1) {
      ctx.lineTo(first[0] * window.innerWidth + 0.01, first[1] * window.innerHeight);
    } else {
      for (let i = 1; i < item.points.length; i++) {
        ctx.lineTo(item.points[i][0] * window.innerWidth, item.points[i][1] * window.innerHeight);
      }
    }
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }

  function renderText(item) {
    ctx.globalCompositeOperation = "source-over";
    ctx.font = fontFor(item);
    ctx.textBaseline = "top";
    ctx.fillStyle = item.color || "#ffffff";
    const lines = (item.text || "").split("\n");
    const lineHeight = (item.size || 34) * 1.2;
    lines.forEach(function (line, index) {
      ctx.fillText(line, item.x * window.innerWidth,
                   item.y * window.innerHeight + lineHeight * index);
    });
  }

  function redraw() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    actions.forEach(function (item) {
      if (item.type === "stroke") renderStroke(item);
      if (item.type === "text") renderText(item);
    });
  }

  function resizeCanvas() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    redraw();
  }

  function locationFrom(event) {
    return [
      Math.max(0, Math.min(1, event.clientX / window.innerWidth)),
      Math.max(0, Math.min(1, event.clientY / window.innerHeight))
    ];
  }

  function findTextAt(x, y) {
    for (let i = actions.length - 1; i >= 0; i--) {
      const item = actions[i];
      if (item.type !== "text") continue;
      const lines = item.text.split("\n");
      ctx.font = fontFor(item);
      const width = Math.max.apply(null, lines.map(function (line) {
        return ctx.measureText(line).width;
      }));
      const left = item.x * window.innerWidth;
      const top = item.y * window.innerHeight;
      const height = (item.size || 34) * 1.2 * lines.length;
      if (x >= left - 12 && x <= left + width + 12 &&
          y >= top - 12 && y <= top + height + 12) return i;
    }
    return -1;
  }

  function setMode(next) {
    mode = next;
    toolButtons.forEach(function (button) {
      const selected = button.dataset.annotationMode === mode;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    toolbar.classList.toggle("text-mode", mode === "text");
    if (mode === "text") textInput.focus();
    disarmClear();
  }

  function disarmClear() {
    clearArmed = false;
    clearButton.textContent = "Clear all";
    clearButton.classList.remove("warn");
  }

  function showTools(show) {
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
    disarmClear();
  }

  toggle.addEventListener("click", function () {
    showTools(!document.body.classList.contains("annotation-mode"));
  });
  document.getElementById("annotationDone").addEventListener("click", function () {
    showTools(false);
  });
  toolButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      setMode(button.dataset.annotationMode);
    });
  });
  document.getElementById("annotationUndo").addEventListener("click", function () {
    actions.pop();
    redraw();
    persist();
    disarmClear();
  });
  clearButton.addEventListener("click", function () {
    if (!clearArmed) {
      clearArmed = true;
      clearButton.textContent = "Clear all?";
      clearButton.classList.add("warn");
      return;
    }
    actions = [];
    redraw();
    persist();
    disarmClear();
  });

  canvas.addEventListener("pointerdown", function (event) {
    if (!document.body.classList.contains("annotation-mode") ||
        activePointer !== null) return;
    event.preventDefault();
    disarmClear();

    const point = locationFrom(event);
    if (mode === "text") {
      const hit = findTextAt(event.clientX, event.clientY);
      if (hit !== -1) {
        const item = actions[hit];
        movingText = {
          item: item,
          dx: point[0] - item.x,
          dy: point[1] - item.y
        };
      } else {
        const message = textInput.value.trim();
        if (!message) {
          textInput.focus();
          return;
        }
        actions.push({
          type: "text",
          text: message,
          x: point[0],
          y: point[1],
          size: 18 + Number(sizeInput.value) * 2,
          color: colorInput.value
        });
        redraw();
        persist();
        return;
      }
    } else {
      activeStroke = {
        type: "stroke",
        erase: mode === "erase",
        color: colorInput.value,
        width: Number(sizeInput.value) * (mode === "erase" ? 3 : 1),
        points: [point]
      };
      actions.push(activeStroke);
      redraw();
    }
    activePointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", function (event) {
    if (event.pointerId !== activePointer) return;
    event.preventDefault();
    const point = locationFrom(event);
    if (movingText) {
      movingText.item.x = Math.max(0, Math.min(1, point[0] - movingText.dx));
      movingText.item.y = Math.max(0, Math.min(1, point[1] - movingText.dy));
    } else if (activeStroke) {
      activeStroke.points.push(point);
    }
    redraw();
  });

  function endPointer(event) {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    activeStroke = null;
    movingText = null;
    persist();
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  document.addEventListener("keydown", function (event) {
    if (!document.body.classList.contains("annotation-mode")) return;
    if (event.key === "Escape") showTools(false);
    const isInput = event.target.closest && event.target.closest("input, textarea");
    if (!isInput && (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "z") {
      event.preventDefault();
      actions.pop();
      redraw();
      persist();
    }
  });

  window.addEventListener("resize", resizeCanvas);
  window.videoClockAnnotations = { close: function () { showTools(false); } };
  resizeCanvas();
  setMode("draw");
})();
