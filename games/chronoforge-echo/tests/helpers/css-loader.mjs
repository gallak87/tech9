// Presentation modules may import CSS; pure Node tests exercise their markup and actions.
export async function load(url, context, nextLoad) {
  if (url.endsWith('.css'))
    return { format: 'module', source: '', shortCircuit: true };
  return nextLoad(url, context);
}
