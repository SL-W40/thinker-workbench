// 简单静态文件服务器
const http = require('http');
const fs = require('fs');
const path = require('path');

const port = parseInt(process.argv[2]) || 8080;
const root = process.cwd();

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let fp = path.join(root, p);

  try {
    const st = fs.statSync(fp);
    if (st.isDirectory()) {
      const items = fs.readdirSync(fp);
      const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + p + '</title></head><body>' +
        '<h1>目录: ' + p + '</h1><ul>' +
        items.map(i => '<li><a href="' + path.join(p, i).replace(/\\/g, '/') + '">' + i + '</a></li>').join('') +
        '</ul></body></html>';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found: ' + p);
  }
}).listen(port, () => {
  console.log('静态服务器已启动: http://127.0.0.1:' + port);
  console.log('根目录: ' + root);
});
