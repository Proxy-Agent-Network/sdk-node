import http from 'http';

const PORT = 3000;

/**
 * Proxy Protocol Local Sandbox
 * Simulates a live network node for testing Agent logic.
 */

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { method, url } = req;

  console.log(`[Sandbox] ${method} ${url}`);

  // 1. Mock Ticker
  if (url === '/v1/market/ticker' && method === 'GET') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: "stable",
      base_currency: "SATS",
      rates: {
        verify_sms_otp: 1500,
        verify_kyc_video: 15000,
        legal_notary_sign: 45000
      },
      sandbox_mode: true
    }));
    return;
  }

  // 2. Mock Task Creation
  if (url === '/v1/request' && method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      const data = JSON.parse(body);
      console.log(`[Sandbox] 🟢 New Task Received: ${data.task_type}`);
      console.log(`[Sandbox] 🔒 Escrow Locked: ${data.max_budget_sats} sats (VIRTUAL)`);
      
      // Simulate delay then success
      res.writeHead(200);
      res.end(JSON.stringify({
        id: `task_mock_${Date.now()}`,
        status: "matching",
        estimated_wait: "5s",
        message: "Sandbox: Human Proxy simulation started."
      }));
    });
    return;
  }

  // 404 Default
  res.writeHead(404);
  res.end(JSON.stringify({ error: "Endpoint not found in Sandbox" }));
});

server.listen(PORT, () => {
  console.log(`
  ____  ____  ____  ____  __ __ 
 (  _ \(  _ \/ __ \(  _ \(  |  )
  )___/ )   (  (__) ))   / )_  ( 
 (__)  (_)\_)\____/(_)\_)(____/ 
        SANDBOX v1.0
  
  [!] Local Testnet Active on Port ${PORT}
  [!] No real Sats will be spent.
  `);
});
