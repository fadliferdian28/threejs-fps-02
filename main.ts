// MERIDIAN RELAY — make.fun threejs-fps-02 hand-in program.
//
// Node 22, standard library only. It takes the game (game/) and the
// screenshots (screenshots/) from beside this file, copies them into the
// output directory, and writes dossier.json there with make.fun's own
// dossier library — the same library the scorer re-runs, so the dossier
// it writes is the one the gate compares against byte for byte.
//
// The grader runs this program twice in a fresh container with no
// network, /output writable and the repository read-only; both runs must
// produce identical bytes, which they do: nothing here reads the clock,
// the network or any randomness. Outside the grader, set
// MAKEFUN_OUTPUT_DIR to a local directory instead of /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Serve the game locally first with `node serve.ts` and open
// http://localhost:8080 to play it in desktop Chrome.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

// The repository root: the directory this file lives in.
const repo = fileURLToPath(new URL('.', import.meta.url));
// Where the hand-in goes: the grader's /output, or a local stand-in.
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repo, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(repo, 'screenshots'))) {
  cpSync(join(repo, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The bounty gate's caps (from its gate.json): the text cap is the only
// one that shapes the dossier's bytes; the rest make this program fail
// exactly where the scorer would — more than 4 screenshots, one over
// 256 KiB, or a game/ past 993 files / 48 MiB.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
