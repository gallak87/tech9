export function validateSafeFrame(frame) {
  if (
    !frame ||
    typeof frame !== 'object' ||
    Array.isArray(frame) ||
    !['left', 'right', 'bottom', 'top'].every(
      (key) => Number.isFinite(frame[key]) && Math.abs(frame[key]) <= 1,
    ) ||
    frame.left >= frame.right ||
    frame.bottom >= frame.top
  )
    throw new Error(
      'Invalid camera safeFrame: ordered NDC bounds within [-1, 1] are required',
    );
  return frame;
}
