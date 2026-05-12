import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API placeholders for Share and Guest logic
  // In a real app, these would interact with Firebase Admin SDK
  // Here we use them as "simulated" endpoints that the frontend can call
  
  app.post("/api/share/guest/request", async (req, res) => {
    const { email, shareToken } = req.body;
    // Simulate sending magic link
    console.log(`[MAGIC LINK] Sent to ${email} for share ${shareToken}`);
    // In production, this would generate a magicToken and send an email
    res.json({ success: true, message: "Magic link sent to your email." });
  });

  app.post("/api/share/guest/verify", async (_req, res) => {
    // Simulate verification
    // magicToken would be checked against Firestore guestSessions
    res.json({ 
      success: true, 
      sessionToken: "simulated_session_" + Math.random().toString(36).substring(7) 
    });
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
