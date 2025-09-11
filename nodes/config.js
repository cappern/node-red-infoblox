"use strict";

module.exports = function (RED) {
  function InfobloxConfigNode(config) {
    RED.nodes.createNode(this, config);
    this.name = config.name;
    this.baseUrl = (config.baseUrl || "").replace(/\/$/, "");
    this.wapiVersion = config.wapiVersion || "2.12";
    this.timeoutMs = Number(config.timeoutMs || 30000);
    this.sslVerify = config.sslVerify !== false; // default true

    // Credentials are stored separately
    this.username = this.credentials && this.credentials.username;
    this.password = this.credentials && this.credentials.password;
    this.caCert = this.credentials && this.credentials.caCert;

    this.getBaseEndpoint = function () {
      if (!this.baseUrl) return null;
      return `${this.baseUrl}/wapi/v${this.wapiVersion}`;
    };
  }

  RED.nodes.registerType("infoblox-config", InfobloxConfigNode, {
    credentials: {
      username: { type: "text" },
      password: { type: "password" },
      caCert: { type: "text" }
    }
  });
};
