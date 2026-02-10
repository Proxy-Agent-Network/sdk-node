import http from 'http';

const PORT = 3000;

/**
 * Proxy Protocol Local Sandbox
 * Simulates a live network node for testing Agent logic.
 * Features:
 * - Real-time Ticker Simulation
 * - Human Node Registry (Mock Users)
 * - Task Lifecycle Simulation (Matching -> Completed)
 */

// 1. Mock Data: The Human Workforce
const MOCK_REGISTRY = [
  { 
    node_id: "human_node_alpha", 
    status: "active", 
    tier: 1, 
    reputation: 950,
    capabilities: ["verify_sms_otp", "physical_mail_receive"] 
  },
  { 
    node_id: "human_node_beta", 
    status: "active", 
    tier: 2, 
    reputation: 880,
    capabilities: ["verify_kyc_video"] 
  },
  { 
    node_id: "human_node_gamma", 
    status: "active", 
    tier: 3, 
    reputation: 995,
    capabilities: ["legal_notary_sign", "contract_review"] 
  }
];

// In-Memory Task Store to simulate state persistence
const taskStore: Record<string, any> = {};

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const { method, url } = req;
  console.log(`[Sandbox] ${method} ${url}`);

  // --- ENDPOINTS ---

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
      congestion_multiplier: 1.0,
      sandbox_mode: true
    }));
    return;
  }

  // 2. Mock Registry (Discovery)
  if (url === '/v1/registry' && method === 'GET') {
    res.writeHead(200);
    res.end(JSON.stringify({
      total_nodes: MOCK_REGISTRY.length,
      nodes: MOCK_REGISTRY
    }));
    return;
  }

  // 3. Mock Task Creation
  if (url === '/v1/request' && method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const taskId = `task_mock_${Date.now()}`;
        
        console.log(`[Sandbox] 🟢 New Task: ${data.task_type}`);
        console.log(`[Sandbox] 🔒 Escrow Locked: ${data.max_budget_sats} sats (VIRTUAL)`);

        // Store task with timestamp to simulate lifecycle
        taskStore[taskId] = {
          id: taskId,
          type: data.task_type,
          created_at: Date.now(),
          status: "matching",
          requirements: data.requirements,
          mock_node: MOCK_REGISTRY[0].node_id // Auto-assign for demo
        };
        
        res.writeHead(200);
        res.end(JSON.stringify({
          id: taskId,
          status: "matching",
          estimated_wait: "5s",
          message: "Sandbox: Task dispatched to mock network."
        }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }

  // 4. Mock Task Status (Polling Simulation)
  // Logic: 0-5s: matching, 5-15s: in_progress, >15s: completed
  const taskMatch = url?.match(/^\/v1\/tasks\/(task_mock_\d+)$/);
  if (taskMatch && method === 'GET') {
    const taskId = taskMatch[1];
    const task = taskStore[taskId];

    if (!task) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: "Task not found" }));
      return;
    }

    const ageSeconds = (Date.now() - task.created_at) / 1000;
    let currentStatus = "matching";
    let result = null;

    if (ageSeconds > 15) {
      currentStatus = "completed";
      result = {
        proof_url: "https://sandbox.proxy/proofs/mock_signature.pdf",
        hash: "0x123...mock...hash"
      };
    } else if (ageSeconds > 5) {
      currentStatus = "in_progress";
    }

    res.writeHead(200);
    res.end(JSON.stringify({
      id: taskId,
      status: currentStatus,
      assigned_to: task.mock_node,
      result: result
    }));
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
        SANDBOX v1.1
  
  [!] Local Testnet Active on Port ${PORT}
  [!] Features: Ticker, Registry, Task Lifecycle
  [!] Mock Data: ${MOCK_REGISTRY.length} Human Nodes Loaded
  `);
});
