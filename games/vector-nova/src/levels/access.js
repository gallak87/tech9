import { IS_DEMO } from '../progression/edition.js';
import { canonicalLevelId } from './aliases.js';

// Technical catalogs include locked courses for previews and validation.
// Preview selection and permission to start a session are deliberately separate.
export const BONUS_LEVEL_IDS = Object.freeze(['ravel', 'nomad', 'oriel']);
export const MODE_UNLOCKS = Object.freeze(
  [
    {
      mode: 'freestyle',
      label: 'Freestyle',
      cupId: 'founders',
      cupName: 'Founders Cup',
      levelIds: ['launchworks', 'freestyle-oriel', 'freestyle-ravel'],
    },
    {
      mode: 'eliminator',
      label: 'Eliminator',
      cupId: 'frontier',
      cupName: 'Frontier Cup',
      levelIds: [
        'eliminator-glasswake',
        'eliminator-saffron',
        'eliminator-nomad',
      ],
    },
    {
      mode: 'interceptor',
      label: 'Interceptor',
      cupId: 'horizon',
      cupName: 'Horizon Cup',
      levelIds: ['interceptor', 'interceptor-helion', 'interceptor-nightweir'],
    },
  ].map((unlock) =>
    Object.freeze({ ...unlock, levelIds: Object.freeze(unlock.levelIds) }),
  ),
);
export const COURSE_IDS = Object.freeze(
  MODE_UNLOCKS.flatMap(({ levelIds }) => levelIds),
);

export function modeUnlockRequirement(mode) {
  return MODE_UNLOCKS.find((unlock) => unlock.mode === mode) ?? null;
}

export function levelUnlockRequirement(id) {
  id = canonicalLevelId(id);
  return MODE_UNLOCKS.find((unlock) => unlock.levelIds.includes(id)) ?? null;
}

export function modeAvailable(mode, { cupWins = [], developer = false } = {}) {
  const requirement = modeUnlockRequirement(mode);
  if (!requirement) return true;
  if (IS_DEMO) return false;
  return (
    developer === true ||
    (Array.isArray(cupWins) && cupWins.includes(requirement.cupId))
  );
}

// Earned status survives edition changes; demo availability still stays closed.
export function courseEarned(id, { cupWins = [], finishedCourses = [] } = {}) {
  id = canonicalLevelId(id);
  const requirement = levelUnlockRequirement(id);
  if (
    !requirement ||
    !Array.isArray(cupWins) ||
    !cupWins.includes(requirement.cupId)
  )
    return false;
  const finished = new Set(finishedCourses ?? []);
  // A later result cannot skip an earlier course, including imported data.
  return requirement.levelIds
    .slice(0, requirement.levelIds.indexOf(id))
    .every((previous) => finished.has(previous));
}

export function courseAvailable(id, access = {}) {
  if (IS_DEMO || !levelUnlockRequirement(id)) return false;
  return access.developer === true || courseEarned(id, access);
}

export function courseUnlockRequirement(id, access = {}) {
  id = canonicalLevelId(id);
  const requirement = levelUnlockRequirement(id);
  if (!requirement || courseAvailable(id, access)) return null;
  if (IS_DEMO)
    return {
      type: 'edition',
      mode: requirement.mode,
      label: requirement.label,
    };
  if (!modeAvailable(requirement.mode, access))
    return {
      type: 'cup',
      mode: requirement.mode,
      label: requirement.label,
      cupId: requirement.cupId,
      cupName: requirement.cupName,
    };
  const finished = new Set(access.finishedCourses ?? []);
  const previousId = requirement.levelIds
    .slice(0, requirement.levelIds.indexOf(id))
    .findLast((previous) => !finished.has(previous));
  return {
    type: 'course',
    mode: requirement.mode,
    label: requirement.label,
    courseId: previousId,
    winRequired: requirement.mode !== 'freestyle',
  };
}

export function courseUnlockMessage(id, access = {}) {
  const requirement = courseUnlockRequirement(id, access);
  if (!requirement) return '';
  if (requirement.type === 'edition')
    return `${requirement.label} is available in the full game.`;
  if (requirement.type === 'cup')
    return `Win ${requirement.cupName} to unlock ${requirement.label}.`;
  return `${requirement.winRequired ? 'Win' : 'Complete'} the previous ${requirement.label} course to unlock this course.`;
}

export function courseCollection(profile, { developer = false } = {}) {
  const access = {
    cupWins: profile?.cups ?? [],
    finishedCourses: profile?.finishedCourses ?? [],
    developer,
  };
  const finished = new Set(access.finishedCourses);
  const courses = MODE_UNLOCKS.flatMap((unlock) =>
    unlock.levelIds.map((id, index) => {
      const available = courseAvailable(id, access);
      const completed = finished.has(id);
      return {
        id,
        mode: unlock.mode,
        label: unlock.label,
        index,
        previousId: unlock.levelIds[index - 1] ?? null,
        available,
        completed,
        status: completed ? 'completed' : available ? 'available' : 'locked',
        requirement: courseUnlockRequirement(id, access),
        message: courseUnlockMessage(id, access),
      };
    }),
  );
  return {
    total: courses.length,
    unlocked: courses.filter((course) => course.available).length,
    completed: courses.filter((course) => course.completed).length,
    courses,
  };
}

export function levelAvailable(
  id,
  {
    complete = false,
    cupWins = [],
    finishedCourses = [],
    developer = false,
  } = {},
) {
  id = canonicalLevelId(id);
  // Retain the Foundry implementation for Dispatch and developer inspection,
  // without presenting the retired Eliminator course in the player catalog.
  if (id === 'crucible') return developer === true && !IS_DEMO;
  const requirement = levelUnlockRequirement(id);
  if (requirement)
    return courseAvailable(id, { cupWins, finishedCourses, developer });
  return !BONUS_LEVEL_IDS.includes(id) || complete || developer;
}

export function previewSelectable(id, access = {}) {
  if (levelUnlockRequirement(id)) return !IS_DEMO;
  return levelAvailable(id, access);
}

export function lockedLevelMessage(id, access = {}) {
  const requirement = levelUnlockRequirement(id);
  if (requirement) return courseUnlockMessage(id, access);
  if (id === 'crucible') return 'Choose one of the new Eliminator courses.';
  return 'Complete all 37 career unlocks to open this course.';
}

export function filterAvailableLevels(levels, access = {}) {
  return levels.filter(({ id }) => levelAvailable(id, access));
}
