// Pure layout state logic; invalid panel IDs must not affect current selection.
export const PANEL_IDS = Object.freeze(['analytics', 'classes', 'students', 'activity']);

export function nextFocusedPanel(current, target) {
  if (!PANEL_IDS.includes(target)) return current;
  return current === target ? null : target;
}
