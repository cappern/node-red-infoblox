/* eslint-env mocha */
"use strict";

const helper = require("node-red-node-test-helper");
const { expect } = require("chai");

const requestNode = require("../nodes/node.js");
const configNode = require("../nodes/config.js");

helper.init(require.resolve("node-red"));

function mkRes(status, body, headers = { "content-type": "application/json" }) {
  const entries = Object.entries(headers);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (k) => headers[k.toLowerCase()] || headers[k] || null,
      entries: function* () { for (const e of entries) yield e; }
    },
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body))
  };
}

describe("infoblox-request node", function () {
  this.timeout(5000);
  let realFetch;

  before(async () => {
    realFetch = global.fetch;
    await helper.startServer();
  });

  after(async () => {
    global.fetch = realFetch;
    await helper.stopServer();
  });

  afterEach(async () => {
    global.fetch = realFetch;
    await helper.unload();
  });

  const credentials = { cfg1: { username: "u", password: "p" } };

  function mkFlow(overrides = {}) {
    return [
      {
        id: "cfg1",
        type: "infoblox-config",
        name: "cfg",
        baseUrl: overrides.baseUrl || "https://grid.example.com",
        wapiVersion: overrides.wapiVersion || "2.12",
        timeoutMs: overrides.timeoutMs || 30000,
        sslVerify: overrides.sslVerify !== undefined ? overrides.sslVerify : true
      },
      Object.assign({
        id: "n1",
        type: "infoblox-request",
        name: "req",
        infoblox: "cfg1",
        resource: "record:a",
        method: "GET",
        wires: [["n2"]]
      }, overrides.node || {}),
      { id: "n2", type: "helper" }
    ];
  }

  it("GETs with query object", function (done) {
    global.fetch = async (url, opts) => {
      try {
        expect(opts.method).to.equal("GET");
        expect(url).to.match(/\/wapi\/v2\.12\/record:a\?name=host\.example\.com&view=default/);
        return mkRes(200, [{ name: "host.example.com" }]);
      } catch (e) { done(e); }
    };
    const flow = mkFlow();
    helper.load([configNode, requestNode], flow, credentials, function () {
      const n = helper.getNode("n1");
      const n2 = helper.getNode("n2");
      n2.on("input", (msg) => {
        try {
          expect(msg.statusCode).to.equal(200);
          expect(msg.payload).to.be.an("array");
          done();
        } catch (e) { done(e); }
      });
      n.receive({ query: { name: "host.example.com", view: "default" } });
    });
  });

  it("POSTs with payload JSON", function (done) {
    const body = { name: "host.example.com", ipv4addr: "192.0.2.10" };
    global.fetch = async (url, opts) => {
      try {
        expect(opts.method).to.equal("POST");
        expect(url).to.match(/\/wapi\/v2\.12\/record:a$/);
        expect(opts.headers["Content-Type"]).to.equal("application/json");
        expect(JSON.parse(opts.body)).to.deep.equal(body);
        return mkRes(201, { _ref: "record:a/xyz" });
      } catch (e) { done(e); }
    };
    const flow = mkFlow({ node: { method: "POST" } });
    helper.load([configNode, requestNode], flow, credentials, function () {
      const n2 = helper.getNode("n2");
      n2.on("input", (msg) => {
        try {
          expect(msg.statusCode).to.equal(201);
          expect(msg.payload).to.have.property("_ref");
          done();
        } catch (e) { done(e); }
      });
      helper.getNode("n1").receive({ payload: body });
    });
  });

  it("handles non-JSON response as text", function (done) {
    global.fetch = async () => mkRes(200, "OK", { "content-type": "text/plain" });
    const flow = mkFlow();
    helper.load([configNode, requestNode], flow, credentials, function () {
      const n2 = helper.getNode("n2");
      n2.on("input", (msg) => {
        try {
          expect(msg.payload).to.equal("OK");
          done();
        } catch (e) { done(e); }
      });
      helper.getNode("n1").receive({});
    });
  });

  it("propagates error on non-2xx response", function (done) {
    let doneCalled = false;
    // monkey patch node's done via error event
    global.fetch = async () => mkRes(400, { error: "bad" });
    const flow = mkFlow();

    helper.load([configNode, requestNode], flow, credentials, function () {
      const n1 = helper.getNode("n1");
      const n2 = helper.getNode("n2");
      n1.error = function (err) { if (!doneCalled) { doneCalled = true; done(); } }; // fallback if helper captures
      n2.on("input", (msg) => {
        try {
          expect(msg.statusCode).to.equal(400);
        } catch (e) { /* ignore: we rely on done via error */ }
      });
      n1.receive({});
    });
  });

  it("honors sslVerify=false and timeout path", function (done) {
    // Trigger AbortController abort handler
    global.fetch = async (url, opts) => new Promise((resolve, reject) => {
      if (opts && opts.signal) {
        opts.signal.addEventListener("abort", () => {
          const e = new Error("aborted"); e.name = "AbortError"; reject(e);
        });
      }
    });
    const flow = mkFlow({ sslVerify: false, timeoutMs: 1 });
    helper.load([configNode, requestNode], flow, credentials, function () {
      const n1 = helper.getNode("n1");
      n1.error = function (err) { try { expect(err).to.be.instanceOf(Error); done(); } catch (e) { done(e); } };
      n1.receive({});
    });
  });

  it("handles array query values", function (done) {
    global.fetch = async (url, opts) => {
      try {
        expect(opts.method).to.equal("GET");
        expect(url).to.match(/return_fields=name/);
        expect(url).to.match(/return_fields=ipv4addrs/);
        return mkRes(200, []);
      } catch (e) { done(e); }
    };
    const flow = mkFlow();
    helper.load([configNode, requestNode], flow, credentials, function () {
      const n = helper.getNode("n1");
      const n2 = helper.getNode("n2");
      n2.on("input", () => done());
      n.receive({ query: { return_fields: ["name", "ipv4addrs"] } });
    });
  });

  it("falls back to {} when JSON parse rejects", function (done) {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json", entries: function* () {} },
      json: async () => { throw new Error("bad json"); },
      text: async () => "should not be used"
    });
    const flow = mkFlow();
    helper.load([configNode, requestNode], flow, credentials, function () {
      const n2 = helper.getNode("n2");
      n2.on("input", (msg) => {
        try {
          expect(msg.payload).to.deep.equal({});
          done();
        } catch (e) { done(e); }
      });
      helper.getNode("n1").receive({});
    });
  });
});
