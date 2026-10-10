/*
 * Lumen: capability explorer and turntable stage.
 *
 * Without JavaScript the four capabilities are a plain ruled list and the
 * stage is a static composition (customer portal in front). With it, they
 * become a vertical tablist (arrow keys, Home/End); choosing one turns the
 * stage the short way round so that capability's pane is front and centre.
 * Panel height stays stable because every panel shares one grid cell.
 * A gentle pointer tilt runs only while motion is on and the pointer is over
 * the stage itself; nothing loops while idle.
 */
(function (global) {
  "use strict";

  var POSITIONS = ["front", "right", "back", "left"];

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

  global.JLLumen = Object.freeze({ ringStep: ringStep, positionOf: positionOf });

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

  tablist.hidden = false;
  panelsWrap.classList.add("is-tabbed");
  if (explorer) explorer.classList.add("is-tabbed");
  panels.forEach(function (panel) {
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", "tab-" + panel.getAttribute("data-panel"));
  });

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

  /* ---------- Pointer tilt: stage only, eased by CSS, no loop ---------- */

  var tilt = stage.querySelector(".stage__tilt");
  var motion = global.JLMotion;
  var running = false;
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

  if (tilt) {
    stage.addEventListener("pointermove", function (event) {
      if (!running || event.pointerType !== "mouse") return;
      var rect = stage.getBoundingClientRect();
      px = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
      py = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
      queue();
    }, { passive: true });

    stage.addEventListener("pointerleave", function () {
      px = 0;
      py = 0;
      queue();
    });

    if (motion) {
      motion.onChange(function (on) {
        running = on;
        if (!on && (px || py)) {
          px = 0;
          py = 0;
          queue();
        }
      });
    }
  }
})(typeof window !== "undefined" ? window : this);
