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
  var tagValues = R.tagValues;
  var S = PF.schema;
  var RENDERERS = R.registry;
  /* --- add_heading ------------------------------------------------------ */
  RENDERERS.add_heading = function (value) {
    var obj = isPlainObject(value) ? value : { heading_text: value };
    var level = Math.min(Math.max(Number(obj.level) || 3, 1), 4);
    var text = firstValue(obj, ["heading_text", "heading", "text", "title"]);
    var sub = firstValue(obj, ["subheading", "subheading_text", "kicker", "note"]);
    if (text == null && sub == null) return "";
    return [
      '<div class="el-heading">',
      text != null ? "<h" + level + ' class="el-heading__text">' + format(text) + "</h" + level + ">" : "",
      sub ? '<p class="el-heading__sub">' + format(sub) + "</p>" : "",
      "</div>"
    ].filter(Boolean).join("");
  };


  /* --- add_paragraph ---------------------------------------------------- */
  RENDERERS.add_paragraph = function (value) {
    if (Array.isArray(value)) {
      return value.map(function (v) { return RENDERERS.add_paragraph(v); }).join("");
    }
    var obj = isPlainObject(value) ? value : { text: value };
    var text = firstValue(obj, ["text", "paragraph", "content"]);
    if (text == null) return "";
    var heading = firstValue(obj, S.fields.heading);
    var lead = obj.is_lead === true || obj.lead === true;
    var layout = String(firstValue(obj, [
      "layout_of_the_paragraph", "layout", "paragraph_layout"
    ]) || "").trim().toLowerCase();
    var twoCol = /^(two|2)[-_ ]?col/.test(layout) || layout === "columns" || layout === "two";
    var body = paragraphs(text);
    if (!body) return "";
    if (twoCol) body = '<div class="el-prose__cols">' + body + "</div>";
    return '<div class="el-prose' + (lead ? " el-prose--lead" : "") +
      (twoCol ? " el-prose--two-col" : "") + '">' +
      (heading ? '<p class="el-prose__label">' + format(heading) + "</p>" : "") +
      body +
      "</div>";
  };


  /* --- add_list --------------------------------------------------------- */
  function listItems(value, keys) {
    if (Array.isArray(value)) return value;
    var obj = isPlainObject(value) ? value : {};
    var items = firstValue(obj, keys);
    return Array.isArray(items) ? items : [];
  }

  function itemText(item) {
    if (isPlainObject(item)) {
      return firstValue(item, ["list_item", "text", "item", "label", "value", "list_item_text"]);
    }
    return item;
  }

  /* --- list styles -------------------------------------------------------
     One name per marker. Ordered styles use a CSS counter, the rest a glyph. */
  var LIST_STYLES = {
    number: "number", decimal: "number", "decimal-leading-zero": "number",
    roman: "roman", "lower-roman": "roman",
    "roman-upper": "roman-upper", "upper-roman": "roman-upper",
    alpha: "alpha", "lower-alpha": "alpha",
    "alpha-upper": "alpha-upper", "upper-alpha": "alpha-upper",
    bullet: "bullet", disc: "bullet", default: "bullet",
    dash: "dash", en: "dash",
    square: "square", circle: "circle",
    check: "check", tick: "check",
    arrow: "arrow",
    inline: "inline", chips: "inline",
    none: "none"
  };

  function listStyle(value, fallback) {
    var key = String(value == null ? "" : value).trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
    return LIST_STYLES[key] || fallback || "bullet";
  }

  /* Items may carry a level; they are drawn as nested lists so numbering and
     indentation follow the structure. */
  function listTree(items) {
    var roots = [];
    var stack = [];
    items.forEach(function (item) {
      var text = itemText(item);
      if (text == null || String(text).trim() === "") return;
      var level = isPlainObject(item) ? Number(item.level || item.list_level || 1) : 1;
      level = Math.min(Math.max(level || 1, 1), 4);

      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();

      var node = { text: String(text), level: level, children: [] };
      if (!stack.length) roots.push(node);
      else stack[stack.length - 1].node.children.push(node);
      stack.push({ level: level, node: node });
    });
    return roots;
  }

  function renderListNodes(nodes, level, styles) {
    var style = styles[level - 1] || "bullet";
    var ordered = style === "number" || style === "roman" ||
      style === "roman-upper" || style === "alpha" || style === "alpha-upper";
    var tag = ordered ? "ol" : "ul";
    var html = nodes.map(function (node) {
      var inner = format(node.text);
      if (node.children && node.children.length) {
        inner += renderListNodes(node.children, Math.min(level + 1, 4), styles);
      }
      return "<li>" + inner + "</li>";
    }).join("");
    return "<" + tag + ' class="el-list el-list--' + style + ' el-list--level-' + level + '">' +
      html + "</" + tag + ">";
  }

  RENDERERS.add_list = function (value) {
    var obj = isPlainObject(value) ? value : {};
    var items = listItems(value, ["add_items_to_list", "items", "list"]);
    if (!items.length) return "";

    var heading = firstValue(obj, S.fields.heading);
    var base = listStyle(firstValue(obj, ["style", "list_style", "list_type"]), "bullet");
    var styles = [1, 2, 3, 4].map(function (level) {
      return listStyle(obj["list_level_" + level + "_style"], base);
    });

    var tree = listTree(items);
    if (!tree.length) return "";

    return headingLabel(heading) + renderListNodes(tree, 1, styles);
  };


  /* --- add_focus_list --------------------------------------------------- */
  RENDERERS.add_focus_list = function (value) {
    var obj = isPlainObject(value) ? value : {};
    var items = listItems(value, ["items_of_the_focus_list", "items", "focus"]);
    if (!items.length) return "";
    var heading = firstValue(obj, S.fields.heading);
    var html = items.map(function (item) {
      var text = itemText(item);
      if (text == null || text === "") return "";
      return "<li>" + format(text) + "</li>";
    }).filter(Boolean).join("");
    if (!html) return "";
    return headingLabel(heading) + '<ul class="el-focus">' + html + "</ul>";
  };


  /* --- add_quote -------------------------------------------------------- */
  RENDERERS.add_quote = function (value) {
    return toArray(value).map(function (item) {
      var obj = isPlainObject(item) ? item : { text: item };
      var text = firstValue(obj, ["text", "quote", "blockquote"]);
      if (!text) return "";
      var heading = firstValue(obj, S.fields.heading);
      var author = firstValue(obj, ["author_of_the_quote", "author", "name"]);
      var role = firstValue(obj, ["position_of_the_author", "position", "role"]);
      var who = [author, role].filter(Boolean).map(function (part) {
        return esc(String(part));
      }).join(", ");
      return (heading ? headingLabel(heading) : "") +
        '<figure class="el-quote">' +
        "<blockquote>" + format(text) + "</blockquote>" +
        (who ? "<figcaption><strong>" + who + "</strong></figcaption>" : "") +
        "</figure>";
    }).filter(Boolean).join("");
  };


  /* --- add_special_note ------------------------------------------------- */
  var NOTE_TONES = {
    info: "info", blue: "info", note: "info",
    amber: "amber", warning: "amber", warn: "amber",
    green: "green", success: "green",
    red: "red", danger: "red", error: "red",
    dark: "dark", neutral: "dark",
    accent: "accent", primary: "accent"
  };

  /* A custom icon may be a bare name (assets/icons/custom_icons/name.svg),
     a path, or a full URL. "icon": false turns the icon off. */
  function noteIcon(value) {
    var raw = String(value == null ? "" : value).trim();
    if (!raw) return "";
    if (/^(https?:)?\/\//.test(raw) || raw.charAt(0) === "/" || raw.indexOf("..") === 0) return raw;
    if (raw.indexOf("/") > -1) return (PF.base || "") + raw;
    return (PF.base || "") + "assets/icons/custom_icons/" + (/\.(svg|png|jpe?g|webp)$/i.test(raw) ? raw : raw + ".svg");
  }

  /* Light text on a custom background needs a light icon. */
  function isLightColour(value) {
    var hex = String(value || "").trim().replace("#", "");
    if (hex.length === 3) hex = hex.split("").map(function (c) { return c + c; }).join("");
    if (!/^[0-9a-f]{6}$/i.test(hex)) return false;
    var r = parseInt(hex.slice(0, 2), 16) / 255;
    var g = parseInt(hex.slice(2, 4), 16) / 255;
    var b = parseInt(hex.slice(4, 6), 16) / 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.6;
  }

  RENDERERS.add_special_note = function (value) {
    return toArray(value).map(function (item) {
      var obj = isPlainObject(item) ? item : { text: item };
      var text = firstValue(obj, ["text", "special_note", "note", "content"]);
      if (!text) return "";
      var heading = firstValue(obj, S.fields.heading);
      var tone = NOTE_TONES[String(obj.colour || obj.color || "accent").toLowerCase()] || "accent";
      var icon = firstValue(obj, ["special_note_icon", "note_icon", "icon"]);
      var bg = firstValue(obj, ["background_colour", "background_color"]);
      var fg = firstValue(obj, ["text_colour", "text_color"]);
      var custom = !!(bg || fg);

      var classes = "el-note el-note--" + tone +
        (custom ? " el-note--custom" : "") +
        (custom && isLightColour(fg) ? " el-note--on-dark" : "");
      var style = custom
        ? ' style="' + (bg ? "background-color:" + esc(String(bg)) + ";" : "") +
          (fg ? "color:" + esc(String(fg)) + ";" : "") + '"'
        : "";

      var iconHtml = icon && typeof icon === "string"
        ? '<img class="el-note__icon" src="' + esc(noteIcon(icon)) + '" alt="" width="18" height="18" loading="lazy">'
        : "";

      return '<aside class="' + classes + '"' + style + ">" +
        iconHtml +
        '<div class="el-note__body">' +
        (heading ? '<p class="el-note__label">' + format(heading) + "</p>" : "") +
        '<div class="el-note__text">' + paragraphs(text) + "</div>" +
        "</div></aside>";
    }).filter(Boolean).join("");
  };


  /* --- add_tags --------------------------------------------------------- */
  RENDERERS.add_tags = function (value) {
    var obj = isPlainObject(value) ? value : {};
    var tags = tagValues(Array.isArray(value) ? value : (isPlainObject(value) ? firstValue(value, S.fields.tags) : value));
    if (!tags.length) return "";
    var heading = firstValue(obj, S.fields.heading);
    return (heading ? headingLabel(heading) : "") +
      '<ul class="el-tags">' + tags.map(function (tag) {
        return '<li class="el-tag">' + esc(tag) + "</li>";
      }).join("") + "</ul>";
  };

})(window.PF);
