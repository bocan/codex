import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authConfig } from '../config/auth';

const router = express.Router();

// Rate limiter for login endpoint - 5 attempts per 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Login endpoint
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  const { password } = req.body;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const timestamp = new Date().toISOString();

  if (!password) {
    console.warn(`[${timestamp}] Login attempt without password from ${ip}`);
    res.status(400).json({ error: 'Password required' });
    return;
  }

  // If auth is disabled, reject login attempts
  if (!authConfig.isAuthEnabled()) {
    console.warn(`[${timestamp}] Login attempt when auth disabled from ${ip}`);
    res.status(503).json({ error: 'Authentication not configured' });
    return;
  }

  // Verify password
  const isValid = await authConfig.verifyPassword(password);

  if (isValid) {
    req.session.authenticated = true;
    console.log(`[${timestamp}] ✓ Successful login from ${ip}`);
    res.json({ success: true, message: 'Login successful' });
  } else {
    console.warn(`[${timestamp}] ✗ Failed login attempt from ${ip}`);
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Logout endpoint
router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: 'Logout failed' });
      return;
    }
    res.json({ success: true, message: 'Logout successful' });
  });
});

// Check auth status
router.get('/status', (req: Request, res: Response) => {
  const authEnabled = authConfig.isAuthEnabled();
  const authenticated = req.session.authenticated || false;

  res.json({
    authEnabled,
    authenticated: authEnabled ? authenticated : true, // If no auth, consider "authenticated"
  });
});

export default router;
