import { SignJWT, exportJWK, importJWK, generateKeyPair } from 'jose';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { storage } from '../storage';

let rsaKeyPair: { publicKey: CryptoKey; privateKey: CryptoKey } | null = null;
let jwks: { keys: any[] } | null = null;

export async function initializeOAuthKeys() {
  if (!rsaKeyPair) {
    // Try to load existing keys from database
    const savedPrivateKey = await storage.getSetting('oauth_rsa_private_key');
    const savedPublicKey = await storage.getSetting('oauth_rsa_public_key');
    
    if (savedPrivateKey && savedPublicKey) {
      // Import existing keys
      const privateKeyJWK = JSON.parse(savedPrivateKey);
      const publicKeyJWK = JSON.parse(savedPublicKey);
      
      rsaKeyPair = {
        privateKey: await importJWK(privateKeyJWK, 'RS256'),
        publicKey: await importJWK(publicKeyJWK, 'RS256')
      };
      
      jwks = {
        keys: [
          {
            ...publicKeyJWK,
            kid: 'neonvideo-oauth-key-1',
            use: 'sig',
            alg: 'RS256',
          },
        ],
      };
      
      console.log('OAuth: Loaded existing RSA key pair from database');
    } else {
      // Generate new keys
      rsaKeyPair = await generateKeyPair('RS256', { extractable: true });
      
      const publicJWK = await exportJWK(rsaKeyPair.publicKey);
      const privateJWK = await exportJWK(rsaKeyPair.privateKey);
      
      // Save keys to database
      await storage.setSetting('oauth_rsa_private_key', JSON.stringify(privateJWK), true);
      await storage.setSetting('oauth_rsa_public_key', JSON.stringify(publicJWK), false);
      
      jwks = {
        keys: [
          {
            ...publicJWK,
            kid: 'neonvideo-oauth-key-1',
            use: 'sig',
            alg: 'RS256',
          },
        ],
      };
      
      console.log('OAuth: Generated and saved new RSA key pair to database');
    }
  }
  
  return rsaKeyPair;
}

export async function getJWKS() {
  if (!jwks) {
    await initializeOAuthKeys();
  }
  return jwks;
}

export async function generateOAuthAccessToken(
  userId: string,
  clientId: string,
  scopes: string[],
  expiresInSeconds: number = 3600
): Promise<string> {
  const keys = await initializeOAuthKeys();
  
  const token = await new SignJWT({
    sub: userId,
    client_id: clientId,
    scope: scopes.join(' '),
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'neonvideo-oauth-key-1' })
    .setIssuedAt()
    .setIssuer('https://neonvideo.ai')
    .setAudience('https://neonvideo.ai')
    .setExpirationTime(`${expiresInSeconds}s`)
    .setJti(nanoid())
    .sign(keys.privateKey);

  return token;
}

export function verifyPKCE(codeVerifier: string, codeChallenge: string, method: string = 'S256'): boolean {
  if (method !== 'S256') {
    return false;
  }
  
  const hash = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return hash === codeChallenge;
}

export function generateClientCredentials() {
  return {
    clientId: `neon_${nanoid(32)}`,
    clientSecret: `secret_${nanoid(48)}`,
  };
}

export function generateAuthorizationCode() {
  return `auth_${nanoid(64)}`;
}
