@cappern/node-red-infoblox [![CI](https://github.com/cappern/node-red-infoblox/actions/workflows/ci.yml/badge.svg)](https://github.com/cappern/node-red-infoblox/actions/workflows/ci.yml)

Node-RED nodes for interacting with Infoblox DDI via the Web API (WAPI).

Features
- Infoblox config node with TLS and timeout settings
- Generic request node for any WAPI resource
- Host-focused CRUD node for <code>record:host</code>
- Clear Node-RED editor help and examples

Nodes
- Infoblox (config): Connection settings and credentials.
- Infoblox Request: Make WAPI calls to resources like <code>record:a</code>, <code>network</code>, <code>fixedaddress</code>.
- Infoblox Host: Focused CRUD for <code>record:host</code> (create/read/update/delete).

Install
1) In your Node-RED user directory run: <code>npm install @cappern/node-red-infoblox</code>
2) Restart Node-RED

Quick Start
1) Add an Infoblox config node and set:
   - Base URL: e.g. <code>https://grid-master</code>
   - WAPI Version: e.g. <code>2.12</code>
   - Credentials: username/password (Basic auth)
   - Verify TLS: uncheck for self-signed lab certs
   - CA Certificate (PEM): paste a custom CA/bundle to trust Infoblox without disabling verification
   - Timeout: defaults to 30000 ms
2) Add an Infoblox Request or Infoblox Host node and select the config
3) Deploy and test with an Inject → Debug flow

Message Properties
- msg.resource: string path (e.g. <code>record:a</code>)
- msg.method: GET | POST | PUT | PATCH | DELETE
- msg.query: object or query string (e.g. <code>{ name: "host.example.com" }</code>)
- msg.payload: object for write operations

Outputs
- msg.payload: parsed JSON response (or text on non‑JSON)
- msg.statusCode, msg.headers: response metadata

Examples
- List A records by name (Request node):
  - Resource: <code>record:a</code>
  - msg.query: <code>{ name: "host.example.com" }</code>
- Create A record (Request node):
  - Method: POST
  - Resource: <code>record:a</code>
  - msg.payload: <code>{ name: "host.example.com", ipv4addr: "192.0.2.10" }</code>

- Host: Create host record
  - Node: Infoblox Host (Operation: Create)
  - msg.payload: <code>{ "name": "host.example.com", "ipv4addrs": [{ "ipv4addr": "192.0.2.10" }] }</code>

- Host: Read by name
  - Node: Infoblox Host (Operation: Read, Hostname: <code>host.example.com</code>)
  - Or pass <code>msg.query = { name: "host.example.com" }</code>

- Host: Update by _ref
  - Node: Infoblox Host (Operation: Update, Ref: <code>_ref-from-read</code>)
  - msg.payload: fields to modify, e.g. <code>{ "comment": "updated via Node-RED" }</code>

- Host: Delete by _ref
  - Node: Infoblox Host (Operation: Delete, Ref: <code>_ref-from-read</code>)

Example Flows
Import these via Node-RED → menu → Import → Clipboard.

Request: List A records by name
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

Host: Create and then read by name
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

Status & Errors
- Nodes show blue while sending, green on success, red on error or timeout
- On error, the node passes response info and sets <code>msg.statusCode</code> and <code>msg.payload</code> for inspection

Security Notes
- Credentials are stored using Node-RED’s credential system
- Prefer adding a <b>CA Certificate (PEM)</b> to trust your Infoblox cert; disable <b>Verify TLS</b> only for labs/testing

Troubleshooting
- 401/403: Check credentials and Infoblox roles/permissions
- 404: Verify resource name (e.g. <code>record:a</code>) or <code>_ref</code>
- 422/400: Validate payload fields against WAPI schema
- Timeout: Increase timeout in config or check connectivity/Certs

Development
- Requires Node.js 20+ (uses global <code>fetch</code>)
- Run tests: <code>npm test</code>, Coverage: <code>npm run coverage</code>

Legal / Branding
- Unofficial project: not affiliated with or endorsed by Infoblox Inc.
- “Infoblox” is a trademark of its respective owner. Any references are for identification and interoperability only (nominative use).
- No Infoblox logos or proprietary artwork are included; the nodes appear under a neutral “Infoblox” palette group with generic icons.
