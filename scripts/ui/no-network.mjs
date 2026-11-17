// Loaded into the Studio server the UI harness starts (NODE_OPTIONS=--import):
// every outgoing connection to anything but this machine is refused and logged
// as "[no-network] blocked <host>". So no OpenAI, Google, Higgsfield, Topaz or
// any other real service can be reached from a harness run, whatever a screen
// asks for. The harness reads these lines and reports them.
import net from 'node:net';

const LOCAL = /^(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|::1|::ffff:127\.0\.0\.1|0\.0\.0\.0)$/i;

function hostOf(args) {
  const [a, b] = args;
  if (Array.isArray(a)) return hostOf(a);                       // internal normalised form
  if (a && typeof a === 'object') return a.path ? null : (a.host || a.hostname || 'localhost');
  if (typeof a === 'number' || (typeof a === 'string' && /^\d+$/.test(a))) return typeof b === 'string' ? b : 'localhost';
  return null;                                                    // a unix socket path
}

const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedConnect(...args) {
  const host = hostOf(args);
  if (host && !LOCAL.test(String(host).replace(/^\[|\]$/g, ''))) {
    process.stderr.write(`[no-network] blocked ${host}\n`);
    const error = Object.assign(new Error(`The UI harness allows no network access (${host}).`), { code: 'ECONNREFUSED' });
    process.nextTick(() => this.destroy(error));
    return this;
  }
  return connect.apply(this, args);
};
