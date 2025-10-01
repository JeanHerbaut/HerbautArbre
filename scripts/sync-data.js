import { access, constants, cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const sourceFile = resolve(rootDir, 'data', 'famille-herbaut.json');
const targetDir = resolve(rootDir, 'public', 'data');
const targetFile = resolve(targetDir, 'famille-herbaut.json');

async function ensureSourceExists() {
  try {
    await access(sourceFile, constants.R_OK);
  } catch (error) {
    console.error(`Fichier source introuvable : ${sourceFile}`);
    throw error;
  }
}

async function syncDataFile() {
  await ensureSourceExists();
  await mkdir(targetDir, { recursive: true });
  await cp(sourceFile, targetFile);
  console.log(`Synchronisation des données : ${sourceFile} -> ${targetFile}`);
}

syncDataFile().catch((error) => {
  console.error('Échec de la synchronisation des données pour le build.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
