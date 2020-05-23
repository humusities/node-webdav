import { spawn } from "child_process";
import net from "net";
import http from "http";
import path from "path";

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

const createConfig = (root, port) => ({
  apps: {
    http: {
      servers: {
        srv0: {
          listen: [`:${port}`],
          routes: [
            {
              handle: [
                {
                  handler: "webdav",
                  root,
                },
              ],
              match: [{ path: ["/*"] }],
            },
          ],
        },
      },
    },
  },
});

export default (executable, root) =>
  portAvailable(2019)
    .then(async (available) => {
      if (available) await startCaddy(executable);
      else console.warn(":2019 in use, trying anyway...");
    })
    .then(() => portAvailable(undefined))
    .then((port) => {
      console.log(port);
      const config = JSON.stringify(createConfig(root, port));
      const options = {
        host: "localhost",
        port: 2019,
        path: "/load",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": config.length,
        },
      };
      return new Promise((resolve, reject) => {
        const req = http.request(options, (res) =>
          res.statusCode === 200
            ? resolve(port)
            : reject(new Error(`Status Code: ${res.statusCode}`))
        );
        req.on("error", reject);
        req.write(config);
        req.end();
      });
    })
    .then((port) => ({ port }));
