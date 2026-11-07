// Scenario setup copies its top-level vehicle values; nested values stay borrowed.
export function createScenarioDescriptors(scenarios) {
  return Object.fromEntries(
    Object.entries(scenarios).map(([id, state]) => [
      id,
      { label: id.replaceAll('-', ' '), state: { ...state } },
    ]),
  );
}
