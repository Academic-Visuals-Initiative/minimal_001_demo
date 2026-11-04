/* ==========================================================================
   schema.js — the canonical content keys, in one place.

   Loaded after core.js and before elements.js. Every element resolves a
   shared concept through PF.schema.pick(), so a key is renamed in one file
   rather than in every renderer. The first name in each list is canonical;
   the rest are kept so older JSON keeps working.
   ========================================================================== */
(function (global) {
  "use strict";

  var PF = global.PF || (global.PF = {});

  var fields = {
    heading: ["heading", "title", "label"],
    subheading: ["subheading", "eyebrow"],
    intro: ["intro", "introduction"],
    text: ["text", "body", "content", "description"],
    additionalInfo: ["additional_info", "meta"],
    link: ["link", "url", "href", "doi"],
    image: ["image_path", "image", "src", "photo"],
    imageAlt: ["image_alt", "alt", "alt_text"],
    caption: ["image_caption", "caption"],
    credit: ["image_credit", "credit"],
    tags: ["tags", "categories", "category", "keywords"],
    column: ["column", "column_position"],
    align: ["align", "alignment"]
  };

  var canonical = {};
  Object.keys(fields).forEach(function (field) {
    canonical[field] = fields[field][0];
  });

  /* alias → canonical, for the migration checker */
  var aliases = {};
  Object.keys(fields).forEach(function (field) {
    fields[field].slice(1).forEach(function (alias) {
      aliases[alias] = canonical[field];
    });
  });

  PF.schema = {
    version: 1,
    fields: fields,
    canonical: canonical,
    aliases: aliases,

    /* The first present key, canonical first. */
    pick: function (obj, field) {
      if (!obj || typeof obj !== "object") return undefined;
      var keys = fields[field];
      if (!keys) return obj[field];
      for (var i = 0; i < keys.length; i += 1) {
        if (obj[keys[i]] != null) return obj[keys[i]];
      }
      return undefined;
    },

    /* True when a key is a known alias (not the canonical spelling). */
    isAlias: function (key) {
      return Object.prototype.hasOwnProperty.call(aliases, key);
    },

    canonicalFor: function (key) {
      return aliases[key] || key;
    }
  };
})(window);
