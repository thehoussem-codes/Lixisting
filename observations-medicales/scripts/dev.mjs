// Lance le serveur API et le serveur de développement Vite en parallèle.
import { spawn } from 'node:child_process';
const opts = { stdio: 'inherit', shell: process.platform === 'win32' };
const api = spawn('node', ['--watch', '--disable-warning=ExperimentalWarning', 'server/index.ts'], opts);
const web = spawn('npx', ['vite'], opts);
const stop = () => { api.kill(); web.kill(); process.exit(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
