/** Focused production-keyboard regressions for layered Escape.
 * Positions, progression gates, and battle/ending setup are explicit fixtures.
 * No clean campaign or performance claim. Run: node tests/modal-escape.mjs
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = path.join(root, 'evidence', 'modal-escape');
await fs.mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.routeWebSocket('**/*', socket => { socket.send('{"type":"connected"}'); socket.onMessage(() => {}); });
page.setDefaultTimeout(5000);
const report = { methodology: 'Actual F/Enter/Tab/Escape/Backspace input in the production browser. Fixtures only select existing scenes, positions, progression gates, battle setup, and callback probes. No performance or campaign completion claim.', checks: [], errors: [] };
page.on('pageerror', e => report.errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
const press = key => page.keyboard.press(key);
const state = () => page.evaluate(() => { const g = __ECHO__.game; return { mode: g.mode, panel: g.ui.panel?.type || null, menu: g.ui.menu, blocked: g.ui.blocked, tab: g.ui.tab, line: g.ui.panel?.index, binding: g.ui.bindCapture, scene: g.state.region }; });
const fixture = name => page.evaluate(name => { __ECHO__.preset(name); const g = __ECHO__.game; g.resetSession(); g.ui.render(); }, name);
async function choose(action) {
  const nav = await page.evaluate(action => { const ui = __ECHO__.game.ui, list = ui.focusables(); return { target: list.findIndex(el => el.dataset.do === action), current: list.indexOf(document.activeElement), count: list.length }; }, action);
  assert.ok(nav.target >= 0, `Visible keyboard action ${action}`);
  for (let n = (nav.target - nav.current + nav.count) % nav.count; n > 0; n--) await press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.do), action);
  await press('Enter');
}
async function capture(name) { const file = path.join(evidence, name + '.png'); await page.screenshot({ path: file }); return path.relative(root, file); }
async function service(kind, preset = 'settlement') {
  await fixture(preset);
  const object = await page.evaluate(kind => {
    const g = __ECHO__.game; g.state.flags.beacon_restored = true;
    const o = g.scene.objects.find(o => o.service === kind); if (!o) throw Error('Missing ' + kind);
    Object.assign(g.state, g.safePoint(g.scene, o.x, o.y + 34)); g.near = o; g.resetFollowers(); g.updateCamera(true); g.ui.updateHUD();
    return { id: o.id, service: o.service, x: g.state.x, y: g.state.y };
  }, kind);
  await press('f');
  assert.equal((await state()).panel, kind === 'construction' ? 'build' : 'vendor');
  assert.equal((await state()).menu, false);
  return object;
}
async function check(name, run) {
  try { const details = await run(); report.checks.push({ name, pass: true, details }); console.log('PASS ' + name); }
  catch (e) { report.checks.push({ name, pass: false, error: e.stack || String(e), screenshot: await capture('failure-' + name.replace(/\W+/g, '-')) }); console.error('FAIL ' + name + ': ' + e.message); }
}

try {
  await page.goto(process.env.ECHO_URL || 'http://127.0.0.1:4321/?test=1');
  await page.waitForFunction(() => window.__ECHO_READY__);
  await check('title help Escape returns to title', async () => {
    await choose('title-controls'); assert.equal((await state()).panel, 'help');
    await press('Escape'); assert.deepEqual(await state(), { mode: 'title', panel: null, menu: false, blocked: true, tab: 0, line: undefined, binding: null, scene: 'haventide' });
    await press('Escape'); assert.equal((await state()).menu, false);
  });
  await check('rest F then Escape exits instead of alternating', async () => {
    const object = await service('rest', 'world');
    await choose('rest'); const before = await capture('rest-open');
    const portrait = await page.evaluate(() => { const c = document.querySelector('.merchant-portrait'), box = c.getBoundingClientRect(); return { intrinsic: [c.width, c.height], display: [box.width, box.height], focusedAction: document.activeElement?.dataset.do }; });
    assert.deepEqual(portrait.intrinsic, [192, 192]); assert.ok(portrait.display[0] >= 40 && portrait.display[0] <= 100); assert.equal(portrait.display[0], portrait.display[1]); assert.equal(portrait.focusedAction, 'rest');
    await press('Escape'); assert.equal((await state()).blocked, false); assert.equal((await state()).panel, null);
    const after = await capture('rest-closed');
    await press('Escape'); assert.equal((await state()).menu, true); assert.equal((await state()).panel, null);
    await press('Escape'); assert.equal((await state()).blocked, false);
    return { object, portrait, screenshots: [before, after], restPanelDidNotReappear: true };
  });
  await check('vendor and build atlas layers return then dismiss', async () => {
    const results = [];
    for (const kind of ['provisions', 'construction']) {
      const object = await service(kind); const panel = (await state()).panel;
      await page.evaluate(() => { window.retainedPanel = __ECHO__.game.ui.panel; });
      await choose('open-atlas'); assert.equal((await state()).menu, true);
      await press('Escape'); assert.equal((await state()).menu, false); assert.equal((await state()).panel, panel);
      assert.ok(await page.evaluate(() => retainedPanel === __ECHO__.game.ui.panel));
      const screenshot = await capture(kind + '-restored');
      await press('Escape'); assert.equal((await state()).blocked, false); assert.equal((await state()).panel, null);
      // A second direct entry also exits in one Escape.
      await press('f'); assert.equal((await state()).panel, panel); await press('Escape'); assert.equal((await state()).blocked, false);
      results.push({ object, screenshot });
    }
    return results;
  });
  await check('confirmation cancels before atlas and underlying rest', async () => {
    await service('rest', 'world'); await choose('open-atlas'); await press('6'); await choose('save:1');
    await choose('delete:1'); assert.equal((await state()).panel, 'confirm');
    await press('1'); await press('q'); assert.equal((await state()).tab, 5, 'Confirmation consumes atlas shortcuts');
    await press('Escape'); let s = await state(); assert.equal(s.menu, true); assert.equal(s.panel, 'vendor');
    assert.ok(await page.evaluate(async () => (await import('/src/persistence.js')).saveMeta(1)));
    await choose('delete:1'); await press('Backspace'); assert.equal((await state()).menu, true); assert.equal((await state()).panel, 'vendor');
    await choose('delete:1'); await choose('confirm-no'); assert.equal((await state()).panel, 'vendor');
    await press('Escape'); assert.equal((await state()).menu, false); assert.equal((await state()).panel, 'vendor');
    const screenshot = await capture('confirmation-returned-to-rest');
    await press('Escape'); assert.equal((await state()).blocked, false);
    return { recordPreserved: true, screenshot };
  });
  await check('key binding capture cancels without closing atlas', async () => {
    await fixture('world'); await press('Escape'); await press('7'); await choose('rebind:up');
    const before = await page.evaluate(() => JSON.stringify(__ECHO__.game.state.settings.keys));
    await press('Escape'); assert.equal((await state()).menu, true); assert.equal((await state()).binding, null);
    assert.equal(await page.evaluate(() => JSON.stringify(__ECHO__.game.state.settings.keys)), before);
    await press('Escape'); assert.equal((await state()).blocked, false);
  });
  await check('sign F reads actual text without portrait then Escape returns to field', async () => {
    await fixture('world');
    const object = await page.evaluate(() => { __ECHO__.goto('emberline');const g=__ECHO__.game,o=g.scene.objects.find(o=>o.id==='ember_forest_sign');Object.assign(g.state,g.safePoint(g.scene,o.x,o.y+25));g.near=o;g.resetFollowers();g.updateCamera(true);g.ui.updateHUD();return {id:o.id,name:o.name,text:o.dialogue,flags:JSON.stringify(g.state.flags)}; });
    assert.match(await page.locator('.interaction').innerText(), /Read The southern branch/);
    await press('f');assert.equal((await state()).panel,'reading');assert.equal(await page.locator('#reading-title').innerText(),object.name);assert.equal(await page.locator('.reading-panel p').innerText(),object.text);assert.equal(await page.locator('.reading-panel [data-portrait]').count(),0);
    const screenshot=await capture('southern-branch-reading');await press('Escape');assert.equal((await state()).blocked,false);assert.equal(await page.evaluate(()=>JSON.stringify(__ECHO__.game.state.flags)),object.flags);
    await press('f');assert.equal((await state()).panel,'reading');await press('Backspace');assert.equal((await state()).blocked,false);
    await press('f');await press('Enter');assert.equal((await state()).blocked,false);
    return {object,screenshot,portraitCount:0,escapeBackspaceAndEnterDismiss:true};
  });
  await check('ordinary dialogue cancellation never invokes completion callback', async () => {
    await fixture('world');await page.evaluate(()=>{window.finishedDialogue=0;__ECHO__.game.ui.showDialogue([{speaker:'Kaida',text:'First line'},{speaker:'Kaida',text:'Last line'}],[],()=>finishedDialogue++);});
    assert.equal(await page.locator('.dialogue-portrait').count(),1);await press('Escape');assert.equal((await state()).blocked,false);assert.equal(await page.evaluate(()=>finishedDialogue),0);
    await page.evaluate(()=>__ECHO__.game.ui.showDialogue(['First line','Last line'],[],()=>finishedDialogue++));assert.equal(await page.locator('.dialogue-portrait').count(),0);await press('Enter');assert.equal((await state()).line,1);await press('Backspace');assert.equal((await state()).blocked,false);assert.equal(await page.evaluate(()=>finishedDialogue),0);
    await page.evaluate(()=>__ECHO__.game.ui.showDialogue(['First line','Last line'],[],()=>finishedDialogue++));await press('Enter');await press('Space');assert.equal((await state()).blocked,false);assert.equal(await page.evaluate(()=>finishedDialogue),1);
    await page.evaluate(()=>__ECHO__.game.ui.showDialogue(['Mouse can leave too.'],[],()=>finishedDialogue++));await page.locator('[data-do="dismiss-panel"]').click();assert.equal((await state()).blocked,false);assert.equal(await page.evaluate(()=>finishedDialogue),1);
    await page.evaluate(()=>__ECHO__.game.ui.showDialogue(['Keyboard can focus Leave.'],[],()=>finishedDialogue++));await choose('dismiss-panel');assert.equal((await state()).blocked,false);assert.equal(await page.evaluate(()=>finishedDialogue),1);
    return {cancelCallbackCount:0,explicitContinueCallbackCount:1,unvoicedTextHasNoPortrait:true};
  });
  await check('explicit atlas over dialogue closes one layer per Escape', async () => {
    await fixture('world');await page.evaluate(()=>{window.layerCallback=0;const ui=__ECHO__.game.ui;ui.showDialogue([{speaker:'Field notes',text:'A mark on the road.'}],[],()=>layerCallback++);ui.toggleMenu();});
    assert.equal((await state()).menu,true);await press('Escape');assert.equal((await state()).menu,false);assert.equal((await state()).panel,'dialogue');assert.equal(await page.locator('.dialogue-portrait').count(),0);await press('Escape');assert.equal((await state()).panel,null);assert.equal((await state()).blocked,false);assert.equal(await page.evaluate(()=>layerCallback),0);
    await press('Escape');assert.equal((await state()).menu,true);assert.equal((await state()).panel,null);await press('Escape');assert.equal((await state()).blocked,false);
    return {noAlternationTrap:true,callbackCount:0};
  });
  await check('choice cancellation makes no selection and changes no quest flags', async () => {
    await fixture('world');await page.evaluate(()=>{window.finishedChoice=0;__ECHO__.game.ui.showDialogue(['Choose deliberately.'],[{text:'Keep the promise',flag:'test_modal_choice'}],()=>finishedChoice++);});const before=await page.evaluate(()=>JSON.stringify(__ECHO__.game.state.flags));await press('Escape');assert.equal((await state()).blocked,false);assert.equal(await page.evaluate(()=>JSON.stringify(__ECHO__.game.state.flags)),before);assert.equal(await page.evaluate(()=>finishedChoice),0);
    await page.evaluate(()=>__ECHO__.game.ui.showDialogue(['Choose deliberately.'],[{text:'Keep the promise',flag:'test_modal_choice'}],()=>finishedChoice++));await press('Backspace');assert.equal((await state()).blocked,false);assert.equal(await page.evaluate(()=>finishedChoice),0);assert.equal(await page.evaluate(()=>!!__ECHO__.game.state.flags.test_modal_choice),false);
    await page.evaluate(()=>__ECHO__.game.ui.showDialogue(['Choose deliberately.'],[{text:'Keep the promise',flag:'test_modal_choice'}],()=>finishedChoice++));await choose('choice:0');assert.equal(await page.evaluate(()=>finishedChoice),1);assert.equal(await page.evaluate(()=>!!__ECHO__.game.state.flags.test_modal_choice),true);
    return {explicitChoiceRequired:true};
  });
  await check('cancelled battle tutorial never starts the pending encounter', async()=>{
    await fixture('world');await page.evaluate(()=>{const g=__ECHO__.game;g.beginBattle(g.scene.objects.find(o=>o.id==='hav_guard'));});assert.equal((await state()).panel,'dialogue');await press('Escape');assert.equal((await state()).blocked,false);assert.equal((await state()).mode,'world');assert.equal(await page.evaluate(()=>__ECHO__.game.battle),null);return {encounterCallbackNotInvoked:true};
  });
  await check('ending resume never steals battle or transition input', async()=>{
    await fixture('battle');await page.evaluate(()=>{const g=__ECHO__.game;g.state.flags.pendingEnding=true;g.state.flags.architect_defeated=true;g.state.endingProgress={index:1,panel:'dialogue'};});await page.waitForFunction(()=>__ECHO__.snapshot().battle.selectedHero==='kaida');await press('Enter');assert.equal((await state()).mode,'battle');assert.equal((await state()).panel,null);assert.equal(await page.evaluate(()=>__ECHO__.snapshot().battle.mode),'command');await page.evaluate(()=>__ECHO__.game.presentEnding());assert.equal((await state()).panel,null);
    await fixture('world');await page.evaluate(()=>{const g=__ECHO__.game;g.state.flags.pendingEnding=true;g.transition={time:0,duration:999,swapped:false,to:'emberline',spawn:{x:130,y:1080}};});await press('Enter');assert.equal((await state()).panel,null);await page.evaluate(()=>{__ECHO__.game.presentEnding();});assert.equal((await state()).panel,null);await page.evaluate(()=>{__ECHO__.game.transition=null;});
    return {battleEnterStillChoosesCommands:true,transitionResumeIgnored:true};
  });
  await check('ending cancellation preserves exact progress and explicit completion', async () => {
    await fixture('final');await page.evaluate(()=>{const g=__ECHO__.game;g.battle.encounter.id='void_architect';g.battle.result='victory';g.finishBattle();});await press('Enter');const line=(await state()).line;assert.equal(line,1);await press('Escape');assert.equal((await state()).blocked,false);assert.equal((await state()).panel,null);assert.ok(await page.locator('[data-resume-ending]').isVisible());assert.ok(await page.evaluate(()=>__ECHO__.game.state.flags.pendingEnding&&!__ECHO__.game.state.campaignComplete&&!__ECHO__.game.state.flags.ending_seen));assert.equal(await page.evaluate(()=>__ECHO__.game.state.endingProgress.index),line);
    await page.evaluate(()=>{const g=__ECHO__.game,o=g.scene.objects.find(o=>o.type==='sign');Object.assign(g.state,g.safePoint(g.scene,o.x,o.y+25));g.near=o;g.updateCamera(true);g.ui.updateHUD();});await press('f');assert.equal((await state()).panel,'reading');await press('Escape');assert.equal(await page.evaluate(()=>__ECHO__.game.state.endingProgress.index),line);
    // Unrelated field notes after cancelling must not overwrite ending progress.
    await page.evaluate(()=>__ECHO__.game.ui.showDialogue(['One note.','Another note.']));await press('Enter');await press('Enter');assert.equal(await page.evaluate(()=>__ECHO__.game.state.endingProgress.index),line);
    await press('Enter');assert.equal((await state()).line,line);const expected=await page.evaluate(()=>__ECHO__.game.ui.panel.lines[__ECHO__.game.ui.panel.index].text);assert.equal(await page.locator('.dialogue-text').innerText(),expected);await press('Backspace');assert.equal((await state()).blocked,false);
    // Cancellation writes a recoverable checkpoint without granting completion.
    await page.evaluate(()=>__ECHO__.game.load('checkpoint'));assert.equal((await state()).line,line);assert.equal(await page.locator('.dialogue-text').innerText(),expected);assert.equal(await page.evaluate(()=>__ECHO__.game.state.campaignComplete),false);
    for(let n=0;n<40&&(await state()).panel==='dialogue';n++)await press('Enter');assert.equal((await state()).panel,'ending');await press('Escape');assert.equal((await state()).blocked,false);assert.equal(await page.evaluate(()=>__ECHO__.game.state.campaignComplete),false);await press('Enter');assert.equal((await state()).panel,'ending');await press('Backspace');assert.equal((await state()).blocked,false);await page.evaluate(()=>__ECHO__.game.load('checkpoint'));assert.equal((await state()).panel,'ending');
    const screenshot=await capture('ending-explicit-return');await choose('ending-continue');await page.waitForFunction(()=>!__ECHO__.game.transition);assert.ok(await page.evaluate(()=>__ECHO__.game.state.campaignComplete&&__ECHO__.game.state.flags.ending_seen&&!__ECHO__.game.state.flags.pendingEnding));
    return {resumeLine:line,unrelatedDialogueDoesNotCorruptEnding:true,checkpointRecovery:true,endingRequiredExplicitReturn:true,screenshot};
  });
  await check('battle atlas freezes all seven tabs and restores target action', async () => {
    await fixture('battle'); await page.waitForFunction(() => __ECHO__.snapshot().battle.selectedHero === 'kaida');
    await press('Enter'); await press('Enter'); assert.equal((await page.evaluate(() => __ECHO__.snapshot().battle)).mode, 'target');
    await press('Escape'); const frozen = await page.evaluate(() => __ECHO__.snapshot().battle);
    for (let tab = 1; tab <= 7; tab++) { await press(String(tab)); assert.equal((await state()).tab, tab - 1); assert.deepEqual(await page.evaluate(() => __ECHO__.snapshot().battle), frozen); }
    await page.waitForTimeout(180); assert.deepEqual(await page.evaluate(() => __ECHO__.snapshot().battle), frozen);
    await press('Escape'); assert.equal((await state()).blocked, false); assert.equal((await page.evaluate(() => __ECHO__.snapshot().battle)).mode, 'target');
    await press('Enter'); await page.waitForFunction(() => __ECHO__.snapshot().battle.action?.elapsed > .1);
    await press('Escape'); const action = await page.evaluate(() => __ECHO__.snapshot().battle);
    await page.waitForTimeout(200); assert.deepEqual(await page.evaluate(() => __ECHO__.snapshot().battle), action);
    await press('Escape'); await page.waitForFunction(() => __ECHO__.snapshot().battle.action?.resolved);
    const resumed = await page.evaluate(() => __ECHO__.snapshot().battle);
    assert.equal(resumed.action.id, action.action.id); assert.ok(resumed.enemies[0].hp < resumed.enemies[0].maxHp);
    return { frozenAt: frozen.clock, actionFrozenAt: action.action.elapsed, actionId: action.action.id, screenshot: await capture('battle-resumed') };
  });
  report.portraits = await page.evaluate(() => [...document.querySelectorAll('[data-portrait]')].map(c => ({ intrinsic: [c.width, c.height], display: [c.getBoundingClientRect().width, c.getBoundingClientRect().height] })));
  report.runtimeErrors = await page.evaluate(() => __ECHO__.snapshot().errors);
} catch (e) { report.fatal = e.stack || String(e); }
finally {
  await browser.close(); report.browserClosed = true;
  report.passed = report.checks.filter(c => c.pass).length; report.failed = report.checks.filter(c => !c.pass).length;
  await fs.writeFile(path.join(evidence, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, failed: report.failed, errors: report.errors, fatal: report.fatal, browserClosed: true }));
  if (report.failed || report.errors.length || report.fatal || report.runtimeErrors?.length) process.exitCode = 1;
}
