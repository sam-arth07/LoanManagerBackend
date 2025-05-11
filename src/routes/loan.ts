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
			res.status(201).json({
				success: true,
				message: "Loan application submitted successfully",
				data: loan,
			});
		})
		.catch((err) => {
			res.status(400).json({
				success: false,
				message: "Failed to submit loan application",
				error: String(err),
			});
		});
});

// Get all loan applications for the current user
router.get("/my-loans", (req: any, res): any => {
	// Get user ID from Clerk auth - the property might be in different places
	const userId = req.auth?.userId || req.userId;

	if (!userId) {
		return res.status(401).json({
			success: false,
			message: "Unauthorized. User ID not found.",
		});
	}

	prisma.loanApplication
		.findMany({
			where: { userId },
			orderBy: { appliedAt: "desc" },
		})
		.then((loans) => {
			res.status(200).json(loans);
		})
		.catch((err) => {
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

// Delete a loan application
router.delete("/:id", async (req: any, res: any) => {
	const { id } = req.params;
	const deleterClerkId = req.auth?.userId;

	if (!deleterClerkId) {
		return res
			.status(401)
			.json({ message: "Unauthorized: User session not found." });
	}

	try {
		const loanApplication = await prisma.loanApplication.findUnique({
			where: { id },
		});

		if (!loanApplication) {
			return res
				.status(404)
				.json({ message: "Loan application not found." });
		}

		let canDelete = false;
		// Check if the deleter is the owner of the loan
		if (loanApplication.userId === deleterClerkId) {
			canDelete = true;
		} else {
			// If not the owner, check if the deleter is an admin
			const requestingUser = await prisma.user.findUnique({
				where: { clerkId: deleterClerkId },
				select: { isAdmin: true },
			});
			if (requestingUser?.isAdmin) {
				canDelete = true;
			}
		}

		if (!canDelete) {
			return res.status(403).json({
				message:
					"Forbidden: You do not have permission to delete this loan application.",
			});
		}

		await prisma.loanApplication.delete({
			where: { id },
		});

		res.status(200).json({
			message: "Loan application deleted successfully.",
		});
	} catch (error: any) {
		if (error.code === "P2025") {
			// Prisma error code for "Record to delete does not exist."
			return res.status(404).json({
				message: "Loan application not found or already deleted.",
			});
		}
		return res.status(500).json({
			message: "Failed to delete loan application. Please try again.",
		});
	}
});

export default router;
