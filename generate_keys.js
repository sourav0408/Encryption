const { mkdirSync, writeFileSync } = require('fs');
const { generateKeyPairSync } = require('crypto');

// Create keys directory
mkdirSync('keys', { recursive: true });

function gen(name){
    // Generate RSA key pair
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,              // Key size in bits
        publicKeyEncoding: {
            type: 'spki',                 // Standard public key format
            format: 'pem'                 // Text-based format
        },
        privateKeyEncoding: {
            type: 'pkcs8',                // Standard private key format
            format: 'pem'
        },
    });

    // Save keys to files
    writeFileSync(`keys/${name}_public.pem`, publicKey);
    writeFileSync(`keys/${name}_private.pem`, privateKey);
    console.log(`Generated keys for ${name}`);
}

// Generate keys for both parties
gen('sender');
gen('receiver');
console.log('Done. Keys are in ./keys');