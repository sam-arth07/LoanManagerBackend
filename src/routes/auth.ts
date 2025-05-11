import { clerkClient } from "@clerk/clerk-sdk-node";
import { getAuth } from "@clerk/express";
import express from "express";
import { prisma } from "../prisma";

const router = express.Router();

// Simple admin check route for testing
router.get("/check-admin", async (req, res): Promise<any> => {
	const adminEmails = (process.env.ADMIN_EMAILS || "").split(",");
	return res.status(200).json({
		adminEmails,
		envValue: process.env.ADMIN_EMAILS,
		clerkSecret: process.env.CLERK_SECRET_KEY ? "configured" : "missing",
	});
});

router.get("/verify", async (req, res): Promise<any> => {
	try {
		const { userId } = getAuth(req); // Clerk parses token automatically
		console.log("Auth request received for userId:", userId);

		if (!userId) {
			return res.status(401).json({ error: "User not authenticated" });
		}

		try {
			// Get user details from Clerk
			console.log(
				"Getting user details with clerkId:",
				userId,
				"using secret key:",
				process.env.CLERK_SECRET_KEY ? "exists" : "missing"
			);

			const user = await clerkClient.users.getUser(userId);
			const email = user.emailAddresses[0].emailAddress;
			const name = `${user.firstName ?? ""} ${
				user.lastName ?? ""
			}`.trim();
			console.log("User verified:", { userId, email, name });

			// Check if user is admin (you can define your admin emails in an environment variable)
			const adminEmails = (process.env.ADMIN_EMAILS || "").split(",");
			console.log("Admin emails from env:", adminEmails);
			console.log("Admin emails raw:", process.env.ADMIN_EMAILS);
			console.log("User email:", email);
			console.log("User email lowercase:", email.toLowerCase());

			// Force lowercase comparison to ensure case insensitivity
			const userEmailLower = email.toLowerCase();

			// Explicitly check for your email
			const isAdmin = userEmailLower === "samarthchaplot7@gmail.com";

			// Log the check details
			console.log("Admin check results:", {
				userEmailLower,
				expectedAdmin: "samarthchaplot7@gmail.com",
				match: userEmailLower === "samarthchaplot7@gmail.com",
				isAdmin,
			});

			// Upsert user into MongoDB using Prisma
			const updatedUser = await prisma.user.upsert({
				where: { clerkId: userId },
				update: { name, email, isAdmin },
				create: {
					clerkId: userId,
					name,
					email,
					isAdmin,
				},
			});

			return res.status(200).json({
				message: "User verified and stored",
				userId,
				email,
				name,
				isAdmin: updatedUser.isAdmin,
			});
		} catch (userError) {
			console.error("Error fetching user from Clerk:", userError);
			return res
				.status(500)
				.json({ error: "Failed to fetch user details from Clerk" });
		}
	} catch (err: any) {
		console.error("Verification failed:", err.message);
		res.status(401).json({ error: "Invalid or expired token" });
	}
});

export default router;
