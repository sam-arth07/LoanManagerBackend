import { ClerkExpressWithAuth } from "@clerk/clerk-sdk-node";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import adminRoutes from "./src/routes/admin";
import authRoutes from "./src/routes/auth";
import loanRoutes from "./src/routes/loan";

const { MongoClient, ServerApiVersion } = require("mongodb");
dotenv.config();

const uri = process.env.DATABASE_URL;
const frontendUrl = process.env.FRONTEND_URL;

const client = new MongoClient(uri, {
	serverApi: {
		version: ServerApiVersion.v1,
		strict: true,
		deprecationErrors: true,
	},
});

async function run() {
	try {
		await client.connect();
		// Send a ping to confirm a successful connection
		await client.db("admin").command({ ping: 1 });
		console.log(
			"Pinged your deployment. You successfully connected to MongoDB!"
		);
	} finally {
		// Ensures that the client will close when you finish/error
		await client.close();
	}
}
run().catch(console.dir);

const app = express();

// Enhanced CORS configuration
app.use(
	cors({
		origin: [
			"https://loan-manager-frontend-bcvd.vercel.app/",
			"https://loan-manager-frontend-bcvd.vercel.app", // Added origin without trailing slash
		],
		methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization"],
		credentials: true,
		exposedHeaders: ["Content-Length", "X-Request-ID"],
	})
);

app.use(express.json());
// Ensure both publishable key and secret key are available
console.log("Clerk keys configured:", {
	publishableKey: process.env.CLERK_PUBLISHABLE_KEY
		? "configured"
		: "missing",
	secretKey: process.env.CLERK_SECRET_KEY ? "configured" : "missing",
});
// Use ClerkExpressWithAuth middleware instead of requireAuth
app.use(ClerkExpressWithAuth());

// Make auth object available to routes
app.use((req: any, res, next) => {
	// Add the userId directly to req for easier access
	if (req.auth && req.auth.userId) {
		req.userId = req.auth.userId;
	}
	next();
});

app.use("/api/loan", loanRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
