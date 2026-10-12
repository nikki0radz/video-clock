(function () {
  "use strict";
  const nativeInput = document.getElementById("annotationColor");
  const toolbar = document.getElementById("annotationToolbar");
  if (!nativeInput || !toolbar) return;

  const SELECTED_KEY = "videoClockDrawingColor";
  const RECENTS_KEY = "videoClockDrawingRecentColors";
  const DEFAULT_COLOR = "#ffffff";
  const validHex = function (hex) {
    return typeof hex === "string" && /^#[0-9a-f]{6}$/i.test(hex);
  };

  function readStored(key, fallback) {
    try { return localStorage.getItem(key) || fallback; }
    catch (_) { return fallback; }
  }
  function store(key, value) {
    try { localStorage.setItem(key, value); }
    catch (_) { /* Drawing still works without persistent storage. */ }
  }
  let selected = readStored(SELECTED_KEY, DEFAULT_COLOR);
  if (!validHex(selected)) selected = DEFAULT_COLOR;
  nativeInput.value = selected;
  nativeInput.hidden = true;

  const colourButton = document.createElement("button");
  colourButton.id = "annotationColorButton";
  colourButton.type = "button";
  colourButton.setAttribute("aria-label", "Choose drawing colour");
  colourButton.innerHTML = '<span id="annotationColorButtonSwatch"></span>';
  nativeInput.insertAdjacentElement("afterend", colourButton);
  const label = toolbar.querySelector('label[for="annotationColor"]');
  if (label) label.htmlFor = "annotationColorButton";
  const buttonSwatch = document.getElementById("annotationColorButtonSwatch");
  buttonSwatch.style.background = selected;

  const overlay = document.createElement("div");
  overlay.className = "vc-colour-backdrop";
  overlay.hidden = true;
  overlay.innerHTML =
    '<section class="vc-colour-dialog" role="dialog" aria-modal="true" aria-labelledby="vc-colour-title">' +
      '<div class="vc-colour-head">' +
        '<div><div class="vc-colour-eyebrow">Drawing colour</div><h2 id="vc-colour-title">Choose a hue</h2></div>' +
        '<button type="button" class="vc-colour-close" aria-label="Close colour picker">×</button>' +
      '</div>' +
      '<div class="vc-colour-picker-panel">' +
        '<div class="vc-colour-wheel-wrap"><div class="vc-colour-wheel" role="group" aria-label="Colour wheel"><span class="vc-colour-cursor"></span></div></div>' +
        '<div class="vc-colour-brightness">' +
          '<div class="vc-colour-brightness-head"><label for="vc-colour-slider" class="vc-colour-label">Brightness</label><span class="vc-colour-hex"></span></div>' +
          '<input class="vc-colour-slider" id="vc-colour-slider" type="range" min="0" max="100" step="1" value="100">' +
        '</div>' +
        '<div class="vc-colour-preview-row">' +
          '<div class="vc-colour-current"><span class="vc-colour-preview-swatch"></span><span class="vc-colour-muted">Live preview</span></div>' +
          '<button type="button" class="vc-colour-done">Done</button>' +
        '</div>' +
        '<div><div class="vc-colour-label">Recent colours</div><div class="vc-colour-recents"></div></div>' +
        '<button type="button" class="vc-colour-reset">Reset to default</button>' +
      '</div>' +
    '</section>';
  document.body.appendChild(overlay);

  const wheel = overlay.querySelector(".vc-colour-wheel");
  const cursor = overlay.querySelector(".vc-colour-cursor");
  const slider = overlay.querySelector(".vc-colour-slider");
  const preview = overlay.querySelector(".vc-colour-preview-swatch");
  const readout = overlay.querySelector(".vc-colour-hex");
  const recentsContainer = overlay.querySelector(".vc-colour-recents");
  let picker = { h: 0, s: 0, v: 1 };
  let pointerId = null;

  function hexToRgb(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
  }
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * (((b - r) / d) + 2);
      else h = 60 * (((r - g) / d) + 4);
    }
    if (h < 0) h += 360;
    return { h: h, s: max === 0 ? 0 : d / max, v: max };
  }
  function hsvToHex(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    const toHex = function (n) {
      return Math.round((n + m) * 255).toString(16).padStart(2, "0");
    };
    return "#" + toHex(r) + toHex(g) + toHex(b);
  }
  function setPickerFromHex(hex) {
    const rgb = hexToRgb(hex);
    picker = rgbToHsv(rgb.r, rgb.g, rgb.b);
    slider.value = Math.round(picker.v * 100);
  }
  function updateCursor() {
    if (overlay.hidden) return;
    const radius = wheel.clientWidth / 2;
    const distance = picker.s * radius * .92;
    const angle = picker.h * Math.PI / 180;
    cursor.style.left = (radius + Math.cos(angle) * distance) + "px";
    cursor.style.top = (radius + Math.sin(angle) * distance) + "px";
  }
  function updateColour() {
    selected = hsvToHex(picker.h, picker.s, picker.v);
    nativeInput.value = selected;
    nativeInput.dispatchEvent(new Event("input", { bubbles: true }));
    buttonSwatch.style.background = selected;
    preview.style.background = selected;
    readout.textContent = selected.toUpperCase();
    const baseHex = hsvToHex(picker.h, picker.s, 1);
    slider.style.setProperty("--picker-base", baseHex);
    wheel.style.setProperty("--wheel-darkness", String(Math.max(0, 1 - picker.v) * .72));
    updateCursor();
    recentsContainer.querySelectorAll(".vc-colour-recent").forEach(function (el) {
      el.classList.toggle("active", el.dataset.color.toLowerCase() === selected.toLowerCase());
    });
  }
  function getRecents() {
    try {
      const saved = JSON.parse(readStored(RECENTS_KEY, "[]"));
      return Array.isArray(saved) ? saved.filter(validHex).slice(0, 8) : [];
    } catch (_) {
      return [];
    }
  }
  function renderRecents() {
    recentsContainer.replaceChildren();
    const recents = getRecents();
    if (!recents.length) {
      const empty = document.createElement("span");
      empty.className = "vc-colour-muted";
      empty.textContent = "Your recent colours will appear here.";
      recentsContainer.append(empty);
      return;
    }
    recents.forEach(function (hex) {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "vc-colour-recent";
      swatch.dataset.color = hex;
      swatch.title = hex.toUpperCase();
      swatch.setAttribute("aria-label", "Use colour " + hex.toUpperCase());
      swatch.style.background = hex;
      swatch.addEventListener("click", function () {
        setPickerFromHex(hex);
        updateColour();
      });
      recentsContainer.append(swatch);
    });
  }
  function rememberSelected() {
    store(SELECTED_KEY, selected);
    const recent = getRecents().filter(function (hex) {
      return hex.toLowerCase() !== selected.toLowerCase();
    });
    recent.unshift(selected);
    store(RECENTS_KEY, JSON.stringify(recent.slice(0, 8)));
  }
  function openPicker() {
    if (!overlay.hidden) return;
    setPickerFromHex(nativeInput.value);
    overlay.hidden = false;
    renderRecents();
    updateColour();
    overlay.querySelector(".vc-colour-close").focus();
  }
  function closePicker() {
    if (overlay.hidden) return;
    overlay.hidden = true;
    pointerId = null;
    rememberSelected();
    colourButton.focus();
  }

  function updateFromPointer(event) {
    const rect = wheel.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    const radius = rect.width / 2;
    const dist = Math.min(Math.hypot(dx, dy), radius * .92);
    picker.s = Math.max(0, Math.min(1, dist / (radius * .92)));
    picker.h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    updateColour();
  }
  wheel.addEventListener("pointerdown", function (event) {
    event.preventDefault();
    pointerId = event.pointerId;
    wheel.setPointerCapture(event.pointerId);
    updateFromPointer(event);
  });
  wheel.addEventListener("pointermove", function (event) {
    if (pointerId === event.pointerId) {
      event.preventDefault();
      updateFromPointer(event);
    }
  });
  function stopPointer(event) {
    if (pointerId === event.pointerId) {
      pointerId = null;
      if (wheel.hasPointerCapture(event.pointerId)) {
        wheel.releasePointerCapture(event.pointerId);
      }
    }
  }
  wheel.addEventListener("pointerup", stopPointer);
  wheel.addEventListener("pointercancel", stopPointer);
  slider.addEventListener("input", function () {
    picker.v = Number(slider.value) / 100;
    updateColour();
  });
  overlay.querySelector(".vc-colour-reset").addEventListener("click", function () {
    setPickerFromHex(DEFAULT_COLOR);
    updateColour();
  });
  colourButton.addEventListener("click", openPicker);
  overlay.querySelector(".vc-colour-close").addEventListener("click", closePicker);
  overlay.querySelector(".vc-colour-done").addEventListener("click", closePicker);
  overlay.addEventListener("pointerdown", function (event) {
    if (event.target === overlay) closePicker();
  });
  document.addEventListener("keydown", function (event) {
    if (!overlay.hidden && event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      closePicker();
    }
  }, true);
  window.addEventListener("resize", updateCursor);
  document.getElementById("annotationDone").addEventListener("click", closePicker);
})();
