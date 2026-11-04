import { expect, test } from '@playwright/test';
import { fillOwnedEditor, readOwnedEditor } from '../src/content/node-form';
import { uploadAutomationImageViaAddForm } from '../src/content/media/media-library';
import { inspectOwnedNodeModeration } from '../src/publishing/moderation-workflow';
import { insightExternalConfig } from '../src/config/content-types';

test('editor rejects ambiguous ownership and hidden input writes', async ({ page }) => {
  await page.setContent('<form><textarea name="body"></textarea><textarea name="body"></textarea></form>');
  await expect(fillOwnedEditor(page.locator('form'), 'textarea', 'QA text', 'Body')).rejects.toThrow('uniquely owned');
  await page.setContent('<form><textarea style="display:none">Existing text</textarea></form>');
  await expect(fillOwnedEditor(page.locator('form'), 'textarea', 'QA text', 'Body')).rejects.toThrow('uniquely owned');
  expect(await readOwnedEditor(page.locator('form'), 'textarea', 'Body')).toBe('Existing text');
});

test('visible editor uses normal input and preserves text', async ({ page }) => {
  await page.setContent('<form><div class="form-item"><textarea></textarea></div></form>');
  await fillOwnedEditor(page.locator('form'), 'textarea', 'QA regression content', 'Body');
  expect(await readOwnedEditor(page.locator('form'), 'textarea', 'Body')).toBe('QA regression content');
});

test('standalone image upload stops before Save on unmet required metadata', async ({ page }) => {
  Object.assign(process.env, { DRUPAL_TARGET: 'benefits', DRUPAL_TIER: 'stage', DRUPAL_ENVIRONMENT: 'develop', DRUPAL_BASE_URL: 'https://benefits-stage.leidos.com' });
  let posts = 0;
  await page.route('https://benefits-stage.leidos.com/**', route => {
    if (route.request().method() === 'POST') posts++;
    return route.fulfill({ contentType: 'text/html', body: '<form class="media-image-add-form"><input type="file" name="files[field_media_image_0]"><span class="file">qa-automated-image.png</span><input name="field_media_image[0][alt]" required><input type="checkbox" name="status[value]"><input required name="license"><input type="submit" value="Save"></form>' });
  });
  await expect(uploadAutomationImageViaAddForm(page)).rejects.toThrow('unmet required fields');
  expect(posts).toBe(0);
});

for (const matches of [true, false]) test('external standalone 404 uses exact edit ownership: ' + matches, async ({ page }) => {
  const title = 'QA-AUTOMATED-BENEFITS-STAGE-Insight-External-unit';
  await page.route('https://benefits-stage.leidos.com/**', route => route.request().url().endsWith('/edit')
    ? route.fulfill({ contentType: 'text/html', body: '<form class="node-insight-external-form"><input name="title[0][value]" value="' + (matches ? title : 'Unrelated editorial title') + '"><div class="field--name-moderation-state">Current state Published</div><select name="moderation_state[0][state]"><option value="draft">Draft</option></select></form>' })
    : route.fulfill({ status: 404, contentType: 'text/html', body: 'No standalone page' }));
  await page.goto('https://benefits-stage.leidos.com/');
  const inspect = inspectOwnedNodeModeration(page, insightExternalConfig, { nodeId: 99, machineName: 'insight_external', label: 'Insight external', title, moderation: 'Draft' });
  if (matches) expect((await inspect).currentState).toBe('Published');
  else await expect(inspect).rejects.toThrow('ownership');
});
import { selectAutomationImageFixture } from '../src/content/media/media-library';
for (const ambiguous of [false, true]) test('media selection requires exact ID/name uniqueness: ' + ambiguous, async ({ page }) => {
  await page.setContent('<input type="button" name="field_media_image-media-library-open-button" value="Choose image" onclick="document.querySelector(\'.ui-dialog\').hidden=false"><div class="ui-dialog" role="dialog" hidden><select><option value="core" selected>Media Types</option></select><label>Name<input name="name"></label><button type="button">Apply</button><label><input type="checkbox" name="media_library_select_form[5921]" aria-label="Select Existing verified image.jpg">Select Existing verified image.jpg</label>' + (ambiguous ? '<label><input type="checkbox" name="media_library_select_form[9999]" aria-label="Select Existing verified image.jpg">Select Existing verified image.jpg</label>' : '') + '<button type="button" onclick="this.closest(\'.ui-dialog\').hidden=true">Insert selected</button></div><script>window.Drupal={ajax:{instances:{fixture:{element:document.querySelector(\'input[type=button]\')}}}};</script>');
  const select = selectAutomationImageFixture(page, '5921', 'Existing verified image.jpg');
  if (ambiguous) {
    await expect(select).rejects.toThrow('not unique');
    expect(await page.locator('input[type=checkbox]:checked').count()).toBe(0);
  } else {
    expect((await select).id).toBe('5921');
    await expect(page.locator('input[name="media_library_select_form[5921]"]')).toBeChecked();
  }
});
