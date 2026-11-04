// Ollama の応答の形をまねた仮のサーバー（動作確認用）。実際の推論はしない。
//   node test/mock-ollama.js            … OLLAMA_ORIGINS="*" を設定した状態をまねる
//   CORS=off node test/mock-ollama.js   … OLLAMA_ORIGINS 未設定で、ブラウザが接続を拒む状態をまねる
const http = require('http');
const PORT = Number(process.env.PORT || 11434);
const cors = process.env.CORS !== 'off';
const log = [];
const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  if (cors) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    log.push({ method: req.method, url: req.url, origin, body: body ? JSON.parse(body) : null });
    if (req.url === '/__log') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(log)); }
    if (req.url === '/api/tags') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ models: [{ name: 'gemma3:4b', model: 'gemma3:4b', modified_at: '2026-10-01T00:00:00Z' }] }));
    }
    if (req.url === '/api/chat' && req.method === 'POST') {
      const j = JSON.parse(body);
      const prompt = j.messages[j.messages.length - 1].content;
      const m = /段階(\d)「[^」]+」の質問を1問だけ/.exec(prompt);
      const content = m
        ? JSON.stringify({ question: `（仮の応答・段階${m[1]}）前の答えについて、さらに深める質問です。` })
        : JSON.stringify({ questions: [
            { field: 'decision', question: '（仮の応答）その判断をするとき、最初にどの書類のどの欄を見ますか。' },
            { field: 'reason', question: '（仮の応答）その基準の値は、いつ、どんな出来事があって決まりましたか。' },
            { field: 'exceptions', question: '（仮の応答）基準どおりに処理しなかった例を一つ思い出せますか。' } ] });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ model: j.model, created_at: new Date().toISOString(), message: { role: 'assistant', content }, done_reason: 'stop', done: true, total_duration: 1, load_duration: 1, prompt_eval_count: 1, eval_count: 1 }));
    }
    res.writeHead(404); res.end('404 page not found');
  });
});
server.listen(PORT, '127.0.0.1', () => console.log(`mock ollama on ${PORT} cors=${cors}`));
