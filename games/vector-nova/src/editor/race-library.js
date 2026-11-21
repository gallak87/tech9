import { analyzePracticeDocument, documentIdentity } from './document.js';
import { createTrackLibrary } from './library.js';
import { editorBiome } from './biomes.js';
import { environmentThumbnailPath } from './environment-thumbnails.js';
import { editorRouteOutline } from './route-outline.js';

export function createRaceLibrary(library = createTrackLibrary()) {
  let cached = new Map();
  return {
    async list() {
      const next = new Map();
      for (const record of await library.list()) {
        const id = 'custom-' + record.id;
        let course = cached.get(id);
        if (!course || course.updatedAt !== record.updatedAt) {
          try {
            const document = await library.read(record.id);
            if (!document) continue;
            const outline = editorRouteOutline(document);
            const preview = environmentThumbnailPath(
              document.biome,
              document.settings.sceneryPreset,
            );
            course = {
              id,
              name: document.name,
              fileId: record.id,
              updatedAt: record.updatedAt,
              biome: editorBiome(document.biome).label,
              closed: document.courseType !== 'downhill',
              preview,
              route: outline && {
                ...outline,
                preview,
                id,
                trackId: documentIdentity(document),
              },
              reason:
                document.points.length < 4
                  ? 'Add at least four road points in the Editor.'
                  : '',
              checked: document.points.length < 4,
            };
          } catch {
            // A damaged or concurrently removed file should leave the other courses usable.
            continue;
          }
          // Yield between files so large libraries never monopolize the menu.
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        next.set(id, course);
      }
      cached = next;
      return next;
    },
    async read(course) {
      const document = await library.read(course.fileId);
      if (!document)
        throw new Error('This level is no longer in your library.');
      return document;
    },
    async check(course) {
      if (course.checked) return;
      try {
        const document = await this.read(course);
        const report = analyzePracticeDocument(document);
        course.reason = report.errors[0] ?? '';
      } catch (error) {
        course.reason = error.message;
      }
      course.checked = true;
    },
  };
}
