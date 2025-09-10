import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

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
        const userId = session.metadata.userId;
        const planId = session.metadata.planId;
        
        if (userId && planId) {
          // Update user with subscription details
          await storage.updateUser(userId, {
            stripeSubscriptionId: session.subscription,
            planId: planId,
          });
          
          // Get plan details and add credits
          const plan = await storage.getPlanById(planId);
          if (plan) {
            const currentUser = await storage.getUser(userId);
            await storage.updateUser(userId, {
              credits: (currentUser?.credits || 0) + plan.credits
            });
          }
          
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
          break;
        }
        
        const customerId = invoice.customer;
        const user = await storage.getUserByStripeCustomerId(customerId);
        
        if (user && invoice.subscription) {
          // Get subscription to find the plan
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          const priceId = subscription.items.data[0]?.price.id;
          
          if (priceId) {
            // Find plan by price ID
            const plans = await storage.getAllPlans();
            const plan = plans.find(p => 
              p.stripePriceIdMonthly === priceId || 
              p.stripePriceIdYearly === priceId
            );
            
            if (plan) {
              // Add credits for renewal
              await storage.updateUser(user.id, {
                credits: (user.credits || 0) + plan.credits
              });
              console.log(`Added ${plan.credits} credits to user ${user.id} for subscription renewal`);
            }
          }
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

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

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
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
