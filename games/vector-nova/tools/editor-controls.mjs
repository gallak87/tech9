// Follow the editor's native progressive disclosures before using a field.
export async function revealEditorField(page, name) {
  const field = page.locator(`[data-editor-field="${name}"]`);
  if (await field.isVisible()) return field;
  for (const selector of [
    '.workshop-generator-details',
    '.workshop-jump-create',
    '.workshop-jump-manual',
  ]) {
    const details = page.locator(selector);
    if (!(await details.count())) continue;
    const summary = details.locator('summary').first();
    if (
      (await summary.isVisible()) &&
      !(await details.evaluate((element) => element.open))
    )
      await summary.click();
    if (await field.isVisible()) return field;
  }
  return field;
}
