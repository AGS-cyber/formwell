/*
 * Shared motion controller.
 *
 * - Motion runs only when ALL are true: the visitor wants it (OS reduced-motion
 *   setting, or the on-page toggle), a decorative scene is on screen, and the
 *   tab is visible.
 * - The state is mirrored to <html data-motion="on|off">; CSS animations are
 *   written only under [data-motion="on"], so without JavaScript nothing moves.
 * - Directions with script-driven art subscribe with JLMotion.onChange().
 * - The toggle preference lasts for this browser session only.
 */
(function () {
  "use strict";

  var root = document.documentElement;
  var KEY = "jl-motion";
  var reduceQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  function readPreference() {
    try {
      return window.sessionStorage.getItem(KEY);
    } catch (error) {
      return null;
    }
  }

  function writePreference(value) {
    try {
      window.sessionStorage.setItem(KEY, value);
    } catch (error) {
      /* Storage can be unavailable; the toggle still works on this page. */
    }
  }

  var stored = readPreference();
  var wantsMotion = stored ? stored === "on" : !(reduceQuery && reduceQuery.matches);
  var scenes = Array.prototype.slice.call(document.querySelectorAll("[data-motion-scene]"));
  var toggles = Array.prototype.slice.call(document.querySelectorAll("[data-motion-toggle]"));
  var sceneVisible = scenes.length > 0 && !("IntersectionObserver" in window);
  var running = null;
  var listeners = [];

  function update() {
    var next = wantsMotion && sceneVisible && !document.hidden;
    root.setAttribute("data-motion", next ? "on" : "off");
    root.setAttribute("data-motion-wanted", wantsMotion ? "on" : "off");
    toggles.forEach(function (button) {
      var label = button.querySelector("[data-motion-label]") || button;
      label.textContent = wantsMotion ? "Pause motion" : "Play motion";
      button.setAttribute("data-state", wantsMotion ? "playing" : "paused");
    });
    if (next !== running) {
      running = next;
      listeners.forEach(function (listener) {
        listener(running);
      });
    }
  }

  toggles.forEach(function (button) {
    button.hidden = false;
    button.addEventListener("click", function () {
      wantsMotion = !wantsMotion;
      writePreference(wantsMotion ? "on" : "off");
      update();
    });
  });

  if (reduceQuery) {
    var onReduceChange = function (event) {
      if (!readPreference()) {
        wantsMotion = !event.matches;
        update();
      }
    };
    if (reduceQuery.addEventListener) {
      reduceQuery.addEventListener("change", onReduceChange);
    } else if (reduceQuery.addListener) {
      reduceQuery.addListener(onReduceChange);
    }
  }

  if ("IntersectionObserver" in window && scenes.length) {
    var visibility = new Map();
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        visibility.set(entry.target, entry.isIntersecting);
      });
      sceneVisible = Array.from(visibility.values()).some(Boolean);
      update();
    }, { rootMargin: "80px 0px" });
    scenes.forEach(function (scene) {
      observer.observe(scene);
    });
  }

  document.addEventListener("visibilitychange", update);

  window.JLMotion = Object.freeze({
    onChange: function (listener) {
      listeners.push(listener);
      listener(running === true);
    },
    isRunning: function () {
      return running === true;
    },
    isWanted: function () {
      return wantsMotion;
    },
  });

  update();
})();
