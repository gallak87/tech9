import { COMMUNITY_DEFINITIONS } from './community-definitions.js';
import { consoleAt, road } from './world-objects.js';

// Native-world sites, beside the existing town approaches. Regional interior
// pieces also serve as open-air workstations: supplies become the finished
// station when its project completes. Footprints stay fixed at every stage.
const sites = {
  emberline: [
    [1620, 730, 'engineering'],
    [2050, 745, 'training'],
    [2300, 855, 'forge'],
  ],
  orbital_reach: [
    [1430, 800, 'inn'],
    [1850, 740, 'engineering'],
    [2110, 795, 'forge'],
  ],
  last_crown: [
    [1700, 930, 'provisions'],
    [2080, 805, 'engineering'],
    [2390, 1000, 'archive'],
  ],
};

export function placeCommunitySites(regions, closestRoadPoint) {
  for (const community of COMMUNITY_DEFINITIONS) {
    const scene = regions[community.id];
    for (const [index, project] of community.projects.entries()) {
      const [x, y, part] = sites[community.id][index];
      const approach = [x, y + 65];
      scene.roads.push(road(approach, closestRoadPoint(scene, ...approach)));
      scene.objects.push(
        consoleAt(`${community.id}_project_${project.id}`, project.name, x, y, {
          service: 'construction',
          havenPart: part,
          interiorRegion: community.id,
          communityProjectLevel: project.level,
          communityProject: project.id,
          artWidth: 210,
          solid: true,
          w: 138,
          h: 50,
        }),
      );
    }
  }
}
