// generate_keys.js
const { mkdirSync, writeFileSync } = require('fs');
const { generateKeyPairSync } = require('crypto');
mkdirSync('keys', { recursive: true });

function gen(name){
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    writeFileSync(`keys/${name}_public.pem`, publicKey);
    writeFileSync(`keys/${name}_private.pem`, privateKey);
    console.log(`Generated keys for ${name}`);
}

gen('sender');
gen('receiver');
console.log('Done. Keys are in ./keys');
