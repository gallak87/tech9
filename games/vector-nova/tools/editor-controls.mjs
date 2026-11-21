// Follow the editor's one-level inline groups or global settings drawer.
// Existing workflow checks continue their checkpoint before operating controls;
// editor-iteration-verify separately exercises the recovery decision itself.
async function continueRecovery(page) {
  const control = page.locator('[data-editor-action="recover-draft"]');
  if (await control.isVisible()) await control.click();
}
// The editor header keeps Back available on both the draft decision and the canvas.
export async function enterRecoveredWorkspace(page) {
  await page.locator('[data-editor-action="exit"]').waitFor({ timeout: 90000 });
  await continueRecovery(page);
}
const authorSections = new Set(['route', 'shape', 'jumps']);

async function revealDock(page, name) {
  const tab = page.locator(`[data-editor-action="dock-${name}"]`);
  if (
    (await tab.isVisible()) &&
    (await tab.getAttribute('aria-pressed')) !== 'true'
  )
    await tab.click();
}

export async function openEditorSection(page, name) {
  await continueRecovery(page);
  const section = page.locator(`[data-editor-section="${name}"]`);
  if (await section.isVisible()) return section;

  const trigger = (id) => page.locator(`[data-editor-action="${id}"]`);
  if (name === 'warnings') await trigger('toggle-warnings').click();
  else if (name === 'library') await trigger('tab-library').click();
  else {
    const inspector = authorSections.has(name);
    const scenery = name === 'world';
    if (
      scenery ||
      (await trigger('context-environment').getAttribute('aria-pressed')) ===
        'true'
    ) {
      await revealDock(page, 'palette');
      await trigger(scenery ? 'context-environment' : 'context-road').click();
    }
    await revealDock(page, inspector ? 'inspector' : 'palette');
    if (!(await section.isVisible())) {
      if (name === 'generate' && !(await trigger('tab-generate').isVisible()))
        await trigger('context-road').click();
      await trigger(
        name === 'road-home' ? 'context-road' : `tab-${name}`,
      ).click();
    }
  }
  await section.waitFor({ state: 'visible' });
  return section;
}

export async function revealEditorControl(control, label = 'editor control') {
  await continueRecovery(control.page());
  await control.first().waitFor({ state: 'attached' });
  const count = await control.count();
  if (count !== 1) throw new Error(`Expected one ${label}; found ${count}.`);
  if (!(await control.isVisible())) {
    const owner = await control.evaluate(
      (element) =>
        element.closest('[data-editor-section]')?.dataset.editorSection,
    );
    if (owner) await openEditorSection(control.page(), owner);
    else {
      const dock = await control.evaluate((element) =>
        element.closest('.workshop-inspector')
          ? 'inspector'
          : element.closest('.workshop-palette')
            ? 'palette'
            : null,
      );
      if (!dock) throw new Error(`${label} is hidden without an editor group.`);
      await revealDock(control.page(), dock);
    }
  }
  const details = control.locator('xpath=ancestor::details');
  for (let i = 0; i < (await details.count()); i++) {
    const panel = details.nth(i);
    if (!(await panel.evaluate((element) => element.open)))
      await panel.locator(':scope > summary').click();
  }
  await control.waitFor({ state: 'visible' });
  await control.evaluate((el) => el.scrollIntoView({ block: 'nearest' }));
  return control;
}

export async function revealEditorField(page, name) {
  return revealEditorControl(
    page.locator(`[data-editor-field="${name}"]`),
    `editor field "${name}"`,
  );
}

export async function revealEditorAction(page, name) {
  return revealEditorControl(
    page.locator(`[data-editor-action="${name}"]`),
    `editor action "${name}"`,
  );
}
