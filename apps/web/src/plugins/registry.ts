import type { WidgetManifest } from './manifest';
import type { Capability } from './permissions';

export type InstalledWidget = {
  manifest: WidgetManifest;
  granted: Capability[];
  installedAt: string;
};

export type WidgetRegistry = {
  installed: Record<string, InstalledWidget>;
};

function viewerKeyFromUrl(): string {
  const as = new URLSearchParams(window.location.search).get('as');
  return as ?? 'anon';
}

function storageKey(): string {
  // Global-per-user (mocked by ?as= in this PoC).
  return `gm.widgetRegistry.v0.${viewerKeyFromUrl()}`;
}

export function loadWidgetRegistry(): WidgetRegistry {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return { installed: {} };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return { installed: {} };
    const installed = (parsed as Record<string, unknown>)['installed'];
    if (!installed || typeof installed !== 'object') return { installed: {} };
    return { installed: installed as Record<string, InstalledWidget> };
  } catch {
    return { installed: {} };
  }
}

export function saveWidgetRegistry(reg: WidgetRegistry) {
  localStorage.setItem(storageKey(), JSON.stringify(reg));
}

export function upsertInstalledWidget(args: { manifest: WidgetManifest }): WidgetRegistry {
  const prev = loadWidgetRegistry();
  const existing = prev.installed[args.manifest.widgetId];
  const next: WidgetRegistry = {
    installed: {
      ...prev.installed,
      [args.manifest.widgetId]: {
        manifest: args.manifest,
        granted: existing?.granted ?? [],
        installedAt: existing?.installedAt ?? new Date().toISOString(),
      },
    },
  };
  saveWidgetRegistry(next);
  return next;
}

export function setGrantedCapabilities(args: { widgetId: string; granted: Capability[] }): WidgetRegistry {
  const prev = loadWidgetRegistry();
  const existing = prev.installed[args.widgetId];
  if (!existing) return prev;
  const next: WidgetRegistry = {
    installed: {
      ...prev.installed,
      [args.widgetId]: { ...existing, granted: args.granted },
    },
  };
  saveWidgetRegistry(next);
  return next;
}

export function removeInstalledWidget(widgetId: string): WidgetRegistry {
  const prev = loadWidgetRegistry();
  if (!prev.installed[widgetId]) return prev;
  const nextInstalled = { ...prev.installed };
  delete nextInstalled[widgetId];
  const next: WidgetRegistry = { installed: nextInstalled };
  saveWidgetRegistry(next);
  return next;
}

export function listInstalledWidgets(reg: WidgetRegistry): InstalledWidget[] {
  return Object.values(reg.installed).sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}

export function isCapabilityGranted(args: { widget: InstalledWidget; cap: Capability }): boolean {
  return args.widget.granted.includes(args.cap);
}


