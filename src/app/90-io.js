/* WrapNote app: import, export, "Save to different location…" and "Confirm end of document". */
var IO = (function () {
  var ACTION_ALIASES = {
    task: ['task', 'action', 'action item', 'action items', 'item', 'description', 'what', 'activity'],
    owner: ['owner', 'assignee', 'assigned to', 'responsible', 'who', 'person', 'owner name'],
    due: ['due', 'due date', 'deadline', 'by', 'target date', 'date due'],
    cost: ['cost', 'amount', 'budget', 'cost ₹', 'cost (₹)', 'cost inr', 'value', 'rs', 'inr'],
    status: ['status', 'state', 'done', 'progress']
  };

  function stamp() { var d = new Date(); return D.localISO(d) + '-' + D.pad2(d.getHours()) + D.pad2(d.getMinutes()); }

  /* ---------- Actions CSV ---------- */
  function actionRows(metas) {
    var rows = [];
    metas.forEach(function (m) {
      MODEL.sortActions(m.actions || []).forEach(function (a) {
        rows.push([m.title, a.task, a.owner, a.due ? D.formatDMY(a.due) : '', a.cost ? M.formatPaise(a.cost, { symbol: false }) : '', a.done ? 'Done' : 'Open',
          a.due ? D.isoWeek(a.due).label : '', a.due ? D.financialYear(a.due).label : '']);
      });
    });
    return rows;
  }
  function exportActionsCSV(all) {
    var metas = all ? Store.metas().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)) || String(a.title).localeCompare(String(b.title)); }) : [Store.meta(Ed.doc.id)];
    var rows = actionRows(metas.filter(Boolean));
    if (!rows.length) { toast('There are no action items to export yet.', 'error'); return; }
    download('wrapnote-actions-' + stamp() + '.csv', WN.csv.toCSV(['Document', 'Task', 'Owner', 'Due date', 'Cost (₹)', 'Status', 'ISO week', 'Financial year'], rows), 'text/csv;charset=utf-8');
  }

  /** CSV import: finds the header after any preamble, matches columns by alias, previews each row, saves nothing until Import. */
  function importActionsCSV(after) {
    if (!Ed.doc || Ed.doc.mode !== 'mom') { toast('Open a minutes document first.', 'error'); return; }
    var file = h('input', { type: 'file', accept: '.csv,text/csv,text/plain' });
    var preview = h('div', { class: 'import-preview' }, h('p', { class: 'hint' }, 'Choose a CSV file. Nothing is saved until you press Import.'));
    var good = [];
    file.addEventListener('change', function () {
      var f = file.files[0]; good = [];
      if (!f) return;
      if (f.size > 5 * 1048576) { preview.textContent = 'The file is over 5 MB. Split it into smaller files.'; return; }
      readFileAs(f).then(function (txt) {
        var rows = WN.csv.parseCSV(txt);
        var hd = WN.csv.findHeader(rows, ACTION_ALIASES, ['task']);
        preview.textContent = '';
        if (!hd) { preview.appendChild(h('p', { class: 'hint err' }, 'No header row with a "Task" column was found in the first 30 lines. Add a header row such as: Task, Owner, Due date, Cost, Status.')); return; }
        var found = Object.keys(hd.map).map(function (k) { return k + ' = column ' + (hd.map[k] + 1) + ' ("' + rows[hd.index][hd.map[k]] + '")'; });
        preview.appendChild(h('p', null, 'Header found on line ' + (hd.index + 1) + '. Matched: ' + found.join('; ') + '.'));
        var t = h('table', { class: 'data-table' }, h('thead', null, h('tr', null, ['Line', 'Status', 'Task', 'Owner', 'Due', 'Cost', 'Done'].map(function (x) { return h('th', null, x); }))));
        var tb = h('tbody');
        var ref = Ed.doc.fields.mom.date ? +Ed.doc.fields.mom.date.slice(0, 4) : new Date().getFullYear();
        rows.slice(hd.index + 1).forEach(function (r, i) {
          if (!r.some(function (c) { return String(c).trim(); })) return;
          var raw = {}; Object.keys(hd.map).forEach(function (k) { raw[k] = r[hd.map[k]]; });
          var v = MODEL.validateAction(raw, ref);
          if (v.ok) good.push(v.value);
          tb.appendChild(h('tr', { class: v.ok ? '' : 'bad' }, h('td', { class: 'num' }, String(hd.index + 2 + i)), h('td', null, v.ok ? 'Ready' : 'Skipped: ' + v.error),
            h('td', null, v.ok ? v.value.task : String(raw.task || '')), h('td', null, v.ok ? v.value.owner : ''), h('td', null, v.ok && v.value.due ? D.formatDMY(v.value.due) : ''),
            h('td', { class: 'num' }, v.ok && v.value.cost ? M.formatPaise(v.value.cost) : ''), h('td', null, v.ok ? (v.value.done ? 'Yes' : 'No') : '')));
        });
        t.appendChild(tb); preview.appendChild(t);
        preview.appendChild(h('p', null, good.length + ' row' + (good.length === 1 ? '' : 's') + ' ready to import.'));
      }).catch(function (e) { logError(e, 'csv import'); preview.textContent = 'Could not read the file: ' + e.message; });
    });
    openDialog({ title: 'Import action items from CSV', wide: true, body: h('div', null, field('CSV file', file), preview), actions: [{ label: 'Cancel' }, { label: 'Import', primary: true, onClick: function (err) {
      if (!good.length) { err('There are no valid rows to import. Fix the rows marked "Skipped", or choose another file.'); return false; }
      Ed.snapshot();
      good.forEach(function (a) { a.id = MODEL.uid('a'); Ed.doc.fields.mom.actions.push(a); });
      toast('Imported ' + good.length + ' action item' + (good.length === 1 ? '' : 's') + '.');
      if (after) after();
    } }] });
  }

  /* ---------- Full backup ---------- */
  function exportBackup() {
    return Store.allRecords().then(function (records) {
      var live = records.filter(function (r) { return !r.d; });
      download('wrapnote-backup-' + stamp() + '.json', JSON.stringify({ app: 'wrapnote', v: 1, exported: Date.now(), records: records }), 'application/json');
      toast('Backup exported: ' + live.length + ' documents.');
    });
  }
  function importBackupDialog() {
    var file = h('input', { type: 'file', accept: '.json,.gz,application/json' });
    var preview = h('div', { class: 'import-preview' }, h('p', { class: 'hint' }, 'Choose a WrapNote backup (.json) or sync save (.json.gz). Nothing is saved until you press Import.'));
    var pending = null;
    file.addEventListener('change', function () {
      var f = file.files[0]; pending = null; if (!f) return;
      if (f.size > 200 * 1048576) { preview.textContent = 'The file is over 200 MB.'; return; }
      (/\.gz$/i.test(f.name) ? gunzip(f) : readFileAs(f)).then(function (txt) {
        var data; try { data = JSON.parse(txt); } catch (e) { throw new Error('The file is not valid JSON. It may be damaged or not a WrapNote backup.'); }
        var v = MODEL.validateBackup(data);
        if (!v.records.length) throw new Error(v.errors[0] || 'The backup has no documents.');
        return Store.allRecords().then(function (local) {
          var map = new Map(local.map(function (r) { return [r.id, r]; }));
          var counts = { add: 0, update: 0, same: 0, older: 0, deleted: 0 };
          var rows = v.records.map(function (r) {
            var cur = map.get(r.id), win = WN.merge.winner(cur, r), status;
            if (!cur) status = r.d ? 'Deletion (no local copy)' : 'New';
            else if (WN.merge.canonical(cur) === WN.merge.canonical(r)) status = 'Already the same';
            else if (win === r) status = r.d ? 'Deletes local copy' : 'Newer: replaces local';
            else status = 'Older: local copy kept';
            if (status === 'New') counts.add++; else if (/^Newer/.test(status)) counts.update++; else if (/same/.test(status)) counts.same++; else if (/Older/.test(status)) counts.older++; else counts.deleted++;
            return { r: r, status: status };
          });
          pending = v.records;
          preview.textContent = '';
          preview.appendChild(h('p', null, counts.add + ' new, ' + counts.update + ' updated, ' + counts.same + ' unchanged, ' + counts.older + ' older (skipped), ' + counts.deleted + ' deletions.'));
          if (v.errors.length) preview.appendChild(h('p', { class: 'hint err' }, v.errors.length + ' record(s) rejected: ' + v.errors.slice(0, 3).join(' ')));
          var t = h('table', { class: 'data-table' }, h('thead', null, h('tr', null, h('th', null, 'Document'), h('th', null, 'Status'))));
          var tb = h('tbody'); rows.slice(0, 300).forEach(function (x) { tb.appendChild(h('tr', null, h('td', null, x.r.d ? '(deleted ' + x.r.id + ')' : (x.r.title || 'Untitled')), h('td', null, x.status))); });
          t.appendChild(tb); preview.appendChild(t);
        });
      }).catch(function (e) { logError(e, 'backup import'); preview.textContent = ''; preview.appendChild(h('p', { class: 'hint err' }, e.message)); });
    });
    openDialog({ title: 'Import backup', wide: true, body: h('div', null, field('Backup file', file), preview), actions: [{ label: 'Cancel' }, { label: 'Import', primary: true, onClick: function (err) {
      if (!pending) { err('Choose a valid backup file first.'); return false; }
      return Store.applyRecords(pending).then(function (ids) { toast('Import finished: ' + ids.length + ' document(s) changed.'); if (Pages.current() === 'docs') Pages.renderDocs(); return true; });
    } }] });
  }

  /* ---------- Document exports ---------- */
  function standaloneHTML(title, bodyHtml) {
    var css = $('#doc-css').textContent;
    return '<!DOCTYPE html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title><style>' + css + ' body{margin:0;background:#fff} .doc-content{max-width:180mm;margin:12mm auto;padding:0 8mm}</style></head><body><div class="doc-content">' + bodyHtml + '</div></body></html>';
  }
  function cleanForExport() { var c = Ed.el().cloneNode(true); $$('[contenteditable]', c).forEach(function (x) { x.removeAttribute('contenteditable'); }); $$('.wn-chart-toggle, .wn-slot', c).forEach(function (x) { x.remove(); }); $$('[data-wn-push]', c).forEach(function (x) { x.style.marginTop = x.getAttribute('data-wn-orig') || ''; x.removeAttribute('data-wn-push'); x.removeAttribute('data-wn-orig'); }); return c; }
  function footnotesHtml(c) {
    var fns = $$('.wn-fnref', c);
    return fns.length ? '<section class="wn-endnotes"><h2>Notes</h2><ol>' + fns.map(function (f) { return '<li>' + esc(f.getAttribute('data-text') || '') + '</li>'; }).join('') + '</ol></section>' : '';
  }
  function exportAs(kind) {
    if (!Ed.doc) return;
    Ed.flush();
    var name = S.fileSlug(Ed.doc.title || 'document') + '-' + stamp();
    var c = cleanForExport(), title = Ed.doc.title || 'Document';
    if (kind === 'pdf') { Layout.print(); return; }
    if (kind === 'saveas') { saveAs(); return; }
    if (kind === 'html') { download(name + '.html', standaloneHTML(title, c.innerHTML + footnotesHtml(c)), 'text/html;charset=utf-8'); return; }
    if (kind === 'doc') {
      // Word opens HTML saved with the Word namespaces as a normal document (.doc).
      var L = Ed.doc.layout, g = Layout.geo();
      var head = (L.header.text || (L.branding.on ? L.branding.headerText : '')), foot = (L.footer.text || (L.branding.on ? L.branding.footerText : ''));
      var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>@page { size: ' + g.wmm + 'mm ' + g.hmm + 'mm; margin: ' + g.mm.map(function (x) { return x + 'mm'; }).join(' ') + '; } ' + $('#doc-css').textContent + '</style></head><body>' +
        (head ? '<p style="text-align:' + L.header.align + ';color:#475569;font-size:9pt">' + esc(head.replace(/\{[a-z]+\}/g, '')) + '</p>' : '') + c.innerHTML + footnotesHtml(c) +
        (foot ? '<p style="text-align:' + L.footer.align + ';color:#475569;font-size:9pt">' + esc(foot.replace(/\{[a-z]+\}/g, '')) + '</p>' : '') + '</body></html>';
      download(name + '.doc', '﻿' + html, 'application/msword'); return;
    }
    if (kind === 'md') { download(name + '.md', toMarkdown(c), 'text/markdown;charset=utf-8'); return; }
    if (kind === 'txt') { download(name + '.txt', Review.textOf(c.innerHTML), 'text/plain;charset=utf-8'); return; }
    if (kind === 'csv') { exportActionsCSV(false); return; }
    if (kind === 'json') { download(name + '.wrapnote.json', JSON.stringify({ app: 'wrapnote', v: 1, records: [Ed.doc] }), 'application/json'); }
  }
  function toMarkdown(root) {
    function inl(n) {
      return Array.prototype.map.call(n.childNodes, function (c) {
        if (c.nodeType === 3) return c.data.replace(/([*_`\[\]])/g, '\\$1');
        if (c.nodeType !== 1) return '';
        var t = c.tagName, x = inl(c);
        if (t === 'B' || t === 'STRONG') return '**' + x + '**';
        if (t === 'I' || t === 'EM') return '*' + x + '*';
        if (t === 'A') return '[' + x + '](' + c.getAttribute('href') + ')';
        if (t === 'BR') return '  \n';
        if (t === 'IMG') return '![' + (c.alt || '') + '](embedded-image)';
        return x;
      }).join('');
    }
    var out = [];
    (function walk(n) {
      Array.prototype.forEach.call(n.children, function (c) {
        var t = c.tagName;
        if (/^H[1-6]$/.test(t)) out.push('#'.repeat(+t[1]) + ' ' + inl(c).trim());
        else if (t === 'P') out.push(inl(c).trim());
        else if (t === 'UL' || t === 'OL') Array.prototype.forEach.call(c.children, function (li, i) { out.push((t === 'OL' ? (i + 1) + '. ' : '- ') + inl(li).trim()); });
        else if (t === 'BLOCKQUOTE') out.push('> ' + c.textContent.trim());
        else if (t === 'TABLE') { var rows = Array.prototype.map.call(c.rows, function (r) { return '| ' + Array.prototype.map.call(r.cells, function (x) { return x.textContent.trim().replace(/\|/g, '\\|'); }).join(' | ') + ' |'; }); if (rows.length) { rows.splice(1, 0, '|' + ' --- |'.repeat(c.rows[0].cells.length)); out.push(rows.join('\n')); } }
        else if (t === 'DL') Array.prototype.forEach.call(c.children, function (x) { out.push(x.tagName === 'DT' ? '**' + x.textContent.trim() + '**' : ': ' + x.textContent.trim()); });
        else if (c.classList.contains('wn-eq')) out.push('$$' + c.getAttribute('data-tex') + '$$');
        else walk(c);
      });
    })(root);
    return out.filter(function (x) { return x !== ''; }).join('\n\n') + '\n';
  }

  /** "Save to different location…": File System Access API where available, otherwise a download. */
  function saveAs() {
    if (!Ed.doc) return;
    Ed.flush();
    var name = S.fileSlug(Ed.doc.title || 'document') + '.wrapnote.json';
    var data = JSON.stringify({ app: 'wrapnote', v: 1, records: [Ed.doc] });
    if (window.showSaveFilePicker) {
      window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'WrapNote document', accept: { 'application/json': ['.json'] } }] })
        .then(function (fh) { return fh.createWritable().then(function (w) { return w.write(data).then(function () { return w.close(); }); }).then(function () { toast('Saved a copy to ' + fh.name + '.'); }); })
        .catch(function (e) { if (e.name !== 'AbortError') { logError(e, 'saveAs'); toast('Could not save there: ' + e.message, 'error'); } });
    } else { download(name, data, 'application/json'); toast('This browser cannot choose a folder, so the copy was downloaded.'); }
  }

  /* ---------- Confirm end of document ----------
   * Final polish runs on this device with fixed rules (spacing, capitals, repeated words). No text is sent anywhere.
   * Then a summary section is built from the fields, every table of contents is updated, a revision is saved,
   * and the document moves to final review (locked until reopened). */
  function confirmEnd() {
    if (!Ed.doc) return;
    if (Ed.doc.status === 'final') { toast('Already in final review.'); return; }
    var polish = h('input', { type: 'checkbox', checked: true }), summary = h('input', { type: 'checkbox', checked: true });
    openDialog({ title: 'Confirm end of document', body: h('div', null, h('p', null, 'This finishes live drafting. WrapNote will:'),
      h('label', { class: 'chk' }, polish, 'Polish the text (spacing, sentence capitals, repeated words)'),
      h('label', { class: 'chk' }, summary, 'Add or refresh a summary section'),
      h('p', { class: 'hint' }, 'Tables of contents are updated, a revision is saved, and the document is locked for review. You can reopen it at any time. The polish runs on this device; nothing is sent to an online service.')),
      actions: [{ label: 'Cancel' }, { label: 'Confirm end of document', primary: true, onClick: function () {
        var t0 = performance.now();
        Ed.snapshot();
        var changes = 0, d = Ed.doc;
        if (polish.checked) {
          var w = document.createTreeWalker(Ed.el(), NodeFilter.SHOW_TEXT), n, nodes = [];
          while ((n = w.nextNode())) if (!n.parentNode.closest('.wn-gen,.wn-eq,.wn-toc,code,pre,del')) nodes.push(n);
          // Polish per paragraph so sentence starts are judged on whole sentences.
          var blocks = new Map();
          nodes.forEach(function (t) { var b = t.parentNode.closest('p,li,h1,h2,h3,h4,td,th,blockquote,dd,dt') || t.parentNode; if (!blocks.has(b)) blocks.set(b, []); blocks.get(b).push(t); });
          blocks.forEach(function (list) {
            if (list.length === 1) { var before = list[0].data, after = T.polishText(before.replace(/^\s+/, '')); after = (/^\s/.test(before) ? ' ' : '') + after + (/\s$/.test(before) && !/\s$/.test(after) ? ' ' : ''); if (after !== before) { list[0].data = after; changes++; } }
            else list.forEach(function (t) { var b2 = t.data, a2 = b2.replace(/[ \t\u00a0]{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1'); if (a2 !== b2) { t.data = a2; changes++; } });
          });
          if (d.mode !== 'blank') { var key = d.mode === 'mom' ? 'purpose' : 'thesis'; var pv = T.polishText(d.fields[d.mode][key] || ''); if (pv !== d.fields[d.mode][key]) { d.fields[d.mode][key] = pv; changes++; } }
        }
        if (summary.checked) buildSummary();
        Ed.ensureGen();
        // One layout pass refreshes automatic tables of contents (and re-runs itself if they change);
        // manual ones are forced once. The revision save below is the only write.
        Layout.run();
        if (Ed.el().querySelector('.wn-toc[data-mode="manual"]')) Refs.updateTocs(true);
        d.status = 'final';
        Ed.applyLock();
        Review.saveRevision('Final');
        Intake.renderBlocks(); Review.updateCounts();
        timings.confirmEnd = performance.now() - t0;
        toast('Final review: ' + changes + ' text fix' + (changes === 1 ? '' : 'es') + ' applied. Export from the banner, or reopen to edit.', '', 6000);
      } }] });
  }

  function buildSummary() {
    var d = Ed.doc, items = [];
    if (d.mode === 'mom') {
      var f = d.fields.mom, acts = f.actions.filter(function (a) { return String(a.task || '').trim(); });
      var open = acts.filter(function (a) { return !a.done; }).length, cost = M.sumPaise(acts.map(function (a) { return a.cost || 0; }));
      items.push(MODEL.lines(f.decisions).length + ' decision(s) recorded; ' + acts.length + ' action item(s), ' + open + ' open' + (cost ? '; action costs ' + M.formatPaise(cost) : '') + '.');
      var owners = {}; acts.forEach(function (a) { if (!a.done && a.owner) owners[a.owner] = (owners[a.owner] || 0) + 1; });
      var ow = Object.keys(owners).sort(function (a, b) { return owners[b] - owners[a] || a.localeCompare(b); });
      if (ow.length) items.push('Open actions by owner: ' + ow.map(function (o) { return o + ' (' + owners[o] + ')'; }).join(', ') + '.');
      if (D.isValidISO(f.nextDate)) items.push('Next meeting: ' + MODEL.dateLine(f.nextDate) + (f.nextTime ? ' at ' + f.nextTime : '') + '.');
    } else if (d.mode === 'book') {
      var b = d.fields.book;
      items.push(MODEL.lines(b.concepts).length + ' concept(s), ' + b.quotes.filter(function (q) { return q.text; }).length + ' quote(s), ' + b.recall.filter(function (r) { return r.q; }).length + ' recall question(s).');
      MODEL.lines(b.takeaways).slice(0, 5).forEach(function (t) { items.push(t); });
    }
    var paras = $$('p', Ed.el()).filter(function (p) { return !p.closest('.wn-gen,.wn-summary,.wn-toc,.wn-cover'); }).map(function (p) { return p.textContent; });
    T.summarise(paras, 4).forEach(function (s) { items.push(s); });
    var old = Ed.el().querySelector('.wn-summary');
    var sec = h('section', { class: 'wn-summary', 'data-summary': '1' }, h('h2', null, 'Summary'), h('ul', null, items.map(function (i) { return h('li', null, i); })));
    if (old) old.replaceWith(sec);
    else { var gen = Ed.el().querySelector(':scope > .wn-gen'); if (gen) gen.after(sec); else Ed.el().insertBefore(sec, Ed.el().firstChild); }
    Ed.doc.summary = items;
  }

  function bind() {
    $('#exportSel').addEventListener('change', function () { var v = this.value; this.value = ''; if (v) exportAs(v); });
    $('#saveAsBtn').addEventListener('click', saveAs);
    $('#confirmEndBtn').addEventListener('click', confirmEnd);
    $$('[data-export]').forEach(function (b) { b.addEventListener('click', function () { exportAs(b.getAttribute('data-export')); }); });
    $('#backupExport').addEventListener('click', exportBackup);
    $('#backupImport').addEventListener('click', importBackupDialog);
    $('#csvAll').addEventListener('click', function () { exportActionsCSV(true); });
  }

  return { bind: bind, importActionsCSV: importActionsCSV, exportActionsCSV: exportActionsCSV, exportBackup: exportBackup, importBackupDialog: importBackupDialog, exportAs: exportAs, saveAs: saveAs, confirmEnd: confirmEnd, toMarkdown: toMarkdown, ACTION_ALIASES: ACTION_ALIASES };
})();
