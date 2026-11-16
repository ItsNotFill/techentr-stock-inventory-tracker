import { config } from "dotenv";

// Integration tests talk to the real database. Values come from .env.local;
// tests that need them skip themselves when they are missing.
config({ path: ".env.local", quiet: true });
