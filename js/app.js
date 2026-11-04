/* ==========================================================================
   app.js — draws the header, the sections and the footer from JSON.
   ========================================================================== */
(function () {
  "use strict";

  var PF = window.PF;
  var E = PF.elements;

  var BASE = PF.base || "";
  var SITE_URL = BASE + "data/site.json";
  var SECTION_DIR = BASE + "data/sections/";

  var ICON_LABELS = {
    mail: "Email",
    email: "Email",
    "googlescholar-old": "Google Scholar",
    "googlescholar-new": "Google Scholar",
    orcid: "ORCID",
    github: "GitHub",
    linkedin: "LinkedIn",
    bluesky: "Bluesky",
    x: "X",
    mastodon: "Mastodon",
    instagram: "Instagram",
    youtube: "YouTube",
    researchgate: "ResearchGate"
  };

  function byId(id) { return document.getElementById(id); }
  function pad(value) { return String(value).padStart(2, "0"); }

  function labelFromIcon(icon) {
    var key = String(icon || "").toLowerCase();
    if (ICON_LABELS[key]) return ICON_LABELS[key];
    return key
      ? key.replace(/[-_]+/g, " ").replace(/\b\w/g, function (letter) { return letter.toUpperCase(); })
      : "Link";
  }

  function cvLink(cv) {
    if (!cv || !cv.file) return "";
    var href = PF.resolveLink("@cv");
    var attrs = " href=\"" + PF.esc(href) + "\"";
    if (/\.pdf(\?|$)/i.test(href)) attrs += ' target="_blank" rel="noopener"';
    else attrs += PF.linkAttrs(href);
    return "<a class=\"cv-button\"" + attrs + ">" +
      "<span>" + PF.esc(cv.label || "Download CV") + "</span>" +
      PF.icon("outward") +
      "</a>";
  }

  function headerMarkup(site) {
    var header = site.header || {};
    var hasImage = String(header.image_path || "").trim() !== "";
    var subheading = header.subheading || header.eyebrow || "";
    var facts = PF.toArray(header.additional_info || header.meta || []).filter(Boolean).map(function (item) {
      return "<li>" + PF.esc(item) + "</li>";
    }).join("");
    var button = cvLink(header.cv);

    var aside = hasImage
      ? '<div class="masthead__aside">' +
        '<img class="masthead__image" src="' + PF.esc(PF.imageSrc(header.image_path)) + '" alt="' +
        PF.esc(header.image_alt || header.name || "") + '" fetchpriority="high">' +
        button +
        "</div>"
      : "";
    var inlineCv = !hasImage && button
      ? '<div class="masthead__cv-inline">' + button + "</div>"
      : "";

    return '<header class="masthead' + (hasImage ? "" : " masthead--plain") + '">' +
      '<div class="masthead__info">' +
      (subheading ? '<p class="eyebrow">' + PF.esc(subheading) + "</p>" : "") +
      '<h1 class="masthead__name">' + PF.esc(header.name || "") + "</h1>" +
      (header.title ? '<p class="masthead__title">' + PF.formatText(header.title) + "</p>" : "") +
      (header.role ? '<p class="masthead__role">' + PF.formatText(header.role) + "</p>" : "") +
      (header.affiliation ? '<p class="masthead__affiliation">' + PF.formatText(header.affiliation) + "</p>" : "") +
      (header.intro ? '<p class="masthead__intro">' + PF.formatText(header.intro) + "</p>" : "") +
      (facts ? '<ul class="masthead__meta">' + facts + "</ul>" : "") +
      inlineCv +
      "</div>" +
      aside +
      "</header>";
  }

  /* Which side of a two-column section an element sits on:
     { "add_teaching_items": { "column": "left", … } } */
  function columnClass(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return "";
    var column = (PF.schema && PF.schema.pick(value, "column")) || "";
    var side = String(column).trim().toLowerCase();
    return side === "left" || side === "right" ? " flow__item--" + side : "";
  }

  function flowItem(html, extraClass) {
    if (!html) return "";
    return '<div class="flow__item' + (extraClass || "") + '">' + html + "</div>";
  }

  function entryTypes(entry) {
    return Object.keys(entry).filter(function (key) {
      return key.indexOf("add_") === 0;
    });
  }

  function isHeadingEntry(entry) {
    return !!entry && typeof entry === "object" &&
      entryTypes(entry).length === 1 && !!entry.add_heading;
  }

  /* A paragraph with no title of its own: a string, or an object with no
     heading/title/label. */
  function isUntitledParagraphEntry(entry) {
    if (!entry || typeof entry !== "object") return false;
    var types = entryTypes(entry);
    if (types.length !== 1 || !entry.add_paragraph) return false;
    var value = entry.add_paragraph;
    if (!value || typeof value !== "object" || Array.isArray(value)) return true;
    return !(value.heading || value.title || value.label ||
      value.heading_text || value.paragraph_heading);
  }

  /* A section may set defaults that apply to its elements. `show_numbering`
     sits at section level to switch every publication list in that section;
     a value on the element itself still wins. */
  function withSectionDefaults(type, value, data) {
    var canonical = (PF.render.aliases && PF.render.aliases[type]) || type;
    if (canonical !== "add_publication_or_more") return value;
    if (!data || data.show_numbering == null) return value;
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    if (value.show_numbering != null) return value;
    var copy = {};
    Object.keys(value).forEach(function (key) { copy[key] = value[key]; });
    copy.show_numbering = data.show_numbering !== false;
    return copy;
  }

  function renderEntry(entry, data) {
    var inner = "";
    var side = "";
    Object.keys(entry).forEach(function (type) {
      /* "column" may sit beside an element written as an array —
         { "add_expandable_information": [ … ], "column": "left" }. */
      if (type === "column" || type === "column_position") {
        if (!side) side = columnClass({ column: entry[type] });
        return;
      }
      inner += E.render(type, withSectionDefaults(type, entry[type], data));
      if (!side) side = columnClass(entry[type]);
    });
    return { html: inner, side: side };
  }

  function flowMarkup(data) {
    return Object.keys(data).map(function (key) {
      if (key === "add_content_to_page") {
        var entries = PF.toArray(data[key]);
        var out = [];
        for (var i = 0; i < entries.length; i += 1) {
          var entry = entries[i];
          if (!entry || typeof entry !== "object") continue;

          /* A heading directly above an untitled paragraph is that
             paragraph's title, so the two are drawn as one block. */
          var next = entries[i + 1];
          if (isHeadingEntry(entry) && isUntitledParagraphEntry(next)) {
            var headingSide = columnClass(entry.add_heading) ||
              columnClass({ column: entry.column });
            var nextSide = columnClass(next.add_paragraph) ||
              columnClass({ column: next.column });
            if (!nextSide || nextSide === headingSide) {
              var group = E.render("add_heading", entry.add_heading) +
                E.render("add_paragraph", next.add_paragraph);
              out.push(flowItem(group, headingSide + " flow__item--titled"));
              i += 1;
              continue;
            }
          }

          var rendered = renderEntry(entry, data);
          out.push(flowItem(rendered.html, rendered.side));
        }
        return out.join("");
      }
      if (key.indexOf("add_") !== 0) return "";
      var html = E.render(key, withSectionDefaults(key, data[key], data));
      return flowItem(html, columnClass(data[key]));
    }).join("");
  }

  function sectionMarkup(section, index, showHead) {
    var data = section.data || {};
    var number = data.number || pad(index + 1);
    var label = data.label || data.nav || section.id;
    if (PF.resetPublicationGroup) PF.resetPublicationGroup();
    var flow = flowMarkup(data);

    var lead = (data.heading || data.intro)
      ? '<div class="section-lead' + (data.heading && data.intro ? "" : " section-lead--single") + '">' +
        (data.heading ? '<h2 class="section-title">' + PF.formatText(data.heading) + "</h2>" : "") +
        (data.intro ? '<p class="section-intro">' + PF.formatText(data.intro) + "</p>" : "") +
        "</div>"
      : "";

    var body = lead
      ? '<div class="section-body">' + lead +
        (flow ? '<div class="flow">' + flow + "</div>" : "") + "</div>"
      : (flow ? '<div class="flow">' + flow + "</div>" : "");

    var layout = String(data.layout || "").toLowerCase();
    /* Text is the only special layout. Everything else is the one flow:
       items stack unless they name a left/right column. */
    var sectionClass = "section" + (layout === "text" ? " section--text" : " section--flow");

    /* The numbered head belongs to the home sections. A standalone page
       keeps its title and intro, but drops the number/label/rule row. */
    var head = showHead === false ? "" :
      '<div class="section-head">' +
      '<span class="section-no">' + PF.esc(number) + "</span>" +
      '<span class="section-label">' + PF.esc(label) + "</span>" +
      '<span class="section-rule" aria-hidden="true"></span>' +
      "</div>";

    return '<section class="' + sectionClass + '" id="' + PF.esc(section.id) + '">' +
      head +
      body +
      "</section>";
  }

  function socialMarkup(site) {
    var links = (site.footer && site.footer.links) || [];
    return links.filter(function (link) { return link && link.link; }).map(function (link) {
      var href = PF.resolveLink(link.link);
      var label = link.label || labelFromIcon(link.icon);
      return '<a href="' + PF.esc(href) + '"' + PF.linkAttrs(href) +
        ' aria-label="' + PF.esc(label) + '" title="' + PF.esc(label) + '">' +
        PF.socialIcon(link.icon) + "</a>";
    }).join("");
  }

  function fitHeader() {
    var info = document.querySelector(".masthead__info");
    var aside = document.querySelector(".masthead__aside");
    if (!info || !aside) return;

    if (window.matchMedia("(max-width: 900px)").matches) {
      aside.style.width = "";
      return;
    }

    var cv = aside.querySelector(".cv-button");
    var cvHeight = cv ? cv.getBoundingClientRect().height : 0;
    var gap = cv ? (parseFloat(getComputedStyle(cv).marginTop) || 0) : 0;
    var size = Math.max(120, Math.round(info.getBoundingClientRect().height - cvHeight - gap));
    aside.style.width = size + "px";
  }

  function fail(message) {
    var content = byId("content");
    if (content) {
      content.innerHTML = '<section class="section"><div class="section-head">' +
        '<span class="section-no">!</span><span class="section-label">Could not load</span>' +
        '<span class="section-rule"></span></div><p class="section-intro">' + PF.esc(message) + "</p></section>";
    }
  }

  /* Free-standing pages keep the footer but drop the masthead: a slim bar
     with a back link and the page title instead. */
  function pageBarMarkup(title) {
    return '<div class="page-bar">' +
      '<a class="page-bar__back" id="pageBack" href="' + BASE + 'index.html">' +
      '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" ' +
      'stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M13 8H3M7 4 3 8l4 4"/></svg>' +
      "<span>Back</span></a>" +
      (title ? '<span class="page-bar__title">' + PF.esc(title) + "</span>" : "") +
      "</div>";
  }

  function wirePageBar() {
    var back = byId("pageBack");
    if (!back) return;
    back.addEventListener("click", function (event) {
      var ref = document.referrer || "";
      if (ref.indexOf(location.origin) === 0 && history.length > 1) {
        event.preventDefault();
        history.back();
      }
    });
  }

  function boot() {
    var pageRef = new URLSearchParams(location.search).get("page");
    PF.loadJson(SITE_URL).then(function (site) {
      PF.setSite(site);
      PF.applyMeta(site);

      var sectionsPromise;
      var pageTitle = "";

      if (pageRef) {
        /* A free-standing page: page.html?page=folder/name
           reads data/pages/folder/name.json. */
        var safe = String(pageRef).replace(/\.json$/i, "").replace(/^\/+|\/+$/g, "");
        if (!safe || safe.indexOf("..") > -1 || safe.indexOf("\\") > -1) {
          fail("That page address is not valid.");
          return;
        }
        var pageUrl = BASE + "data/pages/" + safe.split("/").map(encodeURIComponent).join("/") + ".json";
        sectionsPromise = PF.loadJson(pageUrl).then(function (page) {
          pageTitle = page.title || page.heading || "";
          if (page.title) {
            document.title = page.title + (site.title ? " — " + site.title : "");
            var ogTitle = byId("ogTitle");
            if (ogTitle) ogTitle.setAttribute("content", page.title);
          }
          if (page.description) {
            var meta = document.querySelector('meta[name="description"]');
            if (meta) meta.setAttribute("content", page.description);
            var ogDescription = byId("ogDescription");
            if (ogDescription) ogDescription.setAttribute("content", page.description);
          }
          var entries = page.sections || [];
          if (!entries.length) {
            /* A page may also be written as a plain content flow:
               { "title": "Methods", "add_content_to_page": [ … ] } */
            var hasFlow = !!page.add_content_to_page ||
              Object.keys(page).some(function (k) { return k.indexOf("add_") === 0; });
            if (hasFlow) {
              entries = [Object.assign({}, page, {
                id: page.id || "page",
                label: page.label || page.title || "Page",
                heading: page.heading != null ? page.heading : (page.title || ""),
                layout: page.layout || ""
              })];
            }
          }
          return Promise.all(entries.map(function (entry) {
            if (typeof entry === "string") {
              return PF.loadJson(SECTION_DIR + encodeURIComponent(entry) + ".json")
                .then(function (data) { return { id: entry, data: data }; })
                .catch(function (error) {
                  console.error("[content] " + entry + " could not be loaded", error);
                  return null;
                });
            }
            if (entry && typeof entry === "object" && entry.id) {
              return { id: entry.id, data: entry };
            }
            return null;
          })).then(function (loaded) { return loaded.filter(Boolean); });
        });
      } else {
        var ids = (site.sections || []).map(function (entry) {
          return typeof entry === "string" ? entry : (entry && entry.id);
        }).filter(Boolean);

        sectionsPromise = Promise.all(ids.map(function (id) {
          return PF.loadJson(SECTION_DIR + encodeURIComponent(id) + ".json")
            .then(function (data) { return { id: id, data: data }; })
            .catch(function (error) {
              console.error("[content] " + id + " could not be loaded", error);
              return null;
            });
        })).then(function (loaded) { return loaded.filter(Boolean); });
      }

      return sectionsPromise.then(function (sections) {
        var headerEl = byId("header");
        headerEl.className = pageRef ? "page-header" : "";
        headerEl.innerHTML = pageRef ? pageBarMarkup(pageTitle) : headerMarkup(site);
        byId("content").innerHTML = sections.map(function (section, index) {
          return sectionMarkup(section, index, !pageRef);
        }).join("");
        if (E.typeset) E.typeset(byId("content"));
        if (PF.initSlideshows) PF.initSlideshows(byId("content"));
        if (PF.initCardMasonry) PF.initCardMasonry(byId("content"));
        if (PF.placeFilters) PF.placeFilters(byId("content"));
        if (PF.initFilters) PF.initFilters(byId("content"));
        byId("social").innerHTML = socialMarkup(site);

        if (pageRef) {
          wirePageBar();
        } else {
          fitHeader();
          requestAnimationFrame(fitHeader);
          if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitHeader);
          window.addEventListener("resize", fitHeader);
        }

        PF.initLightbox();
        PF.guardCredits();
      });
    }).catch(function (error) {
      console.error("[content] " + (pageRef ? "page" : "site") + " could not be loaded", error);
      if (pageRef) {
        fail("The page \u201c" + pageRef + "\u201d could not be loaded. Check that data/pages/" +
          String(pageRef).replace(/\.json$/i, "") + ".json exists.");
      } else {
        fail("The site file (data/site.json) could not be loaded. Run the folder from a local server.");
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
