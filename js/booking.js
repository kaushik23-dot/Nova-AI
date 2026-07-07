/* =============================================================================
   NOVA — booking page logic (vanilla JS, no dependencies)
   -----------------------------------------------------------------------------
   Talks to the Apps Script web app (see apps-script/Code.gs + RUNBOOK.md).
   POSTs are sent as text/plain so the browser never issues a CORS preflight
   (Apps Script web apps can't answer OPTIONS requests).
   ============================================================================= */
(function () {
  "use strict";

  /* PASTE THE APPS SCRIPT WEB APP URL HERE after deploying the backend.
     While it's empty: localhost runs a mock backend for design/testing,
     and production shows a "booking opens soon" notice instead of the form. */
  var API_URL = "https://script.google.com/macros/s/AKfycbyKcc41_8MrMh7jn673A2_zEp_eScYpFOKs4_wBxAe0koHxhmdZUqwQyOCFM9lFFgpF/exec";

  var IS_LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var MOCK = !API_URL && IS_LOCAL;

  var TZ = "Pacific/Auckland";
  var MAX_AHEAD_DAYS = 28;
  var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  /* ---------------------------------------------------------------------------
     Elements
  --------------------------------------------------------------------------- */
  var el = {
    offline:  document.getElementById("booking-offline"),
    steps:    document.getElementById("booking-steps"),
    typeBtns: Array.prototype.slice.call(document.querySelectorAll(".choice")),
    calStep:  document.getElementById("step-time"),
    calTitle: document.getElementById("cal-title"),
    calGrid:  document.getElementById("cal-grid"),
    calPrev:  document.getElementById("cal-prev"),
    calNext:  document.getElementById("cal-next"),
    slotsWrap: document.getElementById("slots"),
    slotsHint: document.getElementById("slots-hint"),
    formStep: document.getElementById("step-details"),
    summary:  document.getElementById("pick-summary"),
    form:     document.getElementById("booking-form"),
    submit:   document.getElementById("booking-submit"),
    error:    document.getElementById("booking-error"),
    success:  document.getElementById("booking-success"),
    successBody: document.getElementById("success-body")
  };

  if (!el.form) return; // not the booking page

  /* Production with no backend wired yet: show the notice, hide the flow. */
  if (!API_URL && !IS_LOCAL) {
    el.offline.hidden = false;
    el.steps.hidden = true;
    return;
  }
  if (MOCK) console.info("[Nova booking] mock mode — localhost only, no real backend");

  /* ---------------------------------------------------------------------------
     State
  --------------------------------------------------------------------------- */
  var state = {
    type: null,          // 'Face to Face' | 'Online video call'
    viewYear: 0,
    viewMonth: 0,        // 1-based
    date: null,          // 'yyyy-mm-dd'
    time: null,          // 'HH:mm'
    monthCache: {},      // 'yyyy-mm' -> { 'yyyy-mm-dd': open }
    submitting: false
  };

  /* "Today" in NZ wall time, wherever the visitor is. */
  function nzToday() {
    var p = {};
    new Intl.DateTimeFormat("en-NZ", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric" })
      .formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    return { y: +p.year, m: +p.month, d: +p.day };
  }
  var TODAY = nzToday();
  var todayKey = key(TODAY.y, TODAY.m, TODAY.d);
  var lastDay = (function () {
    var t = new Date(Date.UTC(TODAY.y, TODAY.m - 1, TODAY.d + MAX_AHEAD_DAYS));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  })();

  function key(y, m, d) { return y + "-" + pad(m) + "-" + pad(d); }
  function pad(n) { return ("0" + n).slice(-2); }

  /* ---------------------------------------------------------------------------
     API (with localhost mock)
  --------------------------------------------------------------------------- */
  function apiMonth(y, m) {
    if (MOCK) return mockMonth(y, m);
    return fetch(API_URL + "?fn=month&year=" + y + "&month=" + m).then(asJson);
  }
  function apiSlots(date) {
    if (MOCK) return mockSlots(date);
    return fetch(API_URL + "?fn=slots&date=" + date).then(asJson);
  }
  function apiBook(payload) {
    if (MOCK) return mockBook(payload);
    return fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // simple request → no preflight
      body: JSON.stringify(payload)
    }).then(asJson);
  }
  function asJson(res) { return res.json(); }

  /* Mock: weekdays open, a believable spread of slots, always succeeds. */
  var FULL_GRID = ["09:00","09:45","10:30","11:15","12:00","12:45","13:30","14:15","15:00","15:45","16:30"];
  function mockMonth(y, m) {
    var days = [], n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (var d = 1; d <= n; d++) {
      var dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      days.push({ d: key(y, m, d), open: dow >= 1 && dow <= 5 });
    }
    return delay({ ok: true, days: days });
  }
  function mockSlots(date) {
    var taken = date.charCodeAt(9) % 3; // deterministic variety
    return delay({ ok: true, slots: FULL_GRID.filter(function (_, i) { return (i + taken) % 5 !== 0; }) });
  }
  function mockBook(p) {
    return delay({ ok: true, booking: {
      name: p.name, type: p.type, service: p.service,
      when: friendlyDate(p.date) + " at " + friendlyTime(p.time),
      where: p.type === "Online video call" ? "https://meet.google.com/mock-link" : "38A Finn Ave, Rolleston",
      emailSent: true
    }}, 900);
  }
  function delay(v, ms) { return new Promise(function (r) { setTimeout(function () { r(v); }, ms || 350); }); }

  /* ---------------------------------------------------------------------------
     Step 1 — meeting type
  --------------------------------------------------------------------------- */
  el.typeBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.type = btn.dataset.type;
      el.typeBtns.forEach(function (b) {
        b.classList.toggle("is-selected", b === btn);
        b.setAttribute("aria-pressed", b === btn ? "true" : "false");
      });
      el.calStep.hidden = false;
      resetPick();
      renderCalendar();
      el.calStep.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  /* ---------------------------------------------------------------------------
     Step 2 — calendar + slots
  --------------------------------------------------------------------------- */
  state.viewYear = TODAY.y;
  state.viewMonth = TODAY.m;

  el.calPrev.addEventListener("click", function () { moveMonth(-1); });
  el.calNext.addEventListener("click", function () { moveMonth(1); });

  function moveMonth(dir) {
    var m = state.viewMonth + dir, y = state.viewYear;
    if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    if (y * 100 + m < TODAY.y * 100 + TODAY.m) return;
    if (y * 100 + m > lastDay.y * 100 + lastDay.m) return;
    state.viewYear = y; state.viewMonth = m;
    renderCalendar();
  }

  function renderCalendar() {
    var y = state.viewYear, m = state.viewMonth;
    el.calTitle.textContent = MONTHS[m - 1] + " " + y;
    el.calPrev.disabled = (y * 100 + m) <= (TODAY.y * 100 + TODAY.m);
    el.calNext.disabled = (y * 100 + m) >= (lastDay.y * 100 + lastDay.m);

    var daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    var firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 Sun
    var lead = (firstDow + 6) % 7; // Monday-first grid

    var html = ["M","T","W","T","F","S","S"].map(function (w) {
      return '<span class="cal__wd" aria-hidden="true">' + w + "</span>";
    }).join("");
    for (var i = 0; i < lead; i++) html += '<span class="cal__day is-out"></span>';

    for (var d = 1; d <= daysInMonth; d++) {
      var k = key(y, m, d);
      var inWindow = k >= todayKey && k <= key(lastDay.y, lastDay.m, lastDay.d);
      html += '<button type="button" class="cal__day' +
        (k === state.date ? " is-selected" : "") +
        (inWindow ? "" : " is-closed") +
        '" data-date="' + k + '"' + (inWindow ? "" : " disabled") +
        ' aria-label="' + friendlyDate(k) + '">' + d + "</button>";
    }
    el.calGrid.innerHTML = html;

    // Grey out days the backend says are full/closed
    monthOpenness(y, m).then(function (open) {
      if (state.viewYear !== y || state.viewMonth !== m) return; // view moved on
      Array.prototype.forEach.call(el.calGrid.querySelectorAll("[data-date]"), function (btn) {
        if (open[btn.dataset.date] === false) {
          btn.disabled = true;
          btn.classList.add("is-full");
        }
      });
    });
  }

  function monthOpenness(y, m) {
    var ck = y + "-" + pad(m);
    if (state.monthCache[ck]) return Promise.resolve(state.monthCache[ck]);
    return apiMonth(y, m).then(function (res) {
      var map = {};
      (res.days || []).forEach(function (x) { map[x.d] = x.open; });
      state.monthCache[ck] = map;
      return map;
    }).catch(function () { return {}; }); // on fetch failure leave days enabled; slot fetch is the backstop
  }

  el.calGrid.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-date]");
    if (!btn || btn.disabled) return;
    state.date = btn.dataset.date;
    state.time = null;
    el.formStep.hidden = true;
    renderCalendar();
    loadSlots();
  });

  function loadSlots() {
    el.slotsWrap.innerHTML = '<span class="slots__loading">Checking ' + friendlyDate(state.date) + "…</span>";
    el.slotsHint.hidden = true;
    apiSlots(state.date).then(function (res) {
      var slots = res.slots || [];
      if (!slots.length) {
        el.slotsWrap.innerHTML = '<span class="slots__empty">No slots left on this day — try another date.</span>';
        return;
      }
      el.slotsWrap.innerHTML = slots.map(function (t) {
        return '<button type="button" class="slot" data-time="' + t + '">' + friendlyTime(t) + "</button>";
      }).join("");
      el.slotsHint.hidden = false;
    }).catch(function () {
      el.slotsWrap.innerHTML = '<span class="slots__empty">Couldn’t load times — check your connection and tap the date again.</span>';
    });
  }

  el.slotsWrap.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-time]");
    if (!btn) return;
    state.time = btn.dataset.time;
    Array.prototype.forEach.call(el.slotsWrap.querySelectorAll(".slot"), function (s) {
      s.classList.toggle("is-selected", s === btn);
    });
    el.summary.innerHTML =
      "<strong>" + state.type + "</strong> — " + friendlyDate(state.date) +
      " at <strong>" + friendlyTime(state.time) + "</strong> (NZ time)";
    el.formStep.hidden = false;
    el.formStep.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* ---------------------------------------------------------------------------
     Step 3 — details form
  --------------------------------------------------------------------------- */
  el.form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (state.submitting) return;
    hideError();

    var fields = ["name", "email", "phone", "service", "company", "about"];
    var values = {}, firstBad = null;

    fields.forEach(function (f) {
      var input = el.form.elements[f];
      var v = input.value.trim();
      var bad = !v ||
        (f === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) ||
        (f === "phone" && v.replace(/\D/g, "").length < 7);
      setFieldError(input, bad);
      if (bad && !firstBad) firstBad = input;
      values[f] = v;
    });
    if (firstBad) { firstBad.focus(); return; }

    state.submitting = true;
    el.submit.disabled = true;
    el.submit.textContent = "Locking in your time…";

    apiBook({
      type: state.type, date: state.date, time: state.time,
      name: values.name, email: values.email, phone: values.phone,
      service: values.service, company: values.company, about: values.about
    }).then(function (res) {
      if (!res.ok) throw new Error(res.error || "Something went wrong — please try again.");
      showSuccess(res.booking);
    }).catch(function (err) {
      showError(err.message || "Something went wrong — please try again.");
      // The slot may have been taken — refresh the day's slots
      loadSlots();
      el.formStep.hidden = true;
    }).finally(function () {
      state.submitting = false;
      el.submit.disabled = false;
      el.submit.textContent = "Book this time";
    });
  });

  Array.prototype.forEach.call(el.form.querySelectorAll("input, select, textarea"), function (input) {
    input.addEventListener("input", function () { setFieldError(input, false); });
  });

  function setFieldError(input, bad) {
    input.closest(".field").classList.toggle("field--bad", !!bad);
  }
  function showError(msg) {
    el.error.textContent = msg;
    el.error.hidden = false;
    el.error.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function hideError() { el.error.hidden = true; }

  function showSuccess(b) {
    el.steps.hidden = true;
    var whereLabel = b.type === "Online video call"
      ? 'Join link: <a class="link" href="' + b.where + '">' + b.where + "</a>"
      : "Where: <strong>" + b.where + "</strong>";
    el.successBody.innerHTML =
      "<p><strong>" + b.type + "</strong><br>" + b.when + " (NZ time)<br>" + whereLabel + "</p>" +
      "<p>" + (b.emailSent
        ? "A confirmation with everything you need is on its way to your inbox (check spam the first time)."
        : "Your booking is locked in — the confirmation email will follow shortly.") + "</p>";
    el.success.hidden = false;
    el.success.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------------------------------------------------------------------------
     Formatting
  --------------------------------------------------------------------------- */
  function resetPick() {
    state.date = null; state.time = null;
    el.slotsWrap.innerHTML = '<span class="slots__empty">Pick a date to see times.</span>';
    el.slotsHint.hidden = true;
    el.formStep.hidden = true;
  }

  function friendlyDate(k) {
    var p = k.split("-").map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12));
    return new Intl.DateTimeFormat("en-NZ", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(d);
  }
  function friendlyTime(t) {
    var p = t.split(":").map(Number);
    var h12 = ((p[0] + 11) % 12) + 1;
    return h12 + (p[1] ? ":" + pad(p[1]) : "") + (p[0] < 12 ? "am" : "pm");
  }
})();
