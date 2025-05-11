import { getAuth } from "@clerk/express";
import express from "express";
import { prisma } from "../prisma";

const router = express.Router();

// Middleware to verify admin status
const verifyAdmin = async (req: any, res: any, next: any) => {
	try {
		const { userId } = getAuth(req);

		if (!userId) {
			return res.status(401).json({ error: "Not authenticated" });
		}

		// Check if user has admin privileges
		const user = await prisma.user.findUnique({
			where: { clerkId: userId },
		});

		if (!user || !user.isAdmin) {
			return res
				.status(403)
				.json({ error: "Not authorized - Admin access required" });
		}

		// Admin verified, proceed
		next();
	} catch (error) {
		console.error("Admin verification failed:", error);
		return res
			.status(500)
			.json({ error: "Server error during admin verification" });
	}
};

// Apply admin verification middleware to all routes in this router
router.use(verifyAdmin);

// Get dashboard stats
router.get("/dashboard-stats", async (req, res) => {
	try {
		const activeUsers = await prisma.user.count();

		const loanStats = await prisma.loanApplication.groupBy({
			by: ["status"],
			_count: {
				status: true,
			},
			_sum: {
				loanAmount: true,
			},
		});

		// Calculate total borrowers, disbursed amount, etc.
		const borrowerCount = await prisma.loanApplication
			.groupBy({
				by: ["userId"],
			})
			.then((grouped) => grouped.length);
		const totalDisbursed = loanStats
			.filter((stat) => ["approved", "verified"].includes(stat.status))
			.reduce((sum, stat) => sum + (stat._sum.loanAmount || 0), 0);
		const totalReceived = await prisma.loanApplication.aggregate({
			where: {
				// Only count verified loans as received (repaid)
				status: "verified",
			},
			_sum: {
				loanAmount: true,
			},
		});

		const repaidLoans = await prisma.loanApplication.count({
			where: {
				status: "verified",
			},
		});

		// Count loan applications by status
		const pendingApplications = await prisma.loanApplication.count({
			where: { status: "pending" },
		});

		const approvedApplications = await prisma.loanApplication.count({
			where: { status: "approved" },
		});

		const rejectedApplications = await prisma.loanApplication.count({
			where: { status: "rejected" },
		});

		// Get recent loans for the table
		const recentLoans = await prisma.loanApplication.findMany({
			take: 10,
			orderBy: { appliedAt: "desc" },
			// Remove the include property if not needed
			// include: {
			// 	// Include user details if needed
			// },
		}); // Calculate additional metrics based on real data
		const totalLoans =
			pendingApplications +
			approvedApplications +
			rejectedApplications +
			repaidLoans;
		const totalSavings = totalReceived._sum.loanAmount
			? totalReceived._sum.loanAmount * 0.05
			: 0; // 5% of received amount goes to savings

		// Calculate collection rate (percentage of approved loans that have been verified/repaid)
		const collectionRate =
			approvedApplications + repaidLoans > 0
				? (repaidLoans / (approvedApplications + repaidLoans)) * 100
				: 0;
		// TODO: This is a placeholder for future implementation of tracking actual income sources
		// Currently just counts admin users instead of real income sources
		const otherIncomeSources = await prisma.user.count({
			where: {
				isAdmin: true,
			},
		});
		// Calculate average loan amount for approved and verified loans
		const avgLoanAmount =
			totalDisbursed / (approvedApplications + repaidLoans) || 0;
		// Calculate approval rate - approved loans are those with status "approved" or "verified" (repaid)
		const approvalRate =
			totalLoans > 0
				? ((approvedApplications + repaidLoans) / totalLoans) * 100
				: 0;

		res.json({
			stats: {
				activeUsers,
				borrowerCount,
				cashDisbursed: totalDisbursed,
				cashReceived: totalReceived._sum.loanAmount || 0,
				repaidLoans,
				savingsAccount: totalSavings, // Calculated as percentage of received amount
				otherAccounts: otherIncomeSources, // Dynamic count from database
			},
			loanStats: {
				pending: pendingApplications,
				approved: approvedApplications,
				rejected: rejectedApplications,
				total:
					pendingApplications +
					approvedApplications +
					rejectedApplications,
			},
			recentLoans,
			kpis: {
				averageLoanAmount: avgLoanAmount,
				approvalRate: approvalRate,
				collectionRate: collectionRate,
			},
		});
	} catch (error) {
		console.error("Error fetching admin dashboard stats:", error);
		res.status(500).json({ error: "Failed to fetch dashboard statistics" });
	}
});

// Get all loans (with pagination)
router.get("/loans", async (req, res) => {
	try {
		const page = parseInt(req.query.page as string) || 1;
		const limit = parseInt(req.query.limit as string) || 10;
		const skip = (page - 1) * limit;
		const status = req.query.status as string;

		const whereClause = status && status !== "all" ? { status } : {};

		const loans = await prisma.loanApplication.findMany({
			skip,
			take: limit,
			where: whereClause,
			orderBy: { appliedAt: "desc" },
		});

		const totalLoans = await prisma.loanApplication.count({
			where: whereClause,
		});

		res.json({
			data: loans,
			pagination: {
				total: totalLoans,
				page,
				pages: Math.ceil(totalLoans / limit),
				limit,
			},
		});
	} catch (error) {
		console.error("Error fetching all loans:", error);
		res.status(500).json({ error: "Failed to fetch loans" });
	}
});

// Get all users (with pagination)
router.get("/users", async (req, res) => {
	try {
		const page = parseInt(req.query.page as string) || 1;
		const limit = parseInt(req.query.limit as string) || 10;
		const skip = (page - 1) * limit;

		const users = await prisma.user.findMany({
			skip,
			take: limit,
			orderBy: { name: "asc" },
		});

		const totalUsers = await prisma.user.count();

		res.json({
			data: users,
			pagination: {
				total: totalUsers,
				page,
				pages: Math.ceil(totalUsers / limit),
				limit,
			},
		});
	} catch (error) {
		console.error("Error fetching users:", error);
		res.status(500).json({ error: "Failed to fetch users" });
	}
});

// Get a single loan by ID
router.get("/loans/:id", (req: any, res: any) => {
	const { id } = req.params;

	prisma.loanApplication
		.findUnique({
			where: { id },
		})
		.then((loan) => {
			if (!loan) {
				return res.status(404).json({ error: "Loan not found" });
			}
			res.json(loan);
		})
		.catch((error) => {
			console.error(`Error fetching loan ${id}:`, error);
			res.status(500).json({ error: "Failed to fetch loan details" });
		});
});

// Update loan status (approve, reject, verify)
router.patch("/loans/:id/status", async (req: any, res: any) => {
	const { id } = req.params;
	const { status } = req.body;

	console.log(`[Admin API] Updating loan ${id} status to: ${status}`, {
		body: req.body,
		headers: req.headers,
		method: req.method,
		path: req.path,
	});
	// Validate status
	if (!["pending", "approved", "rejected", "verified"].includes(status)) {
		console.log(`[Admin API] Invalid status: ${status}`);
		return res.status(400).json({ error: "Invalid status value" });
	}

	// Additional validation for status transitions
	try {
		const currentLoan = await prisma.loanApplication.findUnique({
			where: { id },
			select: { status: true },
		});

		if (currentLoan) {
			// Validate status transitions
			const invalidTransitions = [
				// Don't allow changing verified (repaid) loans back to approved
				{ from: "verified", to: "approved" },
				// Don't allow changing verified loans to rejected
				{ from: "verified", to: "rejected" },
				// We do allow reverting from approved back to pending (undo approval)
				// We do allow changing from rejected to pending (reconsideration)
			];

			const isInvalidTransition = invalidTransitions.some(
				(transition) =>
					transition.from === currentLoan.status &&
					transition.to === status
			);

			if (isInvalidTransition) {
				console.log(
					`[Admin API] Invalid status transition from ${currentLoan.status} to ${status}`
				);
				return res.status(400).json({
					error: `Cannot change loan status from ${currentLoan.status} to ${status}`,
				});
			}

			console.log(
				`[Admin API] Valid status transition from ${currentLoan.status} to ${status}`
			);
		}
	} catch (error) {
		console.error("[Admin API] Error validating status transition:", error);
		// Continue processing even if transition validation fails to maintain backward compatibility
	}

	try {
		// First check if the loan exists
		const existingLoan = await prisma.loanApplication.findUnique({
			where: { id },
		});

		if (!existingLoan) {
			console.log(`[Admin API] Loan with ID ${id} not found`);
			return res.status(404).json({ error: "Loan not found" });
		}

		console.log(`[Admin API] Found loan:`, existingLoan);

		// Update the loan status
		const updatedLoan = await prisma.loanApplication.update({
			where: { id },
			data: { status },
		});

		console.log(
			`[Admin API] Successfully updated loan ${id} status to ${status}`
		);
		return res.json(updatedLoan);
	} catch (error) {
		console.error(`[Admin API] Error updating loan ${id} status:`, error);

		// Check if it's a Prisma error and provide more specific messages
		if (error && typeof error === "object" && "code" in error) {
			// Handle specific Prisma error codes
			switch (error.code) {
				case "P2025":
					return res.status(404).json({ error: "Loan not found" });
				case "P2023":
					return res
						.status(400)
						.json({ error: "Invalid loan ID format" });
				default:
					return res.status(500).json({
						error: `Database error: ${String(error.code)}`,
					});
			}
		}
		return res.status(500).json({ error: "Failed to update loan status" });
	}
});

export default router;
