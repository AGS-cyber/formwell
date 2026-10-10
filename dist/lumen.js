/*
 * Lumen: capability explorer and turntable stage.
 *
 * Without JavaScript the four capabilities are a plain ruled list and the
 * stage is a static composition (customer portal in front). With it, they
 * become a tablist (arrow keys, Home/End); choosing one turns the stage the
 * short way round so that capability's pane is front and centre. Panel height
 * stays stable because every panel shares one grid cell.
 *
 * The stage only moves when the visitor asks: a tab choice, or a gentle tilt
 * that follows a mouse pointer over the stage itself (never touch). Nothing
 * runs while idle, so there is no motion to pause. With reduced motion the
 * tilt is off and the CSS makes the turn instant.
 *
 * On phones (portrait) and short landscape screens the tablist is a one-row
 * segmented control under the stage; its aria-orientation follows that.
 */
(function (global) {
  "use strict";

  var POSITIONS = ["front", "right", "back", "left"];
  /* Keep in sync with the segmented-control media queries in lumen.css (tested). */
  var SEGMENTED_QUERY =
    "(max-width: 699px) and (orientation: portrait), (orientation: landscape) and (max-height: 500px) and (min-width: 480px) and (max-width: 1023px)";
  var REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

  /* Shortest signed number of quarter turns from one index to another. */
  function ringStep(from, to, count) {
    var delta = (((to - from) % count) + count) % count;
    if (delta > count / 2) delta -= count;
    return delta;
  }

  function positionOf(index, active, count) {
    var slot = (((index - active) % count) + count) % count;
    return count === POSITIONS.length ? POSITIONS[slot] : "slot-" + slot;
  }

  global.JLLumen = Object.freeze({
    ringStep: ringStep,
    positionOf: positionOf,
    SEGMENTED_QUERY: SEGMENTED_QUERY,
    REDUCED_QUERY: REDUCED_QUERY,
  });

  if (typeof document === "undefined") return;

  var stage = document.querySelector("[data-stage]");
  var explorer = document.querySelector(".explorer");
  var tablist = document.querySelector("[data-tabs]");
  var panelsWrap = document.querySelector("[data-panels]");
  if (!stage || !tablist || !panelsWrap) return;

  var tabs = Array.prototype.slice.call(tablist.querySelectorAll("[role='tab']"));
  var panels = Array.prototype.slice.call(panelsWrap.querySelectorAll("[data-panel]"));
  var panes = Array.prototype.slice.call(stage.querySelectorAll("[data-pane]"));
  var keys = tabs.map(function (tab) {
    return tab.getAttribute("data-tab");
  });
  if (!tabs.length || tabs.length !== panels.length) return;

  function media(query) {
    return global.matchMedia ? global.matchMedia(query) : null;
  }

  function onMediaChange(list, listener) {
    if (!list) return;
    if (list.addEventListener) list.addEventListener("change", listener);
    else if (list.addListener) list.addListener(listener);
  }

  tablist.hidden = false;
  panelsWrap.classList.add("is-tabbed");
  if (explorer) explorer.classList.add("is-tabbed");
  panels.forEach(function (panel) {
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", "tab-" + panel.getAttribute("data-panel"));
  });

  var segmented = media(SEGMENTED_QUERY);
  function syncOrientation() {
    tablist.setAttribute("aria-orientation", segmented && segmented.matches ? "horizontal" : "vertical");
  }
  onMediaChange(segmented, syncOrientation);
  syncOrientation();

  var current = 0;
  var ring = 0;

  function select(index, moveFocus) {
    ring -= ringStep(current, index, keys.length) * 90;
    current = index;
    stage.style.setProperty("--ring", ring + "deg");
    stage.setAttribute("data-active", keys[index]);

    tabs.forEach(function (tab, i) {
      var on = i === index;
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.tabIndex = on ? 0 : -1;
      if (on && moveFocus) tab.focus();
    });
    panels.forEach(function (panel) {
      var on = panel.getAttribute("data-panel") === keys[index];
      if (on) panel.removeAttribute("data-inactive");
      else panel.setAttribute("data-inactive", "");
    });
    panes.forEach(function (pane) {
      var paneIndex = keys.indexOf(pane.getAttribute("data-pane"));
      pane.setAttribute("data-pos", positionOf(paneIndex, index, keys.length));
    });
  }

  tabs.forEach(function (tab, index) {
    tab.addEventListener("click", function () {
      select(index, false);
    });
    tab.addEventListener("keydown", function (event) {
      var next = -1;
      if (event.key === "ArrowDown" || event.key === "ArrowRight") next = (index + 1) % tabs.length;
      else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      if (next > -1) {
        event.preventDefault();
        select(next, true);
      }
    });
  });

  select(0, false);

  /* ---------- Pointer tilt: mouse over the stage only, eased by CSS, no loop ---------- */

  var tilt = stage.querySelector(".stage__tilt");
  var reduced = media(REDUCED_QUERY);
  var frame = 0;
  var px = 0;
  var py = 0;

  function applyTilt() {
    frame = 0;
    tilt.style.setProperty("--px", px.toFixed(3));
    tilt.style.setProperty("--py", py.toFixed(3));
  }

  function queue() {
    if (!frame) frame = global.requestAnimationFrame(applyTilt);
  }

  function settle() {
    if (px || py) {
      px = 0;
      py = 0;
      queue();
    }
  }

  if (tilt) {
    stage.addEventListener("pointermove", function (event) {
      if (event.pointerType !== "mouse" || (reduced && reduced.matches)) return;
      var rect = stage.getBoundingClientRect();
      px = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
      py = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
      queue();
    }, { passive: true });

    stage.addEventListener("pointerleave", settle);
    onMediaChange(reduced, function () {
      if (reduced.matches) settle();
    });
  }
})(typeof window !== "undefined" ? window : this);
