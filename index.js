const tls = require('tls');
const WebSocket = require('ws');
const fs = require('fs');
const extractJsonFromString = require('extract-json-from-string');

const ben = ""; //token
const en = "";  //guıld
const cok = ""; //mfa fıle
const geceleriseverim = ; //pool

let mfaToken = null;
let lastMfaToken = null;  
let vanity = null;
const guilds = {};
const sessionCache = new Map();
const vanityRequestCache = new Map();

const tlsPool = [];

const Http = {
  root: Buffer.from(`PATCH /api/v7/guilds/${en}/vanity-url HTTP/1.1\r\n`),
  host: Buffer.from('Host: canary.discord.com\r\n'),
  auth: Buffer.from(`Authorization: ${ben}\r\n`),
  type: Buffer.from('Content-Type: application/json\r\n'),
  agent: Buffer.from('User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36\r\n'),
  super: Buffer.from('X-Super-Properties: eyJicm93c2VyIjoiRmlyZWZveCIsImJyb3dzZXJfdXNlcl9hZ2VudCI6IkZpcmVmb3gifQ==\r\n'),
  alive: Buffer.from('Connection: keep-alive\r\n'),
  crlf: Buffer.from('\r\n'),
  ping: Buffer.from('GET / HTTP/1.1\r\nHost: canary.discord.com\r\nConnection: keep-alive\r\n\r\n')
};

const TLS_OPTIONS = {
  host: "canary.discord.com",
  port: 443,
  minVersion: "TLSv1.3",
  maxVersion: "TLSv1.3",
  servername: "canary.discord.com",
  rejectUnauthorized: false,
  ALPNProtocols: ["http/1.1"],
  ciphers: "TLS_AES_128_GCM_SHA256",
  ecdhCurve: "X25519",
  honorCipherOrder: true,
  keepAlive: true,
};

class BufferPool {
  constructor(size, bufferSize) {
    this.pool = new Array(size);
    this.index = 0;
    
    for (let i = 0; i < size; i++) {
      this.pool[i] = Buffer.allocUnsafe(bufferSize);
    }
  }
  
  get() {
    const buf = this.pool[this.index];
    this.index = (this.index + 1) % this.pool.length;
    return buf;
  }
}

const requestPool = new BufferPool(100, 4096);

function buildVanityRequest(code) {
  if (vanityRequestCache.has(code)) return vanityRequestCache.get(code);
  
  const payloadStr = JSON.stringify({ code });
  const payloadBuf = Buffer.from(payloadStr);
  
  const packetParts = [
    Http.root,
    Http.host,
    Http.auth,
    mfaToken ? Buffer.from(`X-Discord-MFA-Authorization: ${mfaToken}\r\n`) : Buffer.alloc(0),
    Http.agent,
    Http.super,
    Http.type,
    Http.alive,
    Buffer.from(`Content-Length: ${payloadBuf.length}\r\n`),
    Http.crlf,
    payloadBuf
  ];

  const buf = requestPool.get();
  let cursor = 0;

  for (const part of packetParts) {
    if (part.length > 0) {
      part.copy(buf, cursor);
      cursor += part.length;
    }
  }
  
  const request = buf.slice(0, cursor);
  vanityRequestCache.set(code, request);
  return request;
}

function createTlsConnection(index) {
  const options = { ...TLS_OPTIONS };
  if (sessionCache.has('canary.discord.com')) {
    options.session = sessionCache.get('canary.discord.com');
  }
  
  const conn = tls.connect(options);
  
  conn.setNoDelay(true);
  conn.setKeepAlive(true, 0);
  
  conn.on("data", (data) => {
    try {
      const ext = extractJsonFromString(data.toString());
      if (!Array.isArray(ext)) return;
      
      const find = ext.find(e => e.code || e.message);
      if (find) {
        console.log(`response ${vanity}: ${JSON.stringify(find)}`);
      }
    } catch (e) {}
  });
  
  const cleanup = () => {
    if (tlsPool[index] === conn) {
      tlsPool[index] = null;
      setTimeout(() => {
        tlsPool[index] = createTlsConnection(index);
      }, 100);
    }
  };
  
  conn.on("error", cleanup);
  conn.on("close", cleanup);
  
  conn.on("secureConnect", () => {
  });
  
  conn.on("session", (session) => {
    sessionCache.set('canary.discord.com', session);
  });
  
  return conn;
}

function initializeConnectionPools() {
  for (let i = 0; i < geceleriseverim; i++) {
    tlsPool[i] = createTlsConnection(i);
  }
}

function keepConnectionsAlive() {
  for (let i = 0; i < geceleriseverim; i++) {
    const conn = tlsPool[i];
    if (conn && conn.writable) {
      conn.write(Http.ping);
    }
  }
}

async function loadMfaToken() {
  try {
    const content = await fs.promises.readFile(cok, 'utf8');
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1];
      const tokenPart = lastLine.split('|')[0].trim();
      
      if (tokenPart && tokenPart !== lastMfaToken) {
        lastMfaToken = tokenPart;
        mfaToken = tokenPart;
        console.log("mfa yuklendi");
        vanityRequestCache.clear();
      }
    }
  } catch (e) {}
}

function extremeSnipe(code) {
  vanity = code;
  
  const tlsRequest = buildVanityRequest(code);
  for (let i = 0; i < geceleriseverim; i++) {
    const conn = tlsPool[i];
    if (conn && conn.writable) {
      try {
        conn.write(tlsRequest);
      } catch (e) {}
    }
  }
}

function connectWebSocket() {
  const ws = new WebSocket("wss://gateway-us-east1-b.discord.gg", {
    perMessageDeflate: false,
    autoPong: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
    }
  });
  
  ws.on('open', () => {
    console.log("websocket connected");
    ws.send(JSON.stringify({
      op: 2,
      d: {
        token: ben,
        intents: 1,
        properties: {
          os: "Windows",
          browser: "Chrome",
          device: ""
        },
        guild_subscriptions: false,
        large_threshold: 0
      }
    }));
  });
  
  ws.on('message', (data) => {
    try {
      const payload = JSON.parse(data);
      const { op, t, d } = payload;
      
      if (op === 10) {
        const heartbeatInterval = d.heartbeat_interval;
        setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ op: 1, d: null }));
          }
        }, heartbeatInterval);
      } 
      else if (op === 0) {
        if (t === "READY") {
          if (d && d.guilds) {
            const vanityGuilds = d.guilds.filter(g => g.vanity_url_code);
            for (const guild of vanityGuilds) {
              guilds[guild.id] = guild.vanity_url_code;
            }
          }
        }
        else if (t === "GUILD_UPDATE") {
          const find = guilds[d.guild_id];
          if (find && find !== d.vanity_url_code) {
            vanity = find;
            extremeSnipe(find);
            
            if (d.vanity_url_code) {
              guilds[d.guild_id] = d.vanity_url_code;
            } else {
              delete guilds[d.guild_id];
            }
          }
        }
      }
    } catch (e) {}
  });
  
  ws.on('close', () => {
    console.log("ws reconnecting");
    setTimeout(connectWebSocket, 1000);
  });
  
  ws.on('error', (err) => {
    console.error("ws err", err.message);
    ws.close();
  });
}

async function initialize() {
  await loadMfaToken();
  initializeConnectionPools();
  connectWebSocket();
  
  setInterval(keepConnectionsAlive, 1500);
  setInterval(loadMfaToken, 10000);
}

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

process.title = "slmslm";

initialize();
