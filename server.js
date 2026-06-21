const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8084;
const ROMS_DIR = '/data/data/com.termux/files/home/snes-web-emulator/roms';

// Garantir que a pasta de ROMs exista
if (!fs.existsSync(ROMS_DIR)) {
    fs.mkdirSync(ROMS_DIR, { recursive: true });
    console.log(`Pasta criada em: ${ROMS_DIR}`);
}

const server = http.createServer((req, res) => {
    // Configurar cabeçalhos CORS e CORP obrigatórios para compatibilidade com Cross-Origin Isolation
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    // Tratar requisição de preflight OPTIONS do navegador
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url);
    const pathname = decodeURIComponent(parsedUrl.pathname);
    const filePath = path.join(ROMS_DIR, pathname);

    // Medida de Segurança: Impedir travessia de diretório (Directory Traversal)
    if (!filePath.startsWith(ROMS_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Acesso Negado');
        return;
    }

    // Verificar se o arquivo ou diretório existe
    fs.stat(filePath, (err, stats) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Arquivo ou pasta não encontrado');
            return;
        }

        // Se for um diretório, listar os arquivos (HTML compatível com a raspagem do App)
        if (stats.isDirectory()) {
            fs.readdir(filePath, (err, files) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Erro interno do servidor');
                    return;
                }

                // Filtrar apenas formatos de ROMs de SNES
                const romFiles = files.filter(file => {
                    const ext = path.extname(file).toLowerCase();
                    return ext === '.smc' || ext === '.sfc' || ext === '.zip' || ext === '.7z';
                });

                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                
                let html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>RetroStream - Index of ROMs</title>
    <style>
        body { font-family: sans-serif; background-color: #0f0f15; color: #e2e8f0; padding: 2rem; }
        h1 { color: #8b5cf6; font-size: 1.5rem; margin-bottom: 0.5rem; }
        p { color: #64748b; font-size: 0.9rem; margin-top: 0; }
        hr { border: 0; border-top: 1px solid rgba(255,255,255,0.08); margin: 1.5rem 0; }
        ul { list-style-type: none; padding: 0; }
        li { margin: 0.75rem 0; display: flex; align-items: center; }
        a { color: #06b6d4; text-decoration: none; font-size: 1.1rem; font-weight: 500; }
        a:hover { text-decoration: underline; color: #22d3ee; }
        .empty { color: #64748b; font-style: italic; }
    </style>
</head>
<body>
    <h1>RetroStream ROMs Server</h1>
    <p>Diretório: ${ROMS_DIR}</p>
    <hr>
    <ul>`;
                
                if (romFiles.length === 0) {
                    html += `        <li class="empty">Nenhuma ROM encontrada (.smc, .sfc, .zip, .7z) nesta pasta. Coloque suas ROMs nela!</li>\n`;
                } else {
                    romFiles.forEach(file => {
                        html += `        <li><a href="${encodeURIComponent(file)}">${file}</a></li>\n`;
                    });
                }
                
                html += `    </ul>
</body>
</html>`;
                res.end(html);
            });
        } else {
            // Se for um arquivo, servir suporte a Range Requests
            const ext = path.extname(filePath).toLowerCase();
            let contentType = 'application/octet-stream';
            if (ext === '.zip') contentType = 'application/zip';
            else if (ext === '.7z') contentType = 'application/x-7z-compressed';

            const range = req.headers.range;
            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;

                if (start >= stats.size || end >= stats.size || start > end) {
                    res.writeHead(416, { 'Content-Range': `bytes */${stats.size}` });
                    res.end();
                    return;
                }

                const chunksize = (end - start) + 1;
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${stats.size}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': contentType
                });

                const fileStream = fs.createReadStream(filePath, { start, end });
                fileStream.pipe(res);
            } else {
                res.writeHead(200, {
                    'Content-Length': stats.size,
                    'Content-Type': contentType,
                    'Accept-Ranges': 'bytes'
                });
                const fileStream = fs.createReadStream(filePath);
                fileStream.pipe(res);
            }
        }
    });
});

server.listen(PORT, () => {
    console.log('==========================================================');
    console.log('         RETROSTREAM ROMs SERVER - INICIADO');
    console.log('==========================================================');
    console.log(`Porta:       ${PORT}`);
    console.log(`Diretório:   ${ROMS_DIR}`);
    console.log(`Url Local:   http://localhost:${PORT}`);
    console.log('==========================================================');
    console.log('Coloque os arquivos de jogos (.smc, .sfc) dentro da pasta');
    console.log('de ROMs acima para que eles apareçam na lista do emulador.');
});
