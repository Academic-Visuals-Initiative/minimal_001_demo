/* ==========================================================================
   core.js — the small shared layer.

   Loads JSON, escapes text, resolves links and images, formats inline
   markup, owns the theme, the reveal animation, the lightbox and the
   credit line. No dependencies.
   ========================================================================== */
(function (global) {
  "use strict";

  var PF = {};

  /* The content shells live either at the root (index.html) or in pages/
     (pages/page.html). BASE keeps data, assets and links pointed at the site
     root from either one. */
  var BASE = global.location && /\/pages\/[^\/]*$/.test(global.location.pathname) ? "../" : "";
  PF.base = BASE;

  /* The CV always opens in the bundled reader; only the PDF is configurable. */
  var CV_VIEWER = "pages/reader.html";

  /* --- data ------------------------------------------------------------- */

  PF.loadJson = function (url) {
    return fetch(url, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("Could not load " + url + " (" + res.status + ")");
      return res.json();
    });
  };

  /* --- small helpers ---------------------------------------------------- */

  PF.esc = function (value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  PF.toArray = function (value) {
    if (value == null) return [];
    return Array.isArray(value) ? value : [value];
  };

  PF.slug = function (value) {
    return String(value == null ? "" : value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  PF.firstValue = function (obj, keys) {
    if (!obj) return undefined;
    for (var i = 0; i < keys.length; i++) {
      if (obj[keys[i]] != null) return obj[keys[i]];
    }
    return undefined;
  };

  /* --- site context ----------------------------------------------------- */

  var site = null;

  PF.setSite = function (value) { site = value || null; };
  PF.site = function () { return site; };

  /* --- links ------------------------------------------------------------

     @about          the section with id "about"  →  #about
     @cv             the CV file from site.json
     @email          the address in site.json
     @top            the top of the page
     anything else   used as written (https://, mailto:, #, pages/…)
  ------------------------------------------------------------------------ */

  /* A written-out address without a scheme ("www.example.com" or
     "example.com/paper") is external; without one the browser reads it as a
     file sitting beside the page. Local names keep their extension. */
  function looksExternal(link) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(link)) return false;
    if (/^[#.?\/]/.test(link)) return false;
    if (/\s/.test(link)) return false;
    var host = link.split(/[\/?#]/)[0];
    if (!/^[^\/?#]+\.[a-z]{2,}$/i.test(host)) return false;
    return !/\.(html?|json|pdf|jpe?g|png|gif|webp|svg|css|js|md|txt|zip|mp4|webm|mp3|docx?|xlsx?|pptx?)$/i.test(host);
  }

  PF.resolveLink = function (value) {
    var link = String(value == null ? "" : value).trim();
    if (!link) return "";
    if (link.charAt(0) !== "@") {
      if (looksExternal(link)) return "https://" + link;
      /* Written paths are site-root relative, like the JSON files. */
      if (/^[a-z][a-z0-9+.-]*:/i.test(link) || /^[#\/?]/.test(link) || link.indexOf("..") === 0) {
        return link;
      }
      return BASE + link;
    }

    var key = link.slice(1);
    if (key === "top") return "#top";
    if (key === "home") return BASE + "index.html";
    if (key === "email") return "mailto:" + (site && site.header && site.header.email ? site.header.email : "");
    if (key === "cv") {
      var cv = site && site.header && site.header.cv;
      return cv && cv.file ? BASE + CV_VIEWER : "";
    }

    /* @pages.folder.file → pages/page.html?page=folder/file
       (also @page.… and slashes: @pages/folder/file) */
    var pageKey = key.match(/^pages?[./](.+)$/i);
    if (pageKey) {
      var path = pageKey[1].replace(/\.json$/i, "").replace(/[./]+/g, "/")
        .replace(/^\/+|\/+$/g, "");
      return path ? BASE + "pages/page.html?page=" + path : "";
    }

    /* @research.soil_microbiome → #research when that section exists. */
    var ids = (site && site.sections || []).map(function (entry) {
      return typeof entry === "string" ? entry : (entry && entry.id);
    });
    var head = key.split(".")[0];
    if (key.indexOf(".") > -1 && ids.indexOf(head) > -1) return "#" + PF.slug(head);

    return "#" + PF.slug(key);
  };

  PF.isExternal = function (link) {
    return /^(https?:)?\/\//.test(String(link || ""));
  };

  PF.linkAttrs = function (link) {
    return PF.isExternal(link) ? ' target="_blank" rel="noopener"' : "";
  };

  /* --- images -----------------------------------------------------------

     a bare filename reads from assets/images/; a path is used as written.
  ------------------------------------------------------------------------ */

  PF.imageSrc = function (value) {
    var src = String(value == null ? "" : value).trim();
    if (!src) return "";
    if (/^(https?:)?\/\//.test(src) || src.indexOf("data:") === 0 || src.indexOf("//") === 0) return src;
    if (src.charAt(0) === "/" || src.indexOf("..") === 0) return src;
    if (src.indexOf("/") > -1) return BASE + src;
    return BASE + "assets/images/" + src;
  };

  /* --- inline markup ----------------------------------------------------

     **bold**  *italic*  ***both***  ++underline++  ~~strike~~
     ^super^  ~sub~  ==highlight==  `code`  [label](link)  {text|url}
     A backslash escapes the next character: \* \~ \` \{ \n
     A newline becomes a line break.
  ------------------------------------------------------------------------ */

  PF.formatText = function (value) {
    var text = String(value == null ? "" : value);
    if (!text) return "";

    /* Escaped characters are lifted out first, so they can never be read as
       markup, and put back as literal text at the end. */
    var escapes = [];
    text = text.replace(/\\(.)/g, function (m, ch) {
      escapes.push(ch);
      return "\u0000E" + (escapes.length - 1) + "\u0000";
    });

    var codes = [];
    var out = PF.esc(text);

    out = out.replace(/`([^`]+)`/g, function (m, code) {
      codes.push(code);
      return "\u0000C" + (codes.length - 1) + "\u0000";
    });

    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, href) {
      var raw = href.replace(/&amp;/g, "&");
      var link = PF.resolveLink(raw);
      if (!link) return label;
      return '<a href="' + PF.esc(link) + '"' + PF.linkAttrs(link) + ">" + label + "</a>";
    });

    out = out.replace(/\{([^}|]+)\|([^}]+)\}/g, function (m, label, href) {
      var raw = href.replace(/&amp;/g, "&").trim();
      var link = PF.resolveLink(raw);
      if (!link) return label;
      return '<a href="' + PF.esc(link) + '"' + PF.linkAttrs(link) + "><strong>" + label + "</strong></a>";
    });

    out = out.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    out = out.replace(/\+\+([^+\n]+)\+\+/g, "<u>$1</u>");
    out = out.replace(/==([^=\n]+)==/g, "<mark>$1</mark>");
    out = out.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
    out = out.replace(/\^([^^\n]+)\^/g, "<sup>$1</sup>");
    out = out.replace(/(^|[^~])~([^~\n]+)~/g, "$1<sub>$2</sub>");
    out = out.replace(/\n/g, "<br>");

    out = out.replace(/\u0000C(\d+)\u0000/g, function (m, index) {
      return "<code>" + codes[Number(index)] + "</code>";
    });

    out = out.replace(/\u0000E(\d+)\u0000/g, function (m, index) {
      return PF.esc(escapes[Number(index)]);
    });

    return out;
  };

  /* --- icons ------------------------------------------------------------ */

  PF.icon = function (name) {
    var paths = {
      outward: '<path d="M4.5 11.5 11.5 4.5M5.6 4.5h5.9v5.9"/>',
      right: '<path d="M2.5 8h11M9.5 4l4 4-4 4"/>',
      down: '<path d="M8 2.5v11M4 9.5l4 4 4-4"/>'
    };
    return '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" ' +
      'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (paths[name] || paths.right) + "</svg>";
  };

  PF.socialIcon = function (name) {
    if (!name) return "";
    return '<img src="' + BASE + 'assets/icons/social/' + PF.esc(name) + '.svg" alt="" width="15" height="15" loading="lazy">';
  };

  /* --- theme ------------------------------------------------------------ */

  var THEME_KEY = "portfolio-theme";

  PF.theme = function () {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  };

  PF.applyTheme = function (value) {
    var next = value === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    var meta = document.getElementById("themeColor");
    if (meta) meta.setAttribute("content", next === "dark" ? "#121210" : "#f4f1e9");
    document.dispatchEvent(new CustomEvent("pf:theme", { detail: next }));
  };

  PF.toggleTheme = function () {
    PF.applyTheme(PF.theme() === "dark" ? "light" : "dark");
  };

  /* --- document metadata ------------------------------------------------ */

  PF.applyMeta = function (data) {
    var title = data.title || "Portfolio";
    document.title = title;

    function set(selector, attribute, value) {
      var node = document.querySelector(selector);
      if (node && value != null) node.setAttribute(attribute, value);
    }

    set('meta[name="description"]', "content", data.description || "");
    set('meta[name="author"]', "content", data.author || (data.header && data.header.name) || "");
    set("#ogTitle", "content", title);
    set("#ogDescription", "content", data.description || "");
    set("#ogUrl", "content", location.origin + location.pathname);
    set("#canonical", "href", location.origin + location.pathname);

    if (data.header && data.header.image_path) {
      var ogSource = PF.imageSrc(data.header.image_path);
      var image = /^https?:/.test(ogSource) ? ogSource : new URL(ogSource, location.href).href;
      var ogImage = document.getElementById("ogImage");
      if (ogImage) ogImage.setAttribute("content", image);
    }

    if (data.favicon) {
      var icon = document.getElementById("favicon");
      var iconHref = /^(https?:)?\/\//.test(data.favicon) || data.favicon.charAt(0) === "/"
        ? data.favicon
        : BASE + data.favicon;
      if (icon) icon.setAttribute("href", iconHref);
    }

    if (data.theme && data.theme.accent) {
      document.documentElement.style.setProperty("--accent-base", data.theme.accent);
    }
  };

  /* --- reveal ----------------------------------------------------------- */

  PF.reveal = function (nodes) {
    var list = Array.prototype.slice.call(nodes || []);
    if (!list.length) return;

    var reduced = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in global)) {
      list.forEach(function (node) { node.classList.add("is-in"); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.04 });

    list.forEach(function (node) { io.observe(node); });
  };

  /* --- lightbox --------------------------------------------------------- */

  var lastFocus = null;

  function closeLightbox() {
    var box = document.getElementById("lightbox");
    if (!box || box.hidden) return;
    box.hidden = true;
    document.body.classList.remove("is-locked");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function openLightbox(trigger) {
    var box = document.getElementById("lightbox");
    var image = document.getElementById("lightboxImage");
    var caption = document.getElementById("lightboxCaption");
    if (!box || !image) return;

    var src = trigger.getAttribute("data-lightbox");
    if (!src) return;

    lastFocus = document.activeElement;
    image.setAttribute("src", src);
    image.setAttribute("alt", trigger.getAttribute("data-lightbox-alt") || "");
    if (caption) caption.textContent = trigger.getAttribute("data-lightbox-caption") || "";
    box.hidden = false;
    document.body.classList.add("is-locked");
    var close = box.querySelector("[data-lightbox-close]");
    if (close) close.focus();
  }

  PF.initLightbox = function () {
    document.addEventListener("click", function (event) {
      var trigger = event.target.closest("[data-lightbox]");
      if (trigger) {
        event.preventDefault();
        openLightbox(trigger);
        return;
      }
      if (event.target.closest("[data-lightbox-close]")) {
        event.preventDefault();
        closeLightbox();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeLightbox();
    });
  };

  /* --- slideshows -------------------------------------------------------
     Auto-advance every data-interval ms, dots jump to a slide, and the
     caption/credit/count travel with the picture. Motion stops on hover,
     keyboard focus, a hidden tab, or when reduced motion is requested.
  ------------------------------------------------------------------------ */

  PF.initSlideshows = function (root) {
    var scope = root || document;
    var shows = scope.querySelectorAll("[data-slideshow]");
    if (!shows.length) return;

    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    Array.prototype.forEach.call(shows, function (show) {
      if (show.getAttribute("data-slideshow-ready")) return;
      show.setAttribute("data-slideshow-ready", "1");

      var images = Array.prototype.slice.call(show.querySelectorAll("[data-slide]"));
      var dots = Array.prototype.slice.call(show.querySelectorAll("[data-slide-to]"));
      if (!images.length) return;

      var captionEl = show.querySelector("[data-slide-caption]");
      var countEl = show.querySelector("[data-slide-count]");
      var interval = Math.max(Number(show.getAttribute("data-interval")) || 5000, 1500);
      var index = 0;
      var timer = null;

      function pad(n) { return String(n).padStart(2, "0"); }

      function paint(next) {
        index = (next + images.length) % images.length;
        images.forEach(function (img, i) {
          img.classList.toggle("is-active", i === index);
        });
        dots.forEach(function (dot, i) {
          dot.classList.toggle("is-active", i === index);
          if (i === index) dot.setAttribute("aria-current", "true");
          else dot.removeAttribute("aria-current");
        });
        if (captionEl) {
          var caption = images[index].getAttribute("data-caption") || "";
          var credit = images[index].getAttribute("data-credit") || "";
          captionEl.textContent = credit ? (caption ? caption + " — " + credit : credit) : caption;
          captionEl.setAttribute("title", captionEl.textContent);
        }
        if (countEl) countEl.textContent = pad(index + 1) + " / " + pad(images.length);
      }

      function stop() {
        if (timer) { clearInterval(timer); timer = null; }
      }

      function start() {
        stop();
        if (reduce || document.hidden || !visible) return;
        timer = setInterval(function () { paint(index + 1); }, interval);
      }

      dots.forEach(function (dot) {
        dot.addEventListener("click", function () {
          paint(Number(dot.getAttribute("data-slide-to")) || 0);
          start();
        });
      });

      show.addEventListener("mouseenter", stop);
      show.addEventListener("mouseleave", start);
      show.addEventListener("focusin", stop);
      show.addEventListener("focusout", function (event) {
        if (!show.contains(event.relatedTarget)) start();
      });
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) stop(); else start();
      });

      var visible = !("IntersectionObserver" in window);
      if ("IntersectionObserver" in window) {
        var observer = new IntersectionObserver(function (entries) {
          visible = entries[0].isIntersecting;
          if (visible) start(); else stop();
        }, { threshold: 0.15 });
        observer.observe(show);
      }

      paint(0);
      start();
    });
  };

  /* --- card masonry -------------------------------------------------------
     Card groups with pictures are balanced into columns by height. Cards keep
     their own height; the shorter column takes the next card. On phones the
     cards return to a single column in their original order.
  ------------------------------------------------------------------------ */

  PF.initCardMasonry = function (root) {
    var scope = root || document;
    var lists = scope.querySelectorAll(".el-cards--masonry");
    if (!lists.length) return;

    function columnCount(list) {
      if (window.matchMedia && window.matchMedia("(max-width: 760px)").matches) return 1;
      var n = parseInt(getComputedStyle(list).getPropertyValue("--cols"), 10) || 2;
      if (window.matchMedia && window.matchMedia("(max-width: 1100px)").matches) n = Math.min(n, 2);
      return Math.max(1, Math.min(n, 4));
    }

    Array.prototype.forEach.call(lists, function (list) {
      if (list.getAttribute("data-card-masonry-ready")) {
        if (list._masonryLayout) list._masonryLayout(true);
        return;
      }
      list.setAttribute("data-card-masonry-ready", "1");

      var cards = Array.prototype.slice.call(list.querySelectorAll(".el-card"));
      if (!cards.length) return;

      function reset() {
        cards.forEach(function (card) { list.appendChild(card); });
        Array.prototype.forEach.call(list.querySelectorAll(".el-cards__col"), function (col) {
          col.parentNode.removeChild(col);
        });
      }

      function layout(force) {
        var count = columnCount(list);
        if (!force && list._masonryCount === count) return;
        list._masonryCount = count;
        reset();
        list.classList.remove("el-cards--solo");

        var visible = cards.filter(function (card) {
          return !card.classList.contains("is-filtered");
        });
        if (!visible.length) return;
        if (count < 2 || visible.length === 1) {
          if (count > 1 && visible.length === 1) list.classList.add("el-cards--solo");
          return;
        }

        var cols = [];
        var sums = [];
        for (var i = 0; i < count; i += 1) {
          var col = document.createElement("div");
          col.className = "el-cards__col";
          list.appendChild(col);
          cols.push(col);
          sums.push(0);
        }
        /* Even counts split in order, so the last two cards sit below their
           partners (1,3 left and 2,4 right). Odd counts use the shorter
           column so the last card does not leave a hole. */
        if (visible.length % 2 === 0) {
          visible.forEach(function (card, index) {
            cols[index % count].appendChild(card);
          });
          return;
        }
        visible.forEach(function (card) {
          var target = 0;
          for (var i = 1; i < sums.length; i += 1) {
            if (sums[i] < sums[target]) target = i;
          }
          cols[target].appendChild(card);
          sums[target] += card.getBoundingClientRect().height + 14;
        });
      }

      list._masonryLayout = layout;
      layout(true);

      if (!PF._cardMasonryWired) {
        PF._cardMasonryWired = true;
        var scheduled = false;
        function relayout(force) {
          if (scheduled) return;
          scheduled = true;
          requestAnimationFrame(function () {
            scheduled = false;
            Array.prototype.forEach.call(document.querySelectorAll(".el-cards--masonry"), function (el) {
              if (el._masonryLayout) el._masonryLayout(force);
            });
          });
        }
        window.addEventListener("resize", function () { relayout(true); });
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(function () { relayout(true); });
        }
      }
    });
  };

  PF.refreshCardMasonry = function (root) {
    var scope = root || document;
    Array.prototype.forEach.call(scope.querySelectorAll(".el-cards--masonry"), function (list) {
      if (list._masonryLayout) list._masonryLayout(true);
    });
  };

  /* --- category filters --------------------------------------------------
     Tags are filter metadata. A bar carries data-filter-for="<group>" and
     hides items whose data-tags do not include the chosen slug. Bars work
     independently; clicking the active category again clears it.
  ------------------------------------------------------------------------ */

  PF.initFilters = function (root) {
    var scope = root || document;
    var bars = scope.querySelectorAll("[data-filter-for]");
    if (!bars.length) return;

    Array.prototype.forEach.call(bars, function (bar) {
      if (bar.getAttribute("data-filter-ready")) return;
      bar.setAttribute("data-filter-ready", "1");

      var group = bar.getAttribute("data-filter-for");
      if (!group) return;
      var items = Array.prototype.slice.call(scope.querySelectorAll(
        '[data-filter-group="' + group.replace(/"/g, '\\"') + '"][data-tags]'
      ));
      var buttons = Array.prototype.slice.call(bar.querySelectorAll("[data-filter-tag]"));
      if (!buttons.length || !items.length) return;

      /* A featured paper rendered after the list can add categories the bar
         did not know about. Add any missing tag as a new button. */
      var present = {};
      buttons.forEach(function (button) {
        present[button.getAttribute("data-filter-tag")] = true;
      });
      items.forEach(function (item) {
        var labels = (item.getAttribute("data-tag-labels") || "").split("|");
        labels.forEach(function (label) {
          label = label.trim();
          var slug = PF.slug(label);
          if (!label || !slug || present[slug]) return;
          var button = document.createElement("button");
          button.type = "button";
          button.className = "el-filter__btn";
          button.setAttribute("data-filter-tag", slug);
          button.setAttribute("aria-pressed", "false");
          button.textContent = label;
          bar.appendChild(button);
          buttons.push(button);
          present[slug] = true;
        });
      });

      function apply(slug) {
        buttons.forEach(function (button) {
          var active = button.getAttribute("data-filter-tag") === slug;
          button.classList.toggle("is-active", active);
          button.setAttribute("aria-pressed", active ? "true" : "false");
        });
        items.forEach(function (item) {
          var tags = (item.getAttribute("data-tags") || "").split(/\s+/);
          item.classList.toggle("is-filtered", !!slug && tags.indexOf(slug) < 0);
        });
        if (PF.refreshCardMasonry) PF.refreshCardMasonry(scope);
      }

      buttons.forEach(function (button) {
        button.addEventListener("click", function () {
          var slug = button.getAttribute("data-filter-tag") || "";
          var active = button.classList.contains("is-active");
          apply(active && slug ? "" : slug);
        });
      });
    });
  };

  /* Bars marked data-filter-position="top" move to the start of their
     section's flow, so a publication filter can sit above a featured paper. */
  PF.placeFilters = function (root) {
    var scope = root || document;
    var bars = scope.querySelectorAll('[data-filter-position="top"]');
    Array.prototype.forEach.call(bars, function (bar) {
      var section = bar.closest ? bar.closest(".section") : null;
      if (!section) return;
      var flow = section.querySelector(".flow");
      if (!flow || flow.firstElementChild === bar) return;
      flow.insertBefore(bar, flow.firstElementChild);
    });
  };

  /* --- credit line ------------------------------------------------------
     The credit line is part of the licence, not content. If something
     strips it from the page, it is put back.
  ------------------------------------------------------------------------ */

  PF.guardCredits = function () {
    var footer = document.getElementById("footer");
    if (!footer) return;
    var credits = footer.querySelector("[data-credits]");
    if (!credits) return;

    var markup = credits.outerHTML;

    var observer = new MutationObserver(function () {
      if (!footer.querySelector("[data-credits]")) {
        footer.insertAdjacentHTML("beforeend", markup);
      }
      if (!document.querySelector("[data-credits]")) {
        footer.insertAdjacentHTML("beforeend", markup);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  };

  global.PF = PF;
})(window);
