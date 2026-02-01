// Load environment variables from .env file before any other imports
// Using side-effect import to ensure it runs before other imports
// Safe for production: dotenv only loads .env files if they exist and won't override existing env vars
import 'dotenv/config';

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { errorMonitoring } from "./services/errorMonitoring";

const app = express();

// Handle Stripe webhook BEFORE JSON parsing middleware
// This must come before express.json() to preserve raw body for signature verification
app.post("/api/stripe/webhook", express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Dynamic import of storage to avoid circular dependencies
    const { storage } = await import("./storage");
    
    // Get Stripe settings from database
    const stripeSettings = await storage.getAllSettings();
    const stripeSecretKey = stripeSettings.find(s => s.key === 'stripe_secret_key')?.value;
    const stripeWebhookSecret = stripeSettings.find(s => s.key === 'stripe_webhook_secret')?.value;
    
    if (!stripeSecretKey || !stripeWebhookSecret) {
      console.error("Stripe not configured for webhooks");
      return res.status(400).json({ error: "Webhook configuration missing" });
    }
    
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
    
    const sig = req.headers['stripe-signature'] as string;
    let event;
    
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, stripeWebhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }
    
    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        const userId = session.metadata?.userId;
        const planId = session.metadata?.planId;
        const purchaseType = session.metadata?.type;
        
        // Handle credit purchase (one-time payment)
        if (purchaseType === 'credit_purchase' && userId) {
          const creditsToAdd = parseInt(session.metadata?.creditsToAdd || '5000');
          
          if (session.payment_status === 'paid') {
            const user = await storage.getUser(userId);
            if (user) {
              const newBonusCredits = (user.bonusCredits || 0) + creditsToAdd;
              await storage.updateUser(userId, { bonusCredits: newBonusCredits });
              console.log(`Credit purchase: Added ${creditsToAdd} bonus credits to user ${userId}. New bonus credits: ${newBonusCredits}`);
            } else {
              console.error(`Credit purchase: User ${userId} not found`);
            }
          } else {
            console.log(`Credit purchase: Payment not completed for user ${userId}. Status: ${session.payment_status}`);
          }
          break;
        }
        
        // Handle gift subscription purchase
        if (purchaseType === 'gift_subscription') {
          const giftSubscriptionId = session.metadata?.giftSubscriptionId;
          const recipientEmail = session.metadata?.recipientEmail;
          const redemptionCode = session.metadata?.redemptionCode;
          const purchaserUserId = session.metadata?.purchaserUserId;
          
          if (session.payment_status === 'paid' && giftSubscriptionId) {
            // Update gift subscription status to 'paid'
            await storage.updateGiftSubscription(giftSubscriptionId, {
              status: 'paid',
              stripePaymentIntentId: session.payment_intent
            });
            
            console.log(`Gift subscription ${giftSubscriptionId} payment completed. Redemption code: ${redemptionCode}`);
            
            // Send email to recipient
            if (recipientEmail && redemptionCode) {
              try {
                const { emailService } = await import("./services/email");
                const purchaser = purchaserUserId ? await storage.getUser(purchaserUserId) : null;
                const gift = await storage.getGiftSubscriptionByCode(redemptionCode);
                const plan = gift ? await storage.getPlanById(gift.planId) : null;
                
                const baseUrl = process.env.FRONTEND_URL || 
                  (process.env.NODE_ENV === 'production' 
                    ? 'https://neonvideo.ai' 
                    : `http://localhost:${process.env.PORT || 5000}`);
                const redemptionUrl = `${baseUrl}/redeem-gift?code=${redemptionCode}`;
                
                await emailService.sendEmail({
                  to: recipientEmail,
                  subject: `You've received a gift subscription to neonvideo.ai!`,
                  html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
                        <h1 style="color: white; margin: 0;">🎁 You've Received a Gift!</h1>
                      </div>
                      <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
                        <p style="font-size: 16px; color: #333;">
                          ${purchaser ? `<strong>${purchaser.username}</strong> has` : 'Someone special has'} gifted you a subscription to neonvideo.ai!
                        </p>
                        
                        ${gift?.personalMessage ? `
                          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
                            <p style="font-style: italic; color: #666; margin: 0;">"${gift.personalMessage}"</p>
                          </div>
                        ` : ''}
                        
                        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                          <h3 style="color: #333; margin-top: 0;">Your Gift</h3>
                          <p><strong>Plan:</strong> ${plan?.name || 'Premium'} (${gift?.billingPeriod === 'yearly' ? '1 Year' : '1 Month'})</p>
                          <p><strong>Redemption Code:</strong> <code style="background: #e0e0e0; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${redemptionCode}</code></p>
                        </div>
                        
                        <div style="text-align: center; margin: 30px 0;">
                          <a href="${redemptionUrl}" 
                             style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                                    color: white; 
                                    padding: 15px 30px; 
                                    text-decoration: none; 
                                    border-radius: 8px; 
                                    font-weight: bold;
                                    display: inline-block;">
                            Redeem Your Gift
                          </a>
                        </div>
                        
                        <p style="color: #666; font-size: 14px;">
                          If the button doesn't work, copy and paste this link into your browser:
                          <br><a href="${redemptionUrl}" style="color: #667eea;">${redemptionUrl}</a>
                        </p>
                        
                        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                        
                        <p style="color: #999; font-size: 12px; text-align: center;">
                          This gift expires in 1 year if not redeemed.
                        </p>
                      </div>
                    </div>
                  `
                });
                
                console.log(`Gift subscription email sent to ${recipientEmail}`);
              } catch (emailError) {
                console.error('Failed to send gift subscription email:', emailError);
              }
            }
          } else {
            console.log(`Gift subscription: Payment not completed. Status: ${session.payment_status}`);
          }
          break;
        }
        
        // Handle subscription purchase
        if (userId && planId) {
          // Update user with subscription details
          await storage.updateUser(userId, {
            stripeSubscriptionId: session.subscription,
            planId: planId,
          });
          
          // Reset credits used for new subscription
          await storage.updateUser(userId, {
            creditsUsed: 0
          });
          
          console.log(`Subscription created for user ${userId} with plan ${planId}`);
        }
        break;
      }
      
      case 'customer.subscription.updated': {
        const subscription = event.data.object as any;
        const customerId = subscription.customer;
        
        // Find user by Stripe customer ID
        const user = await storage.getUserByStripeCustomerId(customerId);
        if (user) {
          // Update subscription status
          await storage.updateUser(user.id, {
            stripeSubscriptionId: subscription.id,
          });
        }
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any;
        const customerId = subscription.customer;
        
        // Find user by Stripe customer ID
        const user = await storage.getUserByStripeCustomerId(customerId);
        if (user) {
          // Clear subscription and reset to free plan
          const freePlan = await storage.getFreePlan();
          await storage.updateUser(user.id, {
            stripeSubscriptionId: null,
            planId: freePlan?.id || null,
          });
        }
        break;
      }
      
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as any;
        
        // Skip the first invoice from checkout.session.completed
        if (invoice.billing_reason === 'subscription_create') {
          console.log(`Skipping invoice for new subscription creation (handled by checkout.session.completed)`);
          break;
        }
        
        const customerId = invoice.customer;
        const user = await storage.getUserByStripeCustomerId(customerId);
        
        console.log(`Invoice payment succeeded - Customer: ${customerId}, User found: ${!!user}, Subscription: ${invoice.subscription}, Billing reason: ${invoice.billing_reason}`);
        
        if (user && invoice.subscription) {
          // Reset credits for subscription renewal - this is the key action
          // We reset credits regardless of whether we can match the plan,
          // since any successful subscription payment should refresh credits
          await storage.updateUser(user.id, {
            creditsUsed: 0
          });
          
          // Try to find and log the plan for informational purposes
          try {
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
            const priceId = subscription.items.data[0]?.price.id;
            
            if (priceId) {
              const plans = await storage.getAllPlans();
              const plan = plans.find(p => 
                p.stripeMonthlyPriceId === priceId || 
                p.stripeYearlyPriceId === priceId
              );
              
              if (plan) {
                console.log(`Reset credits for user ${user.id} for subscription renewal (plan: ${plan.name})`);
              } else {
                console.log(`Reset credits for user ${user.id} for subscription renewal (plan not found by priceId: ${priceId})`);
              }
            } else {
              console.log(`Reset credits for user ${user.id} for subscription renewal (no priceId found)`);
            }
          } catch (subscriptionError) {
            console.log(`Reset credits for user ${user.id} for subscription renewal (could not retrieve subscription details: ${subscriptionError})`);
          }
        } else if (!user) {
          console.error(`Invoice payment succeeded but user not found for Stripe customer: ${customerId}`);
        }
        break;
      }
      
      default:
        console.log(`Unhandled event type ${event.type}`);
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Now apply JSON parsing for all other routes
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static files from public directory for generated audio files
app.use(express.static("public"));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Send error notification for server errors (500+)
    if (status >= 500) {
      const user = (req as any).user;
      errorMonitoring.notifyAPIError(err, req.path, req.method, {
        userId: user?.userId,
        username: user?.username,
        statusCode: status,
        query: req.query,
        body: req.body
      }).catch(console.error);
    }

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  
  // Platform-specific server binding:
  // - Windows (local dev): Use localhost and disable reusePort (not supported on Windows)
  // - Linux/Unix (production/Replit): Use 0.0.0.0 with reusePort (original behavior preserved)
  const isWindows = process.platform === 'win32';
  const host = isWindows ? 'localhost' : '0.0.0.0';
  const listenOptions: any = {
    port,
    host,
  };
  
  // reusePort is not supported on Windows, but required for production/Replit
  if (!isWindows) {
    listenOptions.reusePort = true;
  }
  
  server.listen(listenOptions, () => {
    log(`serving on port ${port}`);
  });

  // Global error handlers for uncaught exceptions and unhandled rejections
  process.on('uncaughtException', (error: Error) => {
    console.error('💥 UNCAUGHT EXCEPTION:', error);
    errorMonitoring.notifyError({
      error,
      severity: 'critical',
      context: { errorType: 'uncaughtException' }
    }).catch(console.error);
  });

  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    console.error('💥 UNHANDLED REJECTION:', error);
    errorMonitoring.notifyError({
      error,
      severity: 'critical',
      context: { errorType: 'unhandledRejection' }
    }).catch(console.error);
  });

  // Log successful initialization
  console.log('✅ Error monitoring system initialized');
})();
