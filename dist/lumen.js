/*
 * Lumen: turntable stage and capability explorer. Without JavaScript the
 * capabilities are a plain list and the stage is static. With it, swiping
 * (touch) or dragging (mouse) the stage turns the next capability to the
 * front; four dots under it are the tablist, the keyboard (arrows, Home/End)
 * and screen-reader route. Scrolling and pinch-zoom stay native
 * (touch-action: pan-y pinch-zoom; no preventDefault); only a clear, long
 * enough sideways move turns. Nothing runs while idle; reduced motion means
 * no follow or tilt, and an instant turn (CSS).
 */
(function (global) {
  "use strict";

  var POSITIONS = ["front", "right", "back", "left"];
  var REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
  /* Direction decided after `lock` px; a turn needs 12% of the stage (40-90px), `ratio` x more sideways than vertical. */
  var SWIPE = Object.freeze({ lock: 10, min: 40, max: 90, share: 0.12, ratio: 1.6 });

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

  /* "" until past `lock`, then "x" (a turn) or "y" (a scroll or diagonal, given back). */
  function axisOf(dx, dy) {
    if (Math.abs(dx) < SWIPE.lock && Math.abs(dy) < SWIPE.lock) return "";
    return Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
  }

  /* 1 (moved left: next), -1 (previous) or 0. */
  function swipeStep(dx, dy, width) {
    var need = Math.max(SWIPE.min, Math.min(SWIPE.max, width * SWIPE.share));
    if (Math.abs(dx) < need || Math.abs(dx) < Math.abs(dy) * SWIPE.ratio) return 0;
    return dx < 0 ? 1 : -1;
  }

  global.JLLumen = Object.freeze({
    ringStep: ringStep,
    positionOf: positionOf,
    axisOf: axisOf,
    swipeStep: swipeStep,
    SWIPE: SWIPE,
    REDUCED_QUERY: REDUCED_QUERY,
  });

  if (typeof document === "undefined") return;

  var stage = document.querySelector("[data-stage]");
  var explorer = document.querySelector(".explorer");
  var dial = document.querySelector("[data-dial]");
  var tablist = document.querySelector("[data-tabs]");
  var panelsWrap = document.querySelector("[data-panels]");
  var status = document.querySelector("[data-dial-status]");
  if (!stage || !tablist || !panelsWrap) return;

  var tabs = Array.prototype.slice.call(tablist.querySelectorAll("[role='tab']"));
  var panels = Array.prototype.slice.call(panelsWrap.querySelectorAll("[data-panel]"));
  var panes = Array.prototype.slice.call(stage.querySelectorAll("[data-pane]"));
  var keys = tabs.map(function (tab) {
    return tab.getAttribute("data-tab");
  });
  var names = tabs.map(function (tab) {
    return tab.textContent.trim();
  });
  if (!tabs.length || tabs.length !== panels.length) return;

  var reduced = global.matchMedia ? global.matchMedia(REDUCED_QUERY) : null;
  function still() {
    return Boolean(reduced && reduced.matches);
  }

  if (dial) dial.hidden = false;
  tablist.hidden = false;
  panelsWrap.classList.add("is-tabbed");
  if (explorer) explorer.classList.add("is-tabbed");
  stage.classList.add("is-swipeable");
  panels.forEach(function (panel) {
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", "tab-" + panel.getAttribute("data-panel"));
  });

  var current = 0;
  var ring = 0;

  /* announce: a gesture changed it (focus stays put), so the status line says so. */
  function select(index, moveFocus, announce) {
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
    if (announce && status) status.textContent = names[index] + ", " + (index + 1) + " of " + keys.length;
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

  /* ---------- Swipe/drag and mouse tilt: one frame per change, never a loop ---------- */

  var tilt = stage.querySelector(".stage__tilt");
  var frame = 0;
  var lean = 0; /* degrees the ring follows a sideways drag */
  var px = 0;
  var py = 0;
  var drag = null;
  var quietUntil = 0;

  function paint() {
    frame = 0;
    stage.style.setProperty("--ring", ring + lean + "deg");
    if (tilt) {
      tilt.style.setProperty("--px", px.toFixed(3));
      tilt.style.setProperty("--py", py.toFixed(3));
    }
  }

  function queue() {
    if (!frame) frame = global.requestAnimationFrame(paint);
  }

  /* Only a finished, single-pointer, sideways gesture turns the stage. */
  function endDrag(finished) {
    if (!drag) return;
    var gesture = drag;
    drag = null;
    lean = 0;
    stage.classList.remove("is-dragging");
    if (stage.hasPointerCapture && stage.hasPointerCapture(gesture.id)) stage.releasePointerCapture(gesture.id);
    var step = finished && gesture.axis === "x" ? swipeStep(gesture.dx, gesture.dy, stage.clientWidth) : 0;
    if (step) select((current + step + keys.length) % keys.length, false, true);
    else queue();
  }

  /* Starts only from a lone primary pointer (a later finger is never primary) and the main button. */
  stage.addEventListener("pointerdown", function (event) {
    endDrag(false); /* a press whose end was never seen */
    if (!event.isPrimary || event.button !== 0) return;
    drag = { id: event.pointerId, mouse: event.pointerType === "mouse", x: event.clientX, y: event.clientY, dx: 0, dy: 0, axis: "" };
    px = 0;
    py = 0;
    try {
      stage.setPointerCapture(event.pointerId);
    } catch (error) {
      /* Uncaptured: leaving the stage ends it (pointerleave). */
    }
  });

  stage.addEventListener("pointermove", function (event) {
    if (drag && event.pointerId === drag.id) {
      drag.dx = event.clientX - drag.x;
      drag.dy = event.clientY - drag.y;
      if (!drag.axis) {
        drag.axis = axisOf(drag.dx, drag.dy);
        if (drag.axis === "y") {
          endDrag(false);
          return;
        }
        if (drag.axis === "x") stage.classList.add("is-dragging");
      }
      if (drag.axis === "x" && !still()) {
        lean = Math.max(-60, Math.min(60, (drag.dx / stage.clientWidth) * 110));
        queue();
      }
      return;
    }
    /* Tilt: hovering mouse only (no button held, read live), never mid-drag or with reduced motion. */
    if (event.pointerType !== "mouse" || event.buttons || drag || still() || !tilt) return;
    var rect = stage.getBoundingClientRect();
    px = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
    py = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
    queue();
  }, { passive: true });

  /*
   * Document capture, observe only (nothing is prevented): any other pointer
   * going down anywhere (a second finger on the heading, a pen) cancels the
   * drag; the drag's own lift or cancel ends it wherever it lands.
   */
  function lift(event) {
    if (!drag || event.pointerId !== drag.id) return;
    if (drag.axis === "x" && drag.mouse) quietUntil = Date.now() + 400;
    endDrag(event.type === "pointerup");
  }

  document.addEventListener("pointerdown", function (event) {
    quietUntil = 0; /* a new press disarms the click guard below */
    if (drag && event.pointerId !== drag.id) endDrag(false);
  }, true);
  document.addEventListener("pointerup", lift, true);
  document.addEventListener("pointercancel", lift, true);
  stage.addEventListener("lostpointercapture", function (event) {
    if (drag && event.pointerId === drag.id) endDrag(false);
  });
  stage.addEventListener("pointerleave", function (event) {
    if (drag && event.pointerId === drag.id && !stage.hasPointerCapture(event.pointerId)) endDrag(false);
    if (!drag && (px || py)) {
      px = 0;
      py = 0;
      queue();
    }
  });

  /* Swallow only the click a sideways mouse drag leaves behind. */
  document.addEventListener("click", function (event) {
    if (event.detail > 0 && Date.now() < quietUntil) {
      quietUntil = 0;
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  if (reduced) {
    var settle = function () {
      if (still()) {
        lean = 0;
        px = 0;
        py = 0;
        queue();
      }
    };
    if (reduced.addEventListener) reduced.addEventListener("change", settle);
    else if (reduced.addListener) reduced.addListener(settle);
  }
})(typeof window !== "undefined" ? window : this);
