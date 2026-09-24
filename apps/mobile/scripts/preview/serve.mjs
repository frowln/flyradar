import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json'
};

/** Serves a web export as a single-page app on a free port. */
export async function serve(dist) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = join(dist, path);
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    } catch {
      file = join(dist, 'index.html'); // single-page fallback for deep links
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, r));
  return { port: server.address().port, close: () => server.close() };
}
