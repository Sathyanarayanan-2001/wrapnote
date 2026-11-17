/* WrapNote spell-check worker (bundled by esbuild into dist/spell/worker.js at build time).
 * Runs nspell (a Hunspell-compatible checker in plain JavaScript) with the en-GB dictionary off the main
 * thread, because building the word list takes a second or two and must never freeze typing.
 * The dictionary files are fetched from this site's own spell/ folder; nothing is sent anywhere. */
import NSpell from 'nspell';

let spell = null;
// Everyday office and engineering words the en-GB Hunspell list lacks (checked against it one by one),
// so a template's own labels such as "Approver" are not marked as mistakes.
const EXTRA = ['approver', 'approvers', 'datasheet', 'datasheets', 'subfolder', 'subfolders', 'onboarding', 'offboarding', 'changelog',
  'backend', 'frontend', 'roadmap', 'roadmaps', 'setpoint', 'setpoints', 'signoff'];

function text(name) {
  return fetch(name).then((r) => { if (!r.ok) throw new Error(name + ' could not be loaded (' + r.status + ')'); return r.text(); });
}

self.onmessage = (e) => {
  const m = e.data || {};
  try {
    if (m.type === 'init') {
      Promise.all([text('en-GB.aff'), text('en-GB.dic')]).then(([aff, dic]) => {
        spell = NSpell(aff, dic);
        EXTRA.forEach((w) => spell.add(w));
        (m.personal || []).forEach((w) => spell.add(w));
        self.postMessage({ type: 'ready' });
      }).catch((err) => self.postMessage({ type: 'error', message: String(err && err.message || err) }));
      return;
    }
    if (!spell) { self.postMessage({ id: m.id, type: 'error', message: 'not ready' }); return; }
    if (m.type === 'check') self.postMessage({ id: m.id, bad: m.words.filter((w) => !spell.correct(w)) });
    else if (m.type === 'suggest') self.postMessage({ id: m.id, list: spell.suggest(m.word).slice(0, 8) });
    else if (m.type === 'add') { spell.add(m.word); self.postMessage({ id: m.id, ok: true }); }
    else if (m.type === 'remove') { spell.remove(m.word); self.postMessage({ id: m.id, ok: true }); }
  } catch (err) { self.postMessage({ id: m.id, type: 'error', message: String(err && err.message || err) }); }
};
