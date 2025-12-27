export function getViewerIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('as');
}

