import { spawn } from "child_process";
import net from "net";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { platform } from "os";

const portAvailable = (port) =>
  new Promise((resolve) => {
    const options = { port, host: "localhost" };
    const s = net.createServer().unref();
    s.on("error", () => resolve(false)).listen(options, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

const safe = (child) => {
  [
    "beforeExit",
    "exit",
    "SIGINT",
    "SIGUSR1",
    "SIGUSR2",
    "uncaughtException",
  ].forEach((event) =>
    process.on(event, (err) => {
      console.error(err);
      child.kill();
      process.exit();
    })
  );
  return child;
};

const checkStarted = (chunk) => {
  try {
    return chunk
      .toString()
      .split("\n")
      .filter((v) => v)
      .map(JSON.parse)
      .some(({ msg }) => msg === "admin endpoint started");
  } catch {}
};

const startCaddy = (executable) => {
  const caddy = safe(spawn(path.join(executable, "caddy"), ["run"]));

  return new Promise((resolve, reject) => {
    caddy.stderr.on("data", function startListener(chunk) {
      const id = setTimeout(() => reject("Listen Caddy start timeout"), 10000);
      if (checkStarted(chunk)) resolve(clearTimeout(id));
      this.removeListener("data", startListener);
    });
  });
};

const createWebdavConfig = (root, port) => ({
  listen: [`:${port}`],
  routes: [
    {
      handle: [
        {
          handler: "headers",
          response: {
            deferred: true,
            set: {
              "Access-Control-Allow-Origin": ["*"],
            },
          },
        },
        {
          handler: "webdav",
          root,
        },
      ],
      match: [{ path: ["/*"] }],
    },
  ],
});

const createConfig = (servers) => ({
  apps: {
    http: {
      servers,
    },
  },
});

const postConfig = (config) => {
  const strConfig = JSON.stringify(config);
  const options = {
    host: "localhost",
    port: 2019,
    path: "/load",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": strConfig.length,
    },
  };
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) =>
      res.statusCode === 200
        ? resolve(true)
        : reject(new Error(`Status Code: ${res.statusCode}`))
    );
    req.on("error", reject);
    req.write(strConfig);
    req.end();
  });
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export default (
  root,
  executableDir = path.join(__dirname, "bin", platform())
) =>
  portAvailable(2019)
    .then(async (available) => {
      if (available) await startCaddy(executableDir);
      else console.warn(":2019 in use, trying anyway...");
    })
    .then(() => portAvailable(undefined))
    .then((port) => {
      postConfig(createConfig({ srv0: createWebdavConfig(root, port) }));
      return port;
    })
    .then((port, host = "localhost") => ({
      host,
      port,
      url: `http://${host}:${port}`,
      destroy: () => {
        postConfig(createConfig());
      },
    }));
