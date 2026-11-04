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
  /* --- add_full_width_links --------------------------------------------- */
  RENDERERS.add_full_width_links = function (value) {
    var obj = isPlainObject(value) ? value : { links: value };
    var links = toArray(firstValue(obj, ["links", "items"]));
    if (!links.length) return "";
    var heading = firstValue(obj, S.fields.heading);

    var rows = links.map(function (link, index) {
      if (!isPlainObject(link)) return "";
      var label = firstValue(link, ["label", "text", "title"]);
      if (!label) return "";
      var href = PF.resolveLink(firstValue(link, S.fields.link) || "");
      var note = firstValue(link, ["note", "meta", "kicker"]);
      var tag = href ? "a" : "div";
      return "<" + tag + ' class="el-link-row"' + (href ? ' href="' + esc(href) + '"' + PF.linkAttrs(href) : "") + ">" +
        '<span class="el-link-row__no">' + String(index + 1).padStart(2, "0") + "</span>" +
        '<span class="el-link-row__label">' + format(label) + "</span>" +
        (note ? '<span class="el-link-row__note">' + format(note) + "</span>" : '<span class="el-link-row__note"></span>') +
        '<span class="el-link-row__arrow">' + PF.icon("outward") + "</span>" +
        "</" + tag + ">";
    }).filter(Boolean).join("");

    if (!rows) return "";
    return (heading ? headingLabel(heading) : "") + '<div class="el-links">' + rows + "</div>";
  };


  /* --- add_button ------------------------------------------------------- */
  RENDERERS.add_button = function (value) {
    var obj = isPlainObject(value) ? value : {};
    var list = Array.isArray(value)
      ? value
      : toArray(firstValue(obj, ["items", "buttons", "links"]) ||
          (obj.label || obj.text ? [obj] : []));

    var align = String(obj.align || "").trim().toLowerCase();
    var alignClass = align === "center" ? " el-buttons--center"
      : (align === "right" || align === "end" ? " el-buttons--right" : "");

    var html = list.map(function (button) {
      if (!isPlainObject(button)) button = { label: button };
      var label = firstValue(button, ["label", "text", "title"]);
      if (!label) return "";
      var link = PF.resolveLink(firstValue(button, S.fields.link) || "");
      var style = String(button.style || button.type || "fill").toLowerCase();
      var outline = style === "outline" || style === "ghost" || style === "secondary";
      var tag = link ? "a" : "span";

      /* The arrow is opt-in: icon: "arrow_outward" | "arrow_forward". */
      var icon = button.icon;
      var iconHtml = "";
      if (icon && icon !== false) {
        var iconName = String(icon).toLowerCase();
        iconHtml = PF.icon(/right|forward|next/.test(iconName) ? "right" : "outward");
      }

      return "<" + tag + ' class="el-btn' + (outline ? " el-btn--outline" : "") + '"' +
        (link ? ' href="' + esc(link) + '"' + PF.linkAttrs(link) : "") + ">" +
        format(label) + iconHtml + "</" + tag + ">";
    }).filter(Boolean).join("");

    return html ? '<div class="el-buttons' + alignClass + '">' + html + "</div>" : "";
  };


  /* --- add_divider ------------------------------------------------------ */
  var DIVIDERS = {
    solid: "solid", line: "solid", thin: "thin", hairline: "thin",
    dashed: "dashed", dash: "dashed",
    dotted: "dotted", dot: "dotted",
    bold: "bold", thick: "bold", heavy: "bold",
    double: "double"
  };

  RENDERERS.add_divider = function (value) {
    var raw = typeof value === "string"
      ? value
      : (isPlainObject(value) ? firstValue(value, ["style", "type", "divider_style", "weight"]) : "");
    var key = String(raw == null ? "" : raw).trim().toLowerCase();
    var style = DIVIDERS[key] || "solid";
    return '<hr class="el-divider el-divider--' + style + '">';
  };

})(window.PF);
