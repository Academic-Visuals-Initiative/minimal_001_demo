/* ==========================================================================
   render/<family>.js — renderers registered into PF.render.registry.
   Loaded after elements.js and before app.js.
   ========================================================================== */
(function (PF) {
  "use strict";
  var R = PF.render;
  var esc = R.esc, format = R.format, src = R.src;
  var isPlainObject = R.isPlainObject, firstValue = R.firstValue;
  var toArray = R.toArray, headingLabel = R.headingLabel, paragraphs = R.paragraphs;
  var S = PF.schema;
  var RENDERERS = R.registry;
  /* --- add_equation -------------------------------------------------------
     A LaTeX formula, drawn with KaTeX (loaded only when a page has maths).
     A string is a displayed equation; the object form adds a heading, a
     caption or inline mode. JSON needs doubled backslashes: "\\frac{a}{b}".
     If KaTeX cannot load, the raw TeX stays on the page. */
  var KATEX_BASE = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/";
  var katexLoading = null;

  function loadKatex() {
    if (window.katex) return Promise.resolve(true);
    if (katexLoading) return katexLoading;
    katexLoading = new Promise(function (resolve) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = KATEX_BASE + "katex.min.css";
      document.head.appendChild(link);
      var script = document.createElement("script");
      script.src = KATEX_BASE + "katex.min.js";
      script.onload = function () { resolve(!!window.katex); };
      script.onerror = function () { resolve(false); };
      document.head.appendChild(script);
    });
    return katexLoading;
  }

  function typesetEquations(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll(".el-equation[data-tex]");
    if (!nodes.length) return;
    loadKatex().then(function (ok) {
      if (!ok || !window.katex) return;
      Array.prototype.forEach.call(nodes, function (el) {
        try {
          window.katex.render(el.getAttribute("data-tex"), el, {
            displayMode: el.getAttribute("data-display") === "1",
            throwOnError: false
          });
        } catch (e) { /* leave the raw TeX in place */ }
      });
    });
  }

  RENDERERS.add_equation = function (value) {
    return toArray(value).map(function (item) {
      var obj = isPlainObject(item) ? item : { formatted_equation: item };
      var tex = firstValue(obj, ["formatted_equation", "tex", "text", "equation"]);
      if (tex == null || String(tex).trim() === "") return "";
      tex = String(tex).trim();
      var heading = firstValue(obj, ["heading", "label", "title"]);
      var caption = firstValue(obj, ["equation_caption", "caption"]);
      var inline = obj.add_as_inline_equation === true || obj.inline === true ||
        obj.display === false || obj.block === false;

      return (heading ? headingLabel(heading) : "") +
        (inline
          ? '<span class="el-equation el-equation--inline" data-tex="' + esc(tex) +
            '" data-display="0">' + esc(tex) + "</span>"
          : '<div class="el-equation" data-tex="' + esc(tex) +
            '" data-display="1">' + esc(tex) + "</div>") +
        (caption ? '<p class="el-equation__caption">' + format(caption) + "</p>" : "");
    }).filter(Boolean).join("");
  };


  /* --- add_image -------------------------------------------------------- */
  function figureHtml(item) {
    if (!isPlainObject(item)) item = { image_path: item };
    var path = firstValue(item, S.fields.image);
    if (!path) return "";
    var alt = firstValue(item, S.fields.imageAlt) || "";
    var caption = firstValue(item, S.fields.caption);
    var credit = firstValue(item, S.fields.credit);
    var align = String(firstValue(item, S.fields.align) || "").toLowerCase();
    var zoom = item.zoom_on !== false && item.zoom !== false;
    var image = src(path);

    /* Text written to sit beside the plate: align left/right makes a band. */
    var side = firstValue(item, [
      "content_to_show_on_side_of_the_image_when_aligned",
      "side_content", "content_beside_image", "text_beside_image", "alongside"
    ]);
    var sideText = side == null ? "" : String(side).trim();
    var band = !!sideText && (align === "left" || align === "right");
    if (band && !align) align = "left";

    var cls = "el-figure" + (!band && align === "right" ? " el-figure--right" : (!band && align === "left" ? " el-figure--left" : ""));
    var zoomAttrs = zoom
      ? ' class="zoomable" data-lightbox="' + esc(image) + '" data-lightbox-alt="' + esc(alt) +
        '" data-lightbox-caption="' + esc(caption || "") + '"'
      : "";

    var figure = '<figure class="' + cls + '">' +
      '<img src="' + esc(image) + '" alt="' + esc(alt) + '" loading="lazy"' + zoomAttrs + ">" +
      ((caption || credit)
        ? "<figcaption>" +
          "<span>" + format(caption || "") + "</span>" +
          "<span>" + format(credit || "") + "</span>" +
          "</figcaption>"
        : "") +
      "</figure>";

    if (!band) return figure;

    return '<div class="el-figure-band el-figure-band--' + (align === "right" ? "right" : "left") + '">' +
      figure +
      '<div class="el-figure-band__text el-prose">' + paragraphs(sideText) + "</div>" +
      "</div>";
  }

  RENDERERS.add_image = function (value) {
    return toArray(value).map(figureHtml).filter(Boolean).join("");
  };


  /* --- add_gallery ------------------------------------------------------ */
  var RATIOS = {
    "16:9": "16 / 9", "9:16": "9 / 16",
    "4:3": "4 / 3", "3:4": "3 / 4",
    "3:2": "3 / 2", "2:3": "2 / 3",
    "5:4": "5 / 4", "4:5": "4 / 5",
    "1:1": "1 / 1", "21:9": "21 / 9"
  };

  RENDERERS.add_gallery = function (value) {
    var obj = isPlainObject(value) ? value : { images: value };
    var images = toArray(firstValue(obj, ["images", "photos", "gallery"]));
    if (!images.length) return "";

    var heading = firstValue(obj, S.fields.heading);
    var columns = Math.min(Math.max(Number(obj.columns) || 2, 1), 4);
    /* One image is a full-width plate, cropped by its size. */
    if (images.length === 1) columns = 1;
    var size = String(obj.size || obj.ratio || "").toLowerCase().replace("x", ":");
    var ratio = RATIOS[size] || "";
    var natural = size === "natural";
    var layout = String(obj.layout || "").toLowerCase();
    var masonry = layout === "masonry";
    if (masonry && !size) natural = true;
    var layoutClass = masonry ? " el-gallery--masonry"
      : (layout === "grid" ? " el-gallery--grid" : "");

    var html = images.map(function (item) {
      if (!isPlainObject(item)) item = { image_path: item };
      var path = firstValue(item, S.fields.image);
      if (!path) return "";
      var alt = firstValue(item, S.fields.imageAlt) || "";
      var caption = firstValue(item, S.fields.caption);
      var credit = firstValue(item, S.fields.credit);
      var zoom = item.zoom_on !== false;
      var image = src(path);
      return "<figure>" +
        '<img src="' + esc(image) + '" alt="' + esc(alt) + '" loading="lazy"' +
        (zoom ? ' class="zoomable" data-lightbox="' + esc(image) + '" data-lightbox-alt="' + esc(alt) +
          '" data-lightbox-caption="' + esc([caption, credit].filter(Boolean).join(" — ")) + '"' : "") + ">" +
        (caption || credit
          ? "<figcaption>" + format(caption || "") +
            (credit ? ' <span class="el-gallery__credit">' + format(credit) + "</span>" : "") +
            "</figcaption>"
          : "") +
        "</figure>";
    }).filter(Boolean).join("");

    if (!html) return "";
    return (heading ? headingLabel(heading) : "") +
      '<div class="el-gallery' + layoutClass + (natural ? " el-gallery--natural" : "") +
      '" style="--cols:' + columns +
      (ratio ? ";--ratio:" + ratio : "") + '">' + html + "</div>";
  };


  /* --- add_slideshow ---------------------------------------------------- */
  RENDERERS.add_slideshow = function (value) {
    var obj = isPlainObject(value) ? value : { images: value };
    var images = toArray(firstValue(obj, ["images", "photos", "slides"]));
    if (!images.length) return "";

    var heading = firstValue(obj, S.fields.heading);
    var interval = Math.max(Number(firstValue(obj, ["rotation_time_milliseconds", "interval", "speed"])) || 5000, 1500);

    var zoom = obj.zoom_on !== false && obj.zoom !== false;
    var slides = images.map(function (item, index) {
      if (!isPlainObject(item)) item = { image_path: item };
      var path = firstValue(item, S.fields.image);
      if (!path) return "";
      var caption = String(firstValue(item, S.fields.caption) || "");
      var credit = String(firstValue(item, S.fields.credit) || "");
      var image = src(path);
      var classes = (zoom ? "zoomable" : "") + (index === 0 ? " is-active" : "");
      var lightbox = zoom
        ? ' data-lightbox="' + esc(image) + '" data-lightbox-alt="' +
          esc(firstValue(item, S.fields.imageAlt) || "") + '" data-lightbox-caption="' +
          esc(credit ? (caption ? caption + " — " + credit : credit) : caption) + '"'
        : "";
      return '<img src="' + esc(image) + '" alt="' + esc(firstValue(item, S.fields.imageAlt) || "") +
        '" data-slide="' + index + '" data-caption="' + esc(caption) + '" data-credit="' + esc(credit) + '"' +
        (classes ? ' class="' + classes + '"' : "") + lightbox + ">";
    }).filter(Boolean).join("");

    var captions = images.map(function (item) {
      return isPlainObject(item) ? String(firstValue(item, S.fields.caption) || "") : "";
    });

    var dots = images.map(function (item, index) {
      return '<button type="button" class="el-slideshow__dot' + (index === 0 ? " is-active" : "") +
        '" data-slide-to="' + index + '" aria-label="Show image ' + (index + 1) + '"></button>';
    }).join("");

    var align = String(firstValue(obj, S.fields.align) || "").toLowerCase();
    var side = firstValue(obj, [
      "content_to_show_on_side_of_the_slideshow_when_aligned",
      "side_content", "content_beside_slideshow", "text_beside_slideshow", "alongside"
    ]);
    var sideText = side == null ? "" : String(side).trim();
    var band = !!sideText && (align === "left" || align === "right");

    var show = '<div class="el-slideshow' +
      (!band && align === "left" ? " el-slideshow--left" : "") +
      (!band && align === "right" ? " el-slideshow--right" : "") +
      '" data-slideshow data-interval="' + interval + '">' +
      '<div class="el-slideshow__stage">' + slides + "</div>" +
      '<div class="el-slideshow__bar">' +
      '<span data-slide-caption>' + esc(captions[0] || "") + "</span>" +
      '<span class="el-slideshow__dots">' + dots + "</span>" +
      '<span data-slide-count>01 / ' + String(images.length).padStart(2, "0") + "</span>" +
      "</div></div>";

    if (!band) return (heading ? headingLabel(heading) : "") + show;

    return (heading ? headingLabel(heading) : "") +
      '<div class="el-slideshow-band el-slideshow-band--' + (align === "right" ? "right" : "left") + '">' +
      show +
      '<div class="el-slideshow-band__text el-prose">' + paragraphs(sideText) + "</div>" +
      "</div>";
  };


  /* --- add_3d_model ------------------------------------------------------
     Google's <model-viewer>, fetched once from unpkg. A bare filename is
     read from assets/3d/; a path or URL is used as written. */
  var MODEL_VIEWER_SRC = "https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js";
  var modelViewerAsked = false;

  function needModelViewer() {
    if (modelViewerAsked) return;
    if (window.customElements && customElements.get && customElements.get("model-viewer")) return;
    modelViewerAsked = true;
    var script = document.createElement("script");
    script.type = "module";
    script.src = MODEL_VIEWER_SRC;
    document.head.appendChild(script);
  }

  function modelSrc(file) {
    var s = String(file == null ? "" : file).trim();
    if (!s) return "";
    if (/^(https?:)?\/\//.test(s) || s.charAt(0) === "/" || s.indexOf("..") === 0) return s;
    if (s.indexOf("/") > -1) return (PF.base || "") + s;
    return (PF.base || "") + "assets/3d/" + s;
  }

  function modelHeight(value) {
    if (value == null || value === "") return "420px";
    var text = String(value).trim();
    if (/^\d+(\.\d+)?$/.test(text)) return text + "px";
    if (/^\d+(\.\d+)?(px|vh|vw|rem|em|%)$/i.test(text)) return text;
    return "420px";
  }

  RENDERERS.add_3d_model = function (value) {
    return toArray(value).map(function (item) {
      var obj = isPlainObject(item) ? item : { model_path: item };
      var file = firstValue(obj, ["model_path", "model", "src", "file"]);
      if (!file) return "";
      needModelViewer();

      var url = modelSrc(file);
      var heading = firstValue(obj, S.fields.heading);
      var caption = firstValue(obj, ["model_caption", "caption"]);
      var credit = firstValue(obj, ["model_credit", "credit"]);
      var height = modelHeight(obj.height);
      var autoRotate = obj.show_autorotate === true || obj.autoRotate === true;
      var showDownload = obj.show_download !== false && obj.download !== false;
      var align = String(obj.align || "").toLowerCase();
      var side = firstValue(obj, [
        "content_to_show_on_side_of_the_3d_model_when_aligned",
        "content_to_show_on_side_of_the_model_when_aligned",
        "side_content", "text"
      ]);
      var sideText = side == null ? "" : String(side).trim();
      var band = !!sideText && (align === "left" || align === "right");

      var viewer = '<model-viewer class="el-model__viewer" src="' + esc(url) + '"' +
        ' camera-controls touch-action="pan-y" shadow-intensity="0.8"' +
        ' tone-mapping="neutral" loading="lazy" reveal="auto"' +
        ' style="height:' + height + '"' + (autoRotate ? " auto-rotate" : "") +
        "></model-viewer>";

      var figure = '<figure class="el-model">' + viewer +
        ((caption || credit)
          ? "<figcaption><span>" + format(caption || "") + "</span><span>" + format(credit || "") + "</span></figcaption>"
          : "") +
        (showDownload
          ? '<a class="el-model__download" href="' + esc(url) + '" download>Download the model</a>'
          : "") +
        "</figure>";

      var label = heading ? headingLabel(heading) : "";
      if (!band) return label + figure;

      return label +
        '<div class="el-model-band el-model-band--' + (align === "right" ? "right" : "left") + '">' +
        figure +
        '<div class="el-model-band__text el-prose">' + paragraphs(sideText) + "</div>" +
        "</div>";
    }).filter(Boolean).join("");
  };


  /* --- add_embed_media -------------------------------------------------- */
  function embedUrl(url) {
    var value = String(url || "").trim();
    var youtube = value.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/)([\w-]{6,})/);
    if (youtube) return "https://www.youtube-nocookie.com/embed/" + youtube[1];
    var vimeo = value.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vimeo) return "https://player.vimeo.com/video/" + vimeo[1];

    var m = /docs\.google\.com\/presentation\/d\/([A-Za-z0-9_-]+)/.exec(value);
    if (m) return "https://docs.google.com/presentation/d/" + m[1] + "/embed";
    m = /docs\.google\.com\/document\/d\/([A-Za-z0-9_-]+)/.exec(value);
    if (m) return "https://docs.google.com/document/d/" + m[1] + "/preview";
    m = /docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(value);
    if (m) return "https://docs.google.com/spreadsheets/d/" + m[1] + "/preview";
    m = /docs\.google\.com\/forms\/d\/e\/([A-Za-z0-9_-]+)/.exec(value);
    if (m) return "https://docs.google.com/forms/d/e/" + m[1] + "/viewform?embedded=true";
    m = /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/.exec(value);
    if (m) return "https://drive.google.com/file/d/" + m[1] + "/preview";
    if (/calendar\.google\.com\/calendar\/embed/.test(value)) return value;

    return value;
  }

  function embedPlate(item, height) {
    var link = firstValue(item, S.fields.link);
    if (!link) return "";
    var heading = firstValue(item, S.fields.heading);
    var caption = firstValue(item, ["caption", "image_caption"]);
    var credit = firstValue(item, ["credit", "image_credit"]);
    var h = height || firstValue(item, ["height", "single_embed_media_item_height"]);
    var px = parseInt(h, 10);
    var style = px > 0 ? ' style="height:' + px + 'px;aspect-ratio:auto"' : "";
    return '<figure class="el-embed">' +
      '<div class="el-embed__media">' +
      '<iframe src="' + esc(embedUrl(link)) + '" title="' + esc(heading || caption || "Embedded content") + '" ' +
      'loading="lazy" referrerpolicy="strict-origin-when-cross-origin" ' + style +
      ' allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" ' +
      "allowfullscreen></iframe></div>" +
      ((caption || credit)
        ? "<figcaption><span>" + format(caption || "") + "</span><span>" + format(credit || "") + "</span></figcaption>"
        : "") +
      "</figure>";
  }

  RENDERERS.add_embed_media = function (value) {
    var obj = isPlainObject(value) ? value : { link: value };
    var link = firstValue(obj, S.fields.link);
    if (!link) return "";

    var heading = firstValue(obj, S.fields.heading);
    var align = String(obj.align || "").toLowerCase();
    var side = firstValue(obj, [
      "content_to_show_on_side_of_the_embed_when_aligned",
      "content_to_show_on_the_side_of_the_embed_when_aligned",
      "side_content", "text"
    ]);
    var sideText = side == null ? "" : String(side).trim();
    var plate = embedPlate(obj);
    if (!plate) return "";

    var label = heading ? headingLabel(heading) : "";
    if ((align === "left" || align === "right") && sideText) {
      return label +
        '<div class="el-embed-band el-embed-band--' + (align === "right" ? "right" : "left") + '">' +
        plate +
        '<div class="el-embed-band__text el-prose">' + paragraphs(sideText) + "</div>" +
        "</div>";
    }
    return label + plate;
  };

  RENDERERS.add_embed_media_row = function (value) {
    var obj = isPlainObject(value) ? value : { add_embedded_media_to_row: value };
    var items = toArray(firstValue(obj, ["add_embedded_media_to_row", "items", "embeds"]));
    if (!items.length) return "";
    var heading = firstValue(obj, S.fields.heading);
    var columns = Math.min(Math.max(Number(obj.columns) || items.length || 2, 1), 4);
    var rowHeight = firstValue(obj, ["height"]);
    var html = items.map(function (item) {
      return isPlainObject(item) ? embedPlate(item, rowHeight) : "";
    }).filter(Boolean).join("");
    if (!html) return "";
    return (heading ? headingLabel(heading) : "") +
      '<div class="el-embed-row" style="--cols:' + columns + '">' + html + "</div>";
  };

  R.typeset = typesetEquations;
})(window.PF);
