import 'reflect-metadata';
import { loadEnvFile } from 'node:process';
import { readFile } from 'node:fs/promises';
import { DesignImageProvider } from '../src/modules/spaces/design-image-provider';
import type { DesignScene } from '../src/modules/spaces/design-scene';

// Makes ONE live image-provider call using a bundled catalog photo, never a user photo.
// This verifies provider access/output format, not room-edit quality or private storage.
async function main(): Promise<void> {
  loadEnvFile('.env');
  const photo = await readFile('public/catalog/golden-pothos.png');
  const scene: DesignScene = {
    schemaVersion: 1,
    coordinateSystem: 'PHOTO_NORMALIZED',
    sourceSceneId: 'access-test',
    sourceAnalyzedAt: new Date().toISOString(),
    style: 'MINIMAL',
    carePreference: 'EASY',
    room: {
      proportions: {},
      objects: [],
      surfaces: [],
      environment: {},
      placementZones: [],
      warnings: [],
    },
    plants: [],
  };
  const result = await new DesignImageProvider().generate(
    { data: photo.toString('base64'), mime_type: 'image/png' },
    scene,
  );
  console.log(
    `PASS: image provider returned ${result.mime_type}, ${Buffer.from(result.data, 'base64').length} bytes. No user photo was used.`,
  );
}
void main().catch((error: unknown) => {
  // Provider exceptions contain only our own sanitized messages, never raw provider bodies/keys.
  console.error(error instanceof Error ? error.message : 'Image access check failed.');
  process.exitCode = 1;
});
