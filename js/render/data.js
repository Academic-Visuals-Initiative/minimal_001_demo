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
  /* --- add_table -------------------------------------------------------- */
  function splitCells(value) {
    if (Array.isArray(value)) {
      return value.map(function (cell) { return String(cell == null ? "" : cell).trim(); });
    }
    var text = String(value == null ? "" : value);
    var cells = [];
    var cell = "";
    var quoted = false;
    for (var i = 0; i < text.length; i += 1) {
      var ch = text.charAt(i);
      if (quoted) {
        if (ch === '"' && text.charAt(i + 1) === '"') {
          cell += '"';
          i += 1;
        } else if (ch === '"') {
          quoted = false;
        } else {
          cell += ch;
        }
      } else if (ch === '"' && cell.trim() === "") {
        quoted = true;
        cell = "";
      } else if (ch === ",") {
        cells.push(cell.trim());
        cell = "";
      } else {
        cell += ch;
      }
    }
    cells.push(cell.trim());
    return cells;
  }

  /* A filter bar is added when a group has two or more distinct tags. The
     tag text is shown once above the items; items keep slugs in data-tags. */
  var filterSeq = 0;

  /* A publication group ties a featured paper and a list together: one tag
     set and one filter bar. */
  var publicationGroups = {};
  /* A featured paper automatically joins the next publication list. */
  var pendingPublication = null;
  function publicationGroup(raw) {
    var key = PF.slug(String(raw == null ? "" : raw).trim());
    if (!key) return null;
    if (!publicationGroups[key]) publicationGroups[key] = { tags: [] };
    return publicationGroups[key];
  }

  function filterBar(tags, label, group, position) {
    var unique = [];
    tags.forEach(function (tag) {
      if (unique.indexOf(tag) < 0) unique.push(tag);
    });
    if (unique.length < 2) return "";
    return '<div class="el-filter" role="group" aria-label="' + esc(label) + '"' +
      ' data-filter-for="' + esc(group) + '"' +
      (position === "top" ? ' data-filter-position="top"' : "") + ">" +
      '<button type="button" class="el-filter__btn is-active" data-filter-tag="" aria-pressed="true">All</button>' +
      unique.map(function (tag) {
        return '<button type="button" class="el-filter__btn" data-filter-tag="' +
          esc(PF.slug(tag)) + '" aria-pressed="false">' + esc(tag) + "</button>";
      }).join("") +
      "</div>";
  }

  function tagSlugs(tags) {
    return tags.map(function (tag) { return PF.slug(tag); }).join(" ");
  }

  RENDERERS.add_table = function (value) {
    var obj = isPlainObject(value) ? value : null;
    if (!obj) return "";

    var headRaw = firstValue(obj, ["column_headers", "head", "columns"]);
    var rowsRaw = firstValue(obj, ["content_of_rows_separated_by_comma", "rows", "content"]);
    var head = headRaw == null ? [] : splitCells(headRaw);
    var rows = toArray(rowsRaw).map(splitCells).filter(function (row) {
      return row.length && row.join("").trim();
    });
    if (!head.length && !rows.length) return "";

    var aligns = toArray(obj.align);
    function alignAt(index) {
      var value = String(aligns[index] || aligns[0] || "left").toLowerCase();
      return value === "right" ? " is-right" : (value === "center" ? " is-center" : "");
    }

    var heading = firstValue(obj, S.fields.heading);
    var caption = firstValue(obj, ["table_caption", "caption"]);

    var html = ['<div class="el-table-wrap"><table class="el-table">'];
    if (caption) html.push("<caption>" + format(caption) + "</caption>");
    if (head.length) {
      html.push("<thead><tr>");
      head.forEach(function (cell, index) {
        html.push('<th scope="col" class="' + alignAt(index).trim() + '">' + format(cell) + "</th>");
      });
      html.push("</tr></thead>");
    }
    html.push("<tbody>");
    rows.forEach(function (row, rowIndex) {
      if (head.length && row.length !== head.length) {
        console.warn("[table] row " + (rowIndex + 1) + " has " + row.length + " cells but the table has " +
          head.length + " columns — a comma inside a cell splits it. Write that row as an array of cells.");
      }
      html.push("<tr>");
      row.forEach(function (cell, index) {
        html.push('<td class="' + alignAt(index).trim() + '">' + format(cell) + "</td>");
      });
      html.push("</tr>");
    });
    html.push("</tbody></table></div>");

    return headingLabel(heading) + html.join("");
  };


  /* --- add_cards -------------------------------------------------------- */
  RENDERERS.add_cards = function (value) {
    var obj = isPlainObject(value) ? value : { individual_card_details: value };
    var cards = toArray(firstValue(obj, ["individual_card_details", "cards", "items"]));
    var single = false;
    if (!cards.length && (obj.heading || obj.individual_card_keyword)) {
      cards = [obj];
      single = true;
    }
    if (!cards.length) return "";

    var columns = single ? 1 : Math.min(Math.max(Number(obj.columns) || 3, 1), 4);
    /* A lone card uses its own heading/text; it is not a group with an
       intro, so those keys belong to the card only. */
    var heading = single ? "" : firstValue(obj, S.fields.heading);
    var intro = single ? "" : firstValue(obj, S.fields.intro);
    var showCategories = obj.show_categories !== false && obj.filter !== false;
    var position = String(obj.filter_position || "").toLowerCase();
    var group = "cards-" + (filterSeq += 1);
    var hasMedia = cards.some(function (card) {
      return isPlainObject(card) && firstValue(card, S.fields.image);
    });

    var groupTags = [];
    var html = cards.map(function (card) {
      if (!isPlainObject(card)) return "";
      var keyword = firstValue(card, ["individual_card_keyword", "keyword", "label", "subheading", "eyebrow"]);
      var title = firstValue(card, ["heading", "title", "card_title"]);
      var text = firstValue(card, ["text", "body", "introduction", "description"]);
      var meta = firstValue(card, ["additional_info", "meta", "note", "date", "details"]);
      var tags = tagValues(firstValue(card, S.fields.tags));
      tags.forEach(function (name) {
        if (groupTags.indexOf(name) < 0) groupTags.push(name);
      });
      var image = firstValue(card, S.fields.image);
      var alt = firstValue(card, S.fields.imageAlt) || "";
      var fit = String(firstValue(card, ["image_fit", "fit", "object_fit"]) || "cover").toLowerCase();
      var link = firstValue(card, S.fields.link);
      var resolved = link ? PF.resolveLink(link) : "";
      var tag = resolved ? "a" : "div";
      var attrs = resolved
        ? ' href="' + esc(resolved) + '"' + PF.linkAttrs(resolved)
        : "";
      var tagAttr = tags.length
        ? ' data-filter-group="' + esc(group) + '" data-tags="' + esc(tagSlugs(tags)) + '"'
        : "";
      return "<" + tag + ' class="el-card' + (image ? " el-card--media" : "") + '"' + attrs + tagAttr + ">" +
        (image
          ? '<span class="el-card__media"><img src="' + esc(src(image)) + '" alt="' + esc(alt) +
            '" loading="lazy" style="object-fit:' + (fit === "contain" ? "contain" : "cover") + '"></span>'
          : "") +
        (keyword ? '<span class="el-card__keyword">' + format(keyword) + "</span>" : "") +
        (title ? '<span class="el-card__title">' + format(title) + "</span>" : "") +
        (text ? '<span class="el-card__text">' + format(text) + "</span>" : "") +
        (meta ? '<span class="el-card__meta">' + format(meta) + "</span>" : "") +
        (resolved ? '<span class="el-card__go">Read ' + PF.icon("outward") + "</span>" : "") +
        "</" + tag + ">";
    }).filter(Boolean).join("");

    if (!html) return "";
    var bar = showCategories && cards.length > 1
      ? filterBar(groupTags, "Filter projects by category", group, position)
      : "";
    var masonry = !single && cards.length > 1 && hasMedia;
    var list = '<div class="el-cards' + (single ? " el-cards--single" : "") +
      (masonry ? " el-cards--masonry" : "") +
      '" style="--cols:' + columns + '">' + html + "</div>";
    return (heading ? headingLabel(heading) : "") +
      (intro ? '<p class="el-cards__intro">' + format(intro) + "</p>" : "") +
      bar + list;
  };


  /* --- add_people ------------------------------------------------------- */
  RENDERERS.add_people = function (value) {
    var obj = isPlainObject(value) ? value : {};
    var people = toArray(firstValue(obj, ["people", "items", "add_people"]));
    if (!people.length) return "";

    var heading = firstValue(obj, S.fields.heading);
    var intro = firstValue(obj, S.fields.intro);
    var html = people.map(function (person) {
      if (!isPlainObject(person)) person = { name: person };
      var name = firstValue(person, ["name", "text"]);
      if (!name) return "";
      var role = firstValue(person, ["position", "role", "subtitle"]);
      var photo = firstValue(person, S.fields.image);
      var link = PF.resolveLink(firstValue(person, ["profile_link", "link", "url"]) || "");
      var tag = link ? "a" : "div";
      var initials = String(name).replace(/^(Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s+/i, "").split(/\s+/)
        .map(function (part) { return part.charAt(0); }).join("").slice(0, 2).toUpperCase();
      return "<" + tag + ' class="el-person"' + (link ? ' href="' + esc(link) + '"' + PF.linkAttrs(link) : "") + ">" +
        (photo
          ? '<img src="' + esc(src(photo)) + '" alt="' + esc(name) + '" loading="lazy">'
          : '<span class="el-person__placeholder" aria-hidden="true">' + esc(initials) + "</span>") +
        '<span class="el-person__name">' + format(name) + "</span>" +
        (role ? '<span class="el-person__role">' + format(role) + "</span>" : "") +
        "</" + tag + ">";
    }).filter(Boolean).join("");

    if (!html) return "";
    return (heading ? headingLabel(heading) : "") +
      (intro ? '<p class="el-cards__intro">' + format(intro) + "</p>" : "") +
      '<div class="el-people">' + html + "</div>";
  };


  /* --- add_a_timeline --------------------------------------------------- */
  RENDERERS.add_a_timeline = function (value) {
    var obj = isPlainObject(value) ? value : {};
    var items = toArray(firstValue(obj, ["items_of_the_timeline", "items", "steps"]));
    if (!items.length) return "";

    var heading = firstValue(obj, S.fields.heading);
    var html = items.map(function (item) {
      if (!isPlainObject(item)) item = { timeline_item_title: item };
      var when = firstValue(item, ["timeline_item_date", "date", "year"]);
      var title = firstValue(item, ["timeline_item_title", "title", "what"]);
      var note = firstValue(item, ["timeline_item_text", "text", "note"]);
      if (!when && !title) return "";
      return "<li>" +
        (when ? '<span class="el-timeline__when">' + format(when) + "</span>" : "") +
        (title ? '<span class="el-timeline__what">' + format(title) + "</span>" : "") +
        (note ? '<p class="el-timeline__note">' + format(note) + "</p>" : "") +
        "</li>";
    }).filter(Boolean).join("");

    if (!html) return "";
    return (heading ? headingLabel(heading) : "") + '<ol class="el-timeline">' + html + "</ol>";
  };


  /* --- add_publication_or_more ------------------------------------------ */
  RENDERERS.add_publication_or_more = function (value) {
    var obj = isPlainObject(value) ? value : { items: value };
    var items = toArray(firstValue(obj, ["items", "publication_titles", "papers", "list", "publications"]));
    if (!items.length) return "";

    var heading = firstValue(obj, ["publication_section_title", "heading", "title"]);
    var showNumbers = obj.show_numbering !== false;
    var showCategories = obj.show_categories !== false && obj.filter !== false;
    var position = String(obj.filter_position || "").toLowerCase();
    var groupName = firstValue(obj, ["publication_group", "filter_group", "group"]);
    var groupState = groupName ? publicationGroup(groupName) : null;
    var pending = groupState ? null : pendingPublication;
    pendingPublication = null;
    var group = groupState ? PF.slug(String(groupName))
      : (pending ? pending.group : "pubs-" + (++filterSeq));

    var groupTags = pending ? pending.tags.slice() : [];
    var rows = items.map(function (item, index) {
      if (!isPlainObject(item)) item = { title: item };
      var title = firstValue(item, ["title", "publication_title", "publication_title_to_include", "name"]);
      if (!title) return "";
      var authors = firstValue(item, ["authors", "author", "by"]);
      var venue = firstValue(item, ["venue", "journal", "where", "meta", "publisher"]);
      var year = firstValue(item, ["year", "date"]);
      var tags = tagValues(firstValue(item, S.fields.tags));
      tags.forEach(function (name) {
        if (groupTags.indexOf(name) < 0) groupTags.push(name);
        if (groupState && groupState.tags.indexOf(name) < 0) groupState.tags.push(name);
      });
      var link = PF.resolveLink(firstValue(item, S.fields.link) || "");
      var titleHtml = link
        ? '<a href="' + esc(link) + '"' + PF.linkAttrs(link) + ">" + format(title) + "</a>"
        : format(title);
      var meta = [authors, venue].filter(Boolean).map(function (part) { return esc(String(part)); }).join(" &middot; ");
      var side = (year ? '<span class="el-pub__year">' + esc(year) + "</span>" : "") +
        (link
          ? '<a class="el-pub__view" href="' + esc(link) + '" aria-label="View: ' + esc(String(title)) + '"' +
            PF.linkAttrs(link) + ">View</a>"
          : "");
      var number = showNumbers ? index + 1 : 0;
      var tagAttr = tags.length
        ? ' data-filter-group="' + esc(group) + '" data-tags="' + esc(tagSlugs(tags)) +
          '" data-tag-labels="' + esc(tags.join("|")) + '"'
        : "";
      return '<div class="el-pub' + (showNumbers ? "" : " el-pub--plain") + '"' + tagAttr + ">" +
        (showNumbers ? '<span class="el-pub__no">' + String(number).padStart(2, "0") + "</span>" : "") +
        "<div>" +
        '<div class="el-pub__title">' + titleHtml + "</div>" +
        (meta ? '<div class="el-pub__meta">' + meta + "</div>" : "") +
        "</div>" +
        (side ? '<div class="el-pub__side">' + side + "</div>" : (showNumbers ? "<span></span>" : "")) +
        "</div>";
    }).filter(Boolean).join("");

    if (!rows) return "";
    var barTags = groupState ? groupState.tags : groupTags;
    var bar = showCategories && items.length > 1
      ? filterBar(barTags, "Filter publications by category", group, position)
      : "";
    var list = '<div class="el-pubs">' + rows + "</div>";
    return (heading ? headingLabel(heading) : "") + bar + list;
  };


  /* --- add_contact_information ----------------------------------------- */
  RENDERERS.add_contact_information = function (value) {
    var obj = isPlainObject(value) ? value : { email: value };
    var heading = firstValue(obj, S.fields.heading);
    var people = toArray(firstValue(obj, ["people", "contacts", "items"]) || []);
    if (!people.length) {
      people = (obj.email || obj.mobile || obj.phone || obj.telephone) ? [obj] : [];
    }
    if (!people.length) return "";

    var blocks = people.map(function (person) {
      if (!isPlainObject(person)) person = { email: person };
      var name = firstValue(person, ["name", "full_name"]);
      var role = firstValue(person, ["role", "position", "title"]);
      var email = firstValue(person, ["email", "mail", "address"]);
      var phone = firstValue(person, ["mobile", "mobile_number", "phone", "phone_number", "telephone", "tel"]);
      var note = firstValue(person, ["note", "caption"]);
      if (!name && !email && !phone) return "";

      var tel = phone ? String(phone).replace(/[^\d+]/g, "") : "";
      return '<div class="el-contact__person">' +
        (name ? '<p class="el-contact__name">' + format(name) + "</p>" : "") +
        (role ? '<p class="el-contact__role">' + format(role) + "</p>" : "") +
        (email ? '<a class="el-contact__email" href="mailto:' + esc(email) + '">' + esc(email) + "</a>" : "") +
        (phone ? '<a class="el-contact__phone" href="tel:' + esc(tel) + '">' + format(phone) + "</a>" : "") +
        (note ? '<span class="el-contact__note">' + format(note) + "</span>" : "") +
        "</div>";
    }).filter(Boolean).join("");

    if (!blocks) return "";
    return (heading ? headingLabel(heading) : "") +
      '<div class="el-contact' + (people.length > 1 ? " el-contact--group" : "") + '">' +
      blocks + "</div>";
  };


  /* --- add_teaching_items -------------------------------------------------
     Courses with the facts a student actually wants: name, code, level,
     when it ran, and one line on what it is. Accepts one course or a list,
     optionally under a heading. */
  RENDERERS.add_teaching_items = function (value) {
    var obj = isPlainObject(value) && !Array.isArray(value) ? value : {};
    var isCourse = function (item) {
      return isPlainObject(item) &&
        (item.name || item.title || item.course_name || item.code || item.course_code);
    };

    var heading = firstValue(obj, S.fields.heading);
    var courses = toArray(firstValue(obj, ["items", "courses", "add_items_to_list", "teaching"]));

    if (!courses.length) {
      if (Array.isArray(value)) courses = value;
      else if (isCourse(value)) courses = [value];
    }

    var html = courses.map(function (course) {
      if (typeof course === "string") course = { name: course };
      if (!isCourse(course)) return "";

      var name = firstValue(course, ["name", "title", "course_name", "heading"]);
      var code = firstValue(course, ["code", "course_code", "catalog", "module_code"]);
      var level = firstValue(course, ["level", "study_level", "stage", "audience"]);
      var term = firstValue(course, ["term", "last_taught", "teaching_time", "taught", "semester", "when"]);
      var intro = firstValue(course, ["intro", "description", "summary", "text", "blurb"]);
      var link = PF.resolveLink(firstValue(course, ["link", "url"]) || "");

      var meta = [];
      if (code) meta.push('<span class="el-course__code">' + esc(code) + "</span>");
      if (level) meta.push("<span>" + esc(level) + "</span>");
      if (term) meta.push("<span>" + esc(term) + "</span>");

      var titleHtml = link
        ? '<a href="' + esc(link) + '"' + PF.linkAttrs(link) + ">" + format(name) + "</a>"
        : format(name);

      return '<article class="el-course">' +
        (meta.length ? '<p class="el-course__meta">' + meta.join("") + "</p>" : "") +
        '<h3 class="el-course__name">' + titleHtml + "</h3>" +
        (intro ? '<p class="el-course__intro">' + format(intro) + "</p>" : "") +
        "</article>";
    }).filter(Boolean).join("");

    if (!html) return "";
    return (heading ? headingLabel(heading) : "") + '<div class="el-courses">' + html + "</div>";
  };


  /* --- add_featured_publication -----------------------------------------
     One paper, given room: an image beside the citation, a short summary
     and one link. A string is treated as the title. */
  RENDERERS.add_featured_publication = function (value) {
    var obj = isPlainObject(value) ? value : { title: value };
    var title = firstValue(obj, ["title", "heading", "publication_title"]);
    if (!title) return "";

    var keyword = firstValue(obj, ["keyword", "label", "subheading", "eyebrow"]) || "Featured publication";
    var authors = firstValue(obj, ["authors", "author", "by"]);
    var venue = firstValue(obj, ["venue", "journal", "publisher"]);
    var year = firstValue(obj, ["year", "date"]);
    var summary = firstValue(obj, ["summary", "text", "abstract"]);
    var link = PF.resolveLink(firstValue(obj, S.fields.link) || "");
    var linkLabel = firstValue(obj, ["link_label", "link_text", "button_label"]) || "Read the paper";

    var tags = tagValues(firstValue(obj, S.fields.tags));
    var groupName = firstValue(obj, ["publication_group", "filter_group", "group"]);
    var groupState = groupName ? publicationGroup(groupName) : null;
    var autoGroup = "";
    pendingPublication = null;
    if (groupState) {
      tags.forEach(function (tag) {
        if (groupState.tags.indexOf(tag) < 0) groupState.tags.push(tag);
      });
    } else if (tags.length) {
      autoGroup = "pubs-" + (++filterSeq);
      pendingPublication = { group: autoGroup, tags: tags.slice() };
    }
    var filterGroup = groupState ? PF.slug(String(groupName)) : autoGroup;
    var image = firstValue(obj, S.fields.image);
    var alt = firstValue(obj, S.fields.imageAlt) || "";
    var caption = firstValue(obj, S.fields.caption);
    var credit = firstValue(obj, S.fields.credit);
    var zoom = obj.zoom_on !== false;
    var imageSrc = image ? src(image) : "";

    /* Keyword, venue and year share the top line; authors keep the meta
       line underneath. */
    var keywordLine = format(keyword);
    if (venue) keywordLine += " &middot; " + esc(String(venue));
    if (year) keywordLine += " &middot; " + esc(String(year));
    var meta = authors ? esc(String(authors)) : "";

    var filterAttrs = "";
    if (filterGroup) {
      filterAttrs = ' data-filter-group="' + esc(filterGroup) + '"';
      if (tags.length) {
        filterAttrs += ' data-tags="' + esc(tagSlugs(tags)) + '" data-tag-labels="' + esc(tags.join("|")) + '"';
      }
    }

    var media = image
      ? '<figure class="el-featured__media">' +
        '<img src="' + esc(imageSrc) + '" alt="' + esc(alt) + '" loading="lazy"' +
        (zoom
          ? ' class="zoomable" data-lightbox="' + esc(imageSrc) + '" data-lightbox-alt="' + esc(alt) +
            '" data-lightbox-caption="' + esc([caption, credit].filter(Boolean).join(" — ")) + '"'
          : "") + ">" +
        ((caption || credit)
          ? "<figcaption><span>" + format(caption || "") + "</span><span>" + format(credit || "") + "</span></figcaption>"
          : "") +
        "</figure>"
      : "";

    var titleHtml = link
      ? '<a href="' + esc(link) + '"' + PF.linkAttrs(link) + ">" + format(title) + "</a>"
      : format(title);

    return '<article class="el-featured' + (image ? "" : " el-featured--text") + '"' + filterAttrs + ">" +
      media +
      '<div class="el-featured__body">' +
      '<p class="el-featured__keyword">' + keywordLine + "</p>" +
      '<h3 class="el-featured__title">' + titleHtml + "</h3>" +
      (meta ? '<p class="el-featured__meta">' + meta + "</p>" : "") +
      (summary ? '<p class="el-featured__summary">' + format(summary) + "</p>" : "") +
      (link
        ? '<a class="el-featured__link" href="' + esc(link) + '"' + PF.linkAttrs(link) + ">" +
          esc(linkLabel) + PF.icon("outward") + "</a>"
        : "") +
      "</div></article>";
  };


  /* --- add_expandable_information ----------------------------------------
     Folded groups — Education, honours, previous posts. Each group is a
     native <details>, so it opens by click or keyboard with no script.

     A group:
       { "expandable_information_row_label": "Education",
         "add_information_to_expandable_item": [ …rows… ] }
     A row:
       { "expandable_item_left_column_info": "PhD, 2009",
         "expandable_item_right_column_primary_information": ["Title", "Place"],
         "expandable_item_right_column_secondary_information": [
           { "label": "Thesis", "value": "…" } ] }
     "open": true starts a group unfolded. Shorter names — label, items,
     left, right, secondary — read the same. */
  RENDERERS.add_expandable_information = function (value) {
    var groups = [];

    function firstOf(obj, keys) {
      var found = firstValue(obj, keys);
      return found == null ? "" : found;
    }

    function rowsOf(group) {
      var rows = firstOf(group, [
        "add_information_to_expandable_item", "items", "rows", "details", "fields"
      ]);
      return rows;
    }

    function addGroup(label, rows, open, expanded) {
      label = String(label == null ? "" : label).trim();
      /* An expanded group is its own heading-free block; a label is optional.
         A collapsible group still needs a label to open. */
      if (!rows || (!label && !expanded)) return;
      groups.push({ label: label, rows: rows, open: !!open, expanded: !!expanded });
    }

    /* "open": true starts a group unfolded but still closable.
       "expanded": true keeps it unfolded — no arrow, nothing to click. */
    function startsOpen(group) {
      return group.open === true;
    }

    function staysExpanded(group) {
      return group.expanded === true || group.expanded_by_default === true;
    }

    if (Array.isArray(value)) {
      value.forEach(function (group) {
        if (!isPlainObject(group)) return;
        addGroup(
          firstOf(group, ["expandable_information_row_label", "label", "heading", "title", "name"]),
          rowsOf(group),
          startsOpen(group),
          staysExpanded(group)
        );
      });
    } else if (isPlainObject(value)) {
      var label = firstOf(value, ["expandable_information_row_label", "label", "heading", "title", "name"]);
      if ((label || staysExpanded(value)) && rowsOf(value)) {
        addGroup(label, rowsOf(value), startsOpen(value), staysExpanded(value));
      } else {
        Object.keys(value).forEach(function (key) {
          if (/^(open|expanded|expanded_by_default|column|column_position|label|heading|title|expandable_information_row_label|add_information_to_expandable_item|items|rows|details|fields)$/.test(key)) return;
          addGroup(key, value[key], false, false);
        });
      }
    }

    if (!groups.length) return "";

    var html = groups.map(function (group) {
      var rows = group.rows;
      var list = [];

      function addRow(row) {
        if (!isPlainObject(row)) return;

        var left = firstOf(row, [
          "expandable_item_left_column_info", "left", "label", "period", "date", "year"
        ]);
        var primary = firstOf(row, [
          "expandable_item_right_column_primary_information", "right", "value", "text", "description"
        ]);
        var secondary = firstOf(row, [
          "expandable_item_right_column_secondary_information", "secondary", "under", "details", "meta"
        ]);

        var lines = toArray(primary).map(function (line) {
          return line == null ? "" : String(line).trim();
        }).filter(Boolean);

        var meta = [];
        if (Array.isArray(secondary)) {
          secondary.forEach(function (entry) {
            if (!isPlainObject(entry)) return;
            var metaLabel = firstOf(entry, ["label", "key", "name", "term"]);
            var metaValue = firstOf(entry, ["value", "text", "detail", "description"]);
            if (metaLabel && metaValue) meta.push({ label: metaLabel, value: metaValue });
          });
        } else if (isPlainObject(secondary)) {
          Object.keys(secondary).forEach(function (key) {
            if (secondary[key] != null && String(secondary[key]).trim() !== "") {
              meta.push({ label: key, value: secondary[key] });
            }
          });
        }

        if (!lines.length && !left && !meta.length) return;

        list.push('<div class="el-xp__row">' +
          '<p class="el-xp__left">' + format(left) + "</p>" +
          '<div class="el-xp__right">' +
          lines.map(function (line) {
            return '<p class="el-xp__line">' + format(line) + "</p>";
          }).join("") +
          (meta.length
            ? '<dl class="el-xp__meta">' + meta.map(function (entry) {
              return "<div>" +
                "<dt>" + esc(entry.label) + "</dt>" +
                "<dd>" + format(entry.value) + "</dd>" +
                "</div>";
            }).join("") + "</dl>"
            : "") +
          "</div></div>");
      }

      if (Array.isArray(rows)) rows.forEach(addRow);
      else if (isPlainObject(rows)) {
        Object.keys(rows).forEach(function (key) {
          var row = rows[key];
          if (isPlainObject(row)) {
            row = Object.assign({}, row);
            if (row.expandable_item_left_column_info == null) row.expandable_item_left_column_info = key;
            addRow(row);
          } else {
            addRow({ expandable_item_left_column_info: key, expandable_item_right_column_primary_information: row });
          }
        });
      }

      if (!list.length) return "";

      var rowsHtml = '<div class="el-xp__rows">' + list.join("") + "</div>";

      /* Kept expanded: a static group — no arrow, no way to fold it. The
         summary is drawn only when the group has a label. */
      if (group.expanded) {
        return '<section class="el-xp__group el-xp__group--static">' +
          (group.label
            ? '<div class="el-xp__summary">' +
              '<span class="el-xp__label">' + esc(group.label) + "</span>" +
              "</div>"
            : "") +
          rowsHtml + "</section>";
      }

      return '<details class="el-xp__group"' + (group.open ? " open" : "") + ">" +
        '<summary class="el-xp__summary">' +
        '<span class="el-xp__label">' + esc(group.label) + "</span>" +
        '<span class="el-xp__icon" aria-hidden="true"></span>' +
        "</summary>" + rowsHtml +
        "</details>";
    }).filter(Boolean).join("");

    return html ? '<div class="el-xp">' + html + "</div>" : "";
  };

  PF.resetPublicationGroup = function () {
    pendingPublication = null;
  };

})(window.PF);
