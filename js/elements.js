/* ==========================================================================
   elements.js — the content creation system.

   Every element is an `add_*` key in JSON; the renderer turns it into
   markup with the classes defined in css/site.css. A key may appear once
   at the top of a section, or any number of times inside
   `add_content_to_page` when order and repetition matter.
   ========================================================================== */
(function (global) {
  "use strict";

  var PF = global.PF;
  var esc = PF.esc;
  var S = PF.schema;
  var format = PF.formatText;
  var src = PF.imageSrc;

  var RENDERERS = {};
  var ALIASES = {};

  function toArray(value) { return PF.toArray(value); }

  function isPlainObject(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
  }

  function firstValue(obj, keys) {
    if (!obj) return undefined;
    for (var i = 0; i < keys.length; i++) {
      if (obj[keys[i]] != null) return obj[keys[i]];
    }
    return undefined;
  }

  function headingLabel(value) {
    if (!value) return "";
    return '<h3 class="el-heading__text el-heading__text--sub">' + format(value) + "</h3>";
  }

  function paragraphs(text) {
    return String(text == null ? "" : text)
      .split(/\n{2,}/)
      .map(function (part) { return part.trim(); })
      .filter(Boolean)
      .map(function (part) { return "<p>" + format(part) + "</p>"; })
      .join("");
  }

  /* Tags: an array, a comma-separated string, or { tag, text, label, name }
     objects. Plain text, used as filter metadata rather than printed. */
  function tagValues(value) {
    var raw = Array.isArray(value)
      ? value
      : (typeof value === "string" ? value.split(",") : toArray(value));
    return raw.map(function (tag) {
      if (isPlainObject(tag)) tag = firstValue(tag, ["tag", "text", "label", "name"]);
      return String(tag == null ? "" : tag).trim();
    }).filter(Boolean);
  }

  PF.render = {
    registry: RENDERERS,
    aliases: ALIASES,
    esc: esc,
    format: format,
    src: src,
    isPlainObject: isPlainObject,
    firstValue: firstValue,
    toArray: toArray,
    headingLabel: headingLabel,
    paragraphs: paragraphs,
    tagValues: tagValues
  };

  /* --- add_content_to_page ---------------------------------------------- */
  RENDERERS.add_content_to_page = function (value) {
    return toArray(value).map(function (entry) {
      if (!isPlainObject(entry)) return "";
      return Object.keys(entry).map(function (key) {
        return renderOne(key, entry[key]);
      }).join("");
    }).join("");
  };


  /* --- registry helpers ------------------------------------------------- */

  ALIASES.add_timeline = "add_a_timeline";
  ALIASES.add_publications = "add_publication_or_more";
  ALIASES.add_publication_list = "add_publication_or_more";
  ALIASES.add_embed = "add_embed_media";
  ALIASES.add_teaching = "add_teaching_items";
  ALIASES.add_courses = "add_teaching_items";
  ALIASES.add_course = "add_teaching_items";
  ALIASES.add_expandables = "add_expandable_information";
  ALIASES.add_expandable_items = "add_expandable_information";

  function rendererFor(key) {
    var name = ALIASES[key] || key;
    return RENDERERS[name];
  }

  function renderOne(key, value) {
    var renderer = rendererFor(key);
    if (!renderer) {
      if (/^add_/.test(key)) console.warn("[content] unknown element:", key);
      return "";
    }
    return renderer(value) || "";
  }

  /* Draw every `add_*` key of a section, in file order, expanding
     `add_content_to_page` where it stands. */
  function renderFlow(data) {
    if (!data || typeof data !== "object") return "";
    return Object.keys(data).map(function (key) {
      if (key !== "add_content_to_page" && key.indexOf("add_") !== 0) return "";
      return renderOne(key, data[key]);
    }).join("\n");
  }

  PF.elements = {
    render: renderOne,
    renderFlow: renderFlow,
    typeset: function (root) {
      return PF.render.typeset ? PF.render.typeset(root) : undefined;
    },
    has: function (key) { return !!rendererFor(key); },
    registry: RENDERERS
  };
})(window);

