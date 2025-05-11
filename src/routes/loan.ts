import express from "express";
import { prisma } from "../prisma";

// Define our extended request interface with auth properties
interface AuthenticatedRequest extends express.Request {
	auth?: {
		userId?: string;
	};
	userId?: string;
}

const router = express.Router();

// Create a new loan application
router.post("/", (req, res) => {
	const {
		userId,
		fullName,
		loanAmount,
		duration,
		purpose,
		employmentStatus,
		employmentAddress,
	} = req.body;
	console.log("Received loan application:", req.body);

	prisma.loanApplication
		.create({
			data: {
				userId,
				fullName,
				loanAmount,
				duration,
				purpose,
				employmentStatus,
				employmentAddress,
			},
		})
		.then((loan) => {
			console.log("Loan application created:", loan);
			res.status(201).json({
				success: true,
				message: "Loan application submitted successfully",
				data: loan,
			});
		})
		.catch((err) => {
			console.error("Error creating loan application:", err);
			res.status(400).json({
				success: false,
				message: "Failed to submit loan application",
				error: String(err),
			});
		});
});

// Get all loan applications for the current user
router.get("/my-loans", (req: any, res):any => {
	// Get user ID from Clerk auth - the property might be in different places
	const userId = req.auth?.userId || req.userId;

	if (!userId) {
		return res.status(401).json({
			success: false,
			message: "Unauthorized. User ID not found.",
		});
	}
	console.log("Fetching loans for user:", userId);

	prisma.loanApplication
		.findMany({
			where: { userId },
			orderBy: { appliedAt: "desc" },
		})
		.then((loans) => {
			console.log(`Found ${loans.length} loans for user ${userId}`);
			res.status(200).json(loans);
		})
		.catch((err) => {
			console.error("Error fetching user's loans:", err);
			res.status(500).json({
				success: false,
				message: "Failed to fetch loan applications",
				error: String(err),
			});
		});
});

// Get loans by user ID (for admin use)
router.get("/:userId", (req, res) => {
	prisma.loanApplication
		.findMany({
			where: { userId: req.params.userId },
		})
		.then((loans) => {
			res.status(200).json(loans);
		})
		.catch((err) => {
			res.status(500).json({
				success: false,
				message: "Failed to fetch loans",
				error: String(err),
			});
		});
});

export default router;
