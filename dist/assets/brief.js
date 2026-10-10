/*
 * Shared, local-only "describe what you want built" engine.
 *
 * Nothing typed here is sent, stored or logged. Answers stay in the page's
 * memory, become a plain-text email draft the visitor can copy and, only when
 * a real address is configured in config.js, an optional mailto link that the
 * visitor opens themselves.
 *
 * One engine powers three different interfaces:
 *   - an inline form            [data-brief]
 *   - an inline letter          [data-brief] with [data-brief-starter] buttons
 *   - a stepped modal dialog    <dialog data-brief data-brief-replace> with [data-step] fieldsets
 *
 * The pure helpers are exposed as window.JLBrief so Node tests can check them.
 */
(function (global) {
  "use strict";

  var PLACEHOLDER = "YOUR_EMAIL_HERE";
  var MIN_CHARS = 12;
  var MAX_MAILTO_LENGTH = 1900;
  var EMAIL_PATTERN = /^[A-Za-z0-9_+-]+(?:\.[A-Za-z0-9_+-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

  var KINDS = {
    portal: { label: "Customer portal", phrase: "a customer portal" },
    tool: { label: "Internal tool", phrase: "an internal tool" },
    booking: { label: "Booking or workflow app", phrase: "a booking or workflow app" },
    dashboard: { label: "Dashboard", phrase: "a dashboard" },
    other: { label: "", phrase: "" },
  };

  var MESSAGES = {
    empty: "Add a sentence or two about what you'd like built.",
    short: "Add a little more detail. One full sentence is plenty.",
  };

  function clean(value) {
    return String(value == null ? "" : value).replace(/\r\n?/g, "\n").trim();
  }

  function oneLine(value) {
    return clean(value).replace(/\s+/g, " ");
  }

  function isUsableEmail(value) {
    var address = clean(value);
    return address !== PLACEHOLDER && address.length <= 254 && EMAIL_PATTERN.test(address);
  }

  /* Returns "" when the description is usable, otherwise "empty" or "short". */
  function validateProject(text) {
    var value = oneLine(text);
    if (!value) return "empty";
    if (value.length < MIN_CHARS) return "short";
    return "";
  }

  /* ---------- Unicode safety ---------- */

  function isHighSurrogate(code) {
    return code >= 0xd800 && code <= 0xdbff;
  }

  function isLowSurrogate(code) {
    return code >= 0xdc00 && code <= 0xdfff;
  }

  /* Like text.slice(0, end), but never splits a surrogate pair (an emoji, for example). */
  function sliceSafe(text, end) {
    var value = String(text);
    var at = Math.max(0, Math.min(end, value.length));
    if (at > 0 && at < value.length && isHighSurrogate(value.charCodeAt(at - 1)) && isLowSurrogate(value.charCodeAt(at))) {
      at -= 1;
    }
    return value.slice(0, at);
  }

  /*
   * Replaces lone surrogates (malformed pasted UTF-16) with U+FFFD and leaves
   * valid pairs untouched, so encodeURIComponent can never throw.
   * Equivalent to String.prototype.toWellFormed, written for older browsers.
   */
  function wellFormed(text) {
    var value = String(text == null ? "" : text);
    if (!/[\uD800-\uDFFF]/.test(value)) return value;
    var out = "";
    for (var i = 0; i < value.length; i += 1) {
      var code = value.charCodeAt(i);
      if (isHighSurrogate(code) && isLowSurrogate(value.charCodeAt(i + 1))) {
        out += value.charAt(i) + value.charAt(i + 1);
        i += 1;
      } else if (isHighSurrogate(code) || isLowSurrogate(code)) {
        out += String.fromCharCode(0xfffd);
      } else {
        out += value.charAt(i);
      }
    }
    return out;
  }

  function summarize(text, max) {
    var value = oneLine(text);
    if (value.length <= max) return value;
    var cut = sliceSafe(value, max - 1);
    var space = cut.lastIndexOf(" ");
    if (space > max * 0.6) cut = cut.slice(0, space);
    return cut.replace(/[\s,.;:!?-]+$/, "") + "…";
  }

  /*
   * options.recipient sets the greeting ("Hi Formwell," on the selected Lumen
   * page, from data-recipient on its form). Without it the greeting is the
   * original "Hi there," so Assembly and Margin produce exactly what they did.
   */
  function composeDraft(fields, options) {
    var source = fields || {};
    var kind = Object.prototype.hasOwnProperty.call(KINDS, source.kind) ? KINDS[source.kind] : null;
    var project = clean(source.project);
    var users = oneLine(source.users);
    var today = oneLine(source.today);
    var name = oneLine(source.name);
    var business = oneLine(source.business);
    var topic = kind && kind.label ? kind.label : "Web app idea";
    var recipient = options ? oneLine(options.recipient) : "";

    var lines = [
      recipient ? "Hi " + recipient + "," : "Hi there,",
      "",
      "I'd like to talk about building " + (kind && kind.phrase ? kind.phrase : "a web app") + ".",
      "",
      project,
      "",
    ];
    if (users) lines.push("Who will use it: " + users);
    if (today) lines.push("How it's handled today: " + today);
    if (users || today) lines.push("");
    lines.push(source.next === "call"
      ? "Could we start with a short discovery conversation?"
      : "Happy to continue by email to start with.");
    lines.push("", "Thanks,");
    if (name) lines.push(name);
    if (business) lines.push(business);

    return {
      subject: topic + ": " + summarize(project, 56),
      body: lines.join("\n"),
    };
  }

  function draftText(draft) {
    return "Subject: " + draft.subject + "\n\n" + draft.body;
  }

  /* Only the link is normalised; the displayed and copied draft keeps exactly what was typed. */
  function encode(text) {
    return encodeURIComponent(wellFormed(text));
  }

  var SHORTENED_MARKER = "…\n\n[Shortened for the email link. Please paste the full copied draft here.]";

  /*
   * Returns null unless the address is real. When a draft is too long for a
   * reliable mailto link:
   *   - default: subject only (the page's note tells the visitor to paste the copy)
   *   - { shorten: true }: keep as much of the body as fits, then say plainly
   *     that it was shortened, so nothing is lost silently.
   */
  function buildMailto(address, draft, options) {
    if (!isUsableEmail(address)) return null;
    var base = "mailto:" + clean(address) + "?subject=" + encode(draft.subject) + "&body=";
    var full = base + encode(draft.body);
    if (full.length <= MAX_MAILTO_LENGTH) return { href: full, complete: true };
    if (!(options && options.shorten)) {
      return { href: "mailto:" + clean(address) + "?subject=" + encode(draft.subject), complete: false };
    }

    var budget = MAX_MAILTO_LENGTH - base.length - encode(SHORTENED_MARKER).length;
    var body = String(draft.body);
    var lo = 0;
    var hi = body.length;
    while (lo < hi) {
      var mid = Math.ceil((lo + hi) / 2);
      if (encode(sliceSafe(body, mid)).length <= budget) lo = mid;
      else hi = mid - 1;
    }
    var cut = sliceSafe(body, lo);
    var space = cut.lastIndexOf(" ");
    if (space > lo * 0.8) cut = cut.slice(0, space);
    return { href: base + encode(cut.replace(/\s+$/, "") + SHORTENED_MARKER), complete: false };
  }

  /*
   * Where focus belongs when a stepped dialog opens:
   *   "result"  the finished draft is showing
   *   "project" first step (or a capability button pre-filled the brief)
   *   "step"    the first field of whichever later step the visitor left open
   */
  function dialogFocusTarget(state) {
    if (state.resultVisible) return "result";
    if (state.prefilled || !state.stepped || !state.currentStep) return "project";
    return "step";
  }

  function contactEmailFor(config, site) {
    var entry = site && config.sites && Object.prototype.hasOwnProperty.call(config.sites, site) ? config.sites[site] : null;
    return clean(entry && Object.prototype.hasOwnProperty.call(entry, "contactEmail") ? entry.contactEmail : config.contactEmail);
  }

  global.JLBrief = Object.freeze({
    contactEmailFor: contactEmailFor,
    PLACEHOLDER: PLACEHOLDER,
    MIN_CHARS: MIN_CHARS,
    MESSAGES: MESSAGES,
    isUsableEmail: isUsableEmail,
    validateProject: validateProject,
    summarize: summarize,
    sliceSafe: sliceSafe,
    wellFormed: wellFormed,
    composeDraft: composeDraft,
    draftText: draftText,
    buildMailto: buildMailto,
    SHORTENED_MARKER: SHORTENED_MARKER,
    MAX_MAILTO_LENGTH: MAX_MAILTO_LENGTH,
    dialogFocusTarget: dialogFocusTarget,
  });

  if (typeof document === "undefined") return;

  /* ------------------------------------------------------------------ DOM */

  var config = global.SITE_CONFIG || {};
  var email = contactEmailFor(config, document.documentElement.getAttribute("data-site"));
  var emailReady = isUsableEmail(email);
  var reduceQuery = global.matchMedia ? global.matchMedia("(prefers-reduced-motion: reduce)") : null;

  function each(selector, scope, fn) {
    Array.prototype.forEach.call((scope || document).querySelectorAll(selector), fn);
  }

  function fillEmailSlots() {
    each("[data-contact-email]", document, function (node) {
      node.textContent = "";
      if (emailReady) {
        var link = document.createElement("a");
        link.href = "mailto:" + email;
        link.textContent = email;
        node.appendChild(link);
      } else {
        node.textContent = node.getAttribute("data-missing") || "address to be added";
      }
    });
    each("[data-if-email]", document, function (node) {
      node.hidden = !emailReady;
    });
    each("[data-if-no-email]", document, function (node) {
      node.hidden = emailReady;
    });
  }

  function initBrief(root) {
    var form = root.querySelector("[data-brief-form]");
    if (!form) return;
    form.noValidate = true;

    var project = form.elements.namedItem("project");
    var error = root.querySelector("[data-brief-error]");
    var status = root.querySelector("[data-brief-status]");
    var result = root.querySelector("[data-brief-result]");
    var resultHeading = root.querySelector("[data-brief-result-heading]");
    var output = root.querySelector("[data-brief-output]");
    var copyButton = root.querySelector("[data-brief-copy]");
    var mailtoLink = root.querySelector("[data-brief-mailto]");
    var note = root.querySelector("[data-brief-note]");
    var stale = root.querySelector("[data-brief-stale]");
    var steps = Array.prototype.slice.call(form.querySelectorAll("[data-step]"));
    var stepped = steps.length > 1;
    var replaceForm = root.hasAttribute("data-brief-replace");
    var shortenMailto = root.hasAttribute("data-mailto-shorten");
    var recipient = oneLine(root.getAttribute("data-recipient"));
    var dialog = root.tagName === "DIALOG" ? root : root.closest("dialog");
    var current = 0;
    var lastOpener = null;
    var hasDraft = false;
    var copyTimer = 0;
    var announceTimer = 0;

    function announce(message) {
      if (!status) return;
      global.clearTimeout(announceTimer);
      status.textContent = "";
      announceTimer = global.setTimeout(function () {
        status.textContent = message;
      }, 40);
    }

    function fieldValue(name) {
      var field = form.elements.namedItem(name);
      if (!field) return "";
      return clean(field.value);
    }

    function readFields() {
      return {
        kind: fieldValue("kind"),
        project: project.value,
        users: fieldValue("users"),
        today: fieldValue("today"),
        name: fieldValue("name"),
        business: fieldValue("business"),
        next: fieldValue("next"),
      };
    }

    function clearError() {
      project.removeAttribute("aria-invalid");
      if (error) {
        error.textContent = "";
        error.hidden = true;
      }
    }

    function validate() {
      var problem = validateProject(project.value);
      if (!problem) {
        clearError();
        return "";
      }
      project.setAttribute("aria-invalid", "true");
      if (error) {
        error.textContent = MESSAGES[problem];
        error.hidden = false;
      }
      return MESSAGES[problem];
    }

    function focusField(field) {
      if (!field) return;
      field.focus({ preventScroll: false });
      if (field.setSelectionRange && typeof field.value === "string") {
        var end = field.value.length;
        try {
          field.setSelectionRange(end, end);
        } catch (selectionError) {
          /* Some input types do not support selection. */
        }
      }
    }

    /* ---------- Steps (dialog wizard) ---------- */

    function stepIndexOf(node) {
      for (var i = 0; i < steps.length; i += 1) {
        if (steps[i].contains(node)) return i;
      }
      return 0;
    }

    function firstFieldIn(step) {
      var checked = step.querySelector("input[type='radio']:checked");
      if (checked) return checked;
      return step.querySelector("input, textarea, select");
    }

    function showStep(index, moveFocus) {
      if (!stepped) return;
      current = Math.max(0, Math.min(index, steps.length - 1));
      steps.forEach(function (step, i) {
        step.hidden = i !== current;
      });
      var last = current === steps.length - 1;
      each("[data-step-count]", root, function (node) {
        node.textContent = "Step " + (current + 1) + " of " + steps.length;
      });
      each("[data-step-dot]", root, function (node, i) {
        node.setAttribute("data-state", i < current ? "done" : i === current ? "current" : "todo");
      });
      each("[data-step-back]", root, function (button) {
        button.hidden = current === 0;
      });
      each("[data-step-next]", root, function (button) {
        button.textContent = last
          ? button.getAttribute("data-label-last") || "Prepare draft"
          : button.getAttribute("data-label-next") || "Next";
      });
      if (moveFocus) {
        var legend = steps[current].querySelector("legend");
        announce("Step " + (current + 1) + " of " + steps.length + (legend ? ": " + legend.textContent.trim() : ""));
        focusField(firstFieldIn(steps[current]));
      }
    }

    /* ---------- Draft ---------- */

    function sizeOutput() {
      if (!output) return;
      var lines = output.value.split("\n").length;
      output.rows = Math.max(8, Math.min(lines + 1, 20));
    }

    function resetCopyLabel() {
      if (!copyButton) return;
      global.clearTimeout(copyTimer);
      copyButton.textContent = copyButton.getAttribute("data-label") || "Copy draft";
      copyButton.removeAttribute("data-copied");
    }

    function finish() {
      var problem = validate();
      if (problem) {
        if (stepped) showStep(stepIndexOf(project), false);
        announce(problem);
        focusField(project);
        return;
      }
      var draft = composeDraft(readFields(), recipient ? { recipient: recipient } : undefined);
      output.value = draftText(draft);
      sizeOutput();
      resetCopyLabel();

      var mail = emailReady ? buildMailto(email, draft, { shorten: shortenMailto }) : null;
      if (mailtoLink) {
        if (mail) {
          mailtoLink.href = mail.href;
          mailtoLink.hidden = false;
        } else {
          mailtoLink.hidden = true;
          mailtoLink.removeAttribute("href");
        }
      }
      if (note) {
        var key = !mail ? "data-note-missing" : mail.complete ? "data-note-ready" : "data-note-long";
        note.textContent = note.getAttribute(key) || "";
      }
      if (stale) stale.hidden = true;
      if (replaceForm) form.hidden = true;
      result.hidden = false;
      hasDraft = true;
      announce("Your draft is ready. Nothing has been sent.");
      if (resultHeading) {
        resultHeading.focus();
      } else {
        output.focus();
      }
    }

    function backToForm(index) {
      if (replaceForm) {
        result.hidden = true;
        form.hidden = false;
      }
      if (stepped) {
        showStep(index || 0, false);
      }
      focusField(project);
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (stepped && current < steps.length - 1) {
        if (steps[current].contains(project)) {
          var problem = validate();
          if (problem) {
            announce(problem);
            focusField(project);
            return;
          }
        }
        showStep(current + 1, true);
        return;
      }
      finish();
    });

    form.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        finish();
      }
    });

    form.addEventListener("input", function (event) {
      if (event.target === project && project.getAttribute("aria-invalid") === "true" && !validateProject(project.value)) {
        clearError();
      }
      if (hasDraft && stale && !replaceForm) {
        stale.hidden = false;
      }
    });

    each("[data-step-back]", root, function (button) {
      button.addEventListener("click", function () {
        showStep(current - 1, true);
      });
    });

    if (copyButton && output) {
      copyButton.addEventListener("click", function () {
        var text = output.value;
        if (!text) return;

        function legacyCopy() {
          try {
            output.focus();
            output.select();
            return document.execCommand("copy");
          } catch (copyError) {
            return false;
          }
        }

        function report(ok) {
          if (ok) {
            copyButton.textContent = copyButton.getAttribute("data-label-done") || "Copied";
            copyButton.setAttribute("data-copied", "");
            global.clearTimeout(copyTimer);
            copyTimer = global.setTimeout(resetCopyLabel, 2600);
            announce("Draft copied to your clipboard.");
          } else {
            output.focus();
            output.select();
            announce("Copying isn't available here. The draft is selected, so press Ctrl+C (or Command+C on a Mac).");
          }
        }

        if (global.navigator && global.navigator.clipboard && global.isSecureContext) {
          global.navigator.clipboard.writeText(text).then(function () {
            report(true);
          }, function () {
            report(legacyCopy());
          });
        } else {
          report(legacyCopy());
        }
      });
    }

    each("[data-brief-edit]", root, function (button) {
      button.addEventListener("click", function () {
        backToForm(0);
      });
    });

    /* ---------- Starter lines (letter) ---------- */

    function insertText(text) {
      var value = project.value.replace(/\s+$/, "");
      if (!value) {
        project.value = text;
      } else if (value.indexOf(text) === -1) {
        project.value = value + (/[.!?]$/.test(value) ? " " : ". ") + text;
      }
      project.dispatchEvent(new Event("input", { bubbles: true }));
      focusField(project);
    }

    each("[data-brief-starter]", root, function (button) {
      button.addEventListener("click", function () {
        insertText(button.getAttribute("data-text") || button.textContent.trim());
      });
    });

    /* ---------- Openers ---------- */

    function applyPrefill(opener) {
      var kind = opener.getAttribute("data-kind");
      var text = opener.getAttribute("data-text");
      if (kind) {
        var radio = form.querySelector("input[name='kind'][value='" + kind + "']");
        if (radio) radio.checked = true;
      }
      if (text && !clean(project.value)) {
        project.value = text;
        project.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return Boolean(kind || text);
    }

    if (root.id) {
      each("[data-brief-open='#" + root.id + "']", document, function (opener) {
        opener.addEventListener("click", function (event) {
          if (dialog && typeof dialog.showModal !== "function") return; /* plain link fallback */
          event.preventDefault();
          lastOpener = opener;
          var prefilled = applyPrefill(opener);
          if (dialog) {
            /* A capability button means "start from this": show step 1, keep every answer. */
            if (prefilled) {
              if (hasDraft && !result.hidden) backToForm(0);
              else if (stepped) showStep(0, false);
            }
            if (!dialog.open) dialog.showModal();
            var target = dialogFocusTarget({
              resultVisible: !result.hidden,
              prefilled: prefilled,
              stepped: stepped,
              currentStep: current,
            });
            if (target === "result") focusField(resultHeading || output);
            else if (target === "step") focusField(firstFieldIn(steps[current]));
            else focusField(project);
          } else {
            var smooth = !(reduceQuery && reduceQuery.matches);
            root.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
            project.focus({ preventScroll: true });
          }
        });
      });
    }

    if (dialog) {
      each("[data-dialog-close]", dialog, function (button) {
        button.addEventListener("click", function () {
          dialog.close();
        });
      });
      dialog.addEventListener("close", function () {
        if (lastOpener && document.contains(lastOpener)) lastOpener.focus();
      });
    }

    if (stepped) showStep(0, false);
  }

  /*
   * Pages can mark controls that only work with this script ([data-requires-js],
   * shipped hidden) and fallback text for visitors without it ([data-no-js]).
   * The helper is a modal dialog, so both switch only where <dialog> works.
   */
  function swapScriptFallbacks() {
    if (typeof global.HTMLDialogElement !== "function") return;
    each("[data-requires-js]", document, function (node) {
      node.hidden = false;
    });
    each("[data-no-js]", document, function (node) {
      node.hidden = true;
    });
  }

  function start() {
    fillEmailSlots();
    swapScriptFallbacks();
    each("[data-brief]", document, initBrief);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})(typeof window !== "undefined" ? window : this);
