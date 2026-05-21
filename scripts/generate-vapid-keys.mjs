import { createRequire } from 'node:module';

const require = createRequire(new URL('../packages/backend/package.json', import.meta.url));
const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();

console.log('VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
console.log('VITE_VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_SUBJECT=mailto:seu-email@exemplo.com');
