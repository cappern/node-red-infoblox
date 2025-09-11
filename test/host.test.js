/* eslint-env mocha */
"use strict";

const helper = require("node-red-node-test-helper");
const { expect } = require("chai");

const hostNode = require("../nodes/host.js");
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

describe("infoblox-host node", function () {
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

  function baseFlow(overrides = {}) {
    return [
      {
        id: "cfg1",
        type: "infoblox-config",
        name: "cfg",
        baseUrl: "https://grid.example.com",
        wapiVersion: "2.12",
        timeoutMs: 30000,
        sslVerify: true
      },
      Object.assign({
        id: "host1",
        type: "infoblox-host",
        name: "host",
        infoblox: "cfg1",
        wires: [["n2"]]
      }, overrides),
      { id: "n2", type: "helper" }
    ];
  }

  const credentials = { cfg1: { username: "user", password: "pass" } };

  it("creates host via POST /record:host", function (done) {
    const payload = { name: "host.example.com", ipv4addrs: [{ ipv4addr: "192.0.2.10" }] };
    const response = { _ref: "record:host/ZG5zLmhvc3QkLmEuLi4:" };

    global.fetch = async (url, opts) => {
      try {
        expect(url).to.match(/\/wapi\/v2\.12\/record:host$/);
        expect(opts.method).to.equal("POST");
        expect(opts.headers["Accept"]).to.equal("application/json");
        expect(opts.headers["Content-Type"]).to.equal("application/json");
        const auth = opts.headers["Authorization"] || opts.headers["authorization"];
        expect(auth).to.equal("Basic " + Buffer.from("user:pass").toString("base64"));
        expect(JSON.parse(opts.body)).to.deep.equal(payload);
        return mkRes(201, response);
      } catch (e) {
        done(e);
      }
    };

    const flow = baseFlow({ operation: "create" });
    helper.load([configNode, hostNode], flow, credentials, function () {
      const n2 = helper.getNode("n2");
      n2.on("input", function (msg) {
        try {
          expect(msg.statusCode).to.equal(201);
          expect(msg.payload).to.deep.equal(response);
          done();
        } catch (e) { done(e); }
      });
      const n = helper.getNode("host1");
      n.receive({ payload });
    });
  });

  it("reads host by name via GET /record:host?name=...", function (done) {
    const list = [{ name: "host.example.com", _ref: "record:host/abc" }];
    global.fetch = async (url, opts) => {
      try {
        expect(opts.method).to.equal("GET");
        expect(url).to.match(/\/wapi\/v2\.12\/record:host\?name=host\.example\.com/);
        return mkRes(200, list);
      } catch (e) { done(e); }
    };
    const flow = baseFlow({ operation: "read", hostname: "host.example.com" });
    helper.load([configNode, hostNode], flow, credentials, function () {
      const n2 = helper.getNode("n2");
      n2.on("input", function (msg) {
        try {
          expect(msg.statusCode).to.equal(200);
          expect(msg.payload).to.deep.equal(list);
          done();
        } catch (e) { done(e); }
      });
      const n = helper.getNode("host1");
      n.receive({});
    });
  });

  it("reads host by _ref via GET /{_ref}", function (done) {
    const body = { name: "host.example.com", _ref: "record:host/abc" };
    global.fetch = async (url, opts) => {
      try {
        expect(opts.method).to.equal("GET");
        expect(url).to.match(/\/wapi\/v2\.12\/record:host\/abc$/);
        return mkRes(200, body);
      } catch (e) { done(e); }
    };
    const flow = baseFlow({ operation: "read", ref: "record:host/abc" });
    helper.load([configNode, hostNode], flow, credentials, function () {
      const n2 = helper.getNode("n2");
      n2.on("input", function (msg) {
        try {
          expect(msg.payload).to.deep.equal(body);
          done();
        } catch (e) { done(e); }
      });
      const n = helper.getNode("host1");
      n.receive({});
    });
  });

  it("updates host via PUT /{_ref}", function (done) {
    const patch = { comment: "updated" };
    const ref = "record:host/abc";
    global.fetch = async (url, opts) => {
      try {
        expect(opts.method).to.equal("PUT");
        expect(url).to.match(/\/wapi\/v2\.12\/record:host\/abc$/);
        expect(JSON.parse(opts.body)).to.deep.equal(patch);
        return mkRes(200, { _ref: ref, result: "OK" });
      } catch (e) { done(e); }
    };
    const flow = baseFlow({ operation: "update", ref });
    helper.load([configNode, hostNode], flow, credentials, function () {
      const n2 = helper.getNode("n2");
      n2.on("input", function (msg) {
        try {
          expect(msg.statusCode).to.equal(200);
          expect(msg.payload).to.have.property("_ref", ref);
          done();
        } catch (e) { done(e); }
      });
      const n = helper.getNode("host1");
      n.receive({ payload: patch });
    });
  });

  it("deletes host via DELETE /{_ref}", function (done) {
    global.fetch = async (url, opts) => {
      try {
        expect(opts.method).to.equal("DELETE");
        expect(url).to.match(/\/wapi\/v2\.12\/record:host\/deadbeef$/);
        return mkRes(200, "record:host/deadbeef");
      } catch (e) { done(e); }
    };
    const flow = baseFlow({ operation: "delete", ref: "record:host/deadbeef" });
    helper.load([configNode, hostNode], flow, credentials, function () {
      const n2 = helper.getNode("n2");
      n2.on("input", function (msg) {
        try {
          expect(msg.statusCode).to.equal(200);
          expect(msg.payload).to.be.a("string");
          done();
        } catch (e) { done(e); }
      });
      const n = helper.getNode("host1");
      n.receive({});
    });
  });

  it("appends array query params for read", function (done) {
    global.fetch = async (url, opts) => {
      try {
        expect(opts.method).to.equal("GET");
        expect(url).to.match(/\/wapi\/v2\.12\/record:host\?/);
        expect(url).to.include("return_fields=name");
        expect(url).to.include("return_fields=ipv4addrs");
        return mkRes(200, []);
      } catch (e) { done(e); }
    };
    const flow = baseFlow({ operation: "read" });
    helper.load([configNode, hostNode], flow, credentials, function () {
      const n = helper.getNode("host1");
      const n2 = helper.getNode("n2");
      n2.on("input", function () { done(); });
      n.receive({ query: { return_fields: ["name", "ipv4addrs"] } });
    });
  });

  it("falls back to {} when JSON parsing fails", function (done) {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json", entries: function* () {} },
      json: async () => { throw new Error("bad json"); },
      text: async () => "should not be used"
    });
    const flow = baseFlow({ operation: "read", ref: "record:host/abc" });
    helper.load([configNode, hostNode], flow, credentials, function () {
      const n2 = helper.getNode("n2");
      n2.on("input", function (msg) {
        try {
          expect(msg.payload).to.deep.equal({});
          done();
        } catch (e) { done(e); }
      });
      helper.getNode("host1").receive({});
    });
  });

  it("times out via AbortController", function (done) {
    global.fetch = async (url, opts) => new Promise((resolve, reject) => {
      if (opts && opts.signal) {
        opts.signal.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      }
      // never resolve; rely on abort
    });
    const flow = baseFlow({ operation: "read" });
    flow[0].timeoutMs = 5;
    helper.load([configNode, hostNode], flow, credentials, function () {
      const n1 = helper.getNode("host1");
      n1.error = function (err) { try { expect(err).to.be.instanceOf(Error); done(); } catch (e) { done(e); } };
      n1.receive({});
    });
  });
});
