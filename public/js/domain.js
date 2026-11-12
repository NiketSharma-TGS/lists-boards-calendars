// A domain's dashboard: sections holding list blocks and board blocks side by
// side in one window, each board with its own move rules.

import { html, useState } from '/vendor/preact-htm.js';
import { state, notify, op, sel, go, toast } from './store.js';
import { Icon, openMenu, openModal, closeModal, askText, askConfirm, Empty } from './ui.js';
import { TaskRow, AddTask, Meta, Check, openTask, taskMenu, getDragId, setDragId, dropZone, dropArgs } from './tasks.js';
import { addDays, startOfWeek, fmtDur, describeRelative } from '/shared/dates.js';
import { domainCompare, isOpen, PRIORITY_COLORS } from '/shared/logic.js';
import { DOMAIN_COLORS } from './views.js';

const ROLES = [['', 'Plain column'], ['backlog', 'Backlog'], ['todo', 'To-Do'], ['doing', 'In progress'], ['done', 'Done (completes the card)']];
const ACTIONS = [['deadline', 'Set deadline'], ['due', 'Set date'], ['startDate', 'Set start date'], ['priority', 'Set priority'], ['label', 'Add label']];
const DATE_VALUES = [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['eow', 'End of this week'], ['eonw', 'End of next week'], ['eom', 'End of this month'], ['+3', 'In 3 days'], ['+7', 'In 7 days'], ['+14', 'In 14 days']];

export function ruleSummary(rule) {
  return (rule.actions || []).map((a) => {
    if (a.type === 'deadline') return 'deadline = ' + describeRelative(a.value);
    if (a.type === 'due') return 'date = ' + describeRelative(a.value);
    if (a.type === 'startDate') return 'start = ' + describeRelative(a.value);
    if (a.type === 'priority') return 'priority = P' + a.value;
    if (a.type === 'label') return 'label @' + a.value;
    return '';
  }).filter(Boolean).join(', ');
}

// ---------- rules and columns editor ----------
function BoardSettings({ blockId }) {
  const block = sel.block(blockId);
  if (!block) return null;
  const rules = sel.rules(blockId);
  const cols = block.columns || [];
  const saveCols = (next) => op('block.save', { id: block.id, columns: next });
  const colName = (id) => (id === '*' ? 'anywhere' : cols.find((c) => c.id === id)?.name || '?');
  const saveRule = (r, patch) => op('rule.save', { ...r, ...patch });
  return html`<div class="form board-settings">
    <h3 class="tm-h">Move rules</h3>
    <p class="muted">When a card lands in a column, these defaults are filled in for you. You can still change them on the card afterwards.</p>
    ${rules.length === 0 ? html`<div class="faint">No rules yet.</div>` : null}
    ${rules.map((r) => html`<div class="rule" key=${r.id}>
      <div class="rule-line">
        <${Icon} name="bolt" size=${15} />
        <span>From</span>
        <select value=${r.from} aria-label="From column" onChange=${(e) => saveRule(r, { from: e.target.value })}><option value="*">anywhere</option>${cols.map((c) => html`<option value=${c.id}>${c.name}</option>`)}</select>
        <span>to</span>
        <select value=${r.to} aria-label="To column" onChange=${(e) => saveRule(r, { to: e.target.value })}>${cols.map((c) => html`<option value=${c.id}>${c.name}</option>`)}</select>
        <span class="grow"></span>
        <label class="check-label"><input type="checkbox" checked=${r.enabled !== false} onChange=${(e) => saveRule(r, { enabled: e.target.checked })} /> On</label>
        <button class="icon-btn small" aria-label="Delete rule" onClick=${() => op('rule.delete', { id: r.id })}><${Icon} name="trash" size=${14} /></button>
      </div>
      ${(r.actions || []).map((a, i) => {
        const setAction = (patch) => saveRule(r, { actions: r.actions.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
        const isDate = a.type === 'deadline' || a.type === 'due' || a.type === 'startDate';
        return html`<div class="rule-line indent" key=${i}>
          <select value=${a.type} aria-label="Action" onChange=${(e) => { const type = e.target.value; setAction({ type, value: type === 'priority' ? '2' : type === 'label' ? 'next' : 'eow' }); }}>${ACTIONS.map(([v, l]) => html`<option value=${v}>${l}</option>`)}</select>
          ${isDate ? html`<select value=${a.value} aria-label="Value" onChange=${(e) => setAction({ value: e.target.value })}>${DATE_VALUES.map(([v, l]) => html`<option value=${v}>${l}</option>`)}</select>`
            : a.type === 'priority' ? html`<select value=${String(a.value)} aria-label="Value" onChange=${(e) => setAction({ value: e.target.value })}>${[1, 2, 3, 4].map((p) => html`<option value=${String(p)}>P${p}</option>`)}</select>`
            : html`<input type="text" value=${a.value} aria-label="Label" onChange=${(e) => setAction({ value: e.target.value.replace(/^@/, '').trim() || 'next' })} />`}
          ${isDate ? html`<label class="check-label" title="Replace a value the card already has"><input type="checkbox" checked=${!!a.overwrite} onChange=${(e) => setAction({ overwrite: e.target.checked })} /> Overwrite</label>` : null}
          <span class="grow"></span>
          ${r.actions.length > 1 ? html`<button class="icon-btn small" aria-label="Remove action" onClick=${() => saveRule(r, { actions: r.actions.filter((_, j) => j !== i) })}><${Icon} name="x" size=${14} /></button>` : null}
        </div>`;
      })}
      <button class="link-btn indent" onClick=${() => saveRule(r, { actions: [...(r.actions || []), { type: 'priority', value: '2' }] })}>Add another action</button>
    </div>`)}
    <div><button class="btn small" onClick=${() => op('rule.save', { blockId: block.id, from: '*', to: (cols.find((c) => c.role === 'todo') || cols[0]).id, actions: [{ type: 'deadline', value: 'eow' }] })}><${Icon} name="plus" size=${14} /> Add rule</button></div>

    <h3 class="tm-h">Columns</h3>
    ${cols.map((c, i) => html`<div class="rule-line" key=${c.id}>
      <input type="text" value=${c.name} aria-label="Column name" onChange=${(e) => saveCols(cols.map((x) => (x.id === c.id ? { ...x, name: e.target.value || x.name } : x)))} />
      <select value=${c.role || ''} aria-label="Column kind" onChange=${(e) => saveCols(cols.map((x) => (x.id === c.id ? { ...x, role: e.target.value || null } : x)))}>${ROLES.map(([v, l]) => html`<option value=${v}>${l}</option>`)}</select>
      <button class="icon-btn small" aria-label="Move left" disabled=${i === 0} onClick=${() => { const n = cols.slice(); [n[i - 1], n[i]] = [n[i], n[i - 1]]; saveCols(n); }}><${Icon} name="arrowUp" size=${14} /></button>
      <button class="icon-btn small" aria-label="Move right" disabled=${i === cols.length - 1} onClick=${() => { const n = cols.slice(); [n[i + 1], n[i]] = [n[i], n[i + 1]]; saveCols(n); }}><${Icon} name="arrowDown" size=${14} /></button>
      <button class="icon-btn small" aria-label="Delete column" disabled=${cols.length < 2} onClick=${async () => { if (await askConfirm({ title: 'Delete column', text: `Cards in "${c.name}" move to "${cols.find((x) => x.id !== c.id).name}".`, confirm: 'Delete column' })) { await saveCols(cols.filter((x) => x.id !== c.id)); openBoardSettings(block.id); } }}><${Icon} name="trash" size=${14} /></button>
    </div>`)}
    <div><button class="btn small" onClick=${() => saveCols([...cols, { id: 'c' + Date.now().toString(36), name: 'New column', role: null }])}><${Icon} name="plus" size=${14} /> Add column</button></div>
    <div class="form-actions"><button class="btn primary" onClick=${closeModal}>Done</button></div>
  </div>`;
}
export function openBoardSettings(blockId) {
  const b = sel.block(blockId);
  openModal(() => html`<${BoardSettings} blockId=${blockId} />`, { title: `${b ? b.name : 'Board'}: rules and columns`, width: 640 });
}

// ---------- blocks ----------
function blockMenu(e, block) {
  const sections = sel.sections(block.domainId);
  const all = sel.blocks(block.domainId);
  const peers = all.filter((b) => (b.sectionId || null) === (block.sectionId || null));
  const idx = peers.findIndex((b) => b.id === block.id);
  const swap = (j) => { const ids = all.map((b) => b.id); const a = ids.indexOf(block.id); const b = ids.indexOf(peers[j].id); [ids[a], ids[b]] = [ids[b], ids[a]]; op('block.reorder', { ids }); };
  const count = sel.blockTasks(block.id).length;
  openMenu(e, [
    { label: 'Rename', icon: 'edit', fn: async () => { const name = await askText({ title: 'Rename block', value: block.name }); if (name) op('block.save', { id: block.id, name }); } },
    block.type === 'board' ? { label: 'Rules and columns', icon: 'bolt', fn: () => openBoardSettings(block.id) } : null,
    block.type === 'list' ? { label: block.sort === 'priority' ? 'Sort by hand' : 'Sort by priority', icon: 'flag', fn: () => op('block.save', { id: block.id, sort: block.sort === 'priority' ? 'manual' : 'priority' }) } : null,
    { label: block.type === 'board' ? 'Show as a list' : 'Show as a board', icon: block.type === 'board' ? 'list' : 'board', fn: () => op('block.save', { id: block.id, type: block.type === 'board' ? 'list' : 'board' }) },
    idx > 0 ? { label: 'Move up', icon: 'arrowUp', fn: () => swap(idx - 1) } : null,
    idx < peers.length - 1 ? { label: 'Move down', icon: 'arrowDown', fn: () => swap(idx + 1) } : null,
    sections.length ? { sep: true } : null,
    sections.length ? { heading: 'Section' } : null,
    sections.length ? { label: 'No section', active: !block.sectionId, fn: () => op('block.save', { id: block.id, sectionId: null }) } : null,
    ...sections.map((s) => ({ label: s.name, active: block.sectionId === s.id, fn: () => op('block.save', { id: block.id, sectionId: s.id }) })),
    { sep: true },
    { label: 'Delete block', icon: 'trash', danger: true, fn: async () => { if (await askConfirm({ title: 'Delete block', text: `Delete "${block.name}"${count ? ` and its ${count} task${count === 1 ? '' : 's'}` : ''}? Tasks can be restored from Activity for 30 days.` })) op('block.delete', { id: block.id }); } },
  ]);
}

function BlockHead({ block, count }) {
  return html`<div class="block-head">
    <${Icon} name=${block.type === 'board' ? 'board' : 'list'} size=${16} />
    <h3>${block.name}</h3>
    <span class="kind">${block.type === 'board' ? 'Board' : 'List'}</span>
    <span class="faint">${count}</span>
    <span class="grow"></span>
    ${block.type === 'board' ? html`<button class="btn small ghost" onClick=${() => openBoardSettings(block.id)}><${Icon} name="bolt" size=${14} /> Rules</button>` : null}
    <button class="icon-btn small" aria-label="Block actions" onClick=${(e) => blockMenu(e, block)}><${Icon} name="more" size=${16} /></button>
  </div>`;
}

function ListBlock({ block }) {
  const all = sel.blockTasks(block.id);
  const open = all.filter((t) => !t.completedAt);
  const done = all.filter((t) => t.completedAt).sort((a, b) => b.completedAt - a.completedAt);
  const [showDone, setShowDone] = useState(false);
  const [over, setOver] = useState(false);
  const rows = block.sort === 'priority' ? open.slice().sort(domainCompare) : open;
  return html`<div class=${'block' + (over ? ' drop' : '')}
    onDragOver=${(e) => { if (getDragId()) { e.preventDefault(); setOver(true); } }}
    onDragLeave=${() => setOver(false)}
    onDrop=${(e) => { setOver(false); const id = getDragId(); if (!id) return; e.preventDefault(); setDragId(null); op('task.move', { id, blockId: block.id }); }}>
    <${BlockHead} block=${block} count=${open.length} />
    <div class="task-list">${rows.map((t) => html`<${TaskRow} key=${t.id} task=${t} ctx=${{ siblings: rows }} />`)}</div>
    <${AddTask} defaults=${{ blockId: block.id }} />
    ${done.length ? html`<button class="link-btn" onClick=${() => setShowDone(!showDone)}>${showDone ? 'Hide' : 'Show'} ${done.length} completed</button>` : null}
    ${showDone ? html`<div class="task-list">${done.slice(0, 50).map((t) => html`<${TaskRow} key=${t.id} task=${t} ctx=${{ noDrag: true, noDrop: true }} />`)}</div>` : null}
  </div>`;
}

// Subtasks stay folded on a card until you open them.
const openCards = new Set(JSON.parse(localStorage.getItem('lb.openCards') || '[]'));
function toggleCard(id) {
  openCards.has(id) ? openCards.delete(id) : openCards.add(id);
  localStorage.setItem('lb.openCards', JSON.stringify([...openCards]));
  notify();
}
function CardSubs({ parentId, depth = 0 }) {
  return sel.children(parentId).map((k) => html`<div key=${k.id}>
    <div class=${'card-sub' + (k.completedAt ? ' is-done' : '')} style=${{ paddingLeft: depth * 16 + 'px' }} onClick=${(e) => { e.stopPropagation(); openTask(k.id); }}>
      <${Check} task=${k} small=${true} />
      <span class="grow">${k.title}${(k.labels || []).map((l) => html` <span class="chip label">@${l}</span>`)}</span>
    </div>
    <${CardSubs} parentId=${k.id} depth=${depth + 1} />
  </div>`);
}
function Card({ task: t, block }) {
  const [over, setOver] = useState(null);
  const prog = sel.progress(t.id);
  const open = openCards.has(t.id);
  return html`<div class=${'card' + (t.completedAt ? ' is-done' : '') + (over ? ' drop-' + over : '')} draggable="true" tabindex="0"
    onDragStart=${(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); }}
    onDragEnd=${() => setDragId(null)}
    onDragOver=${(e) => { const id = getDragId(); if (id && id !== t.id) { e.preventDefault(); e.stopPropagation(); setOver(dropZone(e)); } }}
    onDragLeave=${() => setOver(null)}
    onDrop=${(e) => { setOver(null); const id = getDragId(); if (!id || id === t.id) return; e.preventDefault(); e.stopPropagation(); setDragId(null); const zone = dropZone(e); if (zone === 'child') { openCards.add(t.id); } op('task.move', dropArgs(zone, id, t)); }}
    onClick=${() => openTask(t.id)} onKeyDown=${(e) => { if (e.key === 'Enter') openTask(t.id); }}>
    <div class="card-top">
      <${Check} task=${t} small=${true} />
      <span class="card-title">${t.title}${t.description ? html`<span class="card-desc">${t.description}</span>` : null}</span>
      <button class="icon-btn small card-more" aria-label="More actions" onClick=${(e) => { e.stopPropagation(); taskMenu(e, t); }}><${Icon} name="more" size=${14} /></button>
    </div>
    <div class="card-meta">
      <span class="chip"><span class="dot" style=${{ background: PRIORITY_COLORS[t.priority || 4] }}></span>P${t.priority || 4}</span>
      ${prog.total ? html`<button class=${'chip sub-toggle' + (open ? ' open' : '')} aria-expanded=${open} title=${open ? 'Hide subtasks' : 'Show subtasks'} onClick=${(e) => { e.stopPropagation(); toggleCard(t.id); }}><${Icon} name="sub" size=${13} />${prog.done}/${prog.total}<${Icon} name="down" size=${12} /></button>` : null}
      <${Meta} task=${t} hideSubs=${true} />
    </div>
    ${prog.total && !open ? html`<div class="bar thin"><span style=${{ width: Math.round((prog.done / prog.total) * 100) + '%' }}></span></div>` : null}
    ${open ? html`<div class="card-subs"><${CardSubs} parentId=${t.id} /></div>` : null}
    ${t.stopNote && !t.completedAt ? html`<div class="stop-note"><${Icon} name="note" size=${13} />${t.stopNote}</div>` : null}
  </div>`;
}

function Column({ block, col, tasks }) {
  const [over, setOver] = useState(false);
  const [all, setAll] = useState(false);
  const rules = sel.rules(block.id).filter((r) => r.to === col.id && r.enabled !== false);
  const isDone = col.role === 'done';
  const list = isDone ? tasks.slice().sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)) : tasks;
  const shown = isDone && !all ? list.slice(0, 6) : list;
  return html`<div class=${'col' + (over ? ' drop' : '')}
    onDragOver=${(e) => { if (getDragId()) { e.preventDefault(); e.stopPropagation(); setOver(true); } }}
    onDragLeave=${() => setOver(false)}
    onDrop=${(e) => { setOver(false); const id = getDragId(); if (!id) return; e.preventDefault(); e.stopPropagation(); setDragId(null); op('task.move', { id, blockId: block.id, columnId: col.id }); }}>
    <div class="col-head"><span>${col.name}</span><span class="faint">${tasks.length}</span></div>
    ${rules.map((r) => html`<button class="rule-badge" key=${r.id} title="Edit rules" onClick=${() => openBoardSettings(block.id)}><${Icon} name="bolt" size=${12} /><span>On entry: ${ruleSummary(r)}</span></button>`)}
    <div class="cards">
      ${shown.map((t) => html`<${Card} key=${t.id} task=${t} block=${block} />`)}
      ${!tasks.length ? html`<div class="col-empty">Drop a card here</div>` : null}
      ${isDone && list.length > 6 ? html`<button class="link-btn" onClick=${() => setAll(!all)}>${all ? 'Show fewer' : `Show all ${list.length}`}</button>` : null}
    </div>
    ${isDone ? null : html`<${AddTask} defaults=${{ blockId: block.id, columnId: col.id }} label="Add card" placeholder="Card title" />`}
  </div>`;
}

function BoardBlock({ block }) {
  const tasks = sel.blockTasks(block.id);
  const cols = block.columns || [];
  const known = new Set(cols.map((c) => c.id));
  return html`<div class="block">
    <${BlockHead} block=${block} count=${tasks.filter((t) => !t.completedAt).length} />
    <div class="board">
      ${cols.map((c, i) => html`<${Column} key=${c.id} block=${block} col=${c} tasks=${tasks.filter((t) => t.columnId === c.id || (i === 0 && !known.has(t.columnId)))} />`)}
    </div>
  </div>`;
}

function AddBlock({ domainId, sectionId }) {
  const add = async (type) => {
    const name = await askText({ title: type === 'board' ? 'New board' : 'New list', placeholder: type === 'board' ? 'e.g. Assets' : 'e.g. Resources to consume', confirm: 'Create' });
    if (name) op('block.save', { domainId, sectionId: sectionId || null, name, type });
  };
  return html`<div class="add-block">
    <span class="faint">Add a block here</span>
    <button class="btn small" onClick=${() => add('list')}><${Icon} name="list" size=${14} /> List</button>
    <button class="btn small" onClick=${() => add('board')}><${Icon} name="board" size=${14} /> Board</button>
  </div>`;
}

// ---------- domain page ----------
function domainMenu(e, d) {
  openMenu(e, [
    { label: 'Rename', icon: 'edit', fn: async () => { const name = await askText({ title: 'Rename domain', value: d.name }); if (name) op('domain.save', { id: d.id, name }); } },
    { heading: 'Colour' },
    ...DOMAIN_COLORS.map((c) => ({ label: c.name, dot: c.value, active: d.color === c.value, fn: () => op('domain.save', { id: d.id, color: c.value }) })),
    { sep: true },
    { label: 'Delete domain', icon: 'trash', danger: true, fn: async () => { if (await askConfirm({ title: 'Delete domain', text: `Delete "${d.name}" with all its sections, blocks and tasks? Tasks can be restored from Activity for 30 days, but the layout cannot.` })) { await op('domain.delete', { id: d.id }); go('today'); } } },
  ]);
}

export function DomainView({ id }) {
  const d = sel.domain(id);
  if (!d) return html`<${Empty} title="This domain no longer exists" />`;
  const sections = sel.sections(id);
  const blocks = sel.blocks(id);
  const tasks = sel.open().filter((t) => t.domainId === id);
  const top = tasks.filter((t) => !t.parentId).sort(domainCompare).slice(0, 3);
  const weekStart = startOfWeek(state.today, sel.settings().weekEnd);
  const weekEndDate = addDays(weekStart, 6);
  const dueWeek = tasks.filter((t) => (t.due && t.due <= weekEndDate) || (t.deadline && t.deadline <= weekEndDate)).length;
  const tbs = [...state.docs.timeblocks.values()].filter((b) => b.domainId === id && b.date >= weekStart && b.date <= weekEndDate);
  const planned = tbs.filter((b) => b.status !== 'skipped').reduce((n, b) => n + b.len, 0);
  const actual = tbs.reduce((n, b) => n + (b.actualMin || 0), 0);
  const plan = sel.plan(state.today);
  const floorHere = (plan.floor || []).map(sel.task).filter((t) => t && t.domainId === id && isOpen(t)).length;
  const renderBlock = (b) => (b.type === 'board' ? html`<${BoardBlock} key=${b.id} block=${b} />` : html`<${ListBlock} key=${b.id} block=${b} />`);
  return html`<div class="page wide">
    <header class="page-head">
      <div>
        <h1><span class="dot big" style=${{ background: d.color }}></span>${d.name}</h1>
        <div class="muted">Priorities here only rank tasks inside ${d.name}. The Today view uses the domain's weight first.</div>
      </div>
      <div class="head-actions">
        <label class="weight" title="Higher weight puts this domain's tasks first in Today">Weight
          <div class="seg">${[1, 2, 3, 4, 5].map((w) => html`<button class=${d.weight === w ? 'on' : ''} onClick=${() => op('domain.save', { id: d.id, weight: w })}>${w}</button>`)}</div>
        </label>
        <button class="icon-btn" aria-label="Domain actions" onClick=${(e) => domainMenu(e, d)}><${Icon} name="more" /></button>
      </div>
    </header>

    <div class="stats">
      <div class="stat"><div class="stat-num">${tasks.length}</div><div class="stat-label">open tasks</div></div>
      <div class="stat"><div class="stat-num">${dueWeek}</div><div class="stat-label">due or deadlined this week</div></div>
      <div class="stat"><div class="stat-num">${floorHere}</div><div class="stat-label">on today's floor</div></div>
      <div class="stat"><div class="stat-num">${fmtDur(actual) || '0m'}<span class="faint"> / ${fmtDur(planned) || '0m'}</span></div><div class="stat-label">time this week, actual / planned</div></div>
      <div class="stat grow"><div class="stat-label">Top of this domain</div>
        ${top.length ? top.map((t) => html`<button class="top-line" key=${t.id} onClick=${() => openTask(t.id)}><span class="dot" style=${{ background: PRIORITY_COLORS[t.priority || 4] }}></span><span class="ellipsis">${t.title}</span></button>`) : html`<div class="faint">Nothing open.</div>`}
      </div>
    </div>

    ${blocks.filter((b) => !b.sectionId || !sections.some((s) => s.id === b.sectionId)).map(renderBlock)}
    <${AddBlock} domainId=${id} />

    ${sections.map((s) => html`<section class="section" key=${s.id}>
      <div class="section-head">
        <h2>${s.name}</h2>
        <button class="icon-btn small" aria-label="Section actions" onClick=${(e) => openMenu(e, [
          { label: 'Rename', icon: 'edit', fn: async () => { const name = await askText({ title: 'Rename section', value: s.name }); if (name) op('section.save', { id: s.id, name }); } },
          { label: 'Delete section', icon: 'trash', danger: true, fn: async () => { if (await askConfirm({ title: 'Delete section', text: `Delete the "${s.name}" heading? Its blocks stay, and move to the top of the domain.`, confirm: 'Delete section' })) op('section.delete', { id: s.id }); } },
        ])}><${Icon} name="more" size=${16} /></button>
      </div>
      ${blocks.filter((b) => b.sectionId === s.id).map(renderBlock)}
      <${AddBlock} domainId=${id} sectionId=${s.id} />
    </section>`)}

    <button class="add-btn" onClick=${async () => { const name = await askText({ title: 'New section', placeholder: 'e.g. Gameplay, Art', confirm: 'Create' }); if (name) { await op('section.save', { domainId: id, name }); toast('Section added. Put a list or a board in it.', { kind: 'ok' }); } }}><${Icon} name="plus" size=${16} />Add section</button>
  </div>`;
}
