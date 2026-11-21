// Follow the editor's one-level inline groups or global settings drawer.
// Existing workflow checks continue their checkpoint before operating controls;
// editor-iteration-verify separately exercises the recovery decision itself.
async function continueRecovery(page) {
  const control = page.locator('[data-editor-action="recover-draft"]');
  if (await control.isVisible()) await control.click();
}
export async function openEditorSection(page, name) {
  await continueRecovery(page);
  const section = page.locator(`[data-editor-section="${name}"]`);
  if (!(await section.isVisible())) {
    if (name === 'warnings') {
      await page.locator('[data-editor-action="toggle-warnings"]').click();
      await section.waitFor({ state: 'visible' });
      return section;
    }
    if (name !== 'library') {
      const context = page.locator(
        `[data-editor-action="context-${name === 'world' ? 'environment' : 'road'}"]`,
      );
      if ((await context.getAttribute('aria-pressed')) !== 'true')
        await context.click();
    }
    // Contexts remember their last drawer. An already-selected Environment
    // context needs Choose scenery, while returning to a context can restore
    // its desired group without another click (which would close it again).
    if (!(await section.isVisible()))
      await page
        .locator(
          `[data-editor-action="${name === 'world' ? 'open-environment' : `tab-${name}`}"]`,
        )
        .click();
    await section.waitFor({ state: 'visible' });
  }
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
    if (!owner) throw new Error(`${label} is hidden without an editor group.`);
    await openEditorSection(control.page(), owner);
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
