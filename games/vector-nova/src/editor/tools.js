// Tool choices change input, never the authored track.
export const EDITOR_TOOLS = [
  {
    id: 'draw',
    action: 'draw-mode',
    label: 'Draw road',
    key: 'D',
    icon: '<path d="m4 17 1-5L15 2l5 5-10 10-5 1Z M13 4l5 5 M4 22h16"/>',
    hint: 'Click to add road points · Drag a handle to adjust · Drag empty ground to pan',
  },
  {
    id: 'move',
    action: 'select-mode',
    label: 'Select / move',
    key: 'V',
    icon: '<path d="m5 3 13 10-7 1-3 7-3-18Z"/>',
    hint: 'Drag to move · Shift-click a span · Shift-drag for height · Drag empty ground to pan',
  },
  {
    id: 'height',
    action: 'height-mode',
    label: 'Height',
    key: 'H',
    icon: '<path d="M12 3v18 M7 8l5-5 5 5 M7 16l5 5 5-5"/>',
    hint: 'Drag points to change height · Drag empty ground to pan',
  },
  {
    id: 'orbit',
    action: 'orbit-mode',
    label: 'Orbit',
    key: 'O',
    icon: '<ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-30 12 12)"/><path d="m18 2 3 4-5 1"/><circle cx="12" cy="12" r="2"/>',
    hint: 'Drag anywhere to orbit · Scroll to zoom · F focuses the selection',
  },
  {
    id: 'pan',
    action: 'pan-mode',
    label: 'Pan',
    key: 'P',
    icon: '<path d="M12 2v20 M2 12h20 M8 6l4-4 4 4 M8 18l4 4 4-4 M6 8l-4 4 4 4 M18 8l4 4-4 4"/>',
    hint: 'Drag anywhere to pan the view · Scroll to zoom',
  },
];
