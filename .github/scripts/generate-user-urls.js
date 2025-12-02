// generate-user-urls.js
// Escanea la carpeta users/, detecta los IDs y genera:
// - users/index.json (listado con id, filename, url)
// - users/last_added.txt (lista de URLs agregadas en el último push)
//
// Se usa en la Action. No requiere credenciales adicionales.
// Construye la URL pública a partir de GITHUB_REPOSITORY (owner/repo).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function safeReadDir(dir) {
  try { return fs.readdirSync(dir); } catch (e) { return []; }
}

function buildBaseUrl() {
  const repo = process.env.GITHUB_REPOSITORY || '';
  if (!repo) return '/';
  const [owner, repoName] = repo.split('/');
  // Asume GitHub Pages en owner.github.io/repoName/
  return `https://${owner}.github.io/${repoName}/`;
}

function parseAddedFiles() {
  try {
    const diff = execSync('git diff --name-status HEAD^ HEAD', { encoding: 'utf8' });
    // formato: "A\tusers/llavero123.json\nM\tpath\n"
    return diff.split('\n').map(l => l.trim()).filter(Boolean);
  } catch (e) {
    // Si no hay HEAD^ (primer commit) o falla, devolvemos null para indicar que tomemos todos
    return null;
  }
}

function main() {
  const usersDir = path.join(process.cwd(), 'users');
  const allFiles = safeReadDir(usersDir);
  const allLlaveroFiles = allFiles.filter(f => /^llavero[A-Za-z0-9_-]+\.json$/.test(f));
  const base = buildBaseUrl();

  // Detectar añadidos en el último commit (si posible)
  const diffLines = parseAddedFiles();
  const addedIds = [];
  if (diffLines === null) {
    // Fallback: considerar todos como 'existentes' (no hay last_added)
    console.log('[generate] no diff available, will regenerate index from all files');
  } else {
    diffLines.forEach(line => {
      const parts = line.split(/\s+/);
      const status = parts[0];
      const file = parts[1];
      if (!file) return;
      const fname = path.basename(file);
      if ((status === 'A' || status === 'R' || status === 'C') && /^llavero[A-Za-z0-9_-]+\.json$/.test(fname)) {
        const id = fname.replace(/^llavero([A-Za-z0-9_-]+)\.json$/, '$1');
        if (id) addedIds.push(id);
      }
    });
  }

  // Generar index.json con todos los usuarios
  const index = allLlaveroFiles.map(fname => {
    const id = fname.replace(/^llavero([A-Za-z0-9_-]+)\.json$/, '$1');
    return {
      id,
      file: fname,
      url: `${base}?id=${id}`
    };
  }).sort((a,b) => a.id.localeCompare(b.id));

  // escribir users/index.json
  const indexPath = path.join(usersDir, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
  console.log('[generate] wrote', indexPath);

  // escribir users/last_added.txt con las URLs de los añadidos (si se detectaron)
  const lastPath = path.join(usersDir, 'last_added.txt');
  let lastUrls = [];
  if (addedIds.length) {
    lastUrls = addedIds.map(id => `${base}?id=${id}`);
    fs.writeFileSync(lastPath, lastUrls.join('\n') + '\n', 'utf8');
    console.log('[generate] wrote', lastPath, 'with', lastUrls.length, 'entries');
  } else {
    // Si no detectamos añadidos (p.ej. primer commit), dejamos last_added.txt con la última entrada (si existe)
    if (index.length) {
      const last = index[index.length - 1];
      fs.writeFileSync(lastPath, `${last.url}\n`, 'utf8');
      console.log('[generate] no added detected - wrote last single entry');
    } else {
      fs.writeFileSync(lastPath, '', 'utf8');
      console.log('[generate] no users - last_added.txt cleared');
    }
  }
}

main();
