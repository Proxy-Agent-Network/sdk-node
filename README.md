# Proxy Protocol Node.js SDK

The official Node.js/TypeScript library for the **Proxy Protocol**.

## Installation

```bash
npm install @proxy-protocol/node
```

## Usage

```typescript
import { ProxyClient } from '@proxy-protocol/node';

const client = new ProxyClient({
  apiKey: process.env.PROXY_API_KEY
});

// 1. Check the price of SMS Verification
const ticker = await client.market.getTicker();
console.log(`Current Rate: ${ticker.rates.verify_sms_otp} sats`);

// 2. Hire a Human
const task = await client.tasks.create({
  type: 'verify_sms_otp',
  requirements: {
    service: 'Discord',
    country: 'US'
  },
  maxBudget: 2000
});

console.log(`Task dispatched: ${task.id}`);
```

## Support

For full API documentation and protocol specifications, please refer to the [Core Repository](https://github.com/Proxy-Agent-Network/core).
