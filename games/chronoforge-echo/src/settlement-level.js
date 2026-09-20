// Haventide's economic settlement and the regional communities have separate
// progression. Art previews override a detached render state only.
export function settlementLevel(state, region = 'haventide') {
  const id = region.replace(/_town$/, '');
  const level =
    id === 'haventide'
      ? state?.buildings?.town_center
      : state?.communities?.[id]?.level;
  return Math.max(1, Math.min(4, Math.trunc(level || 1)));
}
