import { execFileSync } from 'node:child_process';

// Node disables RSA_PKCS1_PADDING *private* decryption by default (CVE-2023-46809,
// the Marvin attack). Airtel still decrypts PKCS1 on their side, and our
// encryptPin only does *public* encryption (unaffected). To verify the round-trip
// in a test without weakening the whole test runner, decrypt in a throwaway
// subprocess started with the security revert flag. The plaintext is base64'd so
// the revert flag's warning output can't corrupt it.
export function pkcs1Decrypt(ciphertextB64: string, privateKeyDerB64: string): string {
  const script =
    "const {privateDecrypt,createPrivateKey,constants}=require('crypto');" +
    "const key=createPrivateKey({key:Buffer.from(process.env.PK,'base64'),format:'der',type:'pkcs8'});" +
    "const pt=privateDecrypt({key,padding:constants.RSA_PKCS1_PADDING},Buffer.from(process.env.CT,'base64'));" +
    "process.stdout.write('B64:'+pt.toString('base64')+':B64');";
  const out = execFileSync(process.execPath, ['--security-revert=CVE-2023-46809', '-e', script], {
    env: { ...process.env, CT: ciphertextB64, PK: privateKeyDerB64 },
  }).toString();
  const m = /B64:([A-Za-z0-9+/=]*):B64/.exec(out);
  if (!m) throw new Error('pkcs1Decrypt: no result marker in subprocess output');
  return Buffer.from(m[1], 'base64').toString('utf8');
}
