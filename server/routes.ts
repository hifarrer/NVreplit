import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { spawn } from "child_process";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { insertProjectSchema, insertGenerationLogSchema, insertUserSchema, insertSavedCharacterSchema, insertPlanSchema, insertReferralSchema, type Plan, type InsertPlan } from "@shared/schema";
import { z } from "zod";
import { generateLyrics, generateLyricsWithTitle, generateScenePrompts, splitLyricsIntoSections, openai } from "./services/openai";
import { ObjectStorageService, objectStorageClient } from "./objectStorage";
import { generateSongWithElevenLabs } from "./services/elevenlabs";
import { generateSong as generateSongWithKie, getTimestampedLyrics, convertTimestampedLyricsToASS, storeSubtitleFile } from "./services/kie";
import { nanoid } from "nanoid";
import { createForcedAlignment, convertElevenLabsAlignmentToASS, storeElevenLabsSubtitleFile } from "./services/elevenlabs";
import { generateCharacterImage, generateCharacterImages, generateSceneImages, generateSingleSceneImage } from "./services/fal";
import { generateAllVideoSegments, generateAllVideoSegmentsDynamic } from "./services/wavespeed";
import { splitAudio, mergeVideos, pictureInPicture, getWatermarkUrl } from "./services/ffmpeg";
import { VideoQueueService } from "./services/videoQueue";
import { downloadAndStoreImage } from "./services/imageStorage";
import { emailService } from "./services/email";
import { createMuxAssetForVideo } from "./services/muxJobs";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { checkProfanity, getCategoryMessage } from "./profanity-filter";
import { getJWKS, initializeOAuthKeys } from "./services/oauth";

// Configure multer for audio uploads
const uploadDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const audioUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req: any, file: any, cb: any) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, `audio-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req: any, file: any, cb: any) => {
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/aac', 'audio/mp3'];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(mp3|wav|aac)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP3, WAV, and AAC files are allowed.'));
    }
  }
});

// Configure multer for image uploads (memory storage for object storage)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

// Initialize ObjectStorageService
const objectStorage = new ObjectStorageService();

const JWT_SECRET = process.env.JWT_SECRET || "music-video-maker-secret-key";

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/api/auth/google/callback";

// Initialize video queue service
const videoQueueService = new VideoQueueService();

// Initialize admin credentials in database if they don't exist
async function initializeAdminCredentials() {
  try {
    const adminUsername = await storage.getSetting('admin_username');
    const adminPassword = await storage.getSetting('admin_password');
    
    if (!adminUsername) {
      await storage.setSetting('admin_username', 'admin', false);
      console.log('✅ Admin username initialized');
    }
    
    if (!adminPassword) {
      // Hash the default password
      const hashedPassword = await bcrypt.hash('password123', 10);
      await storage.setSetting('admin_password', hashedPassword, true);
      
      // Verify the exact password hash was saved correctly
      const savedPassword = await storage.getSetting('admin_password');
      if (savedPassword !== hashedPassword) {
        console.error('❌ Password initialization verification failed - hash mismatch');
        console.error(`Expected: ${hashedPassword.substring(0, 20)}...`);
        console.error(`Got: ${savedPassword?.substring(0, 20) || 'null'}...`);
        throw new Error('Admin password write verification failed - hash mismatch');
      }
      
      console.log('⚠️  Admin credentials initialized with default password (admin/password123)');
      console.log('⚠️  Please change the admin password immediately via the admin dashboard!');
    }
  } catch (error) {
    console.error('❌ Critical error initializing admin credentials:', error);
    throw error; // Re-throw to be caught by the outer catch
  }
}

// Call initialization (async, doesn't block server start)
initializeAdminCredentials().catch(err => {
  console.error('❌ FATAL: Failed to initialize admin credentials:', err);
  console.error('❌ Admin login may not work until credentials are manually configured in the database');
});

// Middleware to verify JWT token or OAuth access token
function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  // Try JWT verification first (for existing users)
  jwt.verify(token, JWT_SECRET, async (err: any, user: any) => {
    if (!err) {
      // Valid JWT token
      // Check if user is banned
      try {
        const userRecord = await storage.getUser(user.userId);
        if (userRecord) {
          const isBanned = await storage.isEmailBanned(userRecord.email);
          if (isBanned) {
            return res.status(403).json({ 
              error: 'This account has been suspended, please reach out to support@neonvideo.ai if you think this is a mistake' 
            });
          }
        }
      } catch (banCheckError) {
        console.error('Error checking ban status:', banCheckError);
      }
      
      req.user = user;
      return next();
    }

    // JWT failed, try OAuth access token
    try {
      const oauthToken = await storage.getOauthAccessToken(token);
      
      if (!oauthToken) {
        return res.status(403).json({ error: 'Invalid or expired token' });
      }

      // Check if token has expired
      if (new Date() > oauthToken.expiresAt) {
        await storage.deleteExpiredOauthTokens();
        return res.status(403).json({ error: 'Token has expired' });
      }

      // Check if user is banned
      try {
        const userRecord = await storage.getUser(oauthToken.userId);
        if (userRecord) {
          const isBanned = await storage.isEmailBanned(userRecord.email);
          if (isBanned) {
            return res.status(403).json({ 
              error: 'This account has been suspended, please reach out to support@neonvideo.ai if you think this is a mistake' 
            });
          }
        }
      } catch (banCheckError) {
        console.error('Error checking ban status:', banCheckError);
      }

      // Valid OAuth token - set user from token data
      req.user = { 
        userId: oauthToken.userId,
        clientId: oauthToken.clientId,
        scopes: oauthToken.scopes,
        isOAuth: true
      };
      next();
    } catch (oauthError) {
      console.error('OAuth token verification error:', oauthError);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
  });
}

// Middleware to verify admin JWT token
function authenticateAdmin(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    
    // Check if this is an admin token
    if (!decoded.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.admin = decoded;
    next();
  });
}

// Configure Google OAuth Strategy
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          console.log("Google OAuth profile:", profile);
          
          // Check if user exists by Google ID or email
          let user = await storage.getUserByGoogleId(profile.id);
          
          if (!user && profile.emails && profile.emails[0]) {
            // If no user found by Google ID, check by email
            user = await storage.getUserByEmail(profile.emails[0].value);
            
            if (user) {
              // Link existing account with Google ID
              await storage.updateUserGoogleId(user.id, profile.id);
              
              // If user doesn't have a plan assigned, assign Free plan - CRITICAL FIX
              if (!user.planId) {
                const freePlan = await storage.getFreePlan();
                if (!freePlan) {
                  console.error("CRITICAL: Free plan not found for existing user!");
                  return done(new Error("System configuration error"), false);
                }
                await storage.updateUser(user.id, { 
                  planId: freePlan.id, 
                  creditsUsed: user.creditsUsed || 0 
                });
                user.planId = freePlan.id;
                user.creditsUsed = user.creditsUsed || 0;
              }
            }
          }
          
          if (!user) {
            // Create new user
            const email = profile.emails?.[0]?.value || '';
            const username = profile.displayName || `user_${profile.id}`;
            
            // Generate a unique username if it already exists
            let finalUsername = username;
            let counter = 1;
            while (await storage.getUserByUsername(finalUsername)) {
              finalUsername = `${username}_${counter}`;
              counter++;
            }
            
            // Get the free plan to assign to new OAuth users - CRITICAL: must assign free plan
            const freePlan = await storage.getFreePlan();
            if (!freePlan) {
              console.error("CRITICAL: Free plan not found for Google OAuth user!");
              return done(new Error("System configuration error"), false);
            }
            
            user = await storage.createUser({
              username: finalUsername,
              email,
              password: crypto.randomBytes(32).toString('hex'), // Random password for OAuth users
              avatarUrl: profile.photos?.[0]?.value || "/public-objects/public/avatars/anonymous.png",
              googleId: profile.id,
              emailVerified: true, // Google OAuth users are considered verified
              planId: freePlan.id, // ALWAYS assign free plan - guaranteed to exist
              creditsUsed: 0 // Initialize credits usage
            });
          }
          
          return done(null, user);
        } catch (error) {
          console.error("Google OAuth error:", error);
          return done(error, false);
        }
      }
    )
  );
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize Passport
  app.use(passport.initialize());
  
  // Initialize OAuth keys on startup
  await initializeOAuthKeys();

  // OAuth 2.1 Well-Known Discovery Endpoints
  app.get("/.well-known/oauth-protected-resource", (req, res) => {
    const baseUrl = process.env.FRONTEND_URL || 'https://neonvideo.ai';
    res.json({
      resource: `${baseUrl}/api/neon-single-prompt`,
      authorization_servers: [`${baseUrl}`],
      scopes_supported: ["neonvideo.app", "neon:video:create", "neon:video:read"],
      bearer_methods_supported: ["header"]
    });
  });

  app.get("/.well-known/openid-configuration", (req, res) => {
    const baseUrl = process.env.FRONTEND_URL || 'https://neonvideo.ai';
    res.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      registration_endpoint: `${baseUrl}/oauth/register`,
      jwks_uri: `${baseUrl}/.well-known/jwks.json`,
      scopes_supported: ["neonvideo.app", "neon:video:create", "neon:video:read"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      subject_types_supported: ["public"]
    });
  });

  app.get("/.well-known/jwks.json", async (req, res) => {
    const jwks = await getJWKS();
    res.json(jwks);
  });

  // OAuth 2.1 Dynamic Client Registration
  // Handle CORS preflight for OAuth registration
  app.options("/oauth/register", (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.sendStatus(204);
  });
  
  app.post("/oauth/register", async (req, res) => {
    // Set CORS headers
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    
    console.log("📝 OAuth Dynamic Client Registration Request:");
    console.log("  Headers:", JSON.stringify(req.headers, null, 2));
    console.log("  Body:", JSON.stringify(req.body, null, 2));
    
    try {
      const { client_name, redirect_uris, scopes } = req.body;

      if (!client_name || !redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
        console.log("❌ OAuth registration failed: Missing required parameters");
        return res.status(400).json({ 
          error: "invalid_request",
          error_description: "client_name and redirect_uris (array) are required" 
        });
      }

      // Validate redirect URIs (must be HTTPS in production)
      const baseUrl = process.env.FRONTEND_URL || 'https://neonvideo.ai';
      const isProduction = baseUrl.startsWith('https://');
      
      for (const uri of redirect_uris) {
        if (isProduction && !uri.startsWith('https://')) {
          return res.status(400).json({ 
            error: "invalid_redirect_uri",
            error_description: "Redirect URIs must use HTTPS in production" 
          });
        }
      }

      // Import generateClientCredentials from oauth service
      const { generateClientCredentials } = await import("./services/oauth");
      const { clientId, clientSecret } = generateClientCredentials();

      const allowedScopes = scopes && Array.isArray(scopes) 
        ? scopes.filter((s: string) => ["neonvideo.app", "neon:video:create", "neon:video:read"].includes(s))
        : ["neonvideo.app", "neon:video:create", "neon:video:read"];

      await storage.createOauthClient({
        clientId,
        clientSecret,
        clientName: client_name,
        redirectUris: redirect_uris,
        scopes: allowedScopes
      });

      console.log(`✅ OAuth client registered successfully: ${clientId} (${client_name})`);
      console.log(`   Redirect URIs: ${JSON.stringify(redirect_uris)}`);
      console.log(`   Scopes: ${JSON.stringify(allowedScopes)}`);

      const response = {
        client_id: clientId,
        client_secret: clientSecret,
        client_name,
        redirect_uris,
        scopes: allowedScopes,
        token_endpoint_auth_method: "none"
      };
      
      console.log("📤 Sending registration response:", JSON.stringify(response, null, 2));
      res.status(201).json(response);
    } catch (error) {
      console.error("❌ OAuth client registration error:", error);
      res.status(500).json({ error: "server_error", error_description: "Failed to register client" });
    }
  });

  // OAuth 2.1 Authorization Endpoint (API - requires JWT token)
  app.post("/oauth/authorize", authenticateToken, async (req: any, res) => {
    try {
      const { client_id, redirect_uri, state, code_challenge, code_challenge_method, scope } = req.body;

      if (!client_id || !redirect_uri || !code_challenge || !code_challenge_method) {
        return res.status(400).json({ error: "Missing required parameters: client_id, redirect_uri, code_challenge, code_challenge_method" });
      }

      if (code_challenge_method !== 'S256') {
        return res.status(400).json({ error: "Only S256 code_challenge_method is supported" });
      }

      // Verify client exists
      const client = await storage.getOauthClient(client_id as string);
      if (!client) {
        return res.status(400).json({ error: "Invalid client_id" });
      }

      // Verify redirect_uri is registered
      if (!client.redirectUris.includes(redirect_uri as string)) {
        return res.status(400).json({ error: "Invalid redirect_uri" });
      }

      const requestedScopes = scope ? (scope as string).split(' ') : client.scopes;
      const allowedScopes = requestedScopes.filter(s => client.scopes.includes(s));

      // Generate authorization code
      const { generateAuthorizationCode } = await import("./services/oauth");
      const authCode = generateAuthorizationCode();
      
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await storage.createOauthAuthorizationCode({
        code: authCode,
        clientId: client_id as string,
        userId: req.user.userId,
        redirectUri: redirect_uri as string,
        scopes: allowedScopes,
        codeChallenge: code_challenge as string,
        codeChallengeMethod: code_challenge_method as string,
        expiresAt
      });

      // Return the authorization code and redirect URL
      const redirectUrl = new URL(redirect_uri as string);
      redirectUrl.searchParams.append('code', authCode);
      if (state) {
        redirectUrl.searchParams.append('state', state as string);
      }

      res.json({ 
        redirect_url: redirectUrl.toString(),
        code: authCode
      });
    } catch (error) {
      console.error("OAuth authorize error:", error);
      res.status(500).json({ error: "Authorization failed" });
    }
  });

  // OAuth 2.1 Authorization Page (GET - for browser navigation)
  app.get("/oauth/authorize", async (req: any, res) => {
    try {
      const { client_id, redirect_uri, state, code_challenge, code_challenge_method, scope } = req.query;

      if (!client_id || !redirect_uri || !code_challenge || !code_challenge_method) {
        return res.status(400).send("Missing required parameters: client_id, redirect_uri, code_challenge, code_challenge_method");
      }

      // Verify client exists
      const client = await storage.getOauthClient(client_id as string);
      if (!client) {
        return res.status(400).send("Invalid client_id");
      }

      // Serve an HTML page that will handle the authorization with JWT token
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authorize ${client.clientName}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .container {
              background: white;
              padding: 2rem;
              border-radius: 8px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              max-width: 400px;
              width: 100%;
            }
            h1 { margin-top: 0; color: #333; font-size: 1.5rem; }
            .client-info { background: #f3f4f6; padding: 1rem; border-radius: 4px; margin: 1rem 0; }
            .scopes { list-style: none; padding: 0; }
            .scopes li { padding: 0.5rem 0; border-bottom: 1px solid #e5e7eb; }
            .scopes li:last-child { border-bottom: none; }
            .buttons { display: flex; gap: 1rem; margin-top: 1.5rem; }
            button { flex: 1; padding: 0.75rem; border: none; border-radius: 4px; font-size: 1rem; cursor: pointer; }
            .authorize { background: #667eea; color: white; }
            .authorize:hover { background: #5568d3; }
            .deny { background: #e5e7eb; color: #333; }
            .deny:hover { background: #d1d5db; }
            .error { color: #dc2626; padding: 1rem; background: #fee2e2; border-radius: 4px; margin: 1rem 0; }
            .loading { text-align: center; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div id="content">
              <div class="loading">Loading...</div>
            </div>
          </div>
          <script>
            const token = localStorage.getItem('auth_token');
            const params = new URLSearchParams(window.location.search);
            
            if (!token) {
              document.getElementById('content').innerHTML = \`
                <div class="error">You must be logged in to authorize applications.</div>
                <div class="buttons">
                  <button onclick="window.location.href='/auth?redirect=' + encodeURIComponent(window.location.href)">Login</button>
                </div>
              \`;
            } else {
              document.getElementById('content').innerHTML = \`
                <h1>Authorize Application</h1>
                <div class="client-info">
                  <strong>${client.clientName}</strong> wants to access your account
                </div>
                <div>
                  <p>This application will be able to:</p>
                  <ul class="scopes">
                    ${client.scopes.map(s => `<li>${s}</li>`).join('')}
                  </ul>
                </div>
                <div class="buttons">
                  <button class="authorize" data-testid="button-authorize" onclick="authorize()">Authorize</button>
                  <button class="deny" data-testid="button-deny" onclick="deny()">Deny</button>
                </div>
              \`;
            }
            
            async function authorize() {
              try {
                const response = await fetch('/oauth/authorize', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                  },
                  body: JSON.stringify({
                    client_id: params.get('client_id'),
                    redirect_uri: params.get('redirect_uri'),
                    state: params.get('state'),
                    code_challenge: params.get('code_challenge'),
                    code_challenge_method: params.get('code_challenge_method'),
                    scope: params.get('scope')
                  })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                  window.location.href = data.redirect_url;
                } else {
                  document.getElementById('content').innerHTML = '<div class="error">Authorization failed: ' + (data.error || 'Unknown error') + '</div>';
                }
              } catch (error) {
                document.getElementById('content').innerHTML = '<div class="error">Authorization failed: ' + error.message + '</div>';
              }
            }
            
            function deny() {
              const redirectUri = params.get('redirect_uri');
              const state = params.get('state');
              const url = new URL(redirectUri);
              url.searchParams.append('error', 'access_denied');
              if (state) url.searchParams.append('state', state);
              window.location.href = url.toString();
            }
          </script>
        </body>
        </html>
      `);
    } catch (error) {
      console.error("OAuth authorize page error:", error);
      res.status(500).send("Authorization failed");
    }
  });

  // OAuth Test Callback Endpoint (for testing only)
  app.get("/oauth/test/callback", (req, res) => {
    const { code, state, error } = req.query;
    
    if (error) {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Authorization Failed</title></head>
        <body>
          <h1>Authorization Failed</h1>
          <p>Error: ${error}</p>
          <p data-testid="oauth-error">${error}</p>
        </body>
        </html>
      `);
      return;
    }
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Authorization Successful</title></head>
      <body>
        <h1>Authorization Successful</h1>
        <p>Authorization code received successfully.</p>
        <div data-testid="oauth-code">${code}</div>
        <div data-testid="oauth-state">${state || ''}</div>
      </body>
      </html>
    `);
  });

  // OAuth 2.1 Token Endpoint
  app.post("/oauth/token", async (req, res) => {
    console.log("\n[OAUTH TOKEN] ========== Token Exchange Request ==========");
    console.log("[OAUTH TOKEN] Request body:", JSON.stringify(req.body, null, 2));
    console.log("[OAUTH TOKEN] Request headers:", JSON.stringify(req.headers, null, 2));
    
    try {
      const { grant_type, code, redirect_uri, client_id, code_verifier } = req.body;

      console.log("[OAUTH TOKEN] Step 1: Validating grant_type...");
      if (grant_type !== 'authorization_code') {
        console.log("[OAUTH TOKEN] ❌ Invalid grant_type:", grant_type);
        return res.status(400).json({ 
          error: "unsupported_grant_type",
          error_description: "Only authorization_code grant type is supported" 
        });
      }
      console.log("[OAUTH TOKEN] ✅ Grant type valid");

      console.log("[OAUTH TOKEN] Step 2: Checking required parameters...");
      const missingParams = [];
      if (!code) missingParams.push('code');
      if (!redirect_uri) missingParams.push('redirect_uri');
      if (!client_id) missingParams.push('client_id');
      if (!code_verifier) missingParams.push('code_verifier');
      
      if (missingParams.length > 0) {
        console.log("[OAUTH TOKEN] ❌ Missing parameters:", missingParams);
        return res.status(400).json({ 
          error: "invalid_request",
          error_description: `Missing required parameters: ${missingParams.join(', ')}` 
        });
      }
      console.log("[OAUTH TOKEN] ✅ All required parameters present");

      console.log("[OAUTH TOKEN] Step 3: Looking up authorization code:", code);
      const authCode = await storage.getOauthAuthorizationCode(code);
      if (!authCode) {
        console.log("[OAUTH TOKEN] ❌ Authorization code not found or expired");
        return res.status(400).json({ 
          error: "invalid_grant",
          error_description: "Invalid or expired authorization code" 
        });
      }
      console.log("[OAUTH TOKEN] ✅ Authorization code found:", {
        clientId: authCode.clientId,
        userId: authCode.userId,
        scopes: authCode.scopes,
        redirectUri: authCode.redirectUri,
        expiresAt: authCode.expiresAt
      });

      console.log("[OAUTH TOKEN] Step 4: Verifying client_id...");
      console.log("[OAUTH TOKEN] Expected client_id:", authCode.clientId);
      console.log("[OAUTH TOKEN] Received client_id:", client_id);
      if (authCode.clientId !== client_id) {
        console.log("[OAUTH TOKEN] ❌ Client mismatch");
        return res.status(400).json({ 
          error: "invalid_client",
          error_description: "Client mismatch" 
        });
      }
      console.log("[OAUTH TOKEN] ✅ Client verified");

      console.log("[OAUTH TOKEN] Step 5: Verifying redirect_uri...");
      console.log("[OAUTH TOKEN] Expected redirect_uri:", authCode.redirectUri);
      console.log("[OAUTH TOKEN] Received redirect_uri:", redirect_uri);
      if (authCode.redirectUri !== redirect_uri) {
        console.log("[OAUTH TOKEN] ❌ Redirect URI mismatch");
        return res.status(400).json({ 
          error: "invalid_grant",
          error_description: "Redirect URI mismatch" 
        });
      }
      console.log("[OAUTH TOKEN] ✅ Redirect URI verified");

      console.log("[OAUTH TOKEN] Step 6: Checking expiration...");
      const now = new Date();
      console.log("[OAUTH TOKEN] Current time:", now.toISOString());
      console.log("[OAUTH TOKEN] Code expires at:", authCode.expiresAt.toISOString());
      if (now > authCode.expiresAt) {
        console.log("[OAUTH TOKEN] ❌ Authorization code has expired");
        await storage.deleteOauthAuthorizationCode(code);
        return res.status(400).json({ 
          error: "invalid_grant",
          error_description: "Authorization code has expired" 
        });
      }
      console.log("[OAUTH TOKEN] ✅ Code not expired");

      console.log("[OAUTH TOKEN] Step 7: Verifying PKCE...");
      console.log("[OAUTH TOKEN] Code verifier length:", code_verifier.length);
      console.log("[OAUTH TOKEN] Code challenge:", authCode.codeChallenge);
      console.log("[OAUTH TOKEN] Code challenge method:", authCode.codeChallengeMethod);
      
      const { verifyPKCE } = await import("./services/oauth");
      const pkceValid = verifyPKCE(code_verifier, authCode.codeChallenge, authCode.codeChallengeMethod);
      console.log("[OAUTH TOKEN] PKCE verification result:", pkceValid);
      
      if (!pkceValid) {
        console.log("[OAUTH TOKEN] ❌ PKCE verification failed");
        return res.status(400).json({ 
          error: "invalid_grant",
          error_description: "Invalid code_verifier" 
        });
      }
      console.log("[OAUTH TOKEN] ✅ PKCE verified");

      console.log("[OAUTH TOKEN] Step 8: Generating access token...");
      const { generateOAuthAccessToken } = await import("./services/oauth");
      const accessToken = await generateOAuthAccessToken(
        authCode.userId,
        authCode.clientId,
        authCode.scopes,
        3600 // 1 hour
      );
      console.log("[OAUTH TOKEN] ✅ Access token generated:", accessToken.substring(0, 20) + "...");

      const tokenExpiresAt = new Date(Date.now() + 3600 * 1000);

      console.log("[OAUTH TOKEN] Step 9: Storing access token...");
      await storage.createOauthAccessToken({
        token: accessToken,
        clientId: authCode.clientId,
        userId: authCode.userId,
        scopes: authCode.scopes,
        expiresAt: tokenExpiresAt
      });
      console.log("[OAUTH TOKEN] ✅ Access token stored");

      console.log("[OAUTH TOKEN] Step 10: Deleting used authorization code...");
      await storage.deleteOauthAuthorizationCode(code);
      console.log("[OAUTH TOKEN] ✅ Authorization code deleted");

      const responseBody = {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 3600,
        scope: authCode.scopes.join(' ')
      };
      
      console.log("[OAUTH TOKEN] ✅ SUCCESS - Responding with token");
      console.log("[OAUTH TOKEN] Response:", {
        token_type: responseBody.token_type,
        expires_in: responseBody.expires_in,
        scope: responseBody.scope,
        access_token_preview: accessToken.substring(0, 20) + "..."
      });
      console.log("[OAUTH TOKEN] ========== End Token Exchange ==========\n");
      
      res.json(responseBody);
    } catch (error) {
      console.error("[OAUTH TOKEN] ❌ FATAL ERROR:", error);
      console.error("[OAUTH TOKEN] Error stack:", error instanceof Error ? error.stack : 'No stack trace');
      console.log("[OAUTH TOKEN] ========== End Token Exchange (ERROR) ==========\n");
      res.status(500).json({ error: "server_error", error_description: "Failed to issue token" });
    }
  });
  
  // Google OAuth routes
  if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    app.get("/api/auth/google", 
      passport.authenticate("google", { 
        scope: ["profile", "email"] 
      })
    );

    app.get("/api/auth/google/callback",
      passport.authenticate("google", { session: false }),
      async (req: any, res) => {
        try {
          const user = req.user;
          
          // Generate JWT token
          const token = jwt.sign(
            { userId: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '24h' }
          );
          
          // Redirect to frontend with token
          const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
          const host = req.get('host');
          const frontendURL = process.env.FRONTEND_URL || `${protocol}://${host}`;
          res.redirect(`${frontendURL}/auth?token=${token}&user=${encodeURIComponent(JSON.stringify({
            id: user.id,
            username: user.username,
            email: user.email,
            avatarUrl: user.avatarUrl
          }))}`);
        } catch (error) {
          console.error("Google OAuth callback error:", error);
          const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
          const host = req.get('host');
          const frontendURL = process.env.FRONTEND_URL || `${protocol}://${host}`;
          res.redirect(`${frontendURL}/auth?error=oauth_failed`);
        }
      }
    );
  }
  // Authentication routes
  app.post("/api/register", async (req, res) => {
    try {
      const { username, email, password } = insertUserSchema.parse(req.body);
      
      // Check if email is banned
      const isBanned = await storage.isEmailBanned(email);
      if (isBanned) {
        return res.status(403).json({ 
          error: "This account has been suspended, please reach out to support@neonvideo.ai if you think this is a mistake" 
        });
      }
      
      // Check for Gmail emails and reject them
      const emailDomain = email.toLowerCase().split('@')[1];
      const gmailDomains = ['gmail.com', 'googlemail.com'];
      if (gmailDomains.includes(emailDomain)) {
        return res.status(400).json({ 
          error: "Gmail accounts must use Google Login. Please use the \"Continue with Google\" button." 
        });
      }
      
      // Check if user already exists
      const existingUserByUsername = await storage.getUserByUsername(username);
      if (existingUserByUsername) {
        return res.status(400).json({ error: "Username already exists" });
      }
      
      const existingUserByEmail = await storage.getUserByEmail(email);
      if (existingUserByEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }
      
      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      
      // Generate email verification token and expiry date
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
      
      // Get the free plan for new users - CRITICAL: must assign free plan
      const freePlan = await storage.getFreePlan();
      if (!freePlan) {
        console.error("CRITICAL: Free plan not found in database!");
        return res.status(500).json({ error: "System configuration error. Please contact support." });
      }
      
      // Check for affiliate code and validate if provided (support both referralCode and affiliateCode for compatibility)
      let affiliateId = null;
      let shouldAwardBonus = false;
      const { referralCode, affiliateCode } = req.body;
      const codeToCheck = affiliateCode || referralCode; // Try affiliateCode first, then referralCode for backwards compatibility
      
      if (codeToCheck) {
        const affiliate = await storage.getAffiliateByCode(codeToCheck.toLowerCase());
        if (affiliate) {
          affiliateId = affiliate.id;
          shouldAwardBonus = true;
          console.log(`Direct registration: Found affiliate ${affiliate.id} for code "${codeToCheck}"`);
        } else {
          console.log(`Direct registration: No affiliate found for code "${codeToCheck}"`);
        }
      }

      // Create user with email verification fields - ALWAYS with Free plan
      const user = await storage.createUser({
        username,
        email,
        password: hashedPassword,
        emailVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationTokenExpiresAt: tokenExpiresAt,
        avatarUrl: "/public-objects/public/avatars/anonymous.png",
        planId: freePlan.id, // ALWAYS assign free plan
        creditsUsed: 0,
        bonusCredits: shouldAwardBonus ? 500 : 0
      });
      
      // Create affiliate signup record if user used affiliate code
      if (affiliateId) {
        try {
          await storage.createAffiliateSignup({
            affiliateId,
            signupUserId: user.id,
            bonusCreditsAwarded: 500,
            isCreditsAwarded: true
          });
          console.log(`Direct registration affiliate signup: affiliate ${affiliateId} -> user ${user.id} with 500 bonus credits awarded`);
          console.log(`Direct registration: User ${user.id} awarded 500 bonus credits via affiliate ${affiliateId}`);
        } catch (affiliateError) {
          console.error("Failed to create affiliate signup record:", affiliateError);
          // Don't fail registration if affiliate record creation fails
        }
      }
      
      // Send email verification instead of logging user in
      try {
        await emailService.sendEmailVerification({
          username: user.username,
          email: user.email,
          verificationToken: verificationToken
        });
        
        console.log(`Email verification sent to ${user.email}`);
      } catch (emailError) {
        console.error("Failed to send email verification:", emailError);
        return res.status(500).json({ 
          error: "Failed to send verification email. Please try again later." 
        });
      }
      
      // Send notification email to support about new user registration
      try {
        await emailService.sendNewUserRegistrationEmail({
          username: user.username,
          email: user.email,
          createdAt: user.createdAt
        });
      } catch (emailError) {
        // Log error but don't fail the registration
        console.error("Failed to send new user registration email:", emailError);
      }
      
      // Return success message without token - user needs to verify email first
      res.status(201).json({
        message: "Account created successfully! Please check your email to verify your account before logging in.",
        email: user.email
      });
    } catch (error) {
      console.error("Register error:", error);
      const message = error instanceof Error ? error.message : 'Registration failed';
      res.status(400).json({ error: message });
    }
  });

  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }
      
      // Find user by username or email
      let user = await storage.getUserByUsername(username);
      if (!user) {
        user = await storage.getUserByEmail(username); // Allow login with email
      }
      
      if (!user) {
        return res.status(400).json({ error: "Invalid credentials" });
      }
      
      // Check if email is verified (skip for Google OAuth users)
      if (!user.emailVerified && !user.googleId) {
        return res.status(400).json({ 
          error: "Please verify your email address before logging in. Check your email for the verification link." 
        });
      }
      
      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      res.json({
        user: { id: user.id, username: user.username, email: user.email, avatarUrl: user.avatarUrl },
        token
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Email verification endpoint
  app.get("/verify-email", async (req, res) => {
    try {
      const { token } = req.query;
      
      if (!token || typeof token !== 'string') {
        return res.status(400).send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h2 style="color: #e74c3c;">❌ Invalid Verification Link</h2>
              <p>The verification link is invalid or missing. Please check your email for the correct link.</p>
              <a href="/auth" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background-color: #667eea; color: white; text-decoration: none; border-radius: 5px;">Go to Login</a>
            </body>
          </html>
        `);
      }
      
      // Find user by verification token
      const user = await storage.getUserByVerificationToken(token);
      
      if (!user) {
        return res.status(400).send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h2 style="color: #e74c3c;">❌ Invalid Verification Token</h2>
              <p>The verification token is invalid or has already been used.</p>
              <a href="/auth" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background-color: #667eea; color: white; text-decoration: none; border-radius: 5px;">Go to Login</a>
            </body>
          </html>
        `);
      }
      
      // Check if token has expired
      if (user.emailVerificationTokenExpiresAt && new Date() > user.emailVerificationTokenExpiresAt) {
        return res.status(400).send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h2 style="color: #e74c3c;">⏰ Verification Link Expired</h2>
              <p>Your verification link has expired. Please register again or contact support.</p>
              <a href="/auth" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background-color: #667eea; color: white; text-decoration: none; border-radius: 5px;">Go to Registration</a>
            </body>
          </html>
        `);
      }
      
      // Verify the user's email
      await storage.verifyUserEmail(user.id);
      
      // Success page
      res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2 style="color: #27ae60;">✅ Email Verified Successfully!</h2>
            <p>Welcome to neonvideo.ai, ${user.username}! Your email has been verified and you can now log in to your account.</p>
            <a href="/auth" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background-color: #667eea; color: white; text-decoration: none; border-radius: 5px;">Log In Now</a>
          </body>
        </html>
      `);
      
    } catch (error) {
      console.error("Email verification error:", error);
      res.status(500).send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2 style="color: #e74c3c;">❌ Verification Error</h2>
            <p>Something went wrong during verification. Please try again or contact support.</p>
            <a href="/auth" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background-color: #667eea; color: white; text-decoration: none; border-radius: 5px;">Go to Login</a>
          </body>
        </html>
      `);
    }
  });

  // Resend email verification
  app.post("/api/auth/resend-verification", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      // Find user by email
      const user = await storage.getUserByEmail(email);
      
      if (!user) {
        // Don't reveal if user exists or not for security
        return res.status(200).json({ message: "If the email exists and is unverified, a new verification email has been sent." });
      }

      // Check if user is already verified
      if (user.emailVerified) {
        return res.status(400).json({ error: "Email is already verified. You can log in normally." });
      }

      // Generate new verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

      // Update user with new token
      await storage.updateUser(user.id, {
        emailVerificationToken: verificationToken,
        emailVerificationTokenExpiresAt: tokenExpiresAt
      });

      // Send new verification email
      try {
        await emailService.sendEmailVerification({
          username: user.username,
          email: user.email,
          verificationToken: verificationToken
        });

        res.json({ message: "New verification email sent. Please check your email." });
      } catch (emailError) {
        console.error("Failed to resend verification email:", emailError);
        res.status(500).json({ error: "Failed to send verification email. Please try again later." });
      }

    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ error: "Failed to resend verification email" });
    }
  });

  // Referral endpoints
  app.get("/api/referrals", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const referrals = await storage.getUserReferrals(userId);
      const stats = await storage.getReferralStats(userId);
      
      res.json({ referrals, stats });
    } catch (error) {
      console.error("Get referrals error:", error);
      res.status(500).json({ error: "Failed to get referrals" });
    }
  });

  app.get("/api/referrals/code", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Generate referral code if user doesn't have one
      let referralCode = user.referralCode;
      if (!referralCode) {
        referralCode = await storage.generateReferralCode(userId);
      }
      
      res.json({ referralCode });
    } catch (error) {
      console.error("Get referral code error:", error);
      res.status(500).json({ error: "Failed to get referral code" });
    }
  });

  app.post("/api/referrals/code", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { code } = req.body;
      
      if (!code || typeof code !== 'string' || code.length < 3 || code.length > 20) {
        return res.status(400).json({ error: "Referral code must be between 3 and 20 characters" });
      }
      
      // Check if code contains only alphanumeric characters
      if (!/^[a-zA-Z0-9]+$/.test(code)) {
        return res.status(400).json({ error: "Referral code can only contain letters and numbers" });
      }
      
      const success = await storage.setReferralCode(userId, code.toUpperCase());
      
      if (!success) {
        return res.status(400).json({ error: "Referral code is already taken" });
      }
      
      res.json({ referralCode: code.toUpperCase() });
    } catch (error) {
      console.error("Set referral code error:", error);
      res.status(500).json({ error: "Failed to set referral code" });
    }
  });

  // Process referral code for OAuth users (secured endpoint)
  app.post("/api/process-oauth-referral", authenticateToken, async (req, res) => {
    try {
      const { referralCode } = req.body;
      const userId = (req as any).user.userId;
      
      if (!referralCode) {
        return res.status(400).json({ error: "Referral code is required" });
      }
      
      // Get the user to check if they already have a referrer
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      if (user.referredBy) {
        return res.status(400).json({ error: "User already has a referrer" });
      }
      
      // Find the referrer by referral code
      const referrer = await storage.getUserByReferralCode(referralCode);
      if (!referrer) {
        return res.status(404).json({ error: "Invalid referral code" });
      }
      
      // Prevent self-referral
      if (referrer.id === userId) {
        return res.status(400).json({ error: "Cannot refer yourself" });
      }
      
      // Update user with referrer and create referral record
      await storage.updateUser(userId, { referredBy: referrer.id });
      await storage.createReferral({
        referrerId: referrer.id,
        referredUserId: userId,
        referralCode: referralCode,
        status: 'active'
      });
      
      console.log(`OAuth user ${userId} referred by ${referrer.id} with code ${referralCode}`);
      
      res.json({ 
        success: true, 
        message: "Referral processed successfully",
        referrerUsername: referrer.username
      });
    } catch (error) {
      console.error("Failed to process OAuth referral:", error);
      res.status(500).json({ error: "Failed to process referral" });
    }
  });

  // Affiliate endpoints
  app.get("/api/affiliates", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      
      // Check if user has an affiliate profile
      const affiliate = await storage.getAffiliate(userId);
      if (!affiliate) {
        // Return empty data if user is not an affiliate
        return res.json({
          signups: [],
          earnings: [],
          payouts: [],
          stats: {
            totalSignups: 0,
            totalEarnings: 0,
            pendingBalance: 0,
            totalPaidOut: 0
          }
        });
      }

      const signups = await storage.getAffiliateSignups(affiliate.id);
      const earnings = await storage.getAffiliateEarnings(affiliate.id);
      const payouts = await storage.getAffiliatePayouts(affiliate.id);
      const stats = await storage.getAffiliateStats(affiliate.id);

      // Enrich signups with username data
      const signupsWithUsernames = await Promise.all(
        signups.map(async (signup) => {
          const user = await storage.getUser(signup.signupUserId);
          return {
            ...signup,
            username: user?.username || 'Unknown User'
          };
        })
      );

      res.json({
        signups: signupsWithUsernames,
        earnings,
        payouts,
        stats
      });
    } catch (error) {
      console.error("Get affiliate data error:", error);
      res.status(500).json({ error: "Failed to get affiliate data" });
    }
  });

  app.get("/api/affiliates/profile", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      
      // Check if user has an affiliate profile
      let affiliate = await storage.getAffiliate(userId);
      
      if (!affiliate) {
        // Auto-create affiliate profile for new users
        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        // Generate a unique affiliate code based on username
        let affiliateCode = user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (affiliateCode.length < 3) {
          affiliateCode = affiliateCode + Math.random().toString(36).substring(2, 5);
        }
        
        // Ensure uniqueness
        let counter = 1;
        let finalCode = affiliateCode;
        while (await storage.getAffiliateByCode(finalCode)) {
          finalCode = `${affiliateCode}${counter}`;
          counter++;
        }

        affiliate = await storage.createAffiliate({
          userId: userId,
          affiliateCode: finalCode,
          commissionRate: 30,
          totalEarnings: 0,
          totalPaidOut: 0,
          paypalEmail: null,
          isActive: true
        });
      }

      res.json(affiliate);
    } catch (error) {
      console.error("Get affiliate profile error:", error);
      res.status(500).json({ error: "Failed to get affiliate profile" });
    }
  });

  app.post("/api/affiliates/code", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { code } = req.body;
      
      if (!code || typeof code !== 'string' || code.length < 3 || code.length > 20) {
        return res.status(400).json({ error: "Affiliate code must be between 3 and 20 characters" });
      }
      
      // Check if code contains only alphanumeric characters
      if (!/^[a-zA-Z0-9]+$/.test(code)) {
        return res.status(400).json({ error: "Affiliate code can only contain letters and numbers" });
      }
      
      const success = await storage.setAffiliateCode(userId, code.toLowerCase());
      
      if (!success) {
        return res.status(400).json({ error: "Affiliate code is already taken" });
      }
      
      res.json({ affiliateCode: code.toLowerCase() });
    } catch (error) {
      console.error("Set affiliate code error:", error);
      res.status(500).json({ error: "Failed to set affiliate code" });
    }
  });

  app.post("/api/affiliates/payout", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { paypalEmail, requestedAmount } = req.body;
      
      if (!paypalEmail || typeof paypalEmail !== 'string') {
        return res.status(400).json({ error: "PayPal email is required" });
      }
      
      if (!requestedAmount || typeof requestedAmount !== 'number' || requestedAmount < 1000) {
        return res.status(400).json({ error: "Minimum payout amount is $10.00" });
      }
      
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(paypalEmail)) {
        return res.status(400).json({ error: "Invalid email format" });
      }
      
      // Check if user has an affiliate profile
      const affiliate = await storage.getAffiliate(userId);
      if (!affiliate) {
        return res.status(404).json({ error: "Affiliate profile not found" });
      }
      
      // Check if user has sufficient balance
      const stats = await storage.getAffiliateStats(affiliate.id);
      if (stats.pendingBalance < requestedAmount) {
        return res.status(400).json({ error: "Insufficient balance" });
      }
      
      // Create payout request
      const payout = await storage.createAffiliatePayout({
        affiliateId: affiliate.id,
        requestedAmount,
        paypalEmail,
        status: 'pending'
      });
      
      res.json({ 
        success: true, 
        message: "Payout request submitted successfully",
        payout
      });
    } catch (error) {
      console.error("Request affiliate payout error:", error);
      res.status(500).json({ error: "Failed to request payout" });
    }
  });

  // Process affiliate code for OAuth users (secured endpoint) 
  app.post("/api/process-oauth-affiliate", authenticateToken, async (req, res) => {
    try {
      const { affiliateCode } = req.body;
      const userId = (req as any).user.userId;
      
      if (!affiliateCode) {
        return res.status(400).json({ error: "Affiliate code is required" });
      }
      
      // Get the user to check if they already have been credited
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Check if user already has bonus credits (prevent double-crediting)
      if (user.bonusCredits && user.bonusCredits > 0) {
        return res.status(400).json({ error: "User already has affiliate bonus credits" });
      }
      
      // Find the affiliate by code
      const affiliate = await storage.getAffiliateByCode(affiliateCode.toLowerCase());
      if (!affiliate) {
        return res.status(404).json({ error: "Invalid affiliate code" });
      }
      
      // Prevent self-referral
      if (affiliate.userId === userId) {
        return res.status(400).json({ error: "Cannot refer yourself" });
      }
      
      // Check if this user has already been tracked as a signup for this affiliate
      const allSignups = await storage.getAffiliateSignups(affiliate.id);
      const existingSignup = allSignups.find(signup => signup.signupUserId === userId);
      if (existingSignup) {
        return res.status(400).json({ error: "User already counted as affiliate signup" });
      }
      
      // Award 500 bonus credits to the new user
      await storage.updateUser(userId, { bonusCredits: 500 });
      
      // Create affiliate signup record
      await storage.createAffiliateSignup({
        affiliateId: affiliate.id,
        signupUserId: userId,
        bonusCreditsAwarded: 500
      });
      
      console.log(`OAuth user ${userId} signed up via affiliate ${affiliate.userId} (code: ${affiliateCode}) and awarded 500 bonus credits`);
      console.log(`OAuth affiliate signup: User ${userId} awarded 500 bonus credits`);
      
      res.json({ 
        success: true, 
        message: "Affiliate signup processed successfully! You received 500 bonus credits.",
        bonusCredits: 500,
        affiliateUsername: (await storage.getUser(affiliate.userId))?.username
      });
    } catch (error) {
      console.error("Failed to process OAuth affiliate:", error);
      res.status(500).json({ error: "Failed to process affiliate signup" });
    }
  });

  // Handle Stripe payment success and award referral credits (secured endpoint)
  app.get("/api/stripe/payment-success/:sessionId", authenticateToken, async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      if (!sessionId) {
        return res.status(400).json({ error: "Session ID is required" });
      }
      
      // Get Stripe settings from database
      const stripeSettings = await storage.getAllSettings();
      const stripeSecretKey = stripeSettings.find(s => s.key === 'stripe_secret_key')?.value;
      
      if (!stripeSecretKey) {
        console.error("Stripe secret key not configured");
        return res.status(500).json({ error: "Payment system not configured" });
      }
      
      // Import Stripe dynamically to use the database key
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
      
      // Retrieve the checkout session
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      
      if (session.payment_status !== 'paid') {
        return res.status(400).json({ error: "Payment not completed" });
      }
      
      const userId = session.metadata?.userId;
      const planId = session.metadata?.planId;
      const authenticatedUserId = (req as any).user.userId;
      
      if (!userId || !planId) {
        return res.status(400).json({ error: "Invalid session metadata" });
      }
      
      // Security check: ensure the authenticated user matches the session user
      if (userId !== authenticatedUserId) {
        return res.status(403).json({ error: "Unauthorized access to payment session" });
      }
      
      // Get user and check if they have a referrer
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Update user's plan and subscription details
      const plan = await storage.getPlanById(planId);
      if (!plan) {
        return res.status(400).json({ error: "Invalid plan" });
      }
      
      // Check if this is a paid plan (Basic or higher - not the free plan)
      const isPaidPlan = plan.monthlyPrice > 0 || plan.yearlyPrice > 0;
      if (!isPaidPlan) {
        return res.json({ 
          success: true, 
          message: "Payment processed successfully",
          planUpdated: true,
          referralCreditsAwarded: false,
          note: "Free plan - no referral credits awarded"
        });
      }
      
      await storage.updateUser(userId, {
        planId: plan.id,
        stripeSubscriptionId: session.subscription as string,
      });
      
      // Award referral credits if user was referred
      if (user.referredBy) {
        try {
          // Find the referral record
          const referrals = await storage.getUserReferrals(user.referredBy);
          const referralRecord = referrals.find(ref => ref.referredUserId === userId && !ref.isRewarded);
          
          if (referralRecord) {
            // Award 2500 credits to the referrer
            const creditsToAward = 2500;
            const success = await storage.awardReferralCredits(referralRecord.id, creditsToAward);
            
            if (success) {
              // Update referral record with plan upgrade timestamp
              await storage.updateReferral(referralRecord.id, {
                planUpgradeAt: new Date()
              });
              
              console.log(`Awarded ${creditsToAward} credits to referrer ${user.referredBy} for user ${userId} upgrading to paid plan ${plan.name}`);
            }
          }
        } catch (referralError) {
          console.error("Failed to award referral credits:", referralError);
          // Don't fail the payment success if referral crediting fails
        }
      }
      
      res.json({ 
        success: true, 
        message: "Payment processed successfully",
        planUpdated: true,
        referralCreditsAwarded: !!user.referredBy
      });
      
    } catch (error) {
      console.error("Payment success processing error:", error);
      res.status(500).json({ error: "Failed to process payment success" });
    }
  });

  // Database backup endpoint
  app.get("/api/admin/database-backup", authenticateAdmin, async (req, res) => {
    try {
      // Create temporary backup file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `neonvideo_backup_${timestamp}.sql`;
      const tempDir = path.join(process.cwd(), 'temp');
      
      // Ensure temp directory exists
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const backupPath = path.join(tempDir, backupFileName);
      
      // Database connection parameters
      const dbParams = {
        host: process.env.PGHOST,
        port: process.env.PGPORT || '5432',
        database: process.env.PGDATABASE,
        username: process.env.PGUSER,
        password: process.env.PGPASSWORD
      };
      
      // Build pg_dump command
      const pgDumpArgs = [
        '-h', dbParams.host,
        '-p', dbParams.port,
        '-U', dbParams.username,
        '-d', dbParams.database,
        '--clean',  // Include DROP statements
        '--create', // Include CREATE DATABASE statement  
        '--if-exists', // Use IF EXISTS for DROP statements
        '--verbose',
        '--no-password', // Use PGPASSWORD env var
        '-f', backupPath
      ];
      
      // Set environment for pg_dump
      const env = {
        ...process.env,
        PGPASSWORD: dbParams.password
      };
      
      console.log(`Starting database backup: ${backupFileName}`);
      
      // Execute pg_dump
      const pgDump = spawn('pg_dump', pgDumpArgs, { env });
      
      let errorOutput = '';
      
      pgDump.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.log('pg_dump stderr:', data.toString());
      });
      
      pgDump.stdout.on('data', (data) => {
        console.log('pg_dump stdout:', data.toString());
      });
      
      pgDump.on('close', (code) => {
        if (code !== 0) {
          console.error(`pg_dump failed with code ${code}: ${errorOutput}`);
          return res.status(500).json({ 
            error: `Database backup failed: ${errorOutput}` 
          });
        }
        
        try {
          // Check if backup file exists and has content
          if (!fs.existsSync(backupPath)) {
            return res.status(500).json({ 
              error: "Backup file was not created" 
            });
          }
          
          const stats = fs.statSync(backupPath);
          if (stats.size === 0) {
            return res.status(500).json({ 
              error: "Backup file is empty" 
            });
          }
          
          console.log(`Database backup completed: ${backupFileName} (${stats.size} bytes)`);
          
          // Set appropriate headers for file download
          res.setHeader('Content-Type', 'application/sql');
          res.setHeader('Content-Disposition', `attachment; filename="${backupFileName}"`);
          res.setHeader('Content-Length', stats.size);
          
          // Stream the file to the response
          const fileStream = fs.createReadStream(backupPath);
          
          fileStream.on('end', () => {
            // Clean up temporary file after download
            setTimeout(() => {
              try {
                fs.unlinkSync(backupPath);
                console.log(`Temporary backup file deleted: ${backupPath}`);
              } catch (cleanupError) {
                console.error(`Error cleaning up backup file: ${cleanupError}`);
              }
            }, 1000);
          });
          
          fileStream.on('error', (streamError) => {
            console.error(`Error streaming backup file: ${streamError}`);
            res.status(500).json({ error: "Error downloading backup file" });
          });
          
          fileStream.pipe(res);
          
        } catch (fileError) {
          console.error(`Error processing backup file: ${fileError}`);
          res.status(500).json({ error: "Error processing backup file" });
        }
      });
      
      pgDump.on('error', (error) => {
        console.error(`pg_dump process error: ${error}`);
        res.status(500).json({ 
          error: `Failed to start database backup: ${error.message}` 
        });
      });
      
    } catch (error) {
      console.error("Database backup error:", error);
      res.status(500).json({ error: "Failed to create database backup" });
    }
  });

  app.get("/api/me", authenticateToken, async (req, res) => {
    try {
      const userWithPlan = await storage.getUserWithPlan((req as any).user.userId);
      if (!userWithPlan) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Calculate credits remaining
      const creditsRemaining = await storage.getUserCreditsRemaining(userWithPlan.id);
      
      // Debug logging
      console.log('DEBUG /api/me - User credits calculation:', {
        userId: userWithPlan.id,
        username: userWithPlan.username,
        planId: userWithPlan.planId,
        planName: userWithPlan.plan?.name,
        planCredits: userWithPlan.plan?.credits,
        creditsUsed: userWithPlan.creditsUsed,
        creditsRemaining
      });
      
      res.json({
        id: userWithPlan.id,
        username: userWithPlan.username,
        email: userWithPlan.email,
        avatarUrl: userWithPlan.avatarUrl,
        planId: userWithPlan.planId,
        creditsUsed: userWithPlan.creditsUsed || 0,
        creditsRemaining,
        plan: userWithPlan.plan ? {
          id: userWithPlan.plan.id,
          name: userWithPlan.plan.name,
          credits: userWithPlan.plan.credits,
          features: userWithPlan.plan.features,
          monthlyPrice: userWithPlan.plan.monthlyPrice,
          yearlyPrice: userWithPlan.plan.yearlyPrice
        } : null
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ error: "Failed to get user info" });
    }
  });

  // Update username
  app.patch("/api/user/username", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { username } = req.body;
      
      if (!username || typeof username !== 'string' || username.trim().length === 0) {
        return res.status(400).json({ error: "Username is required" });
      }
      
      // Check if username already exists
      const existingUser = await storage.getUserByUsername(username.trim());
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ error: "Username already taken" });
      }
      
      // Update username
      const user = await storage.updateUser(userId, { username: username.trim() });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({
        id: user.id,
        username: user.username,
        email: user.email
      });
    } catch (error) {
      console.error("Update username error:", error);
      res.status(500).json({ error: "Failed to update username" });
    }
  });

  // Admin authentication routes
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }
      
      // Get admin credentials from database
      const adminUsername = await storage.getSetting('admin_username');
      const adminPasswordHash = await storage.getSetting('admin_password');
      
      if (!adminUsername || !adminPasswordHash) {
        return res.status(500).json({ error: "Admin credentials not configured" });
      }
      
      // Check username
      if (username !== adminUsername) {
        return res.status(401).json({ error: "Invalid admin credentials" });
      }
      
      // Verify password
      const isValidPassword = await bcrypt.compare(password, adminPasswordHash);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid admin credentials" });
      }
      
      // Generate admin JWT token
      const token = jwt.sign(
        { username: adminUsername, isAdmin: true },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      res.json({
        admin: { username: adminUsername },
        token
      });
    } catch (error) {
      console.error("Admin login error:", error);
      res.status(500).json({ error: "Admin login failed" });
    }
  });

  // Admin routes
  app.get("/api/admin/users", authenticateAdmin, async (req, res) => {
    try {
      // Parse pagination, filter, and search parameters
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20)); // Default 20 per page, max 100
      const planFilter = req.query.plan as string;
      const searchQuery = (req.query.search as string || '').toLowerCase().trim();

      // Get all users (lightweight, just basic user data)
      const allUsers = await storage.getAllUsers();
      
      // For plan filtering, we need to get user plans first (but not all stats)
      // This is still more efficient than getting all stats for all users
      let usersWithPlans: Array<{ user: any; planName: string }> = [];
      
      if (planFilter && planFilter !== "all") {
        // Only get plans when filtering by plan
        usersWithPlans = await Promise.all(allUsers.map(async (user) => {
          const userWithPlan = await storage.getUserWithPlan(user.id);
          return {
            user,
            planName: userWithPlan?.plan?.name || "Free"
          };
        }));
      }
      
      // Filter users first (before getting expensive stats)
      let filteredUsers = allUsers;
      
      // Filter by plan if specified
      if (planFilter && planFilter !== "all") {
        filteredUsers = usersWithPlans
          .filter(u => u.planName === planFilter)
          .map(u => u.user);
      }

      // Filter by search query if specified
      if (searchQuery) {
        filteredUsers = filteredUsers.filter(user => 
          user.username.toLowerCase().includes(searchQuery) || 
          user.email.toLowerCase().includes(searchQuery)
        );
      }

      // Calculate pagination BEFORE getting stats
      const totalCount = filteredUsers.length;
      const totalPages = Math.ceil(totalCount / limit);
      const offset = (page - 1) * limit;
      const usersToFetch = filteredUsers.slice(offset, offset + limit);
      
      // NOW get stats, but ONLY for the paginated subset
      const paginatedUsersWithStats = await Promise.all(usersToFetch.map(async (user) => {
        const projects = await storage.getUserProjects(user.id);
        const songs = await storage.getSongs(user.id);
        const userWithPlan = await storage.getUserWithPlan(user.id);
        const creditsRemaining = await storage.getUserCreditsRemaining(user.id);
        
        return {
          id: user.id,
          username: user.username,
          email: user.email,
          emailVerified: user.emailVerified,
          avatarUrl: user.avatarUrl,
          createdAt: user.createdAt,
          projectCount: projects.length,
          songCount: songs.length,
          planName: userWithPlan?.plan?.name || "Free",
          planId: userWithPlan?.planId || "",
          creditsUsed: userWithPlan?.creditsUsed || 0,
          creditsLimit: userWithPlan?.plan?.credits || 0
        };
      }));
      
      res.json({
        users: paginatedUsersWithStats,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      });
    } catch (error) {
      console.error("Admin get users error:", error);
      res.status(500).json({ error: "Failed to get users" });
    }
  });

  app.delete("/api/admin/users/:userId", authenticateAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      await storage.deleteUser(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Admin delete user error:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  app.put("/api/admin/users/:userId", authenticateAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { username, email } = req.body;
      await storage.updateUser(userId, { username, email });
      res.json({ success: true });
    } catch (error) {
      console.error("Admin update user error:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.put("/api/admin/users/:userId/plan", authenticateAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { planId } = req.body;
      
      if (!planId) {
        return res.status(400).json({ error: "Plan ID is required" });
      }
      
      // Verify the plan exists
      const plans = await storage.getAllPlans();
      const planExists = plans.some(p => p.id === planId);
      
      if (!planExists) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }
      
      await storage.updateUser(userId, { planId });
      res.json({ success: true });
    } catch (error) {
      console.error("Admin update user plan error:", error);
      res.status(500).json({ error: "Failed to update user plan" });
    }
  });

  // CSV export endpoint for users (name and email only)
  app.get("/api/admin/users/export", authenticateAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      
      // Create CSV content with header
      let csvContent = "Name,Email\n";
      
      // Add user data (username as name, email)
      users.forEach(user => {
        // Escape commas and quotes in data
        const name = user.username.replace(/"/g, '""');
        const email = user.email.replace(/"/g, '""');
        csvContent += `"${name}","${email}"\n`;
      });
      
      // Set headers for CSV download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="users-export.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error("Admin export users error:", error);
      res.status(500).json({ error: "Failed to export users" });
    }
  });

  // Admin endpoint to give bonus credits to users
  app.put("/api/admin/users/:userId/bonus-credits", authenticateAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Validate request body using Zod schema
      const bonusCreditsSchema = z.object({
        bonusCredits: z.number()
          .int("Bonus credits must be an integer")
          .min(0, "Bonus credits cannot be negative")
          .max(1000000, "Bonus credits cannot exceed 1,000,000")
          .finite("Bonus credits must be a finite number")
      });
      
      const validation = bonusCreditsSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid bonus credits amount", 
          details: validation.error.errors.map(e => e.message).join(", ")
        });
      }
      
      const { bonusCredits } = validation.data;
      
      // Check if user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Update user's bonus credits
      await storage.updateUser(userId, { bonusCredits });
      
      res.json({ 
        success: true, 
        message: `Successfully updated bonus credits to ${bonusCredits} for user ${user.username}` 
      });
    } catch (error) {
      console.error("Admin update bonus credits error:", error);
      res.status(500).json({ error: "Failed to update bonus credits" });
    }
  });

  app.get("/api/admin/plans", authenticateAdmin, async (req, res) => {
    try {
      const plans = await storage.getAllPlans();
      res.json(plans);
    } catch (error) {
      console.error("Admin get plans error:", error);
      res.status(500).json({ error: "Failed to get plans" });
    }
  });

  app.get("/api/admin/stats", authenticateAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      const allProjects = await Promise.all(users.map(user => storage.getUserProjects(user.id)));
      const allSongs = await Promise.all(users.map(user => storage.getSongs(user.id)));
      
      const projects = allProjects.flat();
      const songs = allSongs.flat();
      
      // Calculate stats
      const totalUsers = users.length;
      const totalSongs = songs.length;
      const completedProjects = projects.filter(p => p.isCompleted).length;
      
      // Calculate monthly revenue - get all users with their plans
      const usersWithPlans = await Promise.all(users.map(async (user) => {
        const userWithPlan = await storage.getUserWithPlan(user.id);
        return {
          userId: user.id,
          planId: userWithPlan?.planId,
          planName: userWithPlan?.plan?.name || "Free",
          monthlyPrice: userWithPlan?.plan?.monthlyPrice || 0
        };
      }));
      
      // Sum up monthly revenue from all users with paid plans
      const monthlyRevenue = usersWithPlans.reduce((total, user) => {
        return total + (user.monthlyPrice / 100); // Convert cents to dollars
      }, 0);
      
      // Group by creation date for charts
      const userSignupsByDay = users.reduce((acc: any, user) => {
        const date = user.createdAt.toISOString().split('T')[0];
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {});

      const projectsByDay = projects.reduce((acc: any, project) => {
        const date = project.createdAt.toISOString().split('T')[0];
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {});
      
      res.json({
        overview: {
          totalUsers,
          monthlyRevenue,
          totalSongs,
          completedProjects
        },
        charts: {
          userSignups: Object.entries(userSignupsByDay).map(([date, count]) => ({ date, count })),
          projectCreations: Object.entries(projectsByDay).map(([date, count]) => ({ date, count }))
        }
      });
    } catch (error) {
      console.error("Admin get stats error:", error);
      res.status(500).json({ error: "Failed to get stats" });
    }
  });

  app.post("/api/admin/reset-password", authenticateAdmin, async (req, res) => {
    try {
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      
      // Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      
      // Save to database with error handling
      try {
        await storage.setSetting('admin_password', hashedPassword, true);
        
        // Verify the exact password hash was saved correctly
        const savedPassword = await storage.getSetting('admin_password');
        if (savedPassword !== hashedPassword) {
          console.error("❌ Password verification failed - saved password doesn't match new hash");
          console.error(`Expected: ${hashedPassword.substring(0, 20)}...`);
          console.error(`Got: ${savedPassword?.substring(0, 20) || 'null'}...`);
          throw new Error("Password write verification failed - hash mismatch");
        }
        
        console.log("✅ Admin password updated and verified successfully");
        res.json({ success: true, message: "Admin password updated successfully" });
      } catch (storageError) {
        console.error("❌ Failed to save admin password to database:", storageError);
        throw new Error("Failed to persist password change to database");
      }
    } catch (error) {
      console.error("Admin reset password error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to reset password" });
    }
  });
  
  // Get Stripe settings
  app.get("/api/admin/stripe-settings", authenticateAdmin, async (req, res) => {
    try {
      const publishableKey = await storage.getSetting('stripe_publishable_key');
      const secretKey = await storage.getSetting('stripe_secret_key');
      const webhookSecret = await storage.getSetting('stripe_webhook_secret');
      
      res.json({
        stripePublishableKey: publishableKey || '',
        stripeSecretKey: secretKey ? '••••••••' + secretKey.slice(-4) : '', // Mask the secret key
        stripeWebhookSecret: webhookSecret ? '••••••••' + webhookSecret.slice(-8) : '', // Mask the webhook secret
        isConfigured: !!(publishableKey && secretKey && webhookSecret)
      });
    } catch (error) {
      console.error("Get Stripe settings error:", error);
      res.status(500).json({ error: "Failed to get Stripe settings" });
    }
  });
  
  // Update Stripe settings
  app.post("/api/admin/stripe-settings", authenticateAdmin, async (req, res) => {
    try {
      const { stripePublishableKey, stripeSecretKey, stripeWebhookSecret } = req.body;
      
      // Save each key if provided (don't overwrite if not provided)
      if (stripePublishableKey) {
        await storage.setSetting('stripe_publishable_key', stripePublishableKey, false);
      }
      
      if (stripeSecretKey && !stripeSecretKey.includes('••••')) { // Only update if not masked
        await storage.setSetting('stripe_secret_key', stripeSecretKey, true);
      }
      
      if (stripeWebhookSecret && !stripeWebhookSecret.includes('••••')) { // Only update if not masked
        await storage.setSetting('stripe_webhook_secret', stripeWebhookSecret, true);
      }
      
      res.json({ success: true, message: "Stripe settings updated successfully" });
    } catch (error) {
      console.error("Update Stripe settings error:", error);
      res.status(500).json({ error: "Failed to update Stripe settings" });
    }
  });

  // Public endpoint to get active plans
  app.get("/api/plans", async (req, res) => {
    try {
      const plans = await storage.getAllPlans();
      // Filter to only show active plans
      const activePlans = plans.filter(plan => plan.isActive);
      res.json(activePlans);
    } catch (error) {
      console.error("Get plans error:", error);
      res.status(500).json({ error: "Failed to get plans" });
    }
  });

  // Plans management routes (Admin only)
  app.get("/api/admin/plans", authenticateAdmin, async (req, res) => {
    try {
      const plans = await storage.getAllPlans();
      res.json(plans);
    } catch (error) {
      console.error("Get plans error:", error);
      res.status(500).json({ error: "Failed to get plans" });
    }
  });

  app.post("/api/admin/plans", authenticateAdmin, async (req, res) => {
    try {
      const planData = insertPlanSchema.parse(req.body);
      const plan = await storage.createPlan(planData);
      res.status(201).json(plan);
    } catch (error) {
      console.error("Create plan error:", error);
      const message = error instanceof Error ? error.message : 'Failed to create plan';
      res.status(400).json({ error: message });
    }
  });

  app.put("/api/admin/plans/:id", authenticateAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const updatedPlan = await storage.updatePlan(id, updates);
      if (!updatedPlan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      
      res.json(updatedPlan);
    } catch (error) {
      console.error("Update plan error:", error);
      res.status(500).json({ error: "Failed to update plan" });
    }
  });

  app.delete("/api/admin/plans/:id", authenticateAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deletePlan(id);
      
      if (!success) {
        return res.status(404).json({ error: "Plan not found" });
      }
      
      res.json({ success: true, message: "Plan deleted successfully" });
    } catch (error) {
      console.error("Delete plan error:", error);
      res.status(500).json({ error: "Failed to delete plan" });
    }
  });

  // Update user email verification status
  app.patch("/api/admin/users/:id/email-verification", authenticateAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { emailVerified } = req.body;
      
      // Validate the input
      if (typeof emailVerified !== 'boolean') {
        return res.status(400).json({ error: "emailVerified must be a boolean" });
      }
      
      const updatedUser = await storage.updateUser(id, { emailVerified });
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({ 
        message: emailVerified ? "User email verified successfully" : "User email unverified successfully",
        emailVerified 
      });
    } catch (error) {
      console.error("Admin update email verification error:", error);
      res.status(500).json({ error: "Failed to update email verification status" });
    }
  });

  // Admin Video Management Routes
  app.get("/api/admin/videos", authenticateAdmin, async (req, res) => {
    try {
      // Parse pagination parameters
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20)); // Default 20 per page, max 100
      const offset = (page - 1) * limit;

      const allProjects = await storage.getAllVideosForAdmin();
      // Filter only completed videos (projects with finalVideoUrl)
      const videos = allProjects.filter(p => p.finalVideoUrl);
      const totalCount = videos.length;
      const totalPages = Math.ceil(totalCount / limit);
      
      // Get paginated videos
      const paginatedVideos = videos.slice(offset, offset + limit);
      
      // Add user information and thumbnail to each video
      const videosWithUsers = await Promise.all(
        paginatedVideos.map(async (video) => {
          const user = await storage.getUser(video.userId);
          
          // Get the last scene image if available
          let thumbnailUrl = null;
          if (video.sceneData) {
            try {
              const scenes = typeof video.sceneData === 'string' 
                ? JSON.parse(video.sceneData) 
                : video.sceneData;
              
              if (Array.isArray(scenes) && scenes.length > 0) {
                const lastScene = scenes[scenes.length - 1];
                thumbnailUrl = lastScene.imageUrl || null;
              }
            } catch (e) {
              // Silently handle parse errors for old data
            }
          }
          
          return {
            ...video,
            title: ["My Music Video", "NeonVideo Song", "AI Generated Song"].includes(video.title) ? (video.audioPrompt ? video.audioPrompt.substring(0, 50) + (video.audioPrompt.length > 50 ? '...' : '') : video.title) : video.title,
            username: user?.username || 'Unknown User',
            thumbnailUrl
          };
        })
      );
      
      res.json({
        videos: videosWithUsers,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      });
    } catch (error) {
      console.error("Get all videos error:", error);
      res.status(500).json({ error: "Failed to get videos" });
    }
  });

  app.put("/api/admin/videos/:id", authenticateAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const updatedVideo = await storage.updateVideoAsAdmin(id, updates);
      if (!updatedVideo) {
        return res.status(404).json({ error: "Video not found" });
      }
      
      res.json(updatedVideo);
    } catch (error) {
      console.error("Update video error:", error);
      res.status(500).json({ error: "Failed to update video" });
    }
  });

  app.delete("/api/admin/videos/:id", authenticateAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteVideoAsAdmin(id);
      
      if (!success) {
        return res.status(404).json({ error: "Video not found" });
      }
      
      res.json({ success: true, message: "Video deleted successfully" });
    } catch (error) {
      console.error("Delete video error:", error);
      res.status(500).json({ error: "Failed to delete video" });
    }
  });

  // Toggle video featured status
  app.patch("/api/admin/videos/:id/featured", authenticateAdmin, async (req, res) => {
    try {
      const { isFeatured } = req.body;
      const videoId = req.params.id;
      
      // Validate the input
      if (typeof isFeatured !== 'boolean') {
        return res.status(400).json({ error: "isFeatured must be a boolean" });
      }
      
      const success = await storage.updateProject(videoId, { isFeatured });
      if (!success) {
        return res.status(404).json({ error: "Video not found" });
      }
      
      res.json({ 
        message: isFeatured ? "Video featured successfully" : "Video unfeatured successfully",
        isFeatured 
      });
    } catch (error) {
      console.error("Admin toggle featured video error:", error);
      res.status(500).json({ error: "Failed to update video featured status" });
    }
  });

  // Admin Audio Management Routes
  app.get("/api/admin/audios", authenticateAdmin, async (req, res) => {
    try {
      const allProjects = await storage.getAllVideosForAdmin();
      // Filter only audio projects (projects with audioUrl but not finalVideoUrl)
      const audios = allProjects.filter(p => p.audioUrl && !p.finalVideoUrl);
      
      // Add user information to each audio
      const audiosWithUsers = await Promise.all(
        audios.map(async (audio) => {
          const user = await storage.getUser(audio.userId);
          return {
            ...audio,
            username: user?.username || 'Unknown User'
          };
        })
      );
      res.json(audiosWithUsers);
    } catch (error) {
      console.error("Get all audios error:", error);
      res.status(500).json({ error: "Failed to get audios" });
    }
  });

  app.put("/api/admin/audios/:id", authenticateAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const updatedAudio = await storage.updateVideoAsAdmin(id, updates);
      if (!updatedAudio) {
        return res.status(404).json({ error: "Audio not found" });
      }
      
      res.json(updatedAudio);
    } catch (error) {
      console.error("Update audio error:", error);
      res.status(500).json({ error: "Failed to update audio" });
    }
  });

  app.delete("/api/admin/audios/:id", authenticateAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteVideoAsAdmin(id);
      
      if (!success) {
        return res.status(404).json({ error: "Audio not found" });
      }
      
      res.json({ success: true, message: "Audio deleted successfully" });
    } catch (error) {
      console.error("Delete audio error:", error);
      res.status(500).json({ error: "Failed to delete audio" });
    }
  });

  // Admin get all comments
  app.get("/api/admin/comments", authenticateAdmin, async (req, res) => {
    try {
      const comments = await storage.getAllComments();
      res.json(comments);
    } catch (error) {
      console.error("Admin get comments error:", error);
      res.status(500).json({ error: "Failed to get comments" });
    }
  });

  // Admin delete comment
  app.delete("/api/admin/comments/:commentId", authenticateAdmin, async (req, res) => {
    try {
      const { commentId } = req.params;
      
      const success = await storage.adminDeleteComment(commentId);
      
      if (!success) {
        return res.status(404).json({ error: "Comment not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Admin delete comment error:", error);
      res.status(500).json({ error: "Failed to delete comment" });
    }
  });

  // Admin ban user
  app.post("/api/admin/users/:userId/ban", authenticateAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { reason } = req.body;
      const adminUser = (req as any).user;
      
      // Get user to be banned
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Ban the user - use username from JWT token
      const bannedBy = adminUser?.username || "Admin";
      await storage.banUser(user.email, bannedBy, reason);
      
      res.json({ success: true, message: "User banned successfully" });
    } catch (error) {
      console.error("Admin ban user error:", error);
      res.status(500).json({ error: "Failed to ban user" });
    }
  });

  // Admin unban user
  app.post("/api/admin/users/:userId/unban", authenticateAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Get user to be unbanned
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Unban the user
      await storage.unbanUser(user.email);
      
      res.json({ success: true, message: "User unbanned successfully" });
    } catch (error) {
      console.error("Admin unban user error:", error);
      res.status(500).json({ error: "Failed to unban user" });
    }
  });

  // Admin get all banned users
  app.get("/api/admin/banned-users", authenticateAdmin, async (req, res) => {
    try {
      const bannedUsers = await storage.getAllBannedUsers();
      res.json(bannedUsers);
    } catch (error) {
      console.error("Admin get banned users error:", error);
      res.status(500).json({ error: "Failed to get banned users" });
    }
  });

  // Update password
  app.patch("/api/user/password", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "Current password and new password are required" });
      }
      
      if (newPassword.length < 6) {
        return res.status(400).json({ error: "New password must be at least 6 characters long" });
      }
      
      // Get current user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(400).json({ error: "Current password is incorrect" });
      }
      
      // Hash new password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
      
      // Update password
      const updatedUser = await storage.updateUser(userId, { password: hashedPassword });
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Update password error:", error);
      res.status(500).json({ error: "Failed to update password" });
    }
  });

  // Delete account (actually bans the user)
  app.post("/api/user/delete-account", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      
      // Get current user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Check if user has an active subscription (not Free plan)
      const userPlan = await storage.getPlanById(user.planId);
      if (userPlan && userPlan.name !== "Free") {
        return res.status(400).json({ 
          error: "Please downgrade to the Free plan before deleting your account",
          hasActiveSubscription: true
        });
      }
      
      // Instead of deleting, ban the user with reason "Deleted" and bannedBy "User"
      await storage.banUser(user.email, "User", "Deleted");
      
      res.json({ 
        success: true, 
        message: "Account deleted successfully. You will be logged out shortly." 
      });
    } catch (error) {
      console.error("Delete account error:", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  // Get video generation configurations
  app.get("/api/video-generation-configs", async (req, res) => {
    try {
      const configs = await storage.getAllVideoGenerationConfigs();
      res.json(configs);
    } catch (error) {
      console.error("Get video generation configs error:", error);
      res.status(500).json({ error: "Failed to get video generation configurations" });
    }
  });

  // Get avatar upload URL
  app.post("/api/user/avatar/upload-url", authenticateToken, async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Get avatar upload URL error:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Update user avatar
  app.patch("/api/user/avatar", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { avatarUrl } = req.body;
      
      if (!avatarUrl) {
        return res.status(400).json({ error: "Avatar URL is required" });
      }
      
      // For public avatars (predefined avatars), store the URL as-is
      // For uploaded avatars, we would normalize them, but predefined avatars don't need normalization
      const finalAvatarUrl = avatarUrl;
      
      // Update user avatar
      const user = await storage.updateUser(userId, { avatarUrl: finalAvatarUrl });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl
      });
    } catch (error) {
      console.error("Update avatar error:", error);
      res.status(500).json({ error: "Failed to update avatar" });
    }
  });

  // Get avatar options with production-safe URLs
  app.get("/api/avatar-options", authenticateToken, async (req, res) => {
    try {
      const avatarOptions = [];
      
      // Always use fallback URLs for avatars since the actual files may not exist in object storage
      // This ensures avatars display consistently in both development and production
      
      // Add anonymous avatar (default for new users)
      avatarOptions.push({
        id: 0,
        url: `/public-objects/public/avatars/anonymous.png`,
        localUrl: `/public-objects/public/avatars/anonymous.png`
      });
      
      for (let i = 1; i <= 20; i++) {
        avatarOptions.push({
          id: i,
          url: `/public-objects/public/avatars/avatar${i}.png`,
          localUrl: `/public-objects/public/avatars/avatar${i}.png`
        });
      }
      
      if (process.env.NODE_ENV === 'production') {
        // In production, try to enhance with signed URLs if files exist, but don't fail if they don't
        const objectStorageService = new ObjectStorageService();
        
        // Try to get signed URLs for existing files, but keep fallbacks
        for (let option of avatarOptions) {
          try {
            const fileName = option.id === 0 ? 'avatars/anonymous.png' : `avatars/avatar${option.id}.png`;
            const avatarFile = await objectStorageService.searchPublicObject(fileName);
            if (avatarFile) {
              const signedUrl = await avatarFile.getSignedUrl({
                action: 'read',
                expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
              });
              option.url = signedUrl[0]; // Update with signed URL, keep fallback as localUrl
            }
          } catch (error) {
            // Keep the fallback URL if signed URL generation fails
            console.log(`Using fallback URL for avatar ${option.id}`);
          }
        }
      }
      // Development and production now use the same avatar array structure
      
      res.json({ avatarOptions });
    } catch (error) {
      console.error("Error getting avatar options:", error);
      res.status(500).json({ error: "Failed to get avatar options" });
    }
  });


  // Serve sitemap.xml
  app.get("/sitemap.xml", async (req, res) => {
    try {
      const path = await import("path");
      const fs = await import("fs");
      const sitemapPath = path.join(process.cwd(), "public", "sitemap.xml");
      
      if (fs.existsSync(sitemapPath)) {
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
        res.sendFile(sitemapPath);
      } else {
        res.status(404).send('Sitemap not found');
      }
    } catch (error) {
      console.error('Error serving sitemap:', error);
      res.status(500).send('Error serving sitemap');
    }
  });

  // Serve public objects (like avatars)
  app.get("/public-objects/:filePath(*)", async (req, res) => {
    try {
      const filePath = req.params.filePath;
      console.log(`Public object request: ${filePath}`);
      
      // Skip object storage search in production if it's causing auth issues
      // Go straight to fallbacks for known file types
      let shouldSearchObjectStorage = true;
      
      if (process.env.NODE_ENV === 'production') {
        // In production, skip object storage search for watermark to avoid auth errors
        if (filePath.includes('neonlogo_watermark.png')) {
          shouldSearchObjectStorage = false;
          console.log("Skipping object storage search for watermark in production - using SVG fallback");
        }
      }
      
      if (shouldSearchObjectStorage) {
        try {
          const objectStorageService = new ObjectStorageService();
          
          // Try to find the file in object storage
          const file = await objectStorageService.searchPublicObject(filePath);
          if (file) {
            console.log(`Found file in object storage: ${filePath}`);
            return objectStorageService.downloadObject(file, res);
          } else {
            console.log(`File not found in object storage: ${filePath}`);
          }
        } catch (storageError) {
          console.warn(`Object storage search failed for ${filePath}:`, storageError);
        }
      }
      
      // If it's an avatar request and file doesn't exist, provide a generic fallback
      if (filePath.includes('avatars/')) {
        // Generate a simple SVG avatar as fallback
        const avatarMatch = filePath.match(/avatar(\d+)\.png/);
        const avatarId = avatarMatch ? avatarMatch[1] : '?';
        const isAnonymous = filePath.includes('anonymous.png');
        const displayText = isAnonymous ? '?' : avatarId;
        
        const svgContent = `
        <svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="grad" cx="50%" cy="30%" r="70%">
              <stop offset="0%" style="stop-color:#6366f1;stop-opacity:0.8" />
              <stop offset="100%" style="stop-color:#3730a3;stop-opacity:1" />
            </radialGradient>
          </defs>
          <circle cx="32" cy="32" r="32" fill="url(#grad)"/>
          <text x="32" y="40" font-family="Arial, sans-serif" font-size="24" font-weight="bold" 
                text-anchor="middle" fill="white">${displayText}</text>
        </svg>`;
        
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
        return res.send(svgContent);
      }
      
      // If it's a watermark request and file doesn't exist, provide a fallback watermark
      if (filePath.includes('neonlogo_watermark.png')) {
        // Generate a simple SVG watermark as fallback
        const svgWatermark = `
        <svg width="200" height="60" viewBox="0 0 200 60" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="neonGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:#ff00ff;stop-opacity:0.9" />
              <stop offset="50%" style="stop-color:#00ffff;stop-opacity:0.9" />
              <stop offset="100%" style="stop-color:#ff00ff;stop-opacity:0.9" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge> 
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <rect width="200" height="60" fill="rgba(0,0,0,0.7)" rx="8"/>
          <text x="100" y="35" font-family="Arial, sans-serif" font-size="18" font-weight="bold" 
                text-anchor="middle" fill="url(#neonGrad)" filter="url(#glow)">NEONVIDEO.AI</text>
        </svg>`;
        
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
        return res.send(svgWatermark);
      }
      
      // For non-avatar files, return 404
      return res.status(404).json({ error: "File not found" });
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Serve avatar images
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof Error && error.message === "Object not found") {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Create a new project
  app.post("/api/projects", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const projectData = {
        ...req.body,
        userId // Use authenticated user ID
      };
      
      console.log("Creating project with data:", projectData);
      const validatedData = insertProjectSchema.parse(projectData);
      console.log("Validated data:", validatedData);
      const project = await storage.createProject(validatedData);
      res.json(project);
    } catch (error) {
      console.error("Create project error:", error);
      if (error instanceof Error && 'name' in error && error.name === 'ZodError') {
        console.error("Validation errors:", (error as any).errors);
        res.status(400).json({ error: "Validation failed", details: (error as any).errors });
      } else {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(400).json({ error: "Invalid project data", message });
      }
    }
  });

  // Generate a single scene image without updating any project (for edit mode)
  app.post("/api/generate-single-scene", authenticateToken, async (req, res) => {
    try {
      const { prompt, characterImageUrl } = req.body;
      
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }
      
      if (!characterImageUrl) {
        return res.status(400).json({ error: "Character image URL is required" });
      }

      console.log(`Generating single scene with prompt: ${prompt}`);
      
      // Generate scene image using the same method as regular scene generation
      const imageUrl = await generateSingleSceneImage(prompt, characterImageUrl);
      
      res.json({ imageUrl });
    } catch (error) {
      console.error("Generate single scene error:", error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: "Failed to generate scene", message });
    }
  });

  // Clone/regenerate a completed project for editing
  app.post("/api/projects/:id/clone", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const sourceProjectId = req.params.id;
      const { updatedScenes } = req.body; // Receive updated scenes from frontend
      
      // Get the source project
      const sourceProject = await storage.getProject(sourceProjectId);
      if (!sourceProject) {
        return res.status(404).json({ error: "Source project not found" });
      }
      
      // Verify ownership
      if (sourceProject.userId !== userId) {
        return res.status(403).json({ error: "Not authorized to clone this project" });
      }
      
      console.log(`Cloning project ${sourceProjectId} for regeneration...`);
      
      // Deep copy scene data from request or source project
      const scenePrompts = updatedScenes 
        ? updatedScenes.map((s: any) => s.prompt)
        : (sourceProject.scenePrompts ? JSON.parse(JSON.stringify(sourceProject.scenePrompts)) : undefined);
      const sceneImages = updatedScenes
        ? updatedScenes.map((s: any) => s.imageUrl)
        : (sourceProject.sceneImages ? JSON.parse(JSON.stringify(sourceProject.sceneImages)) : undefined);
      
      // Deep copy audio segments (use undefined instead of null to let Zod apply defaults)
      const audioSegments = sourceProject.audioSegments 
        ? JSON.parse(JSON.stringify(sourceProject.audioSegments))
        : undefined;
      
      // Create a new project with all the same data except:
      // - New ID (auto-generated)
      // - Reset completion status and generation tracking
      // - Reset final video and MUX data
      // - Reset video segments (will be regenerated)
      // - Use updated scenes if provided
      // - Keep all other data (audio, character, etc.)
      const clonedProjectData: any = {
        userId: sourceProject.userId,
        title: sourceProject.title || "NeonVideo Song",
        description: sourceProject.description || "AI-generated music video project",
        currentStep: 4, // Set to step 4 (ready for video generation)
        audioUrl: sourceProject.audioUrl,
        audioType: sourceProject.audioType,
        audioPrompt: sourceProject.audioPrompt,
        audioTags: sourceProject.audioTags,
        audioLyrics: sourceProject.audioLyrics,
        audioDuration: sourceProject.audioDuration,
        addSubtitles: sourceProject.addSubtitles,
        subtitleFileUrl: sourceProject.subtitleFileUrl,
        kieTaskId: sourceProject.kieTaskId,
        kieAudioId: sourceProject.kieAudioId,
        characterImageUrl: sourceProject.characterImageUrl,
        characterType: sourceProject.characterType,
        characterPrompt: sourceProject.characterPrompt,
        makeCharacterSing: sourceProject.makeCharacterSing,
        isCompleted: false, // Not completed yet
        generationStatus: 'idle',
      };
      
      // Add optional fields only if they have values (undefined fields are omitted)
      if (scenePrompts !== undefined) clonedProjectData.scenePrompts = scenePrompts;
      if (sceneImages !== undefined) clonedProjectData.sceneImages = sceneImages;
      if (audioSegments !== undefined) clonedProjectData.audioSegments = audioSegments;
      
      const validatedData = insertProjectSchema.parse(clonedProjectData);
      const clonedProject = await storage.createProject(validatedData);
      
      console.log(`Successfully cloned project ${sourceProjectId} to new project ${clonedProject.id}`);
      
      res.json(clonedProject);
    } catch (error) {
      console.error("Clone project error:", error);
      if (error instanceof Error && 'name' in error && error.name === 'ZodError') {
        console.error("Validation errors:", (error as any).errors);
        res.status(400).json({ error: "Validation failed", details: (error as any).errors });
      } else {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(400).json({ error: "Failed to clone project", message });
      }
    }
  });

  // Delete a project
  app.delete("/api/projects/:id", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const projectId = req.params.id;
      
      // Check if the project exists and belongs to the user
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      
      if (project.userId !== userId) {
        return res.status(403).json({ error: "Not authorized to delete this project" });
      }
      
      // Delete the project and its related generation logs
      await storage.deleteProjectWithLogs(projectId);
      res.json({ message: "Project deleted successfully" });
    } catch (error) {
      console.error("Delete project error:", error);
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  // Get all user's completed videos
  // Get a single public video by ID (no auth required)
  app.get("/api/videos/:videoId", async (req, res) => {
    try {
      const { videoId } = req.params;
      
      // Get the project/video
      const project = await storage.getProject(videoId);
      if (!project || !project.isCompleted || !project.finalVideoUrl) {
        return res.status(404).json({ error: "Video not found" });
      }
      
      // Get the creator/user
      const user = await storage.getUser(project.userId);
      if (!user) {
        return res.status(404).json({ error: "Creator not found" });
      }
      
      // Format the response
      const videoData = {
        id: project.id,
        title: ["My Music Video", "NeonVideo Song", "AI Generated Song"].includes(project.title) ? (project.audioPrompt ? project.audioPrompt.substring(0, 30) + (project.audioPrompt.length > 30 ? '...' : '') : project.title) : project.title,
        videoUrl: project.finalVideoUrl,
        thumbnailUrl: project.characterImageUrl || null,
        createdAt: project.createdAt,
        duration: project.audioDuration || 30,
        likesCount: project.likesCount || 0,
        creator: {
          id: user.id,
          username: user.username,
          avatarUrl: user.avatarUrl
        }
      };
      
      res.json(videoData);
    } catch (error) {
      console.error("Get video error:", error);
      res.status(500).json({ error: "Failed to get video" });
    }
  });

  // Get public videos for a user by username (no auth required)
  app.get("/api/users/:username/videos", async (req, res) => {
    try {
      const { username } = req.params;
      
      // Find user by username
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Get user's videos that have final videos (completed)
      const projects = await storage.getProjectsByUser(user.id);
      const videosWithFinal = projects.filter(p => p.isCompleted && p.finalVideoUrl);
      
      // Format the response
      const publicVideos = videosWithFinal.map(project => ({
        id: project.id,
        title: ["My Music Video", "NeonVideo Song", "AI Generated Song"].includes(project.title) ? (project.audioPrompt ? project.audioPrompt.substring(0, 30) + (project.audioPrompt.length > 30 ? '...' : '') : project.title) : project.title,
        videoUrl: project.finalVideoUrl,
        thumbnailUrl: project.characterImageUrl || null,
        createdAt: project.createdAt,
        duration: project.audioDuration || 30
      }));
      
      res.json({
        user: {
          username: user.username,
          avatarUrl: user.avatarUrl
        },
        videos: publicVideos
      });
    } catch (error) {
      console.error("Get public videos error:", error);
      res.status(500).json({ error: "Failed to get public videos" });
    }
  });

  // Get community videos with alternating newest/random algorithm (no auth required)
  app.get("/api/community/videos", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50); // Max 50 items per request
      const afterId = req.query.afterId as string;
      const excludeUserId = req.query.excludeUserId as string | undefined;
      const sessionSeed = req.query.seed as string; // Accept seed from frontend for session stability

      // Use session seed if provided, otherwise create time-based seed
      const currentSeed = sessionSeed || Math.floor(Date.now() / (5 * 60 * 1000)).toString();

      // Get all completed projects with final videos from all users
      const allProjects = await storage.getAllVideosForAdmin();
      
      // Filter for completed AND PUBLIC videos only (critical security fix)
      const publicVideos = allProjects.filter(p => {
        // Filter out videos from excluded user if specified
        if (excludeUserId && p.userId === excludeUserId) {
          return false;
        }
        // Only show completed, public videos with finalVideoUrl
        return p.isCompleted && p.finalVideoUrl && p.isPublic !== false; // Include if isPublic is true or undefined
      });

      // Sort all videos by creation date (newest first)
      const sortedByDate = publicVideos.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      // Implement alternating newest/random algorithm FIRST, then apply pagination
      const recentVideos = sortedByDate.slice(0, Math.ceil(sortedByDate.length * 0.3)); // Top 30% recent
      const olderVideos = sortedByDate.slice(Math.ceil(sortedByDate.length * 0.3)); // Remaining 70% older

      // Shuffle older videos using session seed for stable randomization
      const shuffleWithSeed = (array: typeof olderVideos, seed: string) => {
        const shuffled = [...array];
        let currentIndex = shuffled.length;
        let temporaryValue, randomIndex;
        
        // Convert string seed to number for consistent randomness
        let seededRandom = seed.split('').reduce((a, b) => {
          a = ((a << 5) - a) + b.charCodeAt(0);
          return a & a;
        }, 0);
        
        const random = () => {
          seededRandom = (seededRandom * 9301 + 49297) % 233280;
          return Math.abs(seededRandom) / 233280;
        };

        while (currentIndex !== 0) {
          randomIndex = Math.floor(random() * currentIndex);
          currentIndex -= 1;
          temporaryValue = shuffled[currentIndex];
          shuffled[currentIndex] = shuffled[randomIndex];
          shuffled[randomIndex] = temporaryValue;
        }
        return shuffled;
      };

      const shuffledOlderVideos = shuffleWithSeed(olderVideos, currentSeed);

      // Create alternating pattern FIRST: newest[0], random(older), newest[1], random(older), etc.
      const alternatingVideos: typeof publicVideos = [];
      const maxItems = recentVideos.length + shuffledOlderVideos.length;
      
      let recentIndex = 0;
      let olderIndex = 0;
      
      for (let i = 0; i < maxItems; i++) {
        if (i % 2 === 0) {
          // Even positions: use newest videos
          if (recentIndex < recentVideos.length) {
            alternatingVideos.push(recentVideos[recentIndex]);
            recentIndex++;
          } else if (olderIndex < shuffledOlderVideos.length) {
            // Fallback to older videos if we run out of recent ones
            alternatingVideos.push(shuffledOlderVideos[olderIndex]);
            olderIndex++;
          }
        } else {
          // Odd positions: use random older videos
          if (olderIndex < shuffledOlderVideos.length) {
            alternatingVideos.push(shuffledOlderVideos[olderIndex]);
            olderIndex++;
          } else if (recentIndex < recentVideos.length) {
            // Fallback to recent videos if we run out of older ones
            alternatingVideos.push(recentVideos[recentIndex]);
            recentIndex++;
          }
        }
      }

      // THEN apply pagination to the alternating order (CRITICAL FIX)
      let paginatedVideos = alternatingVideos;
      if (afterId) {
        const afterIndex = alternatingVideos.findIndex(video => video.id === afterId);
        if (afterIndex >= 0) {
          paginatedVideos = alternatingVideos.slice(afterIndex + 1);
        }
      }

      const sortedVideos = paginatedVideos.slice(0, limit);

      // Format the response with user info
      const communityVideos = await Promise.all(
        sortedVideos.map(async (project) => {
          // Get the user info for each video
          const user = await storage.getUser(project.userId);
          
          // Get thumbnail from scene data or character image
          let thumbnailUrl = null;
          if (project.sceneData) {
            try {
              const scenes = typeof project.sceneData === 'string' 
                ? JSON.parse(project.sceneData) 
                : project.sceneData;
              
              if (Array.isArray(scenes) && scenes.length > 0) {
                const lastScene = scenes[scenes.length - 1];
                thumbnailUrl = lastScene.imageUrl || null;
              }
            } catch (e) {
              // Silently handle parse errors
            }
          }
          
          // Fallback to character image if no scene thumbnail
          if (!thumbnailUrl) {
            thumbnailUrl = project.characterImageUrl || null;
          }
          
          return {
            id: project.id,
            title: ["My Music Video", "NeonVideo Song", "AI Generated Song"].includes(project.title) ? (project.audioPrompt ? project.audioPrompt.substring(0, 30) + (project.audioPrompt.length > 30 ? '...' : '') : project.title) : project.title,
            videoUrl: project.finalVideoUrl,
            thumbnailUrl,
            createdAt: project.createdAt,
            duration: project.audioDuration || 30,
            // Mux streaming data for performance optimization
            mux: {
              playbackId: project.muxPlaybackId || null,
              assetStatus: project.muxAssetStatus || null,
              hlsUrl: project.muxPlaybackId ? `https://stream.mux.com/${project.muxPlaybackId}.m3u8` : null
            },
            creator: {
              id: user?.id || project.userId,
              username: user?.username || 'Unknown User',
              avatarUrl: user?.avatarUrl || null
            }
          };
        })
      );

      // Prepare pagination info with session seed for stability
      const hasMore = paginatedVideos.length > limit;
      const nextAfterId = hasMore ? sortedVideos[sortedVideos.length - 1].id : null;
      
      res.json({
        videos: communityVideos,
        pagination: {
          hasMore,
          nextAfterId,
          seed: currentSeed // Include seed for session stability
        }
      });
    } catch (error) {
      console.error("Get community videos error:", error);
      res.status(500).json({ error: "Failed to get community videos" });
    }
  });

  // Get trending/public videos (no auth required)
  app.get("/api/trending-videos", async (req, res) => {
    try {
      // Get excludeUserId from query params if provided
      const excludeUserId = req.query.excludeUserId as string | undefined;
      
      // Get all completed projects with final videos from all users
      const allProjects = await storage.getAllVideosForAdmin(); // Reuse admin function to get all videos
      
      // Filter for completed AND FEATURED videos and sort by creation date (newest first)
      const trendingVideos = allProjects
        .filter(p => {
          // Filter out videos from excluded user if specified
          if (excludeUserId && p.userId === excludeUserId) {
            return false;
          }
          // Only show completed videos that are marked as featured by admin
          return p.isCompleted && p.finalVideoUrl && p.isFeatured;
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 12) // Get top 12 videos
        .map(async (project) => {
          // Get the user info for each video
          const user = await storage.getUser(project.userId);
          
          // Get thumbnail
          let thumbnailUrl = null;
          if (project.sceneData) {
            try {
              const scenes = typeof project.sceneData === 'string' 
                ? JSON.parse(project.sceneData) 
                : project.sceneData;
              
              if (Array.isArray(scenes) && scenes.length > 0) {
                const lastScene = scenes[scenes.length - 1];
                thumbnailUrl = lastScene.imageUrl || null;
              }
            } catch (e) {
              // Silently handle parse errors
            }
          }
          
          return {
            id: project.id,
            title: ["My Music Video", "NeonVideo Song", "AI Generated Song"].includes(project.title) ? (project.audioPrompt ? project.audioPrompt.substring(0, 30) + (project.audioPrompt.length > 30 ? '...' : '') : project.title) : project.title,
            videoUrl: project.finalVideoUrl,
            thumbnailUrl,
            createdAt: project.createdAt,
            duration: project.audioDuration || 30,
            creator: {
              username: user?.username || 'Unknown User',
              avatarUrl: user?.avatarUrl || null
            }
          };
        });
      
      // Wait for all promises to resolve
      const videos = await Promise.all(trendingVideos);
      
      res.json(videos);
    } catch (error) {
      console.error("Get trending videos error:", error);
      res.status(500).json({ error: "Failed to get trending videos" });
    }
  });

  app.get("/api/my-videos", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const projects = await storage.getProjectsByUser(userId);
      // Filter only completed projects with final videos
      const completedVideos = projects
        .filter(p => p.isCompleted && p.finalVideoUrl)
        .map(p => {
          // Get the last scene image if available
          let thumbnailUrl = null;
          if (p.sceneData) {
            try {
              // Parse sceneData if it's a string
              const scenes = typeof p.sceneData === 'string' 
                ? JSON.parse(p.sceneData) 
                : p.sceneData;
              
              if (Array.isArray(scenes) && scenes.length > 0) {
                const lastScene = scenes[scenes.length - 1];
                thumbnailUrl = lastScene.imageUrl || null;
              }
            } catch (e) {
              // Silently handle parse errors for old data
            }
          }
          
          return {
            id: p.id,
            title: p.title || p.audioPrompt || "Untitled Video", // Use actual title (song title) if available, fallback to audio prompt, then default
            videoUrl: p.finalVideoUrl,
            thumbnailUrl,
            sceneImages: p.sceneImages || [],
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
            // Mux streaming data for performance optimization
            mux: {
              playbackId: p.muxPlaybackId || null,
              assetStatus: p.muxAssetStatus || null,
              hlsUrl: p.muxPlaybackId ? `https://stream.mux.com/${p.muxPlaybackId}.m3u8` : null
            }
          };
        });
      res.json(completedVideos);
    } catch (error) {
      console.error("Get my videos error:", error);
      res.status(500).json({ error: "Failed to get videos" });
    }
  });

  // Like a video
  app.post("/api/videos/:videoId/like", authenticateToken, async (req, res) => {
    try {
      const { videoId } = req.params;
      const userId = (req as any).user.userId;
      
      // Check if video exists
      const project = await storage.getProject(videoId);
      if (!project || !project.isCompleted || !project.finalVideoUrl) {
        return res.status(404).json({ error: "Video not found" });
      }
      
      // Like the video
      const liked = await storage.likeVideo(videoId, userId);
      if (!liked) {
        return res.status(400).json({ error: "Video already liked" });
      }
      
      // Get updated likes count
      const likesCount = await storage.getVideoLikesCount(videoId);
      
      res.json({ 
        success: true, 
        liked: true,
        likesCount 
      });
    } catch (error) {
      console.error("Like video error:", error);
      res.status(500).json({ error: "Failed to like video" });
    }
  });

  // Unlike a video
  app.delete("/api/videos/:videoId/like", authenticateToken, async (req, res) => {
    try {
      const { videoId } = req.params;
      const userId = (req as any).user.userId;
      
      // Check if video exists
      const project = await storage.getProject(videoId);
      if (!project || !project.isCompleted || !project.finalVideoUrl) {
        return res.status(404).json({ error: "Video not found" });
      }
      
      // Unlike the video
      const unliked = await storage.unlikeVideo(videoId, userId);
      if (!unliked) {
        return res.status(400).json({ error: "Video not liked" });
      }
      
      // Get updated likes count
      const likesCount = await storage.getVideoLikesCount(videoId);
      
      res.json({ 
        success: true, 
        liked: false,
        likesCount 
      });
    } catch (error) {
      console.error("Unlike video error:", error);
      res.status(500).json({ error: "Failed to unlike video" });
    }
  });

  // Check if a video is liked by the current user
  app.get("/api/videos/:videoId/like", authenticateToken, async (req, res) => {
    try {
      const { videoId } = req.params;
      const userId = (req as any).user.userId;
      
      // Check if video exists
      const project = await storage.getProject(videoId);
      if (!project || !project.isCompleted || !project.finalVideoUrl) {
        return res.status(404).json({ error: "Video not found" });
      }
      
      // Check if user has liked the video
      const isLiked = await storage.isVideoLikedByUser(videoId, userId);
      const likesCount = await storage.getVideoLikesCount(videoId);
      
      res.json({ 
        liked: isLiked,
        likesCount 
      });
    } catch (error) {
      console.error("Check video like error:", error);
      res.status(500).json({ error: "Failed to check video like status" });
    }
  });

  // Get comments for a video (no auth required)
  app.get("/api/videos/:videoId/comments", async (req, res) => {
    try {
      const { videoId } = req.params;
      
      // Check if video exists
      const project = await storage.getProject(videoId);
      if (!project || !project.isCompleted || !project.finalVideoUrl) {
        return res.status(404).json({ error: "Video not found" });
      }
      
      // Get comments
      const comments = await storage.getComments(videoId);
      
      // Get user details for each comment
      const commentsWithUsers = await Promise.all(
        comments.map(async (comment) => {
          const user = await storage.getUser(comment.userId);
          return {
            id: comment.id,
            content: comment.content,
            createdAt: comment.createdAt,
            updatedAt: comment.updatedAt,
            user: {
              id: user?.id || '',
              username: user?.username || 'Unknown User',
              avatarUrl: user?.avatarUrl || null
            }
          };
        })
      );
      
      res.json(commentsWithUsers);
    } catch (error) {
      console.error("Get video comments error:", error);
      res.status(500).json({ error: "Failed to get video comments" });
    }
  });

  // Add a comment to a video
  app.post("/api/videos/:videoId/comments", authenticateToken, async (req, res) => {
    try {
      const { videoId } = req.params;
      const { content } = req.body;
      const userId = (req as any).user.userId;
      
      // Validate input
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ error: "Comment content is required" });
      }
      
      if (content.length > 500) {
        return res.status(400).json({ error: "Comment too long (max 500 characters)" });
      }
      
      // Server-side profanity filtering
      const { checkProfanity, getCategoryMessage } = await import('../server/profanity-filter.js');
      const profanityCheck = checkProfanity(content.trim());
      if (!profanityCheck.isClean) {
        return res.status(400).json({ 
          error: getCategoryMessage(profanityCheck.category || ""),
          type: "profanity_detected"
        });
      }
      
      // Check if video exists
      const project = await storage.getProject(videoId);
      if (!project || !project.isCompleted || !project.finalVideoUrl) {
        return res.status(404).json({ error: "Video not found" });
      }
      
      // Add comment
      const comment = await storage.addComment({
        projectId: videoId,
        userId,
        content: content.trim()
      });
      
      // Get user details for response
      const user = await storage.getUser(userId);
      
      res.status(201).json({
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        user: {
          id: user?.id || '',
          username: user?.username || 'Unknown User',
          avatarUrl: user?.avatarUrl || null
        }
      });
    } catch (error) {
      console.error("Add video comment error:", error);
      res.status(500).json({ error: "Failed to add comment" });
    }
  });

  // Delete a comment
  app.delete("/api/videos/:videoId/comments/:commentId", authenticateToken, async (req, res) => {
    try {
      const { videoId, commentId } = req.params;
      const userId = (req as any).user.userId;
      
      // Check if video exists
      const project = await storage.getProject(videoId);
      if (!project || !project.isCompleted || !project.finalVideoUrl) {
        return res.status(404).json({ error: "Video not found" });
      }
      
      // Get all comments for this video to verify comment belongs to this video
      const comments = await storage.getComments(videoId);
      const comment = comments.find(c => c.id === commentId);
      
      if (!comment) {
        return res.status(404).json({ error: "Comment not found on this video" });
      }
      
      if (comment.userId !== userId) {
        return res.status(403).json({ error: "You don't have permission to delete this comment" });
      }
      
      // Delete comment
      const success = await storage.deleteComment(commentId, userId);
      
      if (!success) {
        return res.status(500).json({ error: "Failed to delete comment" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Delete video comment error:", error);
      res.status(500).json({ error: "Failed to delete comment" });
    }
  });

  // Get all user's generated songs
  app.get("/api/my-songs", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      console.log("=== FETCHING SONGS FOR USER ===");
      console.log("User ID:", userId);
      
      const songs = await storage.getSongs(userId);
      console.log("Raw songs from database:", songs.length);
      console.log("Songs data:", JSON.stringify(songs, null, 2));
      
      // Sort by newest first and format for frontend
      const formattedSongs = songs
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map(song => ({
          id: song.id,
          title: song.title,
          audioUrl: song.url,
          audioTags: song.tags,
          audioLyrics: song.lyrics,
          duration: song.duration,
          subtitleFileUrl: song.subtitleFileUrl,
          kieTaskId: song.kieTaskId,
          kieAudioId: song.kieAudioId,
          createdAt: song.createdAt,
          updatedAt: song.createdAt // Songs table doesn't have updatedAt
        }));
      
      console.log("Formatted songs to return:", formattedSongs.length);
      res.json(formattedSongs);
    } catch (error) {
      console.error("Get my songs error:", error);
      res.status(500).json({ error: "Failed to get songs" });
    }
  });

  // Delete user's own song
  app.delete("/api/my-songs/:id", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const songId = req.params.id;
      
      // First check if the song exists and belongs to the user
      const song = await storage.getSong(songId);
      
      if (!song) {
        // Song doesn't exist - return 404 but frontend treats this as success
        return res.status(404).json({ error: "Song not found" });
      }
      
      // Check if the song belongs to the requesting user
      if (song.userId !== userId) {
        return res.status(403).json({ error: "You can only delete your own songs" });
      }
      
      // Delete the song
      await storage.deleteSong(songId);
      res.json({ message: "Song deleted successfully" });
    } catch (error) {
      console.error("Delete song error:", error);
      res.status(500).json({ error: "Failed to delete song" });
    }
  });

  // Get user's current project (most recent)
  app.get("/api/current-project", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const projects = await storage.getProjectsByUser(userId);
      // Get the most recent project (in-progress or completed)
      const currentProject = projects
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
      
      if (!currentProject) {
        return res.status(404).json({ error: "No project found" });
      }
      
      res.json(currentProject);
    } catch (error) {
      console.error("Get current project error:", error);
      res.status(500).json({ error: "Failed to get current project" });
    }
  });

  // Get project by ID
  app.get("/api/projects/:id", authenticateToken, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error("Get project error:", error);
      res.status(500).json({ error: "Failed to get project" });
    }
  });

  // Update project
  app.patch("/api/projects/:id", authenticateToken, async (req, res) => {
    try {
      const project = await storage.updateProject(req.params.id, req.body);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error("Update project error:", error);
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  // Upload audio file
  app.post("/api/projects/:id/upload-audio", audioUpload.single('audio'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      // Get the project to find the user
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Get user with plan to check if they're paid
      const userWithPlan = await storage.getUserWithPlan(project.userId);
      const isPaidUser = userWithPlan?.plan && userWithPlan.plan.monthlyPrice > 0;
      
      // Cap duration based on user plan: Free users max 120s (2 min), Paid users max 180s (3 min)
      const maxDuration = isPaidUser ? 180 : 120;
      
      // Get song title and description from request (optional)
      const songTitle = req.body.title || "";
      const songDescription = req.body.description || "";

      console.log(`Uploading audio file (user plan: ${isPaidUser ? 'paid' : 'free'}, max allowed: ${maxDuration}s)${songTitle ? `, title: "${songTitle}"` : ''}${songDescription ? `, description: "${songDescription.substring(0, 50)}..."` : ''}`);

      // First, store the uploaded audio to object storage to get a public URL
      const objectStorageService = new ObjectStorageService();
      const audioPath = `songs/${crypto.randomUUID()}.${req.file.originalname.split('.').pop()}`;
      const audioBuffer = fs.readFileSync(req.file.path);
      
      // Upload to object storage
      const uploadedUrl = await objectStorageService.uploadAudioBuffer(audioBuffer, audioPath);
      const publicAudioUrl = await objectStorageService.getSignedUrlForPath(`/objects/${audioPath}`, 86400);

      console.log(`Audio uploaded to object storage: ${uploadedUrl}`);

      // Get the actual duration of the uploaded audio file
      let actualDuration: number;
      try {
        await storage.addGenerationLog({
          projectId: req.params.id,
          step: "audio_upload",
          message: "Detecting audio duration...",
          status: "progress",
          metadata: {}
        });

        const { getAudioDurationFromFile, trimAudio } = await import("./services/ffmpeg");
        actualDuration = await getAudioDurationFromFile(req.file.path);
        
        console.log(`Detected audio duration: ${actualDuration} seconds`);
        
        // Auto-trim if duration exceeds the maximum for user's plan
        if (actualDuration > maxDuration) {
          const originalDuration = actualDuration;
          
          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "audio_upload",
            message: `Audio file is ${originalDuration}s long, automatically trimming to ${maxDuration}s...`,
            status: "progress",
            metadata: { originalDuration, maxDuration }
          });
          
          console.log(`Audio is ${originalDuration}s, trimming to ${maxDuration}s`);
          
          // Trim the audio using the FFMPEG API
          const trimResult = await trimAudio(publicAudioUrl, maxDuration);
          
          // Download the trimmed audio
          const trimmedResponse = await fetch(trimResult.download_url);
          const trimmedBuffer = Buffer.from(await trimmedResponse.arrayBuffer());
          
          // Replace the original audio in object storage with the trimmed version
          await objectStorageService.uploadAudioBuffer(trimmedBuffer, audioPath);
          
          // Update duration to the trimmed length
          actualDuration = maxDuration;
          
          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "audio_upload",
            message: `Audio automatically trimmed from ${originalDuration}s to ${maxDuration}s`,
            status: "completed",
            metadata: { originalDuration, trimmedDuration: actualDuration }
          });
          
          console.log(`Audio trimmed successfully to ${actualDuration}s`);
        }
        
      } catch (durationError) {
        console.error("Failed to detect audio duration:", durationError);
        await storage.addGenerationLog({
          projectId: req.params.id,
          step: "audio_upload",
          message: "Failed to detect audio duration, using estimate",
          status: "warning",
          metadata: { error: (durationError as Error).message }
        });
        // Default to 60 seconds if detection fails
        actualDuration = 60;
      }

      const finalAudioUrl = uploadedUrl;
      
      // Clean up the temporary uploaded file
      try {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
          console.log("Temporary file cleaned up:", req.file.path);
        }
      } catch (cleanupError) {
        console.error("Failed to clean up uploaded file:", cleanupError);
      }
      
      // Update project with audio URL and description
      // For uploaded audio, we store the description in audioPrompt to generate scenes
      const updateData: any = { 
        audioUrl: finalAudioUrl,
        audioType: 'uploaded',
        audioDuration: actualDuration,
        audioPrompt: songDescription || null, // Store description in audioPrompt for scene generation
        addSubtitles: false // No subtitles for uploaded audio
      };
      
      // Only update title if user provided one
      if (songTitle.trim()) {
        updateData.title = songTitle.trim();
      }
      
      const updatedProject = await storage.updateProject(req.params.id, updateData);
      
      if (!updatedProject) {
        return res.status(404).json({ error: "Project not found" });
      }

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "audio_upload",
        message: `Audio file uploaded successfully (${actualDuration}s)${songDescription ? ', with description' : ''}`,
        status: "completed",
        metadata: { 
          filename: req.file.filename,
          originalName: req.file.originalname,
          size: req.file.size,
          audioUrl: finalAudioUrl,
          duration: actualDuration,
          hasDescription: !!songDescription
        }
      });

      res.json({ 
        audioUrl: finalAudioUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        duration: actualDuration,
        hasDescription: !!songDescription
      });
    } catch (error) {
      console.error("Upload audio error:", error);
      
      // Clean up file if it was uploaded but processing failed
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.error("Failed to clean up uploaded file:", cleanupError);
        }
      }

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "audio_upload",
        message: `Audio upload failed: ${(error as Error).message}`,
        status: "error",
        metadata: { error: (error as Error).message }
      });

      res.status(500).json({ error: "Failed to upload audio file" });
    }
  });

  // Generate lyrics with OpenAI and KIE.AI fallback
  app.post("/api/projects/:id/generate-lyrics", async (req, res) => {
    try {
      const { description, duration = 120 } = req.body; // Duration in seconds
      
      // Check for profanity in description
      if (description) {
        const profanityCheck = checkProfanity(description);
        if (!profanityCheck.isClean) {
          console.log("Description contains inappropriate content:", profanityCheck.detectedWords);
          
          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "lyrics_generation",
            message: `Lyrics generation blocked: description contains inappropriate content (${profanityCheck.category})`,
            status: "error",
            metadata: { 
              detectedWords: profanityCheck.detectedWords,
              category: profanityCheck.category
            }
          });
          
          return res.status(400).json({ 
            error: "Content Policy Violation",
            details: getCategoryMessage(profanityCheck.category || 'unknown'),
            category: profanityCheck.category
          });
        }
      }
      
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "lyrics_generation",
        message: "Starting lyrics generation",
        status: "started",
        metadata: { description }
      });

      let lyrics: string;
      let title: string;
      let generationMethod = "OpenAI";

      try {
        // First, try OpenAI lyrics generation
        console.log("Attempting lyrics generation with OpenAI...");
        const { generateLyricsWithTitle } = await import("./services/openai");
        const openaiResult = await generateLyricsWithTitle(description, duration);
        lyrics = openaiResult.lyrics;
        title = openaiResult.title;
        generationMethod = "OpenAI";
        
        console.log("OpenAI lyrics generation successful");
      } catch (openaiError) {
        console.log("OpenAI lyrics generation failed, trying KIE.AI fallback...");
        console.error("OpenAI error:", (openaiError as Error).message);
        
        await storage.addGenerationLog({
          projectId: req.params.id,
          step: "lyrics_generation",
          message: `OpenAI failed, trying KIE.AI fallback: ${(openaiError as Error).message}`,
          status: "retry",
          metadata: { openaiError: (openaiError as Error).message }
        });

        try {
          // Fallback to KIE.AI lyrics generation
          const { generateLyricsWithKieAndTitle } = await import("./services/kie");
          const kieResult = await generateLyricsWithKieAndTitle(description, duration);
          lyrics = kieResult.lyrics;
          title = kieResult.title;
          generationMethod = "KIE.AI";
          
          console.log("KIE.AI lyrics generation successful");
        } catch (kieError) {
          console.log("Both OpenAI and KIE.AI lyrics generation failed");
          console.error("KIE.AI error:", (kieError as Error).message);
          
          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "lyrics_generation",
            message: `Both OpenAI and KIE.AI failed. OpenAI: ${(openaiError as Error).message}. KIE.AI: ${(kieError as Error).message}`,
            status: "error",
            metadata: { 
              openaiError: (openaiError as Error).message,
              kieError: (kieError as Error).message
            }
          });
          
          // Both methods failed
          return res.status(500).json({ 
            error: "Lyrics generation failed, please try again.",
            details: "Both OpenAI and KIE.AI generation methods failed"
          });
        }
      }
      
      // Check for profanity in generated lyrics
      const profanityCheck = checkProfanity(lyrics);
      if (!profanityCheck.isClean) {
        console.log("Generated lyrics contain inappropriate content:", profanityCheck.detectedWords);
        
        await storage.addGenerationLog({
          projectId: req.params.id,
          step: "lyrics_generation",
          message: `Generated lyrics contain inappropriate content: ${profanityCheck.category}`,
          status: "error",
          metadata: { 
            detectedWords: profanityCheck.detectedWords,
            category: profanityCheck.category
          }
        });
        
        return res.status(400).json({ 
          error: "Generated lyrics contain inappropriate content",
          details: getCategoryMessage(profanityCheck.category || 'unknown'),
          category: profanityCheck.category
        });
      }

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "lyrics_generation",
        message: `Lyrics and title generated successfully using ${generationMethod}`,
        status: "completed",
        metadata: { lyrics, title, generationMethod }
      });

      // Update the project title with the AI-generated title
      if (title) {
        await storage.updateProject(req.params.id, { title });
      }

      res.json({ lyrics, title, generationMethod });
    } catch (error) {
      console.error("Generate lyrics error:", error);
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "lyrics_generation",
        message: `Lyrics generation failed: ${(error as Error).message}`,
        status: "error",
        metadata: { error: (error as Error).message }
      });
      res.status(500).json({ 
        error: "Lyrics generation failed, please try again.",
        details: (error as Error).message
      });
    }
  });

  // Generate song
  app.post("/api/projects/:id/generate-song", async (req, res) => {
    try {
      const { description, tags, lyrics, songTitle, duration = 120, addSubtitles = false, includeWatermark = true } = req.body; // Duration in seconds
      
      // Check for profanity in user-provided lyrics
      if (lyrics) {
        const profanityCheck = checkProfanity(lyrics);
        if (!profanityCheck.isClean) {
          console.log("User-provided lyrics contain inappropriate content:", profanityCheck.detectedWords);
          
          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "song_generation",
            message: `Song generation blocked: lyrics contain inappropriate content (${profanityCheck.category})`,
            status: "error",
            metadata: { 
              detectedWords: profanityCheck.detectedWords,
              category: profanityCheck.category
            }
          });
          
          return res.status(400).json({ 
            error: "Content Policy Violation",
            details: getCategoryMessage(profanityCheck.category || 'unknown'),
            category: profanityCheck.category
          });
        }
      }
      
      // Get project to find the user
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      
      // Get user with plan to validate duration limit
      const userWithPlan = await storage.getUserWithPlan(project.userId);
      const isPaidUser = userWithPlan?.plan && userWithPlan.plan.monthlyPrice > 0;
      const isPremiumUser = userWithPlan?.plan?.name === "Premium";
      
      // Validate duration based on user plan: Free users max 120s (2 min), Paid users max 180s (3 min)
      const maxDuration = isPaidUser ? 180 : 120;
      if (duration > maxDuration) {
        return res.status(400).json({ 
          error: `Duration exceeds maximum allowed for your plan. ${isPaidUser ? 'Paid users' : 'Free users'} can generate songs up to ${maxDuration} seconds (${maxDuration / 60} minutes).`,
          maxDuration,
          isPaidUser
        });
      }
      
      // Only Premium users can disable watermark - enforce server-side
      const finalIncludeWatermark = isPremiumUser ? includeWatermark : true;
      
      // Check if user has enough credits for song generation (250 credits)
      const SONG_GENERATION_CREDITS = 250;
      const canAfford = await storage.canUserAffordCredits(project.userId, SONG_GENERATION_CREDITS);
      if (!canAfford) {
        const creditsRemaining = await storage.getUserCreditsRemaining(project.userId);
        return res.status(402).json({ 
          error: "Insufficient credits", 
          creditsRequired: SONG_GENERATION_CREDITS,
          creditsRemaining 
        });
      }
      
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "song_generation",
        message: "Starting song generation",
        status: "started",
        metadata: { tags, lyrics, addSubtitles, includeWatermark: finalIncludeWatermark, isPremiumUser }
      });

      let result;
      let subtitleFileUrl = null;
      let generatedSubtitlesContent = null;
      let kieTaskId = null;
      let kieAudioId = null;
      
      // Always use ElevenLabs for song generation
      console.log("Using ElevenLabs for song generation...");
      const durationMs = duration * 1000; // Convert to milliseconds for ElevenLabs
      const elevenLabsSong = await generateSongWithElevenLabs(tags, lyrics, durationMs);
      
      // Create result format similar to KIE response but with single song
      result = {
        songs: [elevenLabsSong],
        firstSongUrl: elevenLabsSong.audioUrl
      };
      
      // Generate subtitles using ElevenLabs forced alignment if requested
      if (addSubtitles && lyrics) {
        console.log("Generating subtitles using ElevenLabs forced alignment...");
        
        try {
          // Create forced alignment with ElevenLabs
          const alignmentResponse = await createForcedAlignment(elevenLabsSong.audioUrl, lyrics);
          
          // Convert to .ass format
          const assContent = convertElevenLabsAlignmentToASS(alignmentResponse);
          generatedSubtitlesContent = assContent; // Store for debugging display
          
          // Store subtitle file with the song ID for proper association
          const songId = elevenLabsSong.audioUrl.split('/').pop()?.replace('.mp3', '') || undefined;
          subtitleFileUrl = await storeElevenLabsSubtitleFile(assContent, songId);
          
          console.log("ElevenLabs subtitle file stored at:", subtitleFileUrl);
          
          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "subtitle_generation", 
            message: "Subtitles generated successfully using ElevenLabs forced alignment",
            status: "completed",
            metadata: { subtitleFileUrl, wordCount: alignmentResponse.words?.length || 0 }
          });
        } catch (subtitleError) {
          console.error("ElevenLabs subtitle generation failed:", subtitleError);
          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "subtitle_generation",
            message: `ElevenLabs subtitle generation failed: ${(subtitleError as Error).message}`,
            status: "error",
            metadata: { error: (subtitleError as Error).message }
          });
          // Continue without subtitles
        }
      }
      
      // Save the song to the user's library
      // Note: We already have 'project' from earlier in this endpoint
      const selectedSong = result.songs[0];
      const songData = {
        userId: project.userId,
        title: songTitle || description || tags || "NeonVideo Song",
        url: selectedSong.audioUrl,
        duration: duration,
        tags: tags || null,
        lyrics: lyrics || null,
        prompt: description || null,
        subtitleFileUrl: subtitleFileUrl || null,
        // Remove KIE fields since we're using ElevenLabs
        kieTaskId: null,
        kieAudioId: null
      };
      
      console.log("=== ATTEMPTING TO SAVE SONG TO LIBRARY ===");
      console.log("Song data:", JSON.stringify(songData, null, 2));
      
      let savedSong;
      try {
        savedSong = await storage.addSong(songData);
        console.log("✅ Song successfully saved to user library!");
        console.log("Saved song ID:", savedSong.id);
        console.log("Saved song URL:", savedSong.url);
        
        // If subtitles were generated but we have the song ID now, 
        // re-store the subtitle file with the song ID as the filename
        if (addSubtitles && generatedSubtitlesContent && savedSong.id) {
          try {
            console.log("Re-storing ElevenLabs subtitle file with song ID...");
            const namedSubtitleUrl = await storeElevenLabsSubtitleFile(generatedSubtitlesContent, savedSong.id);
            subtitleFileUrl = namedSubtitleUrl;
            
            console.log("Updated ElevenLabs subtitle file URL:", namedSubtitleUrl);
            
          } catch (subtitleUpdateError) {
            console.warn("Failed to re-store ElevenLabs subtitle with song ID:", subtitleUpdateError);
            // Keep the original subtitle URL
          }
        }
      } catch (libraryError) {
        console.error("❌ FAILED to save song to library:");
        console.error("Error details:", libraryError);
        console.error("Error message:", (libraryError as Error).message);
        console.error("Error stack:", (libraryError as Error).stack);
        // Don't fail the entire request if saving to library fails
      }
      
      // Update the project with the selected song
      await storage.updateProject(req.params.id, {
        title: description || tags, // Use the full song description as the project title, fallback to tags
        audioUrl: selectedSong.audioUrl,
        audioType: "generated",
        audioPrompt: description,
        audioTags: tags,
        audioLyrics: lyrics,
        audioDuration: duration, // Store the duration in seconds
        addSubtitles: addSubtitles,
        includeWatermark: finalIncludeWatermark, // Server-side enforced watermark setting
        subtitleFileUrl: subtitleFileUrl,
        // Remove KIE fields since we're using ElevenLabs
        kieTaskId: null,
        kieAudioId: null,
        currentStep: 2
      });

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "song_generation",
        message: `Generated ${result.songs.length} songs successfully`,
        status: "completed",
        metadata: { songs: result.songs }
      });

      // Deduct credits for successful song generation
      const creditDeducted = await storage.deductUserCredits(project.userId, SONG_GENERATION_CREDITS);
      if (!creditDeducted) {
        console.error("Failed to deduct credits for song generation, but song was already generated");
      } else {
        console.log(`Deducted ${SONG_GENERATION_CREDITS} credits for song generation from user ${project.userId}`);
      }
      
      // Add debugging subtitle content to response if generated
      const responseData = {
        ...result,
        subtitleFileUrl,
        generatedSubtitlesContent // For debugging display
      };
      
      res.json(responseData);
    } catch (error) {
      console.error("Generate song error:", error);
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "song_generation",
        message: `Song generation failed: ${(error as Error).message}`,
        status: "error",
        metadata: { error: (error as Error).message }
      });
      res.status(500).json({ error: "Failed to generate song" });
    }
  });


  // Generate character
  app.post("/api/projects/:id/generate-character", async (req, res) => {
    try {
      console.log("Character generation route called with body:", req.body);
      const { prompt, aspectRatio = "16:9" } = req.body;
      console.log("Extracted prompt:", prompt);
      console.log("Aspect ratio:", aspectRatio);
      
      if (!prompt || !prompt.trim()) {
        throw new Error("No prompt provided");
      }
      
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "character_generation",
        message: "Starting character generation",
        status: "started",
        metadata: { prompt }
      });

      console.log("About to call generateCharacterImage with aspect ratio:", aspectRatio);
      const imageUrl = await generateCharacterImage(prompt, aspectRatio);
      console.log("generateCharacterImage returned:", imageUrl);
      
      await storage.updateProject(req.params.id, {
        characterImageUrl: imageUrl,
        characterType: "generated",
        characterPrompt: prompt,
        currentStep: 3
      });

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "character_generation",
        message: "Character generated successfully",
        status: "completed",
        metadata: { imageUrl }
      });

      res.json({ imageUrl });
    } catch (error) {
      console.error("Generate character error:", error);
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "character_generation",
        message: `Character generation failed: ${(error as Error).message}`,
        status: "error",
        metadata: { error: (error as Error).message }
      });
      res.status(500).json({ error: "Failed to generate character" });
    }
  });

  // Generate multiple character options (KIE.ai API)
  app.post("/api/projects/:id/generate-character-options", async (req, res) => {
    try {
      console.log("Character options generation route called with body:", req.body);
      const { prompt, aspectRatio = "16:9" } = req.body;
      console.log("Extracted prompt:", prompt);
      console.log("Aspect ratio:", aspectRatio);
      
      if (!prompt || !prompt.trim()) {
        throw new Error("No prompt provided");
      }
      
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "character_generation",
        message: "Starting character options generation",
        status: "started",
        metadata: { prompt }
      });

      console.log("About to call generateCharacterImages with aspect ratio:", aspectRatio);
      const imageUrls = await generateCharacterImages(prompt, aspectRatio);
      console.log("generateCharacterImages returned:", imageUrls);

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "character_generation",
        message: "Character options generated successfully",
        status: "completed",
        metadata: { imageUrls, count: imageUrls.length }
      });

      res.json({ imageUrls, prompt });
    } catch (error) {
      console.error("Generate character options error:", error);
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "character_generation",
        message: `Character options generation failed: ${(error as Error).message}`,
        status: "error",
        metadata: { error: (error as Error).message }
      });
      res.status(500).json({ error: "Failed to generate character options" });
    }
  });

  // Save selected character option to project  
  app.post("/api/projects/:id/save-character-option", async (req, res) => {
    try {
      console.log("Save character option request body:", req.body);
      const { imageUrl, prompt } = req.body;
      
      if (!imageUrl || !prompt) {
        return res.status(400).json({ error: "Image URL and prompt are required" });
      }

      // Download and store the image permanently
      console.log("Downloading and storing character image...");
      const storedImage = await downloadAndStoreImage(imageUrl, "characters");
      console.log("Image stored successfully:", storedImage.storedUrl);

      const project = await storage.updateProject(req.params.id, {
        characterImageUrl: storedImage.storedUrl,
        characterType: "generated",
        characterPrompt: prompt,
        currentStep: 3
      });

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "character_generation",
        message: "Character option saved successfully with permanent storage",
        status: "completed",
        metadata: { 
          originalImageUrl: imageUrl,
          storedImageUrl: storedImage.storedUrl,
          prompt 
        }
      });

      res.json({ 
        characterImageUrl: project?.characterImageUrl,
        message: 'Character saved successfully' 
      });
    } catch (error) {
      console.error("Save character option error:", error);
      res.status(500).json({ error: "Failed to save character option" });
    }
  });

  // Select song for project (handles both generated songs and library songs)
  app.post("/api/projects/:id/select-song", authenticateToken, async (req, res) => {
    try {
      const { audioUrl, audioTags, audioLyrics, audioType, duration, subtitleFileUrl, kieTaskId, kieAudioId, title } = req.body;
      
      console.log("=== SELECT-SONG REQUEST ===");
      console.log("Request body:", JSON.stringify(req.body, null, 2));
      console.log("Duration received:", duration);
      
      // Build update data based on what's provided
      const updateData: any = {
        audioUrl,
        currentStep: 2
      };
      
      // Add optional fields if provided (for library songs)
      if (audioTags) updateData.audioTags = audioTags;
      if (audioLyrics) updateData.audioLyrics = audioLyrics;
      if (audioType) updateData.audioType = audioType;
      if (duration) updateData.audioDuration = duration;
      if (title && title.trim()) updateData.title = title.trim();
      if (subtitleFileUrl) {
        updateData.addSubtitles = true;
        updateData.subtitleFileUrl = subtitleFileUrl;
        updateData.kieTaskId = kieTaskId;
        updateData.kieAudioId = kieAudioId;
      }
      
      console.log("Update data to save:", JSON.stringify(updateData, null, 2));
      
      const project = await storage.updateProject(req.params.id, updateData);
      
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "song_selection",
        message: "Song selected for project",
        status: "completed",
        metadata: { audioUrl, audioTags, audioLyrics, duration }
      });
      
      res.json({ 
        audioUrl: project.audioUrl,
        message: 'Song selected successfully' 
      });
    } catch (error) {
      console.error("Select song error:", error);
      res.status(500).json({ error: "Failed to select song" });
    }
  });

  // Save selected character to project
  app.post("/api/projects/:id/save-character", authenticateToken, async (req, res) => {
    try {
      console.log("Save character request body:", JSON.stringify(req.body, null, 2));
      console.log("Project ID:", req.params.id);
      
      const { imageUrl, prompt } = req.body;
      
      if (!imageUrl || !prompt) {
        console.log("Missing required fields - imageUrl:", !!imageUrl, "prompt:", !!prompt);
        return res.status(400).json({ error: "Image URL and prompt are required" });
      }

      let characterImageUrl = imageUrl;
      
      // Only download and store if it's an external URL (starts with http)
      // Library characters already have relative URLs to our object storage
      if (imageUrl.startsWith('http')) {
        console.log("Downloading and storing external character image...");
        const storedImage = await downloadAndStoreImage(imageUrl, "characters");
        console.log("Image stored successfully:", storedImage.storedUrl);
        characterImageUrl = storedImage.storedUrl;
      } else {
        console.log("Using existing character from library:", imageUrl);
      }

      const updateData = {
        characterImageUrl,
        characterPrompt: prompt,
        characterType: "selected",
        currentStep: 3
      };
      
      console.log("Updating project with data:", JSON.stringify(updateData, null, 2));
      
      const updatedProject = await storage.updateProject(req.params.id, updateData);
      
      console.log("Updated project result:", JSON.stringify(updatedProject, null, 2));

      res.json({ success: true });
    } catch (error) {
      console.error("Save character to project error:", error);
      res.status(500).json({ error: "Failed to save character to project" });
    }
  });

  // Generate scenes
  app.post("/api/projects/:id/generate-scenes", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      console.log("Project data for scene generation:", JSON.stringify(project, null, 2));
      
      if (!project) {
        console.log("No project found for ID:", req.params.id);
        return res.status(400).json({ error: "Project not found" });
      }
      
      if (!project.characterImageUrl) {
        console.log("Missing characterImageUrl in project:", project.characterImageUrl);
        return res.status(400).json({ error: "Character image URL is required. Please create or select a character first." });
      }

      // Create a prompt based on what we have
      let audioPrompt = "";
      
      // For uploaded audio, prioritize the user's description (stored in audioPrompt)
      if (project.audioType === 'uploaded' && project.audioPrompt) {
        // User provided a description of what the video should be about
        audioPrompt = project.audioPrompt;
        console.log("Using uploaded audio description:", audioPrompt);
      } else if (project.audioLyrics) {
        // For generated audio, use the lyrics to create more relevant scenes
        const tags = project.audioTags || "music";
        const lyricsPreview = project.audioLyrics.substring(0, 200);
        audioPrompt = `${tags} music video based on these lyrics: ${lyricsPreview}`;
        console.log("Using lyrics-based prompt:", audioPrompt);
      } else if (project.audioPrompt) {
        // Fall back to audio generation prompt if available
        audioPrompt = project.audioPrompt;
        console.log("Using audio prompt:", audioPrompt);
      } else if (project.audioType === 'uploaded') {
        // Last resort for uploaded audio without description
        audioPrompt = "Create a music video with dramatic scenes";
        console.log("Using generic uploaded prompt");
      } else {
        // Last resort fallback
        audioPrompt = "Create an engaging music video";
        console.log("Using generic fallback prompt");
      }

      // Combine audio description with character description for better scene generation
      let combinedPrompt = audioPrompt;
      if (project.characterPrompt) {
        combinedPrompt = `Music theme: ${audioPrompt}. Character: ${project.characterPrompt}`;
      }
      
      // Get audio duration to determine configuration
      const audioDuration = project.audioDuration || 120; // Use stored duration or default to 2 minutes
      
      console.log("=== SCENE GENERATION DURATION CHECK ===");
      console.log("Project audioDuration:", project.audioDuration);
      console.log("Final audioDuration used:", audioDuration);
      
      // Calculate number of scenes dynamically based on 10-second segments
      const numberOfScenes = Math.ceil(audioDuration / 10);
      const numberOfAudioParts = Math.ceil(audioDuration / 10);
      
      console.log("Dynamically calculated scene count:", numberOfScenes);
      console.log("Number of audio parts:", numberOfAudioParts);
      
      // Split lyrics into sections based on calculated parts
      let lyricsSections: string[] | undefined;
      if (project.audioLyrics) {
        lyricsSections = splitLyricsIntoSections(project.audioLyrics, numberOfAudioParts);
        console.log(`Split lyrics into ${numberOfAudioParts} sections:`, lyricsSections.map(s => s.substring(0, 50) + "..."));
      }

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_generation",
        message: `Generating ${numberOfScenes} scene prompts`,
        status: "started",
        metadata: { 
          combinedPrompt, 
          hasSections: !!lyricsSections,
          numberOfScenes
        }
      });

      const scenePrompts = await generateScenePrompts(combinedPrompt, numberOfScenes, lyricsSections);
      
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_generation",
        message: `Generating ${numberOfScenes} scene images`,
        status: "progress",
        metadata: { scenePrompts, numberOfScenes }
      });

      const sceneImages = await generateSceneImages(scenePrompts, project.characterImageUrl);
      
      await storage.updateProject(req.params.id, {
        scenePrompts: scenePrompts,
        sceneImages: sceneImages,
        currentStep: 4
      });

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_generation",
        message: "Scene generation completed",
        status: "completed",
        metadata: { scenePrompts, sceneImages }
      });

      res.json({ scenePrompts, sceneImages });
    } catch (error) {
      console.error("Generate scenes error:", error);
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_generation",
        message: `Scene generation failed: ${(error as Error).message}`,
        status: "error",
        metadata: { error: (error as Error).message }
      });
      res.status(500).json({ error: "Failed to generate scenes" });
    }
  });

  // Regenerate individual scene endpoint
  app.post("/api/projects/:id/regenerate-scene", async (req, res) => {
    try {
      const { sceneIndex, prompt } = req.body;
      
      if (sceneIndex === undefined || !prompt) {
        return res.status(400).json({ error: "Scene index and prompt are required" });
      }

      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(400).json({ error: "Project not found" });
      }
      
      if (!project.characterImageUrl) {
        return res.status(400).json({ error: "Character image URL is required" });
      }

      // Get current scene arrays from project
      const scenePrompts = (project.scenePrompts as string[]) || [];
      const sceneImages = (project.sceneImages as string[]) || [];

      if (sceneIndex < 0 || sceneIndex >= scenePrompts.length) {
        return res.status(400).json({ error: "Invalid scene index" });
      }

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_regeneration",
        message: `Regenerating scene ${sceneIndex + 1}`,
        status: "started",
        metadata: { sceneIndex, prompt }
      });

      // Generate a single scene image with the custom prompt
      const imageUrl = await generateSingleSceneImage(prompt, project.characterImageUrl);

      // Update the arrays with new values
      scenePrompts[sceneIndex] = prompt;
      sceneImages[sceneIndex] = imageUrl;

      // Save updated arrays to database
      await storage.updateProject(req.params.id, {
        scenePrompts: scenePrompts,
        sceneImages: sceneImages
      });

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_regeneration",
        message: `Scene ${sceneIndex + 1} regenerated successfully`,
        status: "completed",
        metadata: { sceneIndex, newImageUrl: imageUrl, newPrompt: prompt }
      });

      res.json({ 
        imageUrl: imageUrl,
        sceneIndex: sceneIndex
      });
    } catch (error) {
      console.error("Scene regeneration error:", error);
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_regeneration",
        message: "Scene regeneration failed",
        status: "failed",
        metadata: { error: (error as Error).message }
      });
      res.status(500).json({ error: "Failed to regenerate scene" });
    }
  });

  // Update scene prompts (for edited prompts without regeneration)
  app.post("/api/projects/:id/update-scenes", async (req, res) => {
    try {
      const { scenes } = req.body;
      
      if (!scenes || !Array.isArray(scenes)) {
        return res.status(400).json({ error: "Scenes array is required" });
      }

      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(400).json({ error: "Project not found" });
      }

      // Extract prompts and images from the scenes array
      const scenePrompts = scenes.map((scene: any) => scene.prompt);
      const sceneImages = scenes.map((scene: any) => scene.imageUrl);

      // Update the project with the new scene data
      await storage.updateProject(req.params.id, {
        scenePrompts: scenePrompts,
        sceneImages: sceneImages
      });

      console.log(`Updated scene data for project ${req.params.id}`);
      res.json({ 
        message: "Scenes updated successfully",
        scenePrompts,
        sceneImages
      });
    } catch (error) {
      console.error("Update scenes error:", error);
      res.status(500).json({ error: "Failed to update scenes" });
    }
  });

  // Generate video
  app.post("/api/projects/:id/generate-video", async (req, res) => {
    let isInQueue = false;
    
    try {
      const project = await storage.getProject(req.params.id);
      if (!project || !project.audioUrl || !project.sceneImages || !project.scenePrompts) {
        return res.status(400).json({ error: "Missing required project data" });
      }

      // Calculate credits needed for video generation based on duration
      // New pricing: 1000 credits for every 30 seconds
      const audioDuration = project.audioDuration || 120; // Default to 2 minutes
      const VIDEO_GENERATION_CREDITS = Math.ceil(audioDuration / 30) * 1000;
      
      // Check if user has enough credits for video generation
      const canAfford = await storage.canUserAffordCredits(project.userId, VIDEO_GENERATION_CREDITS);
      if (!canAfford) {
        const creditsRemaining = await storage.getUserCreditsRemaining(project.userId);
        return res.status(402).json({ 
          error: "Insufficient credits for video generation", 
          creditsRequired: VIDEO_GENERATION_CREDITS,
          creditsRemaining,
          videoDuration: audioDuration
        });
      }
      
      // Check if video generation is already in progress or completed
      if ((project as any).generationStatus === 'generating') {
        // Check if generation has timed out (30 minutes)
        const generationStarted = (project as any).generationStartedAt;
        if (generationStarted) {
          const timeoutThreshold = new Date(generationStarted.getTime() + 30 * 60 * 1000);
          if (new Date() > timeoutThreshold) {
            // Mark as failed due to timeout
            await storage.updateProject(req.params.id, {
              generationStatus: 'failed' as any,
              currentStep: 3, // Reset to step 3 so user can try again
            });
          } else {
            // Generation is still active, don't start new one
            return res.status(409).json({ 
              error: "Video generation already in progress. Please wait for it to complete.", 
              generationId: (project as any).generationId 
            });
          }
        }
      }

      if ((project as any).generationStatus === 'completed' && project.finalVideoUrl) {
        // Video already generated successfully
        return res.json({ 
          message: "Video already generated", 
          finalVideoUrl: project.finalVideoUrl 
        });
      }

      // Generate unique identifier for this generation attempt
      const generationId = crypto.randomUUID();
      const now = new Date();
      const timeoutAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes from now

      // Mark generation as started
      await storage.updateProject(req.params.id, {
        generationId: generationId as any,
        generationStatus: 'generating' as any,
        generationStartedAt: now as any,
        generationTimeoutAt: timeoutAt as any,
      });

      // Import video queue service
      const { videoQueueService } = await import("./services/videoQueue");
      
      // Check queue and either start immediately or wait
      const queueResult = await videoQueueService.requestVideoGeneration(req.params.id, project.userId);
      
      if (!queueResult.canStart) {
        isInQueue = true;
        
        // Log queue status
        await storage.addGenerationLog({
          projectId: req.params.id,
          step: "video_generation",
          message: `Video queued at position ${queueResult.queuePosition}. Waiting for processing capacity...`,
          status: "progress",
          metadata: { queuePosition: queueResult.queuePosition, queued: true }
        });
        
        // Wait for queue position
        const canProcess = await videoQueueService.waitForQueuePosition(req.params.id, 300000); // 5 minute timeout
        
        if (!canProcess) {
          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "video_generation",
            message: "Video generation timeout - please try again",
            status: "error",
            metadata: { error: "Queue timeout" }
          });
          return res.status(408).json({ error: "Video generation queue timeout. Please try again." });
        }
        
        await storage.addGenerationLog({
          projectId: req.params.id,
          step: "video_generation", 
          message: "Queue position reached - starting video generation",
          status: "progress",
          metadata: { startingProcessing: true }
        });
      } else {
        await storage.addGenerationLog({
          projectId: req.params.id,
          step: "video_generation",
          message: "Starting video generation immediately",
          status: "progress", 
          metadata: { immediateStart: true }
        });
      }

      // Get configuration based on audio duration (reuse the variable from earlier)
      // audioDuration is already declared above
      
      console.log(`Using audio duration: ${audioDuration} seconds for video generation`);
      
      // Calculate video generation parameters dynamically based on 10-second segments
      const numberOfAudioParts = Math.ceil(audioDuration / 10);
      const numberOfScenes = Math.ceil(audioDuration / 10);
      
      // Split roughly 50/50 between regular and lipsync videos
      const numberOfVideosLipsync = Math.floor(numberOfScenes / 2);
      const numberOfVideosRegularApi = numberOfScenes - numberOfVideosLipsync;
      
      console.log("Dynamically calculated video generation parameters:");
      console.log("- Number of audio parts:", numberOfAudioParts);
      console.log("- Number of scenes:", numberOfScenes);
      console.log("- Regular videos:", numberOfVideosRegularApi);
      console.log("- Lipsync videos:", numberOfVideosLipsync);
      
      // Initialize ObjectStorageService once for reuse throughout video generation
      const objectStorageService = new ObjectStorageService();

      // Step 1: Split audio based on calculation
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "video_generation",
        message: `Splitting audio into ${numberOfAudioParts} segments`,
        status: "progress",
        metadata: { step: 1, total: 4, numberOfSegments: numberOfAudioParts }
      });

      // Convert audio URL to externally accessible signed URL for FFMPEG API
      let audioUrl = project.audioUrl;
      if (audioUrl.startsWith('/objects/')) {
        // Generate signed URL for object storage files (publicly accessible by external APIs)
        audioUrl = await objectStorageService.getSignedUrlForPath(audioUrl, 3600); // 1 hour TTL
      } else if (audioUrl.startsWith('/')) {
        // For truly local files (e.g., /uploads/...) use Replit domain
        // Note: This is only for self-hosted tests; object storage files use signed URLs above
        const replitDevDomain = process.env.REPLIT_DEV_DOMAIN;
        
        if (replitDevDomain) {
          audioUrl = `https://${replitDevDomain}${audioUrl}`;
        } else {
          const replSlug = process.env.REPL_SLUG;
          const replOwner = process.env.REPL_OWNER;
          
          if (replSlug && replOwner) {
            audioUrl = `https://${replSlug}-${replOwner}.replit.app${audioUrl}`;
          } else {
            const host = req.get('host') || 'localhost:5000';
            audioUrl = host.includes('localhost') ? `http://${host}${audioUrl}` : `https://${host}${audioUrl}`;
          }
        }
      }
      
      console.log("=== AUDIO URL DEBUG ===");
      console.log("Original audio URL:", project.audioUrl);
      console.log("REPLIT_DEV_DOMAIN:", process.env.REPLIT_DEV_DOMAIN);
      console.log("Host:", req.get('host'));
      console.log("Final audio URL for FFMPEG:", audioUrl);
      console.log("=== END DEBUG ===");
      // Split audio into 10-second segments by passing totalDurationSeconds
      const audioSegments = await splitAudio(audioUrl, numberOfAudioParts, audioDuration);
      console.log("Audio segments result:", JSON.stringify(audioSegments, null, 2));
      
      const audioUrls = audioSegments.map(segment => segment.download_url);
      console.log("Audio URLs for video generation:", audioUrls);

      await storage.updateProject(req.params.id, {
        audioSegments: audioSegments
      });

      // Step 2: Generate video segments dynamically based on calculation
      const makeCharacterSing = project.makeCharacterSing || true;
      const videoGenerationMessage = makeCharacterSing 
        ? `Generating ${numberOfVideosRegularApi} regular videos (seedance) and ${numberOfVideosLipsync} lipsync videos (multitalk)`
        : `Generating ${numberOfVideosRegularApi} regular videos (seedance only)`;
      
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "video_generation",
        message: videoGenerationMessage,
        status: "progress",
        metadata: { 
          step: 2, 
          total: 5,
          regularVideos: numberOfVideosRegularApi,
          lipsyncVideos: makeCharacterSing ? numberOfVideosLipsync : 0
        }
      });

      // Load subtitle data if available for smart lyrics detection
      let subtitleData: { assContent?: string; totalDuration?: number } | undefined;
      if (project.subtitleFileUrl) {
        try {
          console.log("Loading subtitle file for smart lyrics detection:", project.subtitleFileUrl);
          
          // Read the subtitle file content from object storage
          const { ObjectStorageService, objectStorageClient } = await import("./objectStorage");
          const objectStorageService = new ObjectStorageService();
          
          if (project.subtitleFileUrl.startsWith('/objects/') || project.subtitleFileUrl.startsWith('/public-objects/')) {
            let fullPath: string;
            
            if (project.subtitleFileUrl.startsWith('/public-objects/')) {
              // Public object path (ElevenLabs subtitles)
              const objectPath = project.subtitleFileUrl.replace('/public-objects/', '');
              const publicPaths = objectStorageService.getPublicObjectSearchPaths();
              fullPath = `${publicPaths[0]}/${objectPath}`;
              console.log("Loading public subtitle file from:", fullPath);
            } else {
              // Private object path (KIE subtitles)
              const objectPath = project.subtitleFileUrl.replace('/objects/', '');
              const privateObjectDir = process.env.PRIVATE_OBJECT_DIR || "";
              fullPath = `${privateObjectDir}/${objectPath}`;
              console.log("Loading private subtitle file from:", fullPath);
            }
            
            // Parse bucket and object name
            const pathParts = fullPath.split('/');
            const bucketName = pathParts[1];
            const objectName = pathParts.slice(2).join('/');
            
            // Download the subtitle file
            const bucket = objectStorageClient.bucket(bucketName);
            const file = bucket.file(objectName);
            const [exists] = await file.exists();
            
            if (exists) {
              const [content] = await file.download();
              subtitleData = {
                assContent: content.toString('utf-8'),
                totalDuration: audioDuration
              };
              console.log("Successfully loaded subtitle file for smart lyrics detection");
              console.log("Subtitle file length:", content.length, "bytes");
            } else {
              console.log("Subtitle file not found in object storage");
            }
          } else {
            console.log("Unrecognized subtitle file URL format:", project.subtitleFileUrl);
          }
        } catch (error) {
          console.error("Error loading subtitle file for smart detection:", error);
          // Continue without subtitle data - will use default pattern
        }
      } else {
        console.log("No subtitle file URL found in project - will use default lipsync pattern");
      }

      // Convert scene images to signed URLs for Wavespeed API
      console.log("Converting scene images to signed URLs for Wavespeed API...");
      const sceneImages = project.sceneImages as string[];
      const signedSceneUrls: string[] = [];
      
      try {
        for (let i = 0; i < sceneImages.length; i++) {
          const imageUrl = sceneImages[i];
          
          if (imageUrl.startsWith('/objects/')) {
            // Private object storage URL - convert to signed URL
            const signedUrl = await objectStorageService.getSignedUrlForPath(imageUrl, 86400); // 24 hours
            signedSceneUrls.push(signedUrl);
            console.log(`Scene ${i + 1}: ${imageUrl} -> signed URL generated`);
          } else if (imageUrl.startsWith('/public-objects/')) {
            // Public object storage URL - convert to signed URL
            const signedUrl = await objectStorageService.getSignedUrlForPublicObject(imageUrl, 86400); // 24 hours
            signedSceneUrls.push(signedUrl);
            console.log(`Scene ${i + 1}: ${imageUrl} -> signed URL generated`);
          } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
            // Already a public URL - use as-is
            signedSceneUrls.push(imageUrl);
            console.log(`Scene ${i + 1}: using external URL as-is`);
          } else {
            throw new Error(`Unrecognized scene image URL format: ${imageUrl}`);
          }
        }
        console.log(`Successfully converted ${signedSceneUrls.length} scene images to signed URLs`);
      } catch (error) {
        const errorMsg = `Failed to convert scene images to signed URLs: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(errorMsg);
        await storage.addGenerationLog({
          projectId: req.params.id,
          step: "video_generation",
          message: errorMsg,
          status: "error",
          metadata: { error: errorMsg }
        });
        return res.status(500).json({ error: errorMsg });
      }

      const { videoUrls: allVideoUrls, segmentPairs } = await generateAllVideoSegmentsDynamic(
        audioUrls,
        signedSceneUrls,
        project.scenePrompts as string[],
        {
          numberOfVideosRegularApi,
          numberOfVideosLipsync,
          makeCharacterSing: makeCharacterSing
        },
        subtitleData
      );

      await storage.updateProject(req.params.id, {
        videoSegments: allVideoUrls
      });

      // Step 3: Merge final video directly from all individual segments (simplified workflow)
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "video_generation",
        message: `Merging final video from ${allVideoUrls.length} individual segments + outro video`,
        status: "progress",
        metadata: { step: 3, total: 4 }
      });

      console.log("\n=== STARTING FINAL VIDEO MERGE (SIMPLIFIED) ===");
      console.log("Number of individual videos to merge:", allVideoUrls.length);
      console.log("Individual video URLs to merge:", allVideoUrls);
      
      // Convert video URLs to signed URLs for external FFMPEG API
      const signedVideoUrls: string[] = [];
      try {
        for (let i = 0; i < allVideoUrls.length; i++) {
          const videoUrl = allVideoUrls[i];
          
          if (videoUrl.startsWith('/objects/')) {
            // Private object storage URL - convert to signed URL
            const signedUrl = await objectStorageService.getSignedUrlForPath(videoUrl, 7200); // 2 hours
            signedVideoUrls.push(signedUrl);
            console.log(`Generated signed URL for segment ${i + 1}: ${videoUrl} -> signed`);
          } else if (videoUrl.startsWith('/public-objects/')) {
            // Public object storage URL - convert to signed URL
            const signedUrl = await objectStorageService.getSignedUrlForPublicObject(videoUrl, 7200); // 2 hours
            signedVideoUrls.push(signedUrl);
            console.log(`Generated signed URL for segment ${i + 1}: ${videoUrl} -> signed`);
          } else if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
            // Already a public URL - use as-is
            signedVideoUrls.push(videoUrl);
            console.log(`Using external URL for segment ${i + 1}: ${videoUrl}`);
          } else {
            throw new Error(`Unrecognized video URL format: ${videoUrl}`);
          }
        }
        console.log(`Successfully converted ${signedVideoUrls.length} video segments to signed URLs`);
      } catch (error) {
        const errorMsg = `Failed to convert video segments to signed URLs: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(errorMsg);
        await storage.addGenerationLog({
          projectId: req.params.id,
          step: "video_generation",
          message: errorMsg,
          status: "error",
          metadata: { error: errorMsg }
        });
        return res.status(500).json({ error: errorMsg });
      }
      
      // Add outro video to the end of the video list  
      try {
        // Try to find outro.mp4 in the public object storage
        const outroFile = await objectStorageService.searchPublicObject('outro.mp4');
        
        if (outroFile) {
          console.log("Found outro.mp4 in object storage, generating signed URL...");
          // Generate signed URL for the outro video to ensure external API access
          const signedOutroUrl = await objectStorageService.signObjectURL({
            bucketName: outroFile.bucket.name,
            objectName: outroFile.name,
            method: "GET",
            ttlSec: 7200
          });
          signedVideoUrls.push(signedOutroUrl);
          console.log("Added outro video to merge with signed URL from object storage:", signedOutroUrl);
        } else {
          console.log("outro.mp4 not found in object storage, using fallback URL");
          // Fallback to host-based URL for development
          const host = req.get('host') || 'localhost:5000';
          const fallbackOutroUrl = host.includes('localhost') ? `http://${host}/public-objects/outro.mp4` : `https://${host}/public-objects/outro.mp4`;
          signedVideoUrls.push(fallbackOutroUrl);
          console.log("Using fallback outro video URL:", fallbackOutroUrl);
        }
      } catch (error) {
        console.error("Failed to handle outro video:", error);
        // Final fallback to host-based URL
        const host = req.get('host') || 'localhost:5000';
        const fallbackOutroUrl = host.includes('localhost') ? `http://${host}/public-objects/outro.mp4` : `https://${host}/public-objects/outro.mp4`;
        signedVideoUrls.push(fallbackOutroUrl);
        console.log("Using final fallback outro video URL:", fallbackOutroUrl);
      }
      
      console.log("Signed video URLs for FFMPEG merge (including outro):", signedVideoUrls);
      
      // Convert audio URL to signed URL if it's an internal object storage URL
      let finalAudioUrl = project.audioUrl; // Use original audio URL from project
      if (finalAudioUrl.startsWith('/objects/')) {
        // Internal object storage URL - convert to signed URL
        finalAudioUrl = await objectStorageService.getSignedUrlForPath(finalAudioUrl, 7200); // 2 hours
        console.log("Generated signed URL for audio:", project.audioUrl, "->", finalAudioUrl);
      } else {
        console.log("Using external audio URL:", finalAudioUrl);
      }
      console.log("Final audio URL for FFMPEG merge:", finalAudioUrl);
      
      // Get subtitle URL from project
      let subtitleUrl: string | undefined;
      if (project.subtitleFileUrl) {
        if (project.subtitleFileUrl.startsWith('/public-objects/')) {
          // Public object URL - convert to full URL accessible by FFMPEG
          const host = req.get('host') || 'localhost:5000';
          subtitleUrl = host.includes('localhost') ? `http://${host}${project.subtitleFileUrl}` : `https://${host}${project.subtitleFileUrl}`;
          console.log("Generated public URL for subtitles:", project.subtitleFileUrl, "->", subtitleUrl);
        } else if (project.subtitleFileUrl.startsWith('/objects/')) {
          // Legacy private object URL - convert to signed URL (for backward compatibility)
          subtitleUrl = await objectStorageService.getSignedUrlForPath(project.subtitleFileUrl, 7200); // 2 hours
          console.log("Generated signed URL for legacy subtitles:", project.subtitleFileUrl, "->", subtitleUrl);
        } else {
          // External URL - use as-is
          subtitleUrl = project.subtitleFileUrl;
          console.log("Using external subtitle URL:", subtitleUrl);
        }
      }
      console.log("Subtitle URL for FFMPEG merge:", subtitleUrl || "Not provided");
      
      let finalVideo;
      let savedFinalVideoUrl: string;
      try {
        // Get watermark URL for branding (only Premium users can disable it)
        // Double-check user plan server-side for security
        const userWithPlan = await storage.getUserWithPlan(project.userId);
        const isPremiumUser = userWithPlan?.plan?.name === "Premium";
        const shouldIncludeWatermark = isPremiumUser ? (project.includeWatermark !== false) : true;
        
        let watermarkUrl: string | undefined;
        if (shouldIncludeWatermark) {
          watermarkUrl = await getWatermarkUrl() || undefined;
        }
        
        finalVideo = await mergeVideos(signedVideoUrls, finalAudioUrl, subtitleUrl, watermarkUrl);
        console.log("Final video merge successful:", finalVideo.download_url);
        
        // Try to save the final video to object storage
        console.log("Saving final video to object storage...");
        const objectStorageService = new ObjectStorageService();
        
        try {
          savedFinalVideoUrl = await objectStorageService.uploadVideoFromUrl(
            finalVideo.download_url,
            `neonvideo_${Date.now()}.mp4`
          );
          console.log("Final video saved to storage:", savedFinalVideoUrl);
        } catch (storageError) {
          console.warn("Failed to save video to object storage, using temporary URL:", storageError);
          // Fallback: use the FFMPEG download URL temporarily
          // Note: This URL may expire after some time
          savedFinalVideoUrl = finalVideo.download_url;
          
          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "video_generation",
            message: `Video generated successfully but storage failed. Using temporary URL: ${(storageError as Error).message}`,
            status: "warning",
            metadata: { 
              temporaryUrl: finalVideo.download_url,
              storageError: (storageError as Error).message
            }
          });
        }
      } catch (mergeError) {
        console.error("Final video merge failed:", mergeError);
        await storage.addGenerationLog({
          projectId: req.params.id,
          step: "video_generation",
          message: `Final video merge failed: ${(mergeError as Error).message}`,
          status: "error",
          metadata: { 
            error: (mergeError as Error).message,
            videosAttempted: allVideoUrls
          }
        });
        throw new Error(`Final video merge failed: ${(mergeError as Error).message}`);
      }

      await storage.updateProject(req.params.id, {
        finalVideoUrl: savedFinalVideoUrl,
        isCompleted: true,
        currentStep: 6,
        generationStatus: 'completed' as any,
      });

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "video_generation",
        message: "Video generation completed",
        status: "completed",
        metadata: { finalVideoUrl: savedFinalVideoUrl }
      });

      // Complete video processing in queue
      await videoQueueService.completeVideoGeneration(req.params.id, true);

      // Create Mux asset for improved streaming (non-blocking)
      try {
        await createMuxAssetForVideo(req.params.id, savedFinalVideoUrl);
      } catch (muxError) {
        console.error("Failed to create Mux asset (non-blocking):", muxError);
        // Don't fail the video generation if Mux asset creation fails
      }

      // Deduct credits for successful video generation
      const creditDeducted = await storage.deductUserCredits(project.userId, VIDEO_GENERATION_CREDITS);
      if (!creditDeducted) {
        console.error("Failed to deduct credits for video generation, but video was already generated");
      } else {
        console.log(`Deducted ${VIDEO_GENERATION_CREDITS} credits for video generation (${audioDuration}s) from user ${project.userId}`);
      }

      res.json({ finalVideoUrl: savedFinalVideoUrl });
    } catch (error) {
      console.error("Generate video error:", error);
      const errorMessage = (error as Error).message;
      
      // Mark generation as failed
      await storage.updateProject(req.params.id, {
        generationStatus: 'failed' as any,
        currentStep: 3, // Reset to step 3 so user can try again
      });
      
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "video_generation",
        message: `Video generation failed: ${errorMessage}`,
        status: "error",
        metadata: { error: errorMessage }
      });

      // Complete video processing in queue (mark as failed)
      if (isInQueue) {
        await videoQueueService.completeVideoGeneration(req.params.id, false);
      }
      
      // Send specific error message to help with debugging
      res.status(500).json({ 
        error: errorMessage || "Failed to generate video",
        details: "Check server logs for detailed FFMPEG API requests and responses"
      });
    }
  });

  // Get generation logs
  app.get("/api/projects/:id/logs", async (req, res) => {
    try {
      const logs = await storage.getGenerationLogs(req.params.id);
      res.json(logs);
    } catch (error) {
      console.error("Get logs error:", error);
      res.status(500).json({ error: "Failed to get logs" });
    }
  });

  // Get video queue status
  app.get("/api/video-queue/status", async (req, res) => {
    try {
      const stats = await videoQueueService.getQueueStats();
      res.json(stats);
    } catch (error) {
      console.error("Queue status error:", error);
      res.status(500).json({ error: "Failed to get queue status" });
    }
  });

  // Get queue position for a specific project
  app.get("/api/projects/:id/queue-position", async (req, res) => {
    try {
      const position = await videoQueueService.getQueuePosition(req.params.id);
      res.json({ queuePosition: position });
    } catch (error) {
      console.error("Queue position error:", error);
      res.status(500).json({ error: "Failed to get queue position" });
    }
  });

  // Generate character options for standalone character creation (without project)
  app.post("/api/characters/generate-options", authenticateToken, async (req, res) => {
    try {
      console.log("Standalone character options generation route called with body:", req.body);
      const { prompt, aspectRatio = "16:9" } = req.body;
      console.log("Extracted prompt:", prompt);
      console.log("Aspect ratio:", aspectRatio);
      
      if (!prompt || !prompt.trim()) {
        throw new Error("No prompt provided");
      }

      console.log("About to call generateCharacterImages with aspect ratio:", aspectRatio);
      const imageUrls = await generateCharacterImages(prompt, aspectRatio);
      console.log("generateCharacterImages returned:", imageUrls);

      res.json({ imageUrls, prompt });
    } catch (error) {
      console.error("Generate standalone character options error:", error);
      res.status(500).json({ error: "Failed to generate character options" });
    }
  });

  // Saved characters routes
  app.get("/api/characters", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const characters = await storage.getSavedCharacters(userId);
      res.json(characters);
    } catch (error) {
      console.error("Get saved characters error:", error);
      res.status(500).json({ error: "Failed to get saved characters" });
    }
  });

  app.post("/api/characters", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { imageUrl, ...restData } = req.body;
      
      let finalImageUrl = imageUrl;
      
      // Only download and re-upload if the image is from an external URL
      // If it's already in our object storage (/objects/...), use it directly
      if (!imageUrl.startsWith('/objects/')) {
        console.log("Downloading and storing external character image for library...");
        const storedImage = await downloadAndStoreImage(imageUrl, "saved-characters");
        console.log("Image stored successfully:", storedImage.storedUrl);
        finalImageUrl = storedImage.storedUrl;
      } else {
        console.log("Using existing object storage URL:", imageUrl);
      }
      
      const characterData = {
        ...restData,
        imageUrl: finalImageUrl,
        userId
      };
      
      const validatedData = insertSavedCharacterSchema.parse(characterData);
      const character = await storage.saveCharacter(validatedData);
      res.status(201).json(character);
    } catch (error) {
      console.error("Save character error:", error);
      const message = error instanceof Error ? error.message : 'Failed to save character';
      res.status(400).json({ error: message });
    }
  });

  app.patch("/api/characters/:id", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { name } = req.body;
      
      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Name is required" });
      }

      const updated = await storage.updateSavedCharacter(req.params.id, userId, { name: name.trim() });
      if (!updated) {
        return res.status(404).json({ error: "Character not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Update character error:", error);
      res.status(500).json({ error: "Failed to update character" });
    }
  });

  app.delete("/api/characters/:id", authenticateToken, async (req, res) => {
    try {
      const deleted = await storage.deleteSavedCharacter(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Character not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Delete character error:", error);
      res.status(500).json({ error: "Failed to delete character" });
    }
  });


  // Stripe Subscription Endpoints
  app.post("/api/stripe/create-checkout-session", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { planId, billingPeriod } = req.body;
      
      if (!planId) {
        return res.status(400).json({ error: "Plan ID is required" });
      }
      
      // Get Stripe settings from database
      const stripeSettings = await storage.getAllSettings();
      const stripeSecretKey = stripeSettings.find(s => s.key === 'stripe_secret_key')?.value;
      
      if (!stripeSecretKey) {
        console.error("Stripe secret key not configured");
        return res.status(500).json({ error: "Payment system not configured. Please contact support." });
      }
      
      // Import Stripe dynamically to use the database key
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
      
      // Get user and plan details
      const user = await storage.getUser(userId);
      const plan = await storage.getPlanById(planId);
      
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      
      // Determine the price ID to use
      const priceId = billingPeriod === 'yearly' ? plan.stripeYearlyPriceId : plan.stripeMonthlyPriceId;
      
      if (!priceId) {
        return res.status(400).json({ error: "Price ID not configured for this plan" });
      }
      
      // Create Stripe customer if not exists
      let stripeCustomerId = user?.stripeCustomerId;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user?.email,
          name: user?.username,
          metadata: {
            userId: userId
          }
        });
        stripeCustomerId = customer.id;
        
        // Save Stripe customer ID to user
        await storage.updateUser(userId, { stripeCustomerId });
      }
      
      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        line_items: [{
          price: priceId,
          quantity: 1,
        }],
        mode: 'subscription',
        success_url: `${req.headers.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.origin}/plans`,
        allow_promotion_codes: true,
        metadata: {
          userId,
          planId,
        },
      });
      
      res.json({ sessionUrl: session.url });
    } catch (error) {
      console.error("Create checkout session error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create checkout session" });
    }
  });
  
  // Get subscription status
  app.get("/api/stripe/subscription-status", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const user = await storage.getUser(userId);
      
      if (!user?.stripeCustomerId || !user?.stripeSubscriptionId) {
        return res.json({ hasSubscription: false });
      }
      
      // Get Stripe settings from database
      const stripeSettings = await storage.getAllSettings();
      const stripeSecretKey = stripeSettings.find(s => s.key === 'stripe_secret_key')?.value;
      
      if (!stripeSecretKey) {
        return res.json({ hasSubscription: false });
      }
      
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
      
      try {
        const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        
        res.json({
          hasSubscription: true,
          status: subscription.status,
          currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        });
      } catch (error) {
        // Subscription not found or invalid
        res.json({ hasSubscription: false });
      }
    } catch (error) {
      console.error("Get subscription status error:", error);
      res.status(500).json({ error: "Failed to get subscription status" });
    }
  });
  
  // Cancel subscription
  app.post("/api/stripe/cancel-subscription", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const user = await storage.getUser(userId);
      
      if (!user?.stripeSubscriptionId) {
        return res.status(400).json({ error: "No active subscription found" });
      }
      
      // Get Stripe settings from database
      const stripeSettings = await storage.getAllSettings();
      const stripeSecretKey = stripeSettings.find(s => s.key === 'stripe_secret_key')?.value;
      
      if (!stripeSecretKey) {
        return res.status(500).json({ error: "Payment system not configured" });
      }
      
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
      
      // Cancel at period end (don't immediately cancel)
      const subscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
      
      res.json({ 
        success: true,
        message: "Subscription will be cancelled at the end of the current billing period",
        cancelAt: new Date(subscription.cancel_at! * 1000).toISOString()
      });
    } catch (error) {
      console.error("Cancel subscription error:", error);
      res.status(500).json({ error: "Failed to cancel subscription" });
    }
  });

  // Create checkout session for one-time credit purchase
  app.post("/api/stripe/create-credit-checkout-session", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Check if user has a paid plan (Basic or Premium)
      if (!user.planId || user.plan?.name === 'Free') {
        return res.status(403).json({ error: "Only paid subscribers can purchase additional credits" });
      }
      
      // Get Stripe settings from database
      const stripeSettings = await storage.getAllSettings();
      const stripeSecretKey = stripeSettings.find(s => s.key === 'stripe_secret_key')?.value;
      
      if (!stripeSecretKey) {
        console.error("Stripe secret key not configured");
        return res.status(500).json({ error: "Payment system not configured. Please contact support." });
      }
      
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
      
      // Get or create Stripe customer
      let stripeCustomerId = user.stripeCustomerId;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          metadata: { userId }
        });
        stripeCustomerId = customer.id;
        await storage.updateUser(userId, { stripeCustomerId });
      }
      
      // Create checkout session for one-time payment
      // Price: $9 for 5000 credits
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        line_items: [{
          price: 'price_1SQfnqQxrAsbY9f0PatqnzYy', // Stripe price ID for credit purchase
          quantity: 1,
        }],
        mode: 'payment', // One-time payment
        success_url: `${req.headers.origin}/profile?credit_purchase=success`,
        cancel_url: `${req.headers.origin}/profile?credit_purchase=cancelled`,
        metadata: {
          userId,
          type: 'credit_purchase',
          creditsToAdd: '5000'
        },
      });
      
      res.json({ sessionUrl: session.url });
    } catch (error) {
      console.error("Create credit checkout session error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create checkout session" });
    }
  });

  // Stripe webhook handler for payment events
  app.post("/api/stripe/webhook", express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      // Get Stripe settings from database
      const stripeSettings = await storage.getAllSettings();
      const stripeSecretKey = stripeSettings.find(s => s.key === 'stripe_secret_key')?.value;
      const webhookSecret = stripeSettings.find(s => s.key === 'stripe_webhook_secret')?.value;
      
      if (!stripeSecretKey || !webhookSecret) {
        console.error("Stripe not configured");
        return res.status(500).json({ error: "Payment system not configured" });
      }
      
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
      
      const sig = req.headers['stripe-signature'];
      if (!sig) {
        return res.status(400).json({ error: "Missing stripe signature" });
      }
      
      let event;
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } catch (err) {
        console.error("Webhook signature verification failed:", err);
        return res.status(400).json({ error: `Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}` });
      }
      
      // Handle checkout.session.completed event
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as any;
        
        // Check if this is a credit purchase
        if (session.metadata?.type === 'credit_purchase') {
          const userId = session.metadata.userId;
          const creditsToAdd = parseInt(session.metadata.creditsToAdd || '5000');
          
          if (userId && session.payment_status === 'paid') {
            // Add credits to user
            const user = await storage.getUser(userId);
            if (user) {
              const newCredits = (user.credits || 0) + creditsToAdd;
              await storage.updateUser(userId, { credits: newCredits });
              console.log(`Added ${creditsToAdd} credits to user ${userId}. New balance: ${newCredits}`);
            }
          }
        }
      }
      
      res.json({ received: true });
    } catch (error) {
      console.error("Webhook handler error:", error);
      res.status(500).json({ error: "Webhook handler failed" });
    }
  });

  // Contact form submission endpoint
  app.post("/api/contact", async (req, res) => {
    try {
      const { name, email, subject, message, captchaToken } = req.body;
      
      // Validate required fields
      if (!name || !email || !subject || !message) {
        return res.status(400).json({ error: "All fields are required" });
      }
      
      // Validate captcha token
      if (!captchaToken) {
        return res.status(400).json({ error: "Captcha verification is required" });
      }
      
      // Verify captcha with Google
      const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;
      if (!recaptchaSecret) {
        console.error("RECAPTCHA_SECRET_KEY not configured");
        return res.status(500).json({ error: "Captcha verification service not configured" });
      }
      
      try {
        const verifyUrl = `https://www.google.com/recaptcha/api/siteverify`;
        const verifyResponse = await fetch(verifyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `secret=${recaptchaSecret}&response=${captchaToken}`,
        });
        
        const verifyData = await verifyResponse.json();
        
        if (!verifyData.success) {
          console.warn("Captcha verification failed:", verifyData['error-codes']);
          return res.status(400).json({ error: "Captcha verification failed. Please try again." });
        }
      } catch (captchaError) {
        console.error("Error verifying captcha:", captchaError);
        return res.status(500).json({ error: "Failed to verify captcha" });
      }
      
      // Log the contact form submission
      console.log("Contact form submission:", {
        name,
        email,
        subject,
        message,
        timestamp: new Date().toISOString()
      });
      
      // Send emails using the email service
      const emailSent = await emailService.sendContactFormEmail({
        name,
        email,
        subject,
        message
      });
      
      if (!emailSent) {
        // If email fails, still log it but notify that email failed
        console.warn("Email service failed, but contact form was logged");
        return res.json({ 
          success: true, 
          message: "Contact form submitted successfully. We'll review your message soon." 
        });
      }
      
      res.json({ success: true, message: "Contact form submitted successfully. You should receive a confirmation email shortly." });
    } catch (error) {
      console.error("Contact form error:", error);
      res.status(500).json({ error: "Failed to submit contact form" });
    }
  });

  // ===== MUX MIGRATION ENDPOINTS =====
  
  // Admin endpoint to migrate existing videos to Mux
  app.post("/api/admin/migrate-videos-to-mux", authenticateToken, async (req, res) => {
    try {
      // Check if user is admin
      const user = (req as any).user;
      if (!user || !user.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      // Get all completed videos without Mux assets
      const allProjects = await storage.getAllVideosForAdmin();
      const videosToMigrate = allProjects.filter(p => 
        p.isCompleted && 
        p.finalVideoUrl && 
        !p.muxAssetId && 
        !p.muxPlaybackId
      );

      console.log(`Found ${videosToMigrate.length} videos to migrate to Mux`);

      // Start migration process for each video
      const migrationResults = [];
      for (const project of videosToMigrate) {
        try {
          // Create Mux asset for this video (non-blocking)
          const asyncJob = createMuxAssetForVideo(project.id, project.finalVideoUrl!);
          
          migrationResults.push({
            projectId: project.id,
            title: project.title,
            status: 'queued',
            message: 'Mux asset creation initiated'
          });

          console.log(`Initiated Mux migration for video ${project.id}`);
        } catch (error) {
          console.error(`Failed to initiate migration for video ${project.id}:`, error);
          migrationResults.push({
            projectId: project.id,
            title: project.title,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      res.json({
        message: `Migration initiated for ${videosToMigrate.length} videos`,
        totalVideos: videosToMigrate.length,
        results: migrationResults
      });
    } catch (error) {
      console.error("Video migration error:", error);
      res.status(500).json({ error: "Failed to migrate videos to Mux" });
    }
  });

  // Admin endpoint to check Mux migration status
  app.get("/api/admin/mux-migration-status", authenticateToken, async (req, res) => {
    try {
      // Check if user is admin
      const user = (req as any).user;
      if (!user || !user.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const allProjects = await storage.getAllVideosForAdmin();
      const completedVideos = allProjects.filter(p => p.isCompleted && p.finalVideoUrl);
      
      const muxStats = {
        totalCompletedVideos: completedVideos.length,
        videosWithMuxAssets: completedVideos.filter(p => p.muxAssetId).length,
        videosWithMuxReady: completedVideos.filter(p => p.muxAssetStatus === 'ready').length,
        videosWithMuxPreparing: completedVideos.filter(p => p.muxAssetStatus === 'preparing').length,
        videosWithMuxErrored: completedVideos.filter(p => p.muxAssetStatus === 'errored').length,
        videosWithoutMux: completedVideos.filter(p => !p.muxAssetId).length,
      };

      res.json(muxStats);
    } catch (error) {
      console.error("Mux migration status error:", error);
      res.status(500).json({ error: "Failed to get migration status" });
    }
  });

  // Reset failed Mux migrations endpoint
  app.post("/api/admin/reset-failed-mux-migrations", authenticateToken, async (req, res) => {
    try {
      // Check if user is admin
      const user = (req as any).user;
      if (!user || !user.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { resetFailedMuxMigrations } = await import('./services/mux.js');
      const result = await resetFailedMuxMigrations();
      
      res.json({
        success: true,
        message: `Successfully reset ${result.resetCount} failed Mux migrations`,
        resetCount: result.resetCount
      });
    } catch (error) {
      console.error("Reset failed Mux migrations error:", error);
      res.status(500).json({ error: "Failed to reset failed migrations" });
    }
  });


  // Upload character image
  app.post("/api/projects/:id/upload-character", authenticateToken, upload.single('image'), async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user?.userId) {
        return res.status(401).json({ error: "User authentication required" });
      }

      const { id: projectId } = req.params;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({ error: "Invalid file type. Please upload JPEG, PNG, or GIF images." });
      }

      // Validate file size (5MB limit)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        return res.status(400).json({ error: "File too large. Please upload images under 5MB." });
      }

      // Verify project ownership
      const project = await storage.getProject(projectId);
      if (!project || project.userId !== user.userId) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Generate unique filename
      const fileExtension = file.originalname.split('.').pop() || 'jpg';
      const filename = `character_${nanoid()}.${fileExtension}`;
      const imagePath = `characters/${filename}`;

      // Upload to object storage
      const objectPath = `${objectStorage.getPrivateObjectDir()}/${imagePath}`;
      const { bucketName, objectName } = objectStorage.parseObjectPath(objectPath);
      
      const bucket = objectStorageClient.bucket(bucketName);
      const fileObj = bucket.file(objectName);
      
      await fileObj.save(file.buffer, {
        metadata: {
          contentType: file.mimetype,
        },
      });

      // Generate permanent path
      const permanentPath = `/objects/${imagePath}`;
      
      // Update project with character image
      await storage.updateProject(projectId, {
        characterImageUrl: permanentPath
      });

      console.log(`Character image uploaded: ${permanentPath}`);

      res.json({
        imageUrl: permanentPath,
        message: "Character image uploaded successfully"
      });
    } catch (error) {
      console.error("Character image upload error:", error);
      res.status(500).json({ error: "Failed to upload character image" });
    }
  });

  // Re-process all videos that need Mux conversion
  app.post("/api/admin/reprocess-all-mux-videos", authenticateToken, async (req, res) => {
    try {
      // Check if user is admin
      const user = (req as any).user;
      if (!user || !user.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { reprocessAllMuxVideos } = await import('./services/mux.js');
      const result = await reprocessAllMuxVideos();
      
      res.json({
        success: true,
        message: `Re-processing initiated for ${result.processedCount} videos`,
        processedCount: result.processedCount,
        results: result.results
      });
    } catch (error) {
      console.error("Re-process all Mux videos error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Migrate single video to Mux for testing
  app.post("/api/admin/migrate-single-video-to-mux", authenticateToken, async (req, res) => {
    try {
      // Check if user is admin
      const user = (req as any).user;
      if (!user || !user.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { migrateSingleVideoToMux } = await import('./services/mux.js');
      const result = await migrateSingleVideoToMux();
      
      if (result.success) {
        res.json({
          success: true,
          message: `Successfully started migration for project ${result.projectId}`,
          projectId: result.projectId,
          videoUrl: result.videoUrl
        });
      } else {
        res.status(500).json({
          success: false,
          error: `Migration failed for project ${result.projectId}: ${result.error}`,
          projectId: result.projectId,
          videoUrl: result.videoUrl
        });
      }
    } catch (error) {
      console.error("Migrate single video to Mux error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Helper function to post a video to Postiz
  async function postVideoToPostiz(projectId: string) {
    console.log(`[POSTIZ] Starting post for project ${projectId}`);
    
    const project = await storage.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    if (!project.isCompleted || !project.finalVideoUrl) {
      throw new Error("Video must be completed with a final video URL");
    }

    // Check if already posted
    const existingPost = await storage.getPostizPostByProjectId(projectId);
    if (existingPost && existingPost.postedFacebook && existingPost.postedYoutube && existingPost.postedTiktok) {
      throw new Error("Video has already been posted to Facebook, YouTube, and TikTok");
    }

    const POSTIZ_API_KEY = process.env.POSTIZ_API_KEY;
    const FACEBOOK_CHANNEL_ID = "cmgi638zj005ulb0yf9dlmz4g";
    const YOUTUBE_CHANNEL_ID = "cmgheacv20174lb0yszfbkfrg";
    const TIKTOK_CHANNEL_ID = "cmgi2xrxq0036lb0ykwos7wny";

    if (!POSTIZ_API_KEY) {
      throw new Error("POSTIZ_API_KEY not configured");
    }

    // Prepare video URL and content
    const videoUrl = project.finalVideoUrl;
    const hashtags = "#ai #aivideo #musicvideo #neonvideo";
    
    // Generate a signed URL for the video file (valid for 1 hour)
    const { ObjectStorageService } = await import('./objectStorage.js');
    const objStorage = new ObjectStorageService();
    let fullVideoUrl: string;
    
    try {
      // Get signed URL from object storage
      fullVideoUrl = await objStorage.getSignedUrlForPath(videoUrl, 3600);
      console.log(`[POSTIZ] Generated signed URL for video`);
    } catch (error) {
      console.error(`[POSTIZ] Failed to generate signed URL:`, error);
      // Fallback to direct URL (might not work but better than failing)
      const baseUrl = "https://neonvideo.ai";
      fullVideoUrl = videoUrl.startsWith('http') ? videoUrl : `${baseUrl}${videoUrl}`;
    }
    
    const content = `Create your own AI Music Videos Now! 🤩\n\n${hashtags}`;

    console.log(`[POSTIZ] Posting to Facebook, YouTube, and TikTok for project: ${project.title}`);
    console.log(`[POSTIZ] Video URL for upload: ${fullVideoUrl}`);

    // Step 1: Download video from object storage
    console.log(`[POSTIZ] Downloading video from object storage...`);
    const videoResponse = await fetch(fullVideoUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.status}`);
    }
    const videoBuffer = await videoResponse.arrayBuffer();
    console.log(`[POSTIZ] Downloaded video (${videoBuffer.byteLength} bytes)`);

    // Step 2: Upload video to Postiz as multipart form data
    console.log(`[POSTIZ] Uploading video to Postiz...`);
    const FormData = (await import('form-data')).default;
    const nodeFetch = (await import('node-fetch')).default;
    
    const formData = new FormData();
    formData.append('file', Buffer.from(videoBuffer), {
      filename: `${project.title.replace(/[^a-z0-9]/gi, '_')}.mp4`,
      contentType: 'video/mp4'
    });

    const uploadResponse = await nodeFetch("https://api.postiz.com/public/v1/upload", {
      method: "POST",
      headers: {
        "Authorization": POSTIZ_API_KEY,
        ...formData.getHeaders()
      },
      body: formData as any
    });

    const uploadResponseText = await uploadResponse.text();
    console.log(`[POSTIZ] Upload response status: ${uploadResponse.status}`);
    console.log(`[POSTIZ] Upload response:`, uploadResponseText);

    if (!uploadResponse.ok) {
      throw new Error(`Postiz upload error (${uploadResponse.status}): ${uploadResponseText}`);
    }

    const uploadResult = JSON.parse(uploadResponseText);
    console.log(`[POSTIZ] Video uploaded successfully. Response:`, uploadResult);

    // Step 2: Create post with uploaded video for both Facebook and YouTube
    const groupId = `neonvideo-${Date.now()}`;
    const postBody = {
      type: "now",
      date: new Date().toISOString(),
      shortLink: false,
      tags: [],
      posts: [
        {
          integration: { id: FACEBOOK_CHANNEL_ID },
          value: [
            {
              content: content,
              image: [
                {
                  id: uploadResult.id,
                  path: uploadResult.path || uploadResult.url
                }
              ]
            }
          ],
          group: groupId
        },
        {
          integration: { id: YOUTUBE_CHANNEL_ID },
          value: [
            {
              content: content,
              image: [
                {
                  id: uploadResult.id,
                  path: uploadResult.path || uploadResult.url
                }
              ]
            }
          ],
          settings: {
            title: "Create your own AI Music Video now with NeonVideo.AI",
            type: "public"
          },
          group: groupId
        },
        {
          integration: { id: TIKTOK_CHANNEL_ID },
          value: [
            {
              content: content,
              image: [
                {
                  id: uploadResult.id,
                  path: uploadResult.path || uploadResult.url
                }
              ]
            }
          ],
          settings: {
            privacy_level: "PUBLIC_TO_EVERYONE",
            duet: true,
            stitch: true,
            comment: true,
            autoAddMusic: "no",
            brand_content_toggle: false,
            brand_organic_toggle: false,
            content_posting_method: "DIRECT_POST"
          },
          group: groupId
        }
      ]
    };

    console.log(`[POSTIZ] Creating post with video...`);
    console.log(`[POSTIZ] Post body:`, JSON.stringify(postBody, null, 2));
    
    const postResponse = await fetch("https://api.postiz.com/public/v1/posts", {
      method: "POST",
      headers: {
        "Authorization": POSTIZ_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(postBody)
    });

    const postResponseText = await postResponse.text();
    console.log(`[POSTIZ] Post response status: ${postResponse.status}`);
    console.log(`[POSTIZ] Post response:`, postResponseText);

    if (!postResponse.ok) {
      throw new Error(`Postiz API error (${postResponse.status}): ${postResponseText}`);
    }

    const postResult = JSON.parse(postResponseText);
    const postId = postResult.id || postResult.data?.id || null;

    console.log(`[POSTIZ] Successfully posted to Facebook, YouTube, and TikTok. Post ID: ${postId}`);

    // Record the post in database
    const now = new Date();
    if (existingPost) {
      await storage.updatePostizPost(projectId, {
        postedFacebook: now,
        postedYoutube: now,
        postedTiktok: now,
        facebookPostId: postId,
        youtubePostId: postId,
        tiktokPostId: postId
      });
      console.log(`[POSTIZ] ✅ Updated post record for project ${projectId} - marked as posted to all platforms at ${now.toISOString()}`);
    } else {
      await storage.createPostizPost({
        projectId: projectId,
        postedFacebook: now,
        postedYoutube: now,
        postedTiktok: now,
        facebookPostId: postId,
        youtubePostId: postId,
        tiktokPostId: postId
      });
      console.log(`[POSTIZ] ✅ Created post record for project ${projectId} - marked as posted to all platforms at ${now.toISOString()}`);
    }

    return { postId, projectTitle: project.title, videoUrl: project.finalVideoUrl };
  }

  // Admin endpoint to post a specific video to social media
  app.post("/api/admin/videos/:id/post-to-social", authenticateAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if already posted to all platforms
      const postRecord = await storage.getPostizPostByProjectId(id);
      if (postRecord && postRecord.postedFacebook && postRecord.postedYoutube && postRecord.postedTiktok) {
        return res.status(400).json({
          success: false,
          error: "This video has already been posted to all platforms",
          alreadyPosted: true
        });
      }
      
      const result = await postVideoToPostiz(id);

      res.json({
        success: true,
        message: "Video posted to Facebook, YouTube, and TikTok successfully",
        video: {
          id: id,
          title: result.projectTitle,
          url: result.videoUrl
        },
        postId: result.postId
      });
    } catch (error) {
      console.error("[POSTIZ] Admin post error:", error);
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Cron endpoint for auto-posting videos to social media
  app.post("/api/cron/auto-post-to-social", async (req, res) => {
    try {
      console.log("[AUTO-POST] Starting auto-post job at", new Date().toISOString());
      
      // Get all completed videos that haven't been posted yet
      const allProjects = await storage.getAllProjects();
      const completedVideos = allProjects.filter(p => 
        p.isCompleted && 
        p.finalVideoUrl
      );

      console.log(`[AUTO-POST] Found ${completedVideos.length} completed videos`);

      // Check which ones haven't been posted to Facebook, YouTube, and TikTok yet
      const unpostedVideos = [];
      for (const video of completedVideos) {
        const postRecord = await storage.getPostizPostByProjectId(video.id);
        if (!postRecord || !postRecord.postedFacebook || !postRecord.postedYoutube || !postRecord.postedTiktok) {
          unpostedVideos.push(video);
        }
      }

      console.log(`[AUTO-POST] Found ${unpostedVideos.length} unposted videos`);

      if (unpostedVideos.length === 0) {
        return res.json({
          success: true,
          message: "No videos to post",
          posted: 0
        });
      }

      // Sort by creation date DESC and get the first one
      const videoToPost = unpostedVideos.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];

      console.log(`[AUTO-POST] Selected video to post: ${videoToPost.id} - ${videoToPost.title}`);

      // Use the helper function to post
      const result = await postVideoToPostiz(videoToPost.id);

      res.json({
        success: true,
        message: "Video posted to Facebook, YouTube, and TikTok successfully",
        posted: 1,
        video: {
          id: videoToPost.id,
          title: result.projectTitle,
          url: result.videoUrl
        },
        postId: result.postId
      });

    } catch (error) {
      console.error("[AUTO-POST] Error:", error);
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // CORS preflight for NeonSinglePrompt endpoint
  app.options("/api/neon-single-prompt", (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.sendStatus(204);
  });

  // NeonSinglePrompt: Generate complete music video from a single prompt
  app.post("/api/neon-single-prompt", authenticateToken, async (req, res) => {
    // Set CORS headers
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    
    try {
      const { prompt } = req.body;
      const userId = req.user!.userId;

      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        return res.status(400).json({ 
          error: "Please provide a prompt describing your music video" 
        });
      }

      console.log(`[NEON-SINGLE-PROMPT] Starting video generation for user ${userId}`);
      console.log(`[NEON-SINGLE-PROMPT] Prompt: ${prompt}`);

      // Import OpenAI dynamically to ensure it's available
      const OpenAI = (await import("openai")).default;
      const openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      // Step 1: Parse prompt with OpenAI to extract character, song_title, and video_description
      console.log(`[NEON-SINGLE-PROMPT] Step 1: Parsing prompt with OpenAI...`);
      
      const parseResponse = await openaiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a helpful assistant that extracts structured information from music video prompts. 
            Extract the following from the user's prompt:
            - character: A detailed description of the main character (appearance, style, personality) - REQUIRED
            - video_description: What the music video should be about (scenes, mood, story) - REQUIRED
            - song_title: The title or theme of the song - OPTIONAL (can be null if not specified)
            
            Only mark character and video_description as missing if they are truly unclear or absent.
            Song title is optional and should not be marked as missing.
            Respond ONLY with valid JSON in this format:
            {
              "character": "description or null",
              "song_title": "title or null", 
              "video_description": "description or null",
              "missing": ["list of REQUIRED missing elements only"],
              "suggestion": "helpful suggestion if anything is missing"
            }`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      });

      const parsed = JSON.parse(parseResponse.choices[0].message.content || "{}");
      console.log(`[NEON-SINGLE-PROMPT] Parsed prompt:`, parsed);

      // Filter out song_title from missing elements since it's optional
      const requiredMissing = parsed.missing?.filter((item: string) => item !== 'song_title') || [];

      // Check if we have all required elements (character and video_description only)
      if (requiredMissing.length > 0) {
        console.log(`[NEON-SINGLE-PROMPT] Missing required elements:`, requiredMissing);
        return res.status(400).json({
          error: "Incomplete prompt",
          missing: requiredMissing,
          suggestion: parsed.suggestion || "Please provide a character description and video description.",
          example: "Create a music video about a cute little cowboy hamster in the wild west."
        });
      }

      // Step 2: Create a new project
      console.log(`[NEON-SINGLE-PROMPT] Step 2: Creating project...`);
      const project = await storage.createProject({
        userId,
        title: parsed.song_title || parsed.video_description.substring(0, 50),
        description: parsed.video_description,
        currentStep: 1
      });
      console.log(`[NEON-SINGLE-PROMPT] Created project ${project.id}`);

      // Step 3: Generate lyrics and title
      const lyricsPrompt = parsed.song_title 
        ? `${parsed.song_title}. ${parsed.video_description}`
        : parsed.video_description;
      console.log(`[NEON-SINGLE-PROMPT] Step 3: Generating lyrics and title with OpenAI...`);
      const { lyrics, title: aiGeneratedTitle } = await generateLyricsWithTitle(lyricsPrompt, 30);
      await storage.updateProject(project.id, { 
        audioLyrics: lyrics,
        title: aiGeneratedTitle,
        audioDuration: 30,
        currentStep: 1
      });
      console.log(`[NEON-SINGLE-PROMPT] Generated lyrics (${lyrics.length} chars) and title: ${aiGeneratedTitle}`);

      // Step 4: Generate song with ElevenLabs
      console.log(`[NEON-SINGLE-PROMPT] Step 4: Generating 30-second song with ElevenLabs...`);
      const songTags = parsed.song_title 
        ? `${parsed.song_title}. ${parsed.video_description}`
        : parsed.video_description;
      const songResult = await generateSongWithElevenLabs(
        lyrics,
        songTags,
        30000  // 30 seconds in milliseconds
      );
      
      await storage.updateProject(project.id, { 
        audioUrl: songResult.audioUrl,
        audioDuration: 30,  // 30 seconds
        currentStep: 2 
      });
      console.log(`[NEON-SINGLE-PROMPT] Song generated and uploaded (30 seconds)`);

      // Step 5: Generate character image with Fal.ai
      console.log(`[NEON-SINGLE-PROMPT] Step 5: Generating character image for "${parsed.character}"...`);
      const characterImageUrl = await generateCharacterImage(parsed.character);
      
      await storage.updateProject(project.id, { 
        characterImageUrl,
        currentStep: 3
      });
      console.log(`[NEON-SINGLE-PROMPT] Character image generated`);

      // Calculate number of scenes dynamically for 30-second video
      const numberOfScenes = Math.ceil(30 / 10); // 3 scenes for 30 seconds
      console.log(`[NEON-SINGLE-PROMPT] Dynamically calculated ${numberOfScenes} scenes for 30s video`);

      // Step 6: Generate scene prompts
      console.log(`[NEON-SINGLE-PROMPT] Step 6: Generating scene prompts...`);
      const scenePrompts = await generateScenePrompts(
        parsed.video_description,
        numberOfScenes
      );
      
      console.log(`[NEON-SINGLE-PROMPT] Generated ${scenePrompts.length} scene prompts`);

      // Step 7: Generate scene images
      console.log(`[NEON-SINGLE-PROMPT] Step 7: Generating scene images...`);
      const sceneImages = await generateSceneImages(
        scenePrompts,
        characterImageUrl
      );

      await storage.updateProject(project.id, {
        scenePrompts: scenePrompts,
        sceneImages: sceneImages,
        currentStep: 4
      });
      console.log(`[NEON-SINGLE-PROMPT] Generated ${sceneImages.length} scene images`);

      // Step 8: Generate final video
      console.log(`[NEON-SINGLE-PROMPT] Step 8: Generating final music video...`);
      
      // This will trigger the existing video generation pipeline
      // We'll return the project ID and let the client poll for completion
      await storage.updateProject(project.id, {
        currentStep: 5,
        isCompleted: false
      });

      // Trigger video generation asynchronously
      (async () => {
        try {
          // Call internal video generation logic
          const videoGenResponse = await fetch(`http://localhost:5000/api/projects/${project.id}/generate-video`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            }
          });

          if (videoGenResponse.ok) {
            console.log(`[NEON-SINGLE-PROMPT] Video generation completed for project ${project.id}`);
          } else {
            const errorData = await videoGenResponse.json();
            console.error(`[NEON-SINGLE-PROMPT] Video generation failed with status ${videoGenResponse.status}:`, errorData);
          }
        } catch (error) {
          console.error(`[NEON-SINGLE-PROMPT] Video generation failed:`, error);
        }
      })();

      console.log(`[NEON-SINGLE-PROMPT] ✅ All steps completed! Project ${project.id} is processing final video.`);

      res.json({
        success: true,
        projectId: project.id,
        message: "Music video generation started! The video is being created in the background.",
        details: {
          character: parsed.character,
          song_title: parsed.song_title,
          video_description: parsed.video_description,
          lyrics: lyrics.substring(0, 100) + "...",
          sceneCount: sceneImages.length
        }
      });

    } catch (error) {
      console.error("[NEON-SINGLE-PROMPT] Error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to generate music video"
      });
    }
  });

  // CORS preflight for status endpoint
  app.options("/api/neon-single-prompt/status/:projectId", (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.sendStatus(204);
  });

  // Get video generation status - for async polling
  app.get("/api/neon-single-prompt/status/:projectId", authenticateToken, async (req, res) => {
    // Set CORS headers
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    
    try {
      const { projectId } = req.params;
      
      if (!projectId) {
        return res.status(400).json({ 
          error: "Project ID is required" 
        });
      }

      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ 
          error: "Project not found" 
        });
      }

      // Determine the current status
      let status = 'processing';
      let progress = 0;
      
      if (project.isCompleted && project.finalVideoUrl) {
        status = 'completed';
        progress = 100;
      } else if (project.generationStatus === 'failed') {
        status = 'failed';
        progress = 0;
      } else {
        // Calculate progress based on currentStep (5 total steps)
        progress = Math.round((project.currentStep / 5) * 100);
      }

      // Build the response
      const response: any = {
        projectId: project.id,
        status,
        progress,
        currentStep: project.currentStep,
        title: project.title,
        description: project.description
      };

      // Include video URL if completed
      if (status === 'completed' && project.finalVideoUrl) {
        // Convert relative URL to absolute URL
        let videoUrl = project.finalVideoUrl;
        
        // If it's a relative path, convert to full URL
        if (videoUrl.startsWith('/')) {
          const baseUrl = process.env.FRONTEND_URL || 'https://neonvideo.ai';
          videoUrl = `${baseUrl}${videoUrl}`;
        }
        
        response.finalVideoUrl = videoUrl;
        
        // Include Mux streaming URL if available
        if (project.muxPlaybackId) {
          response.streamingUrl = `https://stream.mux.com/${project.muxPlaybackId}.m3u8`;
          response.muxPlaybackId = project.muxPlaybackId;
          response.muxAssetStatus = project.muxAssetStatus;
        }
      }

      // Include queue position if queued
      if (status === 'processing') {
        const queuePosition = await videoQueueService.getQueuePosition(projectId);
        if (queuePosition !== null && queuePosition > 0) {
          response.queuePosition = queuePosition;
          response.message = `Video is queued for processing. Position in queue: ${queuePosition}`;
        } else {
          response.message = 'Video is being generated...';
        }
      }

      // Include error message if failed
      if (status === 'failed') {
        response.message = 'Video generation failed. Please try again.';
      }

      res.json(response);

    } catch (error) {
      console.error("[NEON-STATUS] Error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get project status"
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
