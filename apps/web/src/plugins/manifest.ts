import { z } from 'zod';
import { allCapabilities, type Capability } from './permissions';

export type WidgetManifest = z.infer<typeof zWidgetManifest>;

export const zWidgetManifest = z.object({
  widgetId: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  publisher: z.string().min(1),
  entry: z.object({
    url: z.string().url(),
  }),
  permissions: z.array(z.enum(allCapabilities)).default([]),
  defaultSize: z
    .object({
      w: z.number().positive(),
      h: z.number().positive(),
    })
    .optional(),
  minSize: z
    .object({
      w: z.number().positive(),
      h: z.number().positive(),
    })
    .optional(),
});

export function parseWidgetManifest(input: unknown): WidgetManifest {
  return zWidgetManifest.parse(input);
}

export function isCapabilityRequested(manifest: WidgetManifest, cap: Capability): boolean {
  return manifest.permissions.includes(cap);
}


