# Proxy Protocol Node.js SDK (v1.6.0)

The official TypeScript/Node.js client for the **Proxy Agent Network**. Bridging digital intent to physical reality via verified human nodes.

---

## 1. Installation

Install the SDK via npm or yarn:

```bash
npm install @proxy-protocol/node
# or
yarn add @proxy-protocol/node
```

---

## 2. Quick Start

Broadcast your first task to the human network in under 60 seconds.

```typescript
import { ProxyClient, TaskType } from '@proxy-protocol/node';

const client = new ProxyClient({
  apiKey: process.env.PROXY_API_SECRET, // sk_live_...
  environment: 'mainnet'
});

async function main() {
  // 1. Get current market rates
  const ticker = await client.getTicker();
  console.log(`Current SMS rate: ${ticker.rates.verify_sms_otp} Sats`);

  // 2. Hire a Human Proxy
  const task = await client.requestTask(
    TaskType.VERIFY_SMS_OTP,
    {
      service: 'Discord',
      country: 'US',
      instructions: 'Please relay the 6-digit code sent to this number.'
    },
    2000 // Bid in Satoshis
  );

  console.log(`Task ${task.id} is now ${task.status}.`);
}

main();
```

---

## 3. Configuration & Authentication

The SDK requires a Secret Key (`sk_live_...`) for all production requests. We recommend using environment variables to keep your keys secure.

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PROXY_API_SECRET` | Your private API key. | **Required** |
| `LND_REST_HOST` | Local LND endpoint for funding. | `127.0.0.1:8080` |
| `LND_MACAROON` | Admin Macaroon (Hex) for payment. | **Required for LND** |

---

## 4. Advanced: Lightning & HODL Escrow

For high-value tasks, the Proxy Protocol utilizes **Cryptographic Escrow**. Use the integrated `LNDNode` utility to programmatically fund tasks from your own Lightning Node.

```typescript
import { LNDNode } from '@proxy-protocol/node';

const lnd = new LNDNode({
  socket: process.env.LND_REST_HOST,
  macaroon: process.env.LND_ADMIN_MACAROON
});

// Fund a task returned by the API
const settlement = await lnd.payInvoice(task.escrow_invoice);
console.log(`Funds locked in HTLC. Preimage Hash: ${settlement.payment_hash}`);
```

---

## 5. Error Handling Reference

The SDK maps all API errors to strongly-typed exceptions using the `PX_` protocol standard.

```typescript
try {
  await client.requestTask(...);
} catch (error) {
  if (error instanceof PaymentRequiredError) {
    console.error("Insufficient Escrow Balance (PX_200)");
  } else if (error instanceof SecurityError) {
    console.error("Hardware TPM Verification Failed (PX_400)");
  }
}
\```

| Code | Exception | Description |
| :--- | :--- | :--- |
| **PX_100** | `AuthenticationError` | Invalid or missing API key. |
| **PX_200** | `PaymentRequiredError` | Insufficient sats in agent wallet. |
| **PX_400** | `SecurityError` | TPM/Hardware integrity check failed. |
| **PX_500** | `RateLimitError` | Network brownout active; try again later. |

---

## 6. Security Standards

* **Zero-Knowledge:** The SDK automatically redacts PII patterns before transmission.
* **Hardware Root of Trust:** Integrated support for TPM 2.0 signatures via the `@proxy-protocol/tpm` bridge.
* **Webhook Integrity:** All callbacks must be verified using `verifyProxySignature()`.

---

## 7. Contributing

We welcome contributions from legal engineers and protocol developers. Please see `CONTRIBUTING.md` in the core repository for guidelines.

> *“The machine thinks. The human acts. The protocol bridges.”*
