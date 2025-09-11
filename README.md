# @cappern/node-red-infoblox

[![CI](https://github.com/cappern/node-red-infoblox/actions/workflows/ci.yml/badge.svg)](https://github.com/cappern/node-red-infoblox/actions/workflows/ci.yml)

Node-RED nodes for interacting with Infoblox DDI via the Web API (WAPI).

## Table of Contents
- Features
- Installation
- Quick Start
- Nodes Overview
- Usage Examples
- Status & Errors
- Security
- Troubleshooting
- Development
- Legal / Branding

## Features
- Infoblox config node with TLS, custom CA and timeout settings
- Generic request node for any WAPI resource
- Host-focused CRUD node for `record:host`
- Clear Node-RED editor help and examples

## Installation
1) In your Node-RED user directory, install the package:

```bash
npm install @cappern/node-red-infoblox
```

2) Restart Node-RED and find the nodes in the palette under “Infoblox”.

## Quick Start
1) Add an Infoblox config node and set:
   - Base URL: e.g. `https://grid-master`
   - WAPI Version: e.g. `2.12`
   - Credentials: username/password (Basic auth)
   - Verify TLS: uncheck for self-signed lab certs
   - CA Certificate (PEM): paste a custom CA/bundle to trust Infoblox without disabling verification
   - Timeout: defaults to 30000 ms
2) Add an Infoblox Request or Infoblox Host node and select the config.
3) Deploy and test with an Inject → Debug flow.

## Nodes Overview
- Infoblox (config): connection settings and credentials shared by the nodes.
- Infoblox Request: call WAPI resources like `record:a`, `network`, `fixedaddress`.
- Infoblox Host: simplified CRUD for `record:host` (create/read/update/delete).

### Message properties
- `msg.resource`: string path (e.g. `record:a`)
- `msg.method`: `GET | POST | PUT | PATCH | DELETE`
- `msg.query`: object or query string (e.g. `{ name: "host.example.com" }`)
- `msg.payload`: object for write operations

### Outputs
- `msg.payload`: parsed JSON response (or text on non‑JSON)
- `msg.statusCode`, `msg.headers`: response metadata

## Usage Examples

### Request node
- List A records by name

```js
msg.resource = "record:a";
msg.query = { name: "host.example.com" };
return msg;
```

- Create an A record

```js
msg.method = "POST";
msg.resource = "record:a";
msg.payload = { name: "host.example.com", ipv4addr: "192.0.2.10" };
return msg;
```

### Host node
- Create host record

```js
msg.operation = "create";
msg.payload = {
  name: "host.example.com",
  ipv4addrs: [{ ipv4addr: "192.0.2.10" }]
};
return msg;
```

- Read by name

```js
msg.operation = "read";
msg.hostname = "host.example.com";
return msg;
```

- Update by _ref

```js
msg.operation = "update";
msg.ref = "record:host/ZG5zLmhvc3Qk...:host.example.com/default";
msg.payload = { comment: "updated via Node-RED" };
return msg;
```

### Importable example flows
Import via Node-RED → menu → Import → Clipboard.

<details>
<summary>Request: List A records by name (JSON)</summary>

```json
[
  {
    "id": "4f8d7b8d2a0b",
    "type": "inject",
    "z": "",
    "name": "Query A by name",
    "props": [
      { "p": "resource", "v": "record:a", "vt": "str" },
      { "p": "query", "v": "{\"name\":\"host.example.com\"}", "vt": "json" }
    ],
    "repeat": "",
    "once": false,
    "onceDelay": 0.1,
    "topic": "",
    "x": 200,
    "y": 120,
    "wires": [["req1"]]
  },
  { "id": "conf1", "type": "infoblox-config", "name": "Infoblox", "baseUrl": "https://grid-master", "wapiVersion": "2.12", "timeoutMs": 30000, "sslVerify": true },
  { "id": "req1", "type": "infoblox-request", "infoblox": "conf1", "name": "List A records", "method": "GET", "resource": "record:a", "x": 430, "y": 120, "wires": [["dbg1"]] },
  { "id": "dbg1", "type": "debug", "name": "payload", "active": true, "tosidebar": true, "console": false, "tostatus": false, "complete": "payload", "targetType": "msg", "x": 630, "y": 120, "wires": [] }
]
```

</details>

<details>
<summary>Host: Create and then read by name (JSON)</summary>

```json
[
  { "id": "conf2", "type": "infoblox-config", "name": "Infoblox", "baseUrl": "https://grid-master", "wapiVersion": "2.12", "timeoutMs": 30000, "sslVerify": true },
  {
    "id": "injc1", "type": "inject", "name": "Create host",
    "props": [
      { "p": "operation", "v": "create", "vt": "str" },
      { "p": "payload", "v": "{\n  \"name\": \"host.example.com\",\n  \"ipv4addrs\": [{ \"ipv4addr\": \"192.0.2.10\" }]\n}", "vt": "json" }
    ],
    "x": 200, "y": 220, "wires": [["host1"]]
  },
  { "id": "host1", "type": "infoblox-host", "name": "Host create/read", "infoblox": "conf2", "operation": "read", "hostname": "", "ref": "", "x": 430, "y": 220, "wires": [["dbg2"]] },
  { "id": "injr1", "type": "inject", "name": "Read host by name", "props": [ { "p": "operation", "v": "read", "vt": "str" }, { "p": "hostname", "v": "host.example.com", "vt": "str" } ], "x": 190, "y": 260, "wires": [["host1"]] },
  { "id": "dbg2", "type": "debug", "name": "payload", "active": true, "tosidebar": true, "complete": "payload", "targetType": "msg", "x": 630, "y": 240, "wires": [] }
]
```

</details>

## Status & Errors
- Nodes show blue while sending, green on success, red on error or timeout.
- On error, the node passes response info and sets `msg.statusCode` and `msg.payload` for inspection.

## Security
- Credentials are stored using Node-RED’s credential system.
- Prefer adding a CA Certificate (PEM) to trust your Infoblox cert; disable “Verify TLS” only for labs/testing.

## Troubleshooting
- 401/403: check credentials and Infoblox roles/permissions
- 404: verify resource name (e.g. `record:a`) or `_ref`
- 422/400: validate payload fields against WAPI schema
- Timeout: increase timeout in config or check connectivity/certs

## Development
- Requires Node.js 20+ (uses global `fetch`)
- Run tests: `npm test`  |  Coverage: `npm run coverage`

## Legal / Branding
- Unofficial project: not affiliated with or endorsed by Infoblox Inc.
- “Infoblox” is a trademark of its respective owner. Any references are for identification and interoperability only (nominative use).
- No Infoblox logos or proprietary artwork are included; the nodes appear under a neutral “Infoblox” palette group with generic icons.
