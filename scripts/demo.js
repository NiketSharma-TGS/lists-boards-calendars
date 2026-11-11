// Starts the app on a throwaway database filled with sample data, so you can
// click around without touching your real one:  npm run demo
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../server/server.js';
import { addDays } from '../shared/dates.js';
import { parseRecur } from '../shared/quickadd.js';

const file = path.join(os.tmpdir(), 'lists-boards-demo.db');
for (const f of [file, file + '-wal', file + '-shm']) fs.rmSync(f, { force: true });

const stamp = (date, hhmm) => date.replace(/-/g, '') + 'T' + hhmm.replace(':', '') + '00';
let app;
const demoCalendar = async () => {
  const today = app.ops.today();
  const ics = ['BEGIN:VCALENDAR',
    'BEGIN:VEVENT', 'UID:standup', 'SUMMARY:Team standup', `DTSTART;TZID=Asia/Kolkata:${stamp(addDays(today, -7), '10:30')}`, `DTEND;TZID=Asia/Kolkata:${stamp(addDays(today, -7), '11:00')}`, 'RRULE:FREQ=DAILY', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:sync', 'SUMMARY:Build validation sync', `DTSTART;TZID=Asia/Kolkata:${stamp(today, '15:00')}`, `DTEND;TZID=Asia/Kolkata:${stamp(today, '16:00')}`, 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:review', 'SUMMARY:Sprint review', `DTSTART;TZID=Asia/Kolkata:${stamp(addDays(today, 2), '14:00')}`, `DTEND;TZID=Asia/Kolkata:${stamp(addDays(today, 2), '15:30')}`, 'END:VEVENT',
    'END:VCALENDAR'].join('\r\n');
  return new Response(ics);
};
app = createApp({ dataFile: file, fetchImpl: demoCalendar });
const run = (name, args) => app.ops.run(name, args).result;
const today = app.ops.today();
const domain = (name) => app.store.all('domains').find((d) => d.name === name);
const office = domain('Office');
const sdet = domain('SDET');
const game = domain('Game Dev');
const gym = domain('Gym');

run('settings.save', { calendars: [{ id: 'demo', name: 'Work', url: 'https://example.invalid/demo.ics' }] });

// Office
const uat = run('task.add', { title: 'Review the UAT report for the latest SDK build', domainId: office.id, priority: 1, due: today, duration: 60, labels: ['uat'] });
run('task.complete', { id: run('task.add', { title: 'Collect failing cases from the compatibility sheet', parentId: uat.id }).id });
const retest = run('task.add', { title: 'Re-test the three flaky devices', parentId: uat.id });
run('task.add', { title: 'Log device models and OS versions', parentId: retest.id });
run('task.add', { title: 'Attach screen recordings', parentId: retest.id });
run('task.add', { title: 'Write the summary for the team', parentId: uat.id, duration: 20 });
const notes = run('task.add', { title: "Prepare validation notes for tomorrow's sync", domainId: office.id, priority: 2, due: today, duration: 30 });
run('task.add', { title: 'File the weekly compatibility report', domainId: office.id, priority: 2, recur: parseRecur('every fri'), duration: 45 });
run('task.add', { title: 'Clear the bug triage queue', domainId: office.id, priority: 3, due: addDays(today, 1), duration: 40 });
run('task.add', { title: 'Book the device lab slot', domainId: office.id, priority: 3, due: addDays(today, -1), duration: 10 });

// SDET
const practice = run('task.add', { title: 'One practice exercise', domainId: sdet.id, priority: 1, recur: parseRecur('every day'), duration: 45 });
run('task.update', { id: practice.id, patch: { stopNote: 'Chapter 4, exercise 2. Next: page-object fixtures.' } });
run('task.add', { title: 'Write API tests for the login flow', domainId: sdet.id, priority: 2, due: addDays(today, 2), duration: 90, deadline: addDays(today, 4) });
run('task.add', { title: 'Read the chapter on test doubles', domainId: sdet.id, priority: 3, duration: 20 });

// Game Dev: sections with lists and boards side by side
const gameplay = run('section.save', { domainId: game.id, name: 'Gameplay' });
const art = run('section.save', { domainId: game.id, name: 'Art' });
const combat = run('block.save', { domainId: game.id, sectionId: gameplay.id, name: 'Combat and systems', type: 'board' });
const col = (b, role) => b.columns.find((c) => c.role === role).id;
run('task.add', { title: 'Enemy stagger and poise rules', blockId: combat.id, columnId: col(combat, 'backlog'), priority: 2 });
run('task.add', { title: 'Weapon scaling curves', blockId: combat.id, columnId: col(combat, 'backlog'), priority: 3 });
run('task.add', { title: 'Boss phase pacing draft', blockId: combat.id, columnId: col(combat, 'backlog'), priority: 2, duration: 60 });
run('task.add', { title: 'Update the damage formulas in the GDD', blockId: combat.id, columnId: col(combat, 'todo'), priority: 1, duration: 45, due: today });
const parry = run('task.add', { title: 'Dodge and parry timing table', blockId: combat.id, columnId: col(combat, 'doing'), priority: 1, duration: 90 });
for (const [title, done] of [['List every enemy attack', true], ['Set the dodge window per attack', true], ['Set the parry window per attack', false], ['Playtest and adjust', false]]) {
  const t = run('task.add', { title, parentId: parry.id });
  if (done) run('task.complete', { id: t.id });
}
run('task.complete', { id: run('task.add', { title: 'Define stamina costs', blockId: combat.id, columnId: col(combat, 'doing') }).id });
const design = run('block.save', { domainId: game.id, sectionId: gameplay.id, name: 'Game design', type: 'list' });
run('task.add', { title: 'Read the resource on combat balancing', blockId: design.id, priority: 2, duration: 30, due: addDays(today, 3) });
run('task.add', { title: "Update the GDD with last week's decisions", blockId: design.id, priority: 2, duration: 40 });
run('task.add', { title: 'Research materials for a metallic crust planet', blockId: design.id, priority: 3, duration: 25 });
const assets = run('block.save', { domainId: game.id, sectionId: art.id, name: 'Assets', type: 'board', columns: [
  { name: 'Sketch', role: 'backlog' }, { name: 'Base mesh', role: 'todo' }, { name: 'Sculpting', role: 'doing' }, { name: 'Maps' }, { name: 'Textures' }, { name: 'Rigging' }, { name: 'Integrated', role: 'done' }] });
const acol = (name) => assets.columns.find((c) => c.name === name).id;
run('task.add', { title: 'Ruined gate', blockId: assets.id, columnId: acol('Sketch'), priority: 3 });
run('task.add', { title: 'Survey drone', blockId: assets.id, columnId: acol('Sketch'), priority: 2 });
run('task.add', { title: 'Hero armour set', blockId: assets.id, columnId: acol('Base mesh'), priority: 1 });
run('task.add', { title: 'Rock formations kit', blockId: assets.id, columnId: acol('Sculpting'), priority: 2 });
run('task.add', { title: 'Metal crust tiles', blockId: assets.id, columnId: acol('Textures'), priority: 3 });
run('task.add', { title: 'Torch prop', blockId: assets.id, columnId: acol('Rigging'), priority: 2 });
const resources = run('block.save', { domainId: game.id, sectionId: art.id, name: 'Resources to consume', type: 'list' });
run('task.add', { title: 'Read the guide on rigging', blockId: resources.id, priority: 2, duration: 30 });
run('task.add', { title: 'Watch the Blender shortcut guide', blockId: resources.id, priority: 3, duration: 20 });
run('task.add', { title: 'Find a new pen tablet', blockId: resources.id, priority: 4 });

// Gym
const stretch = run('task.add', { title: 'Wrist stretches', domainId: gym.id, priority: 2, recur: parseRecur('every day at 11am, 4pm and 9pm'), duration: 5 });
run('task.add', { title: 'Strength session', domainId: gym.id, priority: 1, recur: parseRecur('every mon, wed, fri at 7pm'), duration: 60 });

// Inbox
run('task.add', { title: 'Idea: telegraph boss attacks with colour and sound' });
run('task.add', { title: 'Ask about leave dates' });

// The day
run('plan.pin', { taskId: uat.id, tier: 'floor' });
run('plan.pin', { taskId: practice.id, tier: 'floor' });
run('plan.pin', { taskId: notes.id, tier: 'stretch' });
run('tb.save', { date: today, start: 11 * 60 + 30, len: 90, domainId: office.id, hardStop: true });
run('tb.save', { date: today, start: 16 * 60 + 30, len: 60, domainId: sdet.id, taskId: practice.id, hardStop: true });
run('tb.save', { date: today, start: 20 * 60, len: 90, domainId: game.id, hardStop: false });
const earlier = run('tb.save', { date: addDays(today, -1), start: 20 * 60, len: 90, domainId: game.id, hardStop: true, status: 'done', actualMin: 70, note: 'Dodge windows done for the first six attacks.' });
void earlier; void stretch;

const port = +process.env.PORT || 8090;
app.server.listen(port, '127.0.0.1', () => console.log(`Demo running at http://localhost:${port} (sample data, safe to play with)`));
