"use strict";

const { Agent } = require("undici");

module.exports = function (RED) {
  function InfobloxRequestNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.name = config.name;
    node.resource = config.resource || "";
    node.method = (config.method || "GET").toUpperCase();
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

      const resource = (msg.resource || node.resource || "").replace(/^\/+/, "");
      if (!resource) {
        node.status({ fill: "yellow", shape: "dot", text: "set resource" });
        return done(new Error("Resource (e.g. 'record:a') is required"));
      }

      const method = (msg.method || node.method || "GET").toUpperCase();

      // Build URL
      let url = `${base}/${resource}`;
      if (msg.query) {
        if (typeof msg.query === "string") {
          const q = msg.query.startsWith("?") ? msg.query.substring(1) : msg.query;
          url += `?${q}`;
        } else if (typeof msg.query === "object") {
          const params = new URLSearchParams();
          for (const [k, v] of Object.entries(msg.query)) {
            if (Array.isArray(v)) v.forEach(val => params.append(k, String(val)));
            else if (v !== undefined && v !== null) params.set(k, String(v));
          }
          const qs = params.toString();
          if (qs) url += `?${qs}`;
        }
      }

      const headers = {
        "Accept": "application/json",
      };

      let body;
      if (["POST", "PUT", "PATCH"].includes(method)) {
        if (msg.payload !== undefined) {
          headers["Content-Type"] = "application/json";
          body = JSON.stringify(msg.payload);
        }
      }

      headers["Authorization"] = "Basic " + Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64");

      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), Number(cfg.timeoutMs || 30000));

      const fetchOpts = {
        method,
        headers,
        body,
        signal: controller.signal,
      };
      // TLS handling: prefer custom CA; otherwise allow disabling verification for labs
      if (cfg) {
        const connect = {};
        if (cfg.caCert) connect.ca = cfg.caCert;
        if (cfg.sslVerify === false) connect.rejectUnauthorized = false;
        if (Object.keys(connect).length) {
          fetchOpts.dispatcher = new Agent({ connect });
        }
      }

      node.status({ fill: "blue", shape: "dot", text: `${method} ${resource}` });
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

  RED.nodes.registerType("infoblox-request", InfobloxRequestNode);
};
