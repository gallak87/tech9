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
    await page.locator(`[data-editor-action="tab-${name}"]`).click();
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
  const details = control.locator('xpath=ancestor::details[1]');
  if (await details.count()) {
    if (!(await details.evaluate((element) => element.open)))
      await details.locator(':scope > summary').click();
  }
  await control.scrollIntoViewIfNeeded();
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
