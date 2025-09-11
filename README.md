# @cappern/node-red-infoblox
[![CI](https://github.com/cappern/node-red-infoblox/actions/workflows/ci.yml/badge.svg)](https://github.com/cappern/node-red-infoblox/actions/workflows/ci.yml)
[![Node-RED](https://img.shields.io/badge/Node--RED-Infoblox-blue)](https://nodered.org)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL--3.0--or--later-blue.svg)](./LICENSE)

Node-RED nodes for interacting with Infoblox DDI via the Web API (WAPI).

---

## 🚀 Features

- Infoblox config node with TLS, custom CA and timeout settings
- Generic request node for any WAPI resource
- Host-focused CRUD node for `record:host`
- Clear Node-RED editor help and examples

---

## 📦 Installation

From your Node-RED user directory (e.g. `~/.node-red` or `/data` in Docker):

```bash
npm install @cappern/node-red-infoblox
```

Restart Node-RED and find the nodes in the palette under "Infoblox".

---

## 🔧 Usage

1. Add an Infoblox config node and set:
   - Base URL: e.g. `https://grid-master`
   - WAPI Version: e.g. `2.12`
   - Credentials: username/password (Basic auth)
   - Verify TLS: uncheck for self-signed lab certs
   - CA Certificate (PEM): optional custom CA/bundle to trust Infoblox
   - Timeout: defaults to 30000 ms
2. Use either node and select the config:
   - Infoblox Request: call WAPI resources like `record:a`, `network`, `fixedaddress`
   - Infoblox Host: simplified CRUD for `record:host`
3. Deploy and send a message. On error, nodes set `msg.statusCode` and include response details in `msg.payload`.

Common message properties:

```text
msg.resource  // e.g. "record:a" (Request node)
msg.method    // GET | POST | PUT | PATCH | DELETE (Request node)
msg.query     // object or querystring, e.g. { name: "host.example.com" }
msg.payload   // object for write operations

msg.operation // create | read | update | delete (Host node)
msg.hostname  // name for read/delete (Host node)
msg.ref       // _ref for update/delete (Host node)
```

Examples:

```js
// Request: list A records by name
msg.resource = "record:a";
msg.query = { name: "host.example.com" };
return msg;
```

```js
// Request: create an A record
msg.method = "POST";
msg.resource = "record:a";
msg.payload = { name: "host.example.com", ipv4addr: "192.0.2.10" };
return msg;
```

```js
// Host: create a host record
msg.operation = "create";
msg.payload = { name: "host.example.com", ipv4addrs: [{ ipv4addr: "192.0.2.10" }] };
return msg;
```

```js
// Host: update by _ref
msg.operation = "update";
msg.ref = "record:host/ZG5zLmhvc3Qk...:host.example.com/default";
msg.payload = { comment: "updated via Node-RED" };
return msg;
```

---

## 📜 License

This project is licensed under the [AGPL-3.0-or-later](./LICENSE).

---

## 🤝 Contributing

Pull requests and issues are welcome!
Check out the [issues page](https://github.com/cappern/node-red-infoblox/issues).

