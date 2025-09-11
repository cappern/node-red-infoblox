"use strict";

const { Agent } = require("undici");

module.exports = function (RED) {
  function InfobloxHostNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.name = config.name;
    node.operation = (config.operation || "read").toLowerCase();
    node.hostname = config.hostname || ""; // used for read when no ref
    node.ref = config.ref || ""; // used for update/delete/read-by-ref
    node.infoblox = RED.nodes.getNode(config.infoblox);

    try { node.status({}); } catch (_) {}

    node.on("input", async (msg, send, done) => {
      const cfg = node.infoblox || (msg.infoblox && RED.nodes.getNode(msg.infoblox));
      if (!cfg) {
        node.status({ fill: "red", shape: "dot", text: "missing config" });
        return done(new Error("Infoblox config not set"));
      }
      const base = cfg.getBaseEndpoint && cfg.getBaseEndpoint();
      if (!base) {
        node.status({ fill: "red", shape: "dot", text: "invalid base url" });
        return done(new Error("Infoblox base URL not configured"));
      }
      if (!cfg.username || !cfg.password) {
        node.status({ fill: "red", shape: "dot", text: "missing credentials" });
        return done(new Error("Infoblox credentials not configured"));
      }

      const operation = (msg.operation || node.operation || "read").toLowerCase();
      const ref = (msg.ref || node.ref || "").replace(/^\/+/, "");
      const hostname = msg.hostname || node.hostname || "";

      let method = "GET";
      let url = base;
      let body;

      const appendQuery = (u, q) => {
        if (!q) return u;
        if (typeof q === "string") {
          const qs = q.startsWith("?") ? q : `?${q}`;
          return `${u}${qs}`;
        }
        if (typeof q === "object") {
          const params = new URLSearchParams();
          for (const [k, v] of Object.entries(q)) {
            if (Array.isArray(v)) v.forEach(val => params.append(k, String(val)));
            else if (v !== undefined && v !== null) params.set(k, String(v));
          }
          const qs = params.toString();
          return qs ? `${u}?${qs}` : u;
        }
        return u;
      };

      try {
        switch (operation) {
          case "create": {
            method = "POST";
            url = `${base}/record:host`;
            if (msg.payload === undefined || msg.payload === null) {
              node.status({ fill: "yellow", shape: "dot", text: "payload required" });
              return done(new Error("Create requires msg.payload with host fields"));
            }
            body = JSON.stringify(msg.payload);
            url = appendQuery(url, msg.query);
            break;
          }
          case "read": {
            method = "GET";
            if (ref) {
              url = `${base}/${ref}`;
              url = appendQuery(url, msg.query);
            } else {
              url = `${base}/record:host`;
              // Build query from msg.query and/or hostname
              if (msg.query) {
                if (typeof msg.query === "object") {
                  const qp = Object.assign({}, msg.query);
                  if (hostname && qp.name === undefined) qp.name = hostname;
                  url = appendQuery(url, qp);
                } else {
                  url = appendQuery(url, msg.query);
                }
              } else if (hostname) {
                url += `?name=${encodeURIComponent(hostname)}`;
              }
            }
            break;
          }
          case "update": {
            if (!ref) {
              node.status({ fill: "yellow", shape: "dot", text: "ref required" });
              return done(new Error("Update requires msg.ref (object reference)"));
            }
            method = (msg.method || "PUT").toUpperCase(); // allow PATCH when desired
            url = `${base}/${ref}`;
            if (msg.payload === undefined || msg.payload === null) {
              node.status({ fill: "yellow", shape: "dot", text: "payload required" });
              return done(new Error("Update requires msg.payload with fields to change"));
            }
            body = JSON.stringify(msg.payload);
            url = appendQuery(url, msg.query);
            break;
          }
          case "delete": {
            if (!ref) {
              node.status({ fill: "yellow", shape: "dot", text: "ref required" });
              return done(new Error("Delete requires msg.ref (object reference)"));
            }
            method = "DELETE";
            url = `${base}/${ref}`;
            url = appendQuery(url, msg.query);
            break;
          }
          default:
            node.status({ fill: "yellow", shape: "dot", text: "bad operation" });
            return done(new Error(`Unsupported operation: ${operation}`));
        }
      } catch (e) {
        node.status({ fill: "red", shape: "dot", text: "build error" });
        return done(e);
      }

      const headers = { "Accept": "application/json" };
      if (["POST", "PUT", "PATCH"].includes(method) && body !== undefined) {
        headers["Content-Type"] = "application/json";
      }
      headers["Authorization"] = "Basic " + Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64");

      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), Number(cfg.timeoutMs || 30000));

      const fetchOpts = { method, headers, body, signal: controller.signal };
      // TLS handling: prefer custom CA bundle; or disable verification if requested
      if (cfg) {
        const connect = {};
        if (cfg.caCert) connect.ca = cfg.caCert;
        if (cfg.sslVerify === false) connect.rejectUnauthorized = false;
        if (Object.keys(connect).length) fetchOpts.dispatcher = new Agent({ connect });
      }

      node.status({ fill: "blue", shape: "dot", text: `${method} host` });
      try {
        const res = await fetch(url, fetchOpts);
        clearTimeout(to);
        const ct = res.headers.get("content-type") || "";
        const isJson = ct.includes("application/json");
        const payload = isJson ? await res.json().catch(() => ({})) : await res.text();

        const headersObj = {};
        for (const [k, v] of res.headers.entries()) headersObj[k] = v;

        msg.statusCode = res.status;
        msg.headers = headersObj;
        msg.payload = payload;

        if (!res.ok) {
          node.status({ fill: "red", shape: "dot", text: `${res.status}` });
          send(msg);
          return done(new Error(`Infoblox error ${res.status}`));
        }

        node.status({ fill: "green", shape: "dot", text: `${res.status}` });
        send(msg);
        done();
      } catch (err) {
        clearTimeout(to);
        if (err && err.name === "AbortError") {
          node.status({ fill: "red", shape: "dot", text: "timeout" });
          return done(new Error("Request timed out"));
        }
        node.status({ fill: "red", shape: "dot", text: "error" });
        done(err);
      }
    });

    node.on("close", (done) => {
      try { node.status({}); } catch (_) {}
      done();
    });
  }

  RED.nodes.registerType("infoblox-host", InfobloxHostNode);
};
