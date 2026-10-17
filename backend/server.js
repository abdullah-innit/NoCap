const http = require('node:http');
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200);
    return res.end(JSON.stringify({ status: 'ok' }));
  }
  res.writeHead(404);
  res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Route not found', details: {} } }));
});
server.listen(8080, '0.0.0.0');
