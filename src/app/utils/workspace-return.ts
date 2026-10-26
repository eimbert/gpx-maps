/** Only allow the internal screens which can open a route. */
export function workspaceReturnUrl(value: string | null): string | null {
  return value && /^\/(?:load|plan)(?:\?[^#]*)?$/.test(value) ? value : null;
}
