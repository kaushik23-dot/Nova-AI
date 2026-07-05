/* =============================================================================
   NOVA — main.js
   Vanilla JS, no dependencies. Handles: nav, hero load sequence, scroll reveals,
   sticky-header state, footer year. Respects prefers-reduced-motion throughout.
   ============================================================================= */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------------------------------------------------------
     1. MOBILE NAVIGATION
     --------------------------------------------------------------------------- */
  var toggle = document.querySelector(".nav__toggle");
  var menu = document.getElementById("nav-menu");

  function closeNav() {
    if (!toggle || !menu) return;
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
    menu.classList.remove("is-open");
    document.body.classList.remove("nav-open");
  }

  function openNav() {
    if (!toggle || !menu) return;
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Close menu");
    menu.classList.add("is-open");
    document.body.classList.add("nav-open");
  }

  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      open ? closeNav() : openNav();
    });

    // Close when a link is tapped (mobile)
    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) closeNav();
    });

    // Close on Escape
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeNav();
    });

    // Reset state if resized back to desktop
    window.addEventListener("resize", function () {
      if (window.innerWidth > 880) closeNav();
    });
  }

  /* ---------------------------------------------------------------------------
     2. STICKY HEADER — solidify background after a little scroll
     --------------------------------------------------------------------------- */
  var header = document.querySelector(".site-header");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 24);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------------------------------------------------------------------------
     3. SCROLL REVEALS — IntersectionObserver, transform/opacity only
     --------------------------------------------------------------------------- */
  var reveals = document.querySelectorAll(".reveal");

  if (reduceMotion || !("IntersectionObserver" in window)) {
    // Show everything immediately
    reveals.forEach(function (el) { el.classList.add("is-visible"); });
  } else {
    var io = new IntersectionObserver(
      function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            obs.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 }
    );
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ---------------------------------------------------------------------------
     4. HERO LOAD-IN — kick off "The Split" sequence
     CSS holds all the timing; we just flip the switch once painted.
     --------------------------------------------------------------------------- */
  function startHero() {
    root.classList.add("loaded");
  }
  if (document.querySelector(".hero")) {
    if (reduceMotion) {
      startHero();
    } else {
      // Wait a frame so the browser has painted the initial (hidden) state
      requestAnimationFrame(function () {
        requestAnimationFrame(startHero);
      });
    }
  }

  /* ---------------------------------------------------------------------------
     5. FOOTER YEAR
     --------------------------------------------------------------------------- */
  var yearEls = document.querySelectorAll("[data-year]");
  var year = String(new Date().getFullYear());
  yearEls.forEach(function (el) { el.textContent = year; });

})();
