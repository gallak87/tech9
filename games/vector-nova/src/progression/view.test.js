import test from 'node:test';
import assert from 'node:assert/strict';
import {
  careerProgressView,
  careerView,
  courseRequirementText,
  courseResultsView,
} from './view.js';
import { freshProfile } from './profile.js';
import { REWARDS } from './catalog.js';
import { COURSE_IDS, MODE_UNLOCKS } from '../levels/access.js';
import { trackChallenge } from '../frontend/track-challenge.js';

const catalog = COURSE_IDS.map((id, index) => ({
  id,
  name: `Course ${index + 1}`,
}));

const access = (profile) => ({
  cupWins: profile.cups,
  finishedCourses: profile.finishedCourses,
});

test('career presents one 37-item unlock collection with all gear and course items', () => {
  const profile = freshProfile();
  const view = careerView(profile, { catalog });
  assert.match(view, /<strong>0<small> \/ 37 unlocks/);
  assert.equal(
    (view.match(/aria-label="Career unlock collection"/g) ?? []).length,
    1,
  );
  assert.match(view, /Rewards <small>0 \/ 28 collected/);
  assert.match(view, /Courses <small>0 \/ 9 unlocked/);
  assert.equal((view.match(/class="career-course-card /g) ?? []).length, 9);
  assert.equal((view.match(/class="reward-milestone /g) ?? []).length, 28);
  assert.match(view, /Win Founders Cup to unlock Freestyle/);
  const bar = careerProgressView(profile);
  assert.match(bar, /<span>Unlocks<\/span>/);
  assert.match(
    bar,
    /aria-label="Career unlocks"[^>]*aria-valuemax="37"[^>]*aria-valuenow="0"/,
  );
  assert.equal((bar.match(/class="career-progress-notch/g) ?? []).length, 37);
  assert.equal((bar.match(/role="progressbar"/g) ?? []).length, 1);
  assert.doesNotMatch(bar, /course-progress|<img|<svg/);
});

test('the static bar fills continuously from the left when gear and courses unlock out of order', () => {
  const profile = freshProfile();
  profile.claims = ['speed-1'];
  profile.cups = ['horizon'];
  profile.finishedCourses = ['interceptor'];
  const view = careerView(profile, { catalog, developer: true });
  assert.match(view, /<strong>3<small> \/ 37 unlocks/);
  assert.match(
    view,
    /career-course-card is-completed" data-course="interceptor"/,
  );
  assert.match(
    view,
    /career-course-card is-available" data-course="interceptor-helion"/,
  );
  assert.match(
    view,
    /career-course-card is-locked" data-course="interceptor-nightweir"/,
  );
  assert.match(view, /Win Course 8 to unlock this course/);
  assert.match(view, /Courses <small>2 \/ 9 unlocked/);
  const bar = careerProgressView(profile, { developer: true });
  assert.match(bar, /aria-valuenow="3"/);
  assert.equal(
    (bar.match(/class="career-progress-notch is-earned"/g) ?? []).length,
    3,
  );
  assert.deepEqual(
    [...bar.matchAll(/class="career-progress-notch( is-earned)?"/g)].map(
      (match) => !!match[1],
    ),
    [...Array(3).fill(true), ...Array(34).fill(false)],
    'every collected unlock fills the next notch, without holes for unearned catalog items',
  );
});

test('all 37 unlocks are visible without inventing stored course reward claims', () => {
  const profile = freshProfile();
  profile.claims = REWARDS.map(({ id }) => id);
  profile.cups = MODE_UNLOCKS.map(({ cupId }) => cupId);
  profile.finishedCourses = MODE_UNLOCKS.flatMap(({ levelIds }) =>
    levelIds.slice(0, 2),
  );
  const view = careerView(profile, { catalog });
  const bar = careerProgressView(profile);
  assert.match(view, /<strong>37<small> \/ 37 unlocks/);
  assert.match(view, /Rewards <small>28 \/ 28 collected/);
  assert.match(view, /Courses <small>9 \/ 9 unlocked/);
  assert.match(bar, /aria-valuemax="37"[^>]*aria-valuenow="37"/);
  assert.equal(
    (bar.match(/class="career-progress-notch is-earned"/g) ?? []).length,
    37,
  );
  assert.equal(
    (view.match(/class="reward-milestone /g) ?? []).length +
      (view.match(/class="career-course-card /g) ?? []).length,
    37,
  );
  assert.equal(profile.claims.length, 28);
  assert.equal(
    (view.match(/class="career-course-card is-completed"/g) ?? []).length,
    6,
  );
  assert.equal(
    (view.match(/class="career-course-card is-available"/g) ?? []).length,
    3,
  );
});

test('course requirements name the immediate prerequisite and authored challenge tiers', () => {
  const profile = freshProfile();
  profile.cups = ['founders', 'horizon'];
  assert.equal(
    courseRequirementText('freestyle-ravel', access(profile), catalog),
    'Complete Course 2 to unlock this course.',
  );
  profile.finishedCourses = ['zephyr-skywell'];
  assert.equal(
    courseRequirementText('freestyle-ravel', access(profile), catalog),
    'Complete Course 2 to unlock this course.',
  );
  assert.equal(
    courseRequirementText('zephyr-skywell', access(profile), catalog),
    '',
  );
  for (const mode of MODE_UNLOCKS) {
    const expected = ['Easy', 'Medium', 'Hard'];
    assert.deepEqual(mode.levelIds.map(trackChallenge), expected);
  }
});

test('results name the newly opened course and distinguish completing the mode', () => {
  const before = freshProfile();
  before.cups = ['founders'];
  const after = structuredClone(before);
  after.finishedCourses = ['zephyr-skywell'];
  const opened = courseResultsView(before, after, catalog);
  assert.match(opened, /Course complete/);
  assert.match(opened, /Course 1 completed/);
  assert.match(opened, /Course 2<\/strong> unlocked/);
  assert.equal(courseResultsView(after, after, catalog), '');
  const middle = structuredClone(after);
  middle.finishedCourses.push('freestyle-oriel');
  const complete = structuredClone(middle);
  complete.finishedCourses.push('freestyle-ravel');
  assert.match(
    courseResultsView(middle, complete, catalog),
    /All three courses in this mode are complete/,
  );
});
