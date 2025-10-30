const User = require("../models/User");
const Tournament = require("../models/Tournament");
const Transaction = require("../models/Transaction");
const VerificationRequest = require("../models/verification");
const ActivityLog = require("../models/ActivityLog");
const asyncHandler = require("express-async-handler");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const generateToken = require("../utils/generateToken");
const mongoose = require("mongoose");

/**
 * @desc    Create a new admin user
 * @route   POST /api/admin/create-admin
 * @access  Admin only
 */
exports.createAdmin = asyncHandler(async (req, res) => {
  const { fullName, email, password, phoneNumber } = req.body;

  // Validate required fields
  if (!fullName || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "Please provide all required fields",
    });
  }

  try {
    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Create new admin user
    const admin = await User.create({
      fullName,
      email,
      password, // Password will be hashed via pre-save hook
      phoneNumber: phoneNumber || "",
      role: "admin",
      isVerified: true, // Auto-verify admin accounts
    });

    // Create token for immediate login
    const token = generateToken(admin);

    // Return success response without password
    res.status(201).json({
      success: true,
      message: "Admin user created successfully",
      data: {
        _id: admin._id,
        fullName: admin.fullName,
        email: admin.email,
        role: admin.role,
        isVerified: admin.isVerified,
        token,
      },
    });
  } catch (error) {
    console.error("Error creating admin user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create admin user",
      error: error.message,
    });
  }
});

/**
 * @desc    Set an existing user as admin
 * @route   PUT /api/admin/set-admin/:userId
 * @access  Admin only
 */
exports.setUserAsAdmin = asyncHandler(async (req, res) => {
  try {
    const userId = req.params.userId;

    // Find user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update user role to admin
    user.role = "admin";
    await user.save();
    const token = generateToken(user); // Fixed: was using undefined 'admin' variable

    res.status(200).json({
      success: true,
      message: `User ${user.email} has been set as admin successfully`,
      data: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        token,
      },
    });
  } catch (error) {
    console.error("Error setting user as admin:", error);
    res.status(500).json({
      success: false,
      message: "Failed to set user as admin",
      error: error.message,
    });
  }
});

/**
 * @desc    Remove admin privileges from a user
 * @route   PUT /api/admin/remove-admin/:userId
 * @access  Admin only
 */
exports.removeAdminPrivileges = asyncHandler(async (req, res) => {
  try {
    const userId = req.params.userId;

    // Find user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if trying to remove admin status from the last admin
    const adminCount = await User.countDocuments({ role: "admin" });
    if (adminCount <= 1 && user.role === "admin") {
      return res.status(400).json({
        success: false,
        message: "Cannot remove admin privileges from the last admin user",
      });
    }

    // Update user role to regular user
    user.role = "user";
    await user.save();

    // Fixed: was using undefined 'admin' variable
    const token = generateToken(user);

    res.status(200).json({
      success: true,
      message: `Admin privileges removed from ${user.email} successfully`,
      data: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        token,
      },
    });
  } catch (error) {
    console.error("Error removing admin privileges:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove admin privileges",
      error: error.message,
    });
  }
});

/**
 * @desc    Get all admin users
 * @route   GET /api/admin/admins
 * @access  Admin only
 */
exports.getAllAdmins = asyncHandler(async (req, res) => {
  try {
    const admins = await User.find({ role: "admin" })
      .select("-password")
      .sort({ createdAt: -1 });

    // No need to generate token here
    res.status(200).json({
      success: true,
      count: admins.length,
      data: admins,
    });
  } catch (error) {
    console.error("Error getting admin users:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get admin users",
      error: error.message,
    });
  }
});

/**
 * @desc    Admin login
 * @route   POST /api/auth/admin/login
 * @access  Public
 */
exports.adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validate request
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Please provide email and password",
    });
  }

  try {
    // Find the user by email and include the password field for comparison
    const admin = await User.findOne({ email }).select("+password");

    // Check if user exists
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Check if user is an admin
    if (admin.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Not authorized as admin",
      });
    }

    // Check if password matches
    const isMatch = await admin.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Generate JWT token using the utility function
    const token = generateToken(admin);

    // Return success response
    res.status(200).json({
      success: true,
      message: "Admin login successful",
      data: {
        _id: admin._id,
        fullName: admin.fullName,
        email: admin.email,
        role: admin.role,
        token,
      },
    });
  } catch (error) {
    console.error("Error in admin login:", error);
    res.status(500).json({
      success: false,
      message: "Failed to login",
      error: error.message,
    });
  }
});

/**
 * @desc    Check if current user is admin
 * @route   GET /api/auth/admin/check
 * @access  Private
 */
exports.checkAdminStatus = asyncHandler(async (req, res) => {
  try {
    // req.user should be set by the auth middleware
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    // Check if user is admin
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Not authorized as admin",
      });
    }

    // User is admin
    res.status(200).json({
      success: true,
      message: "User is admin",
      data: {
        isAdmin: true,
        userId: req.user._id,
        email: req.user.email,
      },
    });
  } catch (error) {
    console.error("Error checking admin status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check admin status",
      error: error.message,
    });
  }
});

/**
 * @desc    Get platform statistics
 * @route   GET /api/statistics
 * @access  Admin
 */
exports.getStatistics = async (req, res) => {
  try {
    // Get total tournaments count
    const totalTournaments = await Tournament.countDocuments();

    // Get total players count (all users with role 'user')
    const totalPlayers = await User.countDocuments({ role: "user" });

    // Get total organizers count (users who have created at least one tournament)
    const totalOrganizers = await User.countDocuments({
      createdTournaments: { $exists: true, $not: { $size: 0 } },
    });

    // Get active tournaments count
    const activeTournaments = await Tournament.countDocuments({
      status: "active",
    });

    const stats = [
      {
        title: "Total Tournaments",
        count: totalTournaments,
      },
      {
        title: "Total Players",
        count: totalPlayers,
      },
      {
        title: "Total Organizers",
        count: totalOrganizers,
      },
      {
        title: "Active Tournaments",
        count: activeTournaments,
      },
    ];

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Statistics error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching statistics",
    });
  }
};

/**
 * @desc    Get platform statistics
 * @route   GET /api/stats
 * @access  Public
 */

/**
 * @desc    Get dashboard statistics for admin
 * @route   GET /api/admin/dashboard
 * @access  Admin only
 */
exports.getDashboardStats = asyncHandler(async (req, res) => {
  try {
    // Users statistics
    const totalUsers = await User.countDocuments();
    const adminUsers = await User.countDocuments({ role: "admin" });
    const verifiedUsers = await User.countDocuments({ isVerified: true });
    const unverifiedUsers = await User.countDocuments({ isVerified: false });

    // Tournaments statistics
    const totalTournaments = await Tournament.countDocuments();
    const activeTournaments = await Tournament.countDocuments({
      status: "active",
    });
    const completedTournaments = await Tournament.countDocuments({
      status: "completed",
    });
    const upcomingTournaments = await Tournament.countDocuments({
      status: "upcoming",
    });

    // Tournament category statistics
    const tournamentsByCategory = await Tournament.aggregate([
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
          participants: { $sum: { $size: "$participants" } },
        },
      },
      {
        $project: {
          category: "$_id",
          count: 1,
          participants: 1,
          _id: 0,
        },
      },
    ]);

    // Ensure all categories are represented even if they have zero tournaments
    const allCategories = ["bullet", "blitz", "rapid", "classical"];
    const categoriesStats = allCategories.map((category) => {
      const found = tournamentsByCategory.find(
        (item) => item.category === category
      );
      return found || { category, count: 0, participants: 0 };
    });

    // Transactions statistics
    const totalTransactions = await Transaction.countDocuments();
    const pendingWithdrawals = await Transaction.countDocuments({
      type: "withdrawal",
      status: "pending",
    });
    const completedWithdrawals = await Transaction.countDocuments({
      type: "withdrawal",
      status: "completed",
    });
    const deposits = await Transaction.countDocuments({ type: "deposit" });

    // Get transactions by type with amounts
    const transactionsByType = await Transaction.aggregate([
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
      {
        $project: {
          type: "$_id",
          count: 1,
          totalAmount: 1,
          _id: 0,
        },
      },
    ]);

    // Recent activities
    const recentTransactions = await Transaction.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("user", "fullName email")
      .lean();

    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select("fullName email createdAt role isVerified")
      .lean();

    res.status(200).json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          admins: adminUsers,
          verified: verifiedUsers,
          unverified: unverifiedUsers,
        },
        tournaments: {
          total: totalTournaments,
          active: activeTournaments,
          completed: completedTournaments,
          upcoming: upcomingTournaments,
          categories: categoriesStats,
        },
        transactions: {
          total: totalTransactions,
          pendingWithdrawals,
          completedWithdrawals,
          deposits,
          byType: transactionsByType,
        },
        recent: {
          transactions: recentTransactions,
          users: recentUsers,
        },
      },
    });
  } catch (error) {
    console.error("Error getting dashboard stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get dashboard statistics",
      error: error.message,
    });
  }
});

// Get all players
exports.getAllPlayers = asyncHandler(async (req, res) => {
  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;

  // Filtering
  const filter = { role: "user" };

  // Handle verification filter
  if (req.query.filter) {
    if (req.query.filter === "verified") {
      filter.isVerified = true;
    } else if (req.query.filter === "unverified") {
      filter.isVerified = false;
    } else if (req.query.filter === "pending") {
      // For pending verification, we need to find users with pending verification requests
      const pendingUsers = await VerificationRequest.find({
        status: "pending",
      }).distinct("user");

      filter._id = { $in: pendingUsers };
      filter.isVerified = false; // They should also be unverified
    }
  } else {
    // Legacy filtering support
    if (req.query.verified === "true") {
      filter.isVerified = true;
    } else if (req.query.verified === "false") {
      filter.isVerified = false;
    }
  }

  if (req.query.search) {
    filter.$or = [
      { fullName: { $regex: req.query.search, $options: "i" } },
      { email: { $regex: req.query.search, $options: "i" } },
      { lichessUsername: { $regex: req.query.search, $options: "i" } },
    ];
  }

  // Sorting
  const sort = {};
  if (req.query.sortBy) {
    const parts = req.query.sortBy.split(":");
    sort[parts[0]] = parts[1] === "desc" ? -1 : 1;
  } else {
    sort.createdAt = -1; // Default to newest first
  }

  // Execute query
  const total = await User.countDocuments(filter);

  // Get all users matching the filter
  const players = await User.find(filter)
    .sort(sort)
    .skip(startIndex)
    .limit(limit)
    .select(
      "fullName email phoneNumber lichessUsername isVerified profilePic walletBalance createdAt"
    );

  // Get verification status for each player
  const enhancedPlayers = await Promise.all(
    players.map(async (player) => {
      const playerObj = player.toObject();

      // Count tournaments
      playerObj.registeredTournamentsCount = await Registration.countDocuments({
        user: player._id,
      });
      playerObj.createdTournamentsCount = await Tournament.countDocuments({
        organizer: player._id,
      });

      // Check for pending verification
      const pendingVerification = await VerificationRequest.findOne({
        user: player._id,
        status: "pending",
      });

      if (pendingVerification) {
        playerObj.status = "pending";
      } else if (player.isVerified) {
        playerObj.status = "verified";
      } else {
        playerObj.status = "unverified";
      }

      return playerObj;
    })
  );

  // Pagination result
  const pagination = {};
  if (endIndex < total) {
    pagination.next = {
      page: page + 1,
      limit,
    };
  }

  if (startIndex > 0) {
    pagination.prev = {
      page: page - 1,
      limit,
    };
  }

  // Get counts for reporting
  const verifiedCount = await User.countDocuments({
    role: "user",
    isVerified: true,
  });
  const unverifiedCount = await User.countDocuments({
    role: "user",
    isVerified: false,
  });
  const pendingVerifications = await VerificationRequest.countDocuments({
    status: "pending",
  });
  const approvedVerifications = await VerificationRequest.countDocuments({
    status: "approved",
  });
  const rejectedVerifications = await VerificationRequest.countDocuments({
    status: "rejected",
  });

  res.status(200).json({
    success: true,
    count: enhancedPlayers.length,
    pagination,
    data: enhancedPlayers,
    total,
    counts: {
      verified: verifiedCount,
      unverified: unverifiedCount,
      pending: pendingVerifications,
      approved: approvedVerifications,
      rejected: rejectedVerifications,
      total: verifiedCount + unverifiedCount,
    },
  });
});

// Get player details
exports.getPlayerDetails = asyncHandler(async (req, res) => {
  const player = await User.findById(req.params.userId)
    .select("-password")
    .populate({
      path: "registeredTournaments",
      select: "title category startDate status",
    });

  if (!player) {
    return res.status(404).json({
      success: false,
      message: "Player not found",
    });
  }

  // Get player's transactions
  const transactions = await Transaction.find({ user: player._id })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate("tournament", "title");

  // Get verification status if applicable
  let verificationStatus = null;
  if (VerificationRequest) {
    const verification = await VerificationRequest.findOne({
      user: player._id,
    }).sort({ createdAt: -1 });

    if (verification) {
      verificationStatus = {
        status: verification.status,
        submittedAt: verification.createdAt,
        updatedAt: verification.updatedAt,
      };
    }
  }

  res.status(200).json({
    success: true,
    data: {
      player,
      transactions,
      verificationStatus,
    },
  });
});

/**
 * @desc    Get all verification requests with pagination
 * @route   GET /api/admin/verifications
 * @access  Admin only
 */
exports.getAllVerifications = asyncHandler(async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    // Allow 'all' as a valid status query parameter
    const requestedStatus = req.query.status || "pending"; // Default to pending
    const search = req.query.search || "";

    // Build query - handle 'all' status specially
    const query = requestedStatus !== "all" ? { status: requestedStatus } : {};

    // Add search functionality
    if (search) {
      // We need to join with User model to search by username or email
      const users = await User.find({
        $or: [
          { fullName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { lichessUsername: { $regex: search, $options: "i" } },
        ],
      }).select("_id");

      const userIds = users.map((user) => user._id);
      query.user = { $in: userIds };
    }

    // Count total documents for pagination
    const totalDocs = await VerificationRequest.countDocuments(query);

    // Get the verification requests along with user data
    let verifications = await VerificationRequest.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("user", "fullName email lichessUsername profilePic isVerified")
      .lean();

    // Get counts for each status
    const pendingCount = await VerificationRequest.countDocuments({
      status: "pending",
    });
    const approvedCount = await VerificationRequest.countDocuments({
      status: "approved",
    });
    const rejectedCount = await VerificationRequest.countDocuments({
      status: "rejected",
    });
    const totalCount = pendingCount + approvedCount + rejectedCount;

    // Also get verified and unverified user counts
    const verifiedCount = await User.countDocuments({
      isVerified: true,
      role: "user",
    });
    const unverifiedCount = await User.countDocuments({
      isVerified: false,
      role: "user",
    });

    // Get users with pending verification status for reporting
    const pendingUserIds = await VerificationRequest.find({
      status: "pending",
    }).distinct("user");
    const pendingUsersCount = pendingUserIds.length;

    res.status(200).json({
      success: true,
      pagination: {
        total: totalDocs,
        page,
        limit,
        pages: Math.ceil(totalDocs / limit),
      },
      counts: {
        verified: verifiedCount,
        unverified: unverifiedCount - pendingUsersCount, // Remove pending from unverified
        pending: pendingCount,
        pendingUsers: pendingUsersCount, // Add count of unique users with pending status
        approved: approvedCount,
        rejected: rejectedCount,
        total: totalCount,
        registered: verifiedCount + unverifiedCount, // Total number of users
      },
      data: verifications,
    });
  } catch (error) {
    console.error("Error fetching verification requests:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching verification requests",
      error: error.message,
    });
  }
});

/**
 * @desc    Approve a verification request
 * @route   PUT /api/admin/verifications/:requestId/approve
 * @access  Admin only
 */
exports.approveVerification = asyncHandler(async (req, res) => {
  try {
    const requestId = req.params.requestId;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request ID",
      });
    }

    const verificationRequest = await VerificationRequest.findById(requestId);

    if (!verificationRequest) {
      return res.status(404).json({
        success: false,
        message: "Verification request not found",
      });
    }

    // Update verification request status using findByIdAndUpdate to avoid validation issues
    const updatedRequest = await VerificationRequest.findByIdAndUpdate(
      requestId,
      { status: "approved", updatedAt: Date.now() },
      { new: true }
    );

    // Update user's verification status
    const user = await User.findById(verificationRequest.user);
    if (user) {
      user.isVerified = true;
      await user.save();

      // Here you would typically send a notification
      // Placeholder for notification logic
      console.log(`User ${user._id} has been verified!`);
    }

    res.status(200).json({
      success: true,
      message: "Verification request approved successfully",
      data: updatedRequest,
    });
  } catch (error) {
    console.error("Error approving verification:", error);
    res.status(500).json({
      success: false,
      message: "Error approving verification request",
      error: error.message,
    });
  }
});

/**
 * @desc    Reject a verification request
 * @route   PUT /api/admin/verifications/:requestId/reject
 * @access  Admin only
 */
exports.rejectVerification = asyncHandler(async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    const requestId = req.params.requestId;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request ID",
      });
    }

    if (!rejectionReason) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required",
      });
    }

    const verificationRequest = await VerificationRequest.findById(requestId);

    if (!verificationRequest) {
      return res.status(404).json({
        success: false,
        message: "Verification request not found",
      });
    }

    // Update verification request using findByIdAndUpdate to avoid validation issues
    const updatedRequest = await VerificationRequest.findByIdAndUpdate(
      requestId,
      {
        status: "rejected",
        rejectionReason: rejectionReason,
        updatedAt: Date.now(),
      },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "Verification request rejected successfully",
      data: updatedRequest,
    });
  } catch (error) {
    console.error("Error rejecting verification:", error);
    res.status(500).json({
      success: false,
      message: "Error rejecting verification request",
      error: error.message,
    });
  }
});

/**
 * @desc    Download verification documents
 * @route   GET /api/admin/verifications/:requestId/download
 * @access  Admin only
 */
exports.downloadVerificationData = asyncHandler(async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const format = req.query.format?.toLowerCase() || "pdf"; // Default to PDF if format not specified

    if (!["pdf", "csv"].includes(format)) {
      return res.status(400).json({
        success: false,
        message: "Invalid format. Supported formats: pdf, csv",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request ID",
      });
    }

    const verificationRequest = await VerificationRequest.findById(requestId)
      .populate("user", "fullName email lichessUsername")
      .lean();

    if (!verificationRequest) {
      return res.status(404).json({
        success: false,
        message: "Verification request not found",
      });
    }

    // Handle PDF format
    if (format === "pdf") {
      // Create PDF document using PDFKit
      const PDFDocument = require("pdfkit");
      const doc = new PDFDocument();

      // Set response headers for PDF download
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=verification_${requestId}.pdf`
      );

      // Pipe the PDF document to the response
      doc.pipe(res);

      // Add content to the PDF
      doc
        .fontSize(20)
        .text("Verification Request Details", { align: "center" });
      doc.moveDown();

      // Add a horizontal line
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown();

      // User information section
      doc.fontSize(16).text("User Information");
      doc.moveDown(0.5);
      doc
        .fontSize(12)
        .text(
          `Full Name: ${
            verificationRequest.fullName ||
            verificationRequest.user.fullName ||
            "N/A"
          }`
        );
      doc.moveDown(0.5);
      doc
        .fontSize(12)
        .text(`Email: ${verificationRequest.user.email || "N/A"}`);
      doc.moveDown(0.5);
      doc
        .fontSize(12)
        .text(
          `Lichess Username: ${
            verificationRequest.user.lichessUsername || "N/A"
          }`
        );
      doc.moveDown(0.5);
      doc.fontSize(12).text(`Address: ${verificationRequest.address || "N/A"}`);
      doc.moveDown();

      // Request information section
      doc.fontSize(16).text("Verification Details");
      doc.moveDown(0.5);
      doc.fontSize(12).text(`Status: ${verificationRequest.status || "N/A"}`);
      doc.moveDown(0.5);
      doc
        .fontSize(12)
        .text(
          `Created At: ${
            new Date(verificationRequest.createdAt).toLocaleString() || "N/A"
          }`
        );
      doc.moveDown(0.5);
      doc
        .fontSize(12)
        .text(
          `Updated At: ${
            new Date(verificationRequest.updatedAt).toLocaleString() || "N/A"
          }`
        );
      doc.moveDown();

      // ID information section
      doc.fontSize(16).text("ID Information");
      doc.moveDown(0.5);

      // Only include these fields if they exist in the data
      if (verificationRequest.idType) {
        doc.fontSize(12).text(`ID Type: ${verificationRequest.idType}`);
        doc.moveDown(0.5);
      }

      if (verificationRequest.idNumber) {
        doc.fontSize(12).text(`ID Number: ${verificationRequest.idNumber}`);
        doc.moveDown(0.5);
      }

      // Image references section
      doc.fontSize(16).text("Document References");
      doc.moveDown(0.5);
      doc
        .fontSize(12)
        .text(`ID Card Image URL: ${verificationRequest.idCardImage || "N/A"}`);
      doc.moveDown(0.5);
      doc
        .fontSize(12)
        .text(`Selfie Image URL: ${verificationRequest.selfieImage || "N/A"}`);

      // If there's a rejection reason, add it
      if (verificationRequest.rejectionReason) {
        doc.moveDown();
        doc.fontSize(16).text("Rejection Information");
        doc.moveDown(0.5);
        doc.fontSize(12).text(`Reason: ${verificationRequest.rejectionReason}`);
      }

      // Request ID for reference
      doc.moveDown();
      doc
        .fontSize(10)
        .text(`Request ID: ${verificationRequest._id}`, { align: "right" });

      // Finalize the PDF
      doc.end();
    }
    // Handle CSV format
    else if (format === "csv") {
      // Create data object for CSV
      const csvData = {
        "Request ID": verificationRequest._id,
        "Full Name":
          verificationRequest.fullName ||
          verificationRequest.user.fullName ||
          "N/A",
        Email: verificationRequest.user.email || "N/A",
        "Lichess Username": verificationRequest.user.lichessUsername || "N/A",
        Address: verificationRequest.address || "N/A",
        Status: verificationRequest.status || "N/A",
        "Created At":
          new Date(verificationRequest.createdAt).toLocaleString() || "N/A",
        "Updated At":
          new Date(verificationRequest.updatedAt).toLocaleString() || "N/A",
        "ID Card Image URL": verificationRequest.idCardImage || "N/A",
        "Selfie Image URL": verificationRequest.selfieImage || "N/A",
      };

      // Add conditional fields
      if (verificationRequest.idType) {
        csvData["ID Type"] = verificationRequest.idType;
      }

      if (verificationRequest.idNumber) {
        csvData["ID Number"] = verificationRequest.idNumber;
      }

      if (verificationRequest.rejectionReason) {
        csvData["Rejection Reason"] = verificationRequest.rejectionReason;
      }

      // Create CSV content
      const createCsvStringifier =
        require("csv-writer").createObjectCsvStringifier;
      const csvStringifier = createCsvStringifier({
        header: Object.keys(csvData).map((key) => ({ id: key, title: key })),
      });

      const header = csvStringifier.getHeaderString();
      const records = csvStringifier.stringifyRecords([csvData]);
      const csvContent = header + records;

      // Set headers for CSV download
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=verification_${requestId}.csv`
      );

      // Send the CSV content
      res.send(csvContent);
    }
  } catch (error) {
    console.error("Error downloading verification data:", error);
    res.status(500).json({
      success: false,
      message: "Error downloading verification data",
      error: error.message,
    });
  }
});

/**
 * @desc    Get a single verification request details
 * @route   GET /api/admin/verifications/:requestId
 * @access  Admin only
 */
exports.getVerificationDetails = asyncHandler(async (req, res) => {
  try {
    const requestId = req.params.requestId;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request ID",
      });
    }

    const verificationRequest = await VerificationRequest.findById(requestId)
      .populate("user", "fullName email lichessUsername profilePic")
      .lean();

    if (!verificationRequest) {
      return res.status(404).json({
        success: false,
        message: "Verification request not found",
      });
    }

    res.status(200).json({
      success: true,
      data: verificationRequest,
    });
  } catch (error) {
    console.error("Error getting verification details:", error);
    res.status(500).json({
      success: false,
      message: "Error getting verification details",
      error: error.message,
    });
  }
});

/**
 * @desc    Get all tournaments with pagination
 * @route   GET /api/admin/tournaments
 * @access  Admin only
 */
exports.getAllTournaments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const status = req.query.status || "all"; // 'all', 'upcoming', 'active', 'completed', 'cancelled'
    const search = req.query.search || "";

    // Build query
    const query = {};

    if (status !== "all") {
      query.status = status;
    }

    // Add search functionality
    if (search) {
      query.title = { $regex: search, $options: "i" };
    }

    // Count total documents for pagination
    const totalDocs = await Tournament.countDocuments(query);

    // Get tournaments with pagination
    const tournaments = await Tournament.find(query)
      .populate("organizer", "fullName email lichessUsername")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get counts for each status
    const upcomingCount = await Tournament.countDocuments({
      status: "upcoming",
    });
    const activeCount = await Tournament.countDocuments({ status: "active" });
    const completedCount = await Tournament.countDocuments({
      status: "completed",
    });
    const cancelledCount = await Tournament.countDocuments({
      status: "cancelled",
    });

    res.status(200).json({
      success: true,
      pagination: {
        total: totalDocs,
        page,
        limit,
        pages: Math.ceil(totalDocs / limit),
      },
      counts: {
        upcoming: upcomingCount,
        active: activeCount,
        completed: completedCount,
        cancelled: cancelledCount,
        total: totalDocs,
      },
      data: tournaments,
    });
  } catch (error) {
    console.error("Error fetching tournaments:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching tournaments",
      error: error.message,
    });
  }
};

/**
 * @desc    Get tournament details by ID
 * @route   GET /api/admin/tournaments/:tournamentId
 * @access  Admin only
 */
exports.getTournamentById = async (req, res) => {
  try {
    const tournamentId = req.params.tournamentId;

    if (!mongoose.Types.ObjectId.isValid(tournamentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tournament ID",
      });
    }

    const tournament = await Tournament.findById(tournamentId)
      .populate("organizer", "fullName email lichessUsername profilePic")
      .populate("participants", "fullName lichessUsername profilePic");

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    // Get related transactions
    const transactions = await Transaction.find({
      tournament: tournamentId,
    })
      .populate("user", "fullName email lichessUsername")
      .lean();

    // Calculate category counts for all tournaments
    const categoryStats = await Tournament.aggregate([
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    // Format category stats into an object for easier access
    const categoryCounts = {};
    categoryStats.forEach((stat) => {
      categoryCounts[stat._id] = stat.count;
    });

    // Get current tournament's category count
    const currentCategoryCount = categoryCounts[tournament.category] || 0;

    // Calculate additional tournament details
    const tournamentDetails = {
      participantCount: tournament.participants.length,
      maxParticipants: tournament.maxParticipants || null,
      registrationDeadline: tournament.registrationDeadline || null,
      isRegistrationOpen:
        tournament.status === "upcoming" &&
        (!tournament.registrationDeadline ||
          new Date() < new Date(tournament.registrationDeadline)),
      timeUntilStart:
        tournament.startDate > new Date()
          ? Math.ceil(
              (new Date(tournament.startDate) - new Date()) /
                (1000 * 60 * 60 * 24)
            )
          : 0,
      durationInHours: tournament.duration / (1000 * 60 * 60),
      totalPrizePool: calculateTotalPrizePool(
        tournament.prizes,
        tournament.prizeType
      ),
      hasPassword: !!tournament.password,
      entriesReceived: transactions.filter((t) => t.type === "entry_fee")
        .length,
      totalFunding: transactions
        .filter(
          (t) => t.type === "tournament_funding" && t.status === "completed"
        )
        .reduce((sum, t) => sum + t.amount, 0),
      // Add category information directly to tournament details
      category: tournament.category,
      categoryCount: currentCategoryCount,
    };

    res.status(200).json({
      success: true,
      data: {
        tournament,
        transactions,
        // Enhanced category statistics
        categoryStats: {
          allCategories: categoryCounts,
          currentCategory: tournament.category,
          currentCategoryCount: currentCategoryCount,
          totalTournaments: Object.values(categoryCounts).reduce(
            (sum, count) => sum + count,
            0
          ),
          categoryBreakdown: categoryStats.map((stat) => ({
            category: stat._id,
            count: stat.count,
          })),
        },
        details: tournamentDetails,
        // Also include category info at root level for easy access
        category: tournament.category,
        count: currentCategoryCount,
      },
    });
  } catch (error) {
    console.error("Error fetching tournament details:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching tournament details",
      error: error.message,
    });
  }
};

// Helper function to calculate total prize pool
function calculateTotalPrizePool(prizes, prizeType) {
  let totalPrizePool = 0;

  try {
    if (prizeType === "fixed" && prizes.fixed) {
      // Sum the ordered amounts array (index 0 => 1st, index 1 => 2nd, ...)
      const amounts = Array.isArray(prizes.fixed.amounts)
        ? prizes.fixed.amounts
        : [];
      const amountsSum = amounts.reduce((s, v) => s + (parseFloat(v) || 0), 0);

      // Add additional prizes if any
      const additionalSum =
        prizes.fixed.additional && prizes.fixed.additional.length
          ? prizes.fixed.additional.reduce(
              (sum, prize) => sum + (prize.amount || 0),
              0
            )
          : 0;

      totalPrizePool = amountsSum + additionalSum;
    } else if (prizeType === "percentage" && prizes.percentage) {
      // For percentage, we use the base prize pool
      totalPrizePool = prizes.percentage.basePrizePool || 0;
    } else if (prizeType === "special" && prizes.special) {
      if (prizes.special.isFixed) {
        // Calculate total from special prizes
        totalPrizePool = prizes.special.specialPrizes.reduce(
          (sum, prize) => sum + (prize.amount || 0),
          0
        );
      } else {
        // For percentage-based special prizes, use the base prize pool
        totalPrizePool = prizes.special.basePrizePool || 0;
      }
    }
  } catch (error) {
    console.error("Error calculating prize pool:", error);
    totalPrizePool = 0;
  }

  return totalPrizePool;
}

/**
 * @desc    Delete tournament and refund participants
 * @route   DELETE /api/admin/tournaments/:tournamentId
 * @access  Admin only
 */
exports.deleteTournament = async (req, res) => {
  try {
    const tournamentId = req.params.tournamentId;

    if (!mongoose.Types.ObjectId.isValid(tournamentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tournament ID",
      });
    }

    const tournament = await Tournament.findById(tournamentId);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    // Remove tournament from organizer's created tournaments
    await User.findByIdAndUpdate(tournament.organizer, {
      $pull: { createdTournaments: tournamentId },
    });

    // Delete tournament
    await Tournament.findByIdAndDelete(tournamentId);

    res.status(200).json({
      success: true,
      message: "Tournament deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting tournament:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting tournament",
      error: error.message,
    });
  }
};

/**
 * @desc    Update tournament status
 * @route   PUT /api/admin/tournaments/:tournamentId/status
 * @access  Admin only
 */
exports.updateTournamentStatus = async (req, res) => {
  try {
    const tournamentId = req.params.tournamentId;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(tournamentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tournament ID",
      });
    }

    if (
      !status ||
      !["upcoming", "active", "completed", "cancelled"].includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid status. Must be one of: upcoming, active, completed, cancelled",
      });
    }

    const tournament = await Tournament.findById(tournamentId);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    // Handle special case for cancelled status
    if (status === "cancelled" && tournament.status !== "cancelled") {
      // Refund logic removed: No refunds will be issued when a tournament is cancelled
      // (Previously, this would refund entry fees to all participants)
    }

    // Update tournament status
    tournament.status = status;
    await tournament.save();

    res.status(200).json({
      success: true,
      message: `Tournament status updated to ${status}`,
      data: {
        tournamentId: tournament._id,
        title: tournament.title,
        status: tournament.status,
      },
    });
  } catch (error) {
    console.error("Error updating tournament status:", error);
    res.status(500).json({
      success: false,
      message: "Error updating tournament status",
      error: error.message,
    });
  }
};

/**
 * @desc    Download tournament data
 * @route   GET /api/admin/tournaments/download
 * @access  Admin only
 */
exports.downloadTournaments = async (req, res) => {
  try {
    const format = req.query.format?.toLowerCase() || "pdf"; // Default to PDF if format not specified
    const status = req.query.status || "all";
    const startDate = req.query.startDate
      ? new Date(req.query.startDate)
      : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

    if (!["pdf", "csv"].includes(format)) {
      return res.status(400).json({
        success: false,
        message: "Invalid format. Supported formats: pdf, csv",
      });
    }

    // Build query
    const query = {};

    if (status !== "all") {
      query.status = status;
    }

    // Add date range if provided
    if (startDate && endDate) {
      query.startDate = {
        $gte: startDate,
        $lte: endDate,
      };
    } else if (startDate) {
      query.startDate = { $gte: startDate };
    } else if (endDate) {
      query.startDate = { $lte: endDate };
    }

    // Get tournament data
    const tournaments = await Tournament.find(query)
      .populate("organizer", "fullName email lichessUsername")
      .sort({ startDate: -1 })
      .lean();

    // Format data for export
    const formattedTournaments = tournaments.map((t) => ({
      title: t.title || "N/A",
      category: t.category || "N/A",
      organizerName: t.organizer ? t.organizer.fullName : "N/A",
      organizerEmail: t.organizer ? t.organizer.email : "N/A",
      organizerLichess: t.organizer ? t.organizer.lichessUsername : "N/A",
      startDate: t.startDate
        ? new Date(t.startDate).toLocaleDateString()
        : "N/A",
      startTime: t.startTime || "N/A",
      duration: t.duration || "N/A",
      status: t.status || "N/A",
      entryFee: t.entryFee || 0,
      participantsCount: t.participants ? t.participants.length : 0,
      prizeType: t.prizeType || "N/A",
      tournamentLink: t.tournamentLink || "N/A",
      createdAt: t.createdAt
        ? new Date(t.createdAt).toLocaleDateString()
        : "N/A",
    }));

    // Set filename based on filters
    let filename = `tournaments_${status}`;
    if (startDate) filename += `_from_${startDate.toISOString().split("T")[0]}`;
    if (endDate) filename += `_to_${endDate.toISOString().split("T")[0]}`;

    // Handle PDF format
    if (format === "pdf") {
      try {
        // Try to require PDFKit
        const PDFDocument = require("pdfkit");
        const doc = new PDFDocument({ margin: 50 });

        // Set response headers for PDF download
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=${filename}.pdf`
        );

        // Pipe the PDF document to the response
        doc.pipe(res);

        // Add content to the PDF
        doc.fontSize(20).text("Tournaments Report", { align: "center" });
        doc.moveDown();

        // Add filters information
        doc.fontSize(12).text(`Status: ${status}`);
        if (startDate)
          doc.text(`Start Date: ${startDate.toLocaleDateString()}`);
        if (endDate) doc.text(`End Date: ${endDate.toLocaleDateString()}`);
        doc.text(`Total Records: ${formattedTournaments.length}`);
        doc.moveDown();

        // Add a horizontal line
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

        // If no tournaments found
        if (formattedTournaments.length === 0) {
          doc
            .fontSize(14)
            .text("No tournaments found matching the criteria.", {
              align: "center",
            });
        } else {
          // For each tournament, add a section
          formattedTournaments.forEach((tournament, index) => {
            doc.fontSize(16).text(`${index + 1}. ${tournament.title}`);
            doc.moveDown(0.5);
            doc.fontSize(12).text(`Category: ${tournament.category}`);
            doc
              .fontSize(12)
              .text(
                `Organizer: ${tournament.organizerName} (${tournament.organizerEmail})`
              );
            doc
              .fontSize(12)
              .text(`Lichess Username: ${tournament.organizerLichess}`);
            doc.fontSize(12).text(`Start Date: ${tournament.startDate}`);
            doc.fontSize(12).text(`Start Time: ${tournament.startTime}`);
            doc.fontSize(12).text(`Duration: ${tournament.duration}`);
            doc.fontSize(12).text(`Status: ${tournament.status}`);
            doc.fontSize(12).text(`Entry Fee: ${tournament.entryFee}`);
            doc
              .fontSize(12)
              .text(`Participants Count: ${tournament.participantsCount}`);
            doc.fontSize(12).text(`Prize Type: ${tournament.prizeType}`);
            doc
              .fontSize(12)
              .text(`Tournament Link: ${tournament.tournamentLink}`);
            doc.fontSize(12).text(`Created At: ${tournament.createdAt}`);

            // Add space between tournaments
            if (index < formattedTournaments.length - 1) {
              doc.moveDown();
              doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
              doc.moveDown();
            }
          });
        }

        // Finalize the PDF
        doc.end();
      } catch (error) {
        if (error.code === "MODULE_NOT_FOUND") {
          return res.status(500).json({
            success: false,
            message: "PDF generation module not installed",
            error: "Please run: npm install pdfkit",
          });
        }
        throw error; // Re-throw if it's a different error
      }
    }
    // Handle CSV format
    else if (format === "csv") {
      try {
        // Try to require csv-writer
        const createCsvStringifier =
          require("csv-writer").createObjectCsvStringifier;

        // Define headers for CSV
        const headers = [
          { id: "title", title: "Title" },
          { id: "category", title: "Category" },
          { id: "organizerName", title: "Organizer Name" },
          { id: "organizerEmail", title: "Organizer Email" },
          { id: "organizerLichess", title: "Lichess Username" },
          { id: "startDate", title: "Start Date" },
          { id: "startTime", title: "Start Time" },
          { id: "duration", title: "Duration" },
          { id: "status", title: "Status" },
          { id: "entryFee", title: "Entry Fee" },
          { id: "participantsCount", title: "Participants Count" },
          { id: "prizeType", title: "Prize Type" },
          { id: "tournamentLink", title: "Tournament Link" },
          { id: "createdAt", title: "Created At" },
        ];

        const csvStringifier = createCsvStringifier({
          header: headers,
        });

        const headerString = csvStringifier.getHeaderString();
        const recordsString =
          csvStringifier.stringifyRecords(formattedTournaments);
        const csvContent = headerString + recordsString;

        // Set headers for CSV download
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=${filename}.csv`
        );

        // Send the CSV content
        res.send(csvContent);
      } catch (error) {
        if (error.code === "MODULE_NOT_FOUND") {
          return res.status(500).json({
            success: false,
            message: "CSV generation module not installed",
            error: "Please run: npm install csv-writer",
          });
        }
        throw error; // Re-throw if it's a different error
      }
    }
  } catch (error) {
    console.error("Error downloading tournament data:", error);
    res.status(500).json({
      success: false,
      message: "Error downloading tournament data",
      error: error.message,
    });
  }
};

/**
 * @desc    Update admin profile
 * @route   PUT /api/admin/profile
 * @access  Private/Admin
 */
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware
    const { fullName, email } = req.body;

    // Validation
    if (!fullName || !email) {
      return res.status(400).json({
        success: false,
        message: "Please provide both fullName and email",
      });
    }

    // Check if email already exists (except for the current user)
    if (email) {
      const existingUser = await User.findOne({ email, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Email already in use",
        });
      }
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { fullName, email },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({
      success: false,
      message: "Error updating profile",
      error: error.message,
    });
  }
};

/**
 * @desc    Update admin profile picture
 * @route   PUT /api/admin/profile/picture
 * @access  Private/Admin
 */
exports.updateProfilePicture = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware
    const { profilePic } = req.body;

    if (!profilePic) {
      return res.status(400).json({
        success: false,
        message: "Profile picture URL is required",
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profilePic },
      { new: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Profile picture updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error updating profile picture:", error);
    res.status(500).json({
      success: false,
      message: "Error updating profile picture",
      error: error.message,
    });
  }
};

/**
 * @desc    Change admin password
 * @route   PUT /api/admin/profile/password
 * @access  Private/Admin
 */
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware
    const { currentPassword, newPassword } = req.body;

    // Validation
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Please provide both current and new password",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long",
      });
    }

    // Get user with password
    const user = await User.findById(userId).select("+password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if current password matches
    const isMatch = await user.matchPassword(currentPassword);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({
      success: false,
      message: "Error changing password",
      error: error.message,
    });
  }
};

/**
 * @desc    Get advanced analytics
 * @route   GET /api/admin/analytics
 * @access  Private/Admin
 */
exports.getAnalytics = async (req, res) => {
  try {
    const timeframe = req.query.timeframe || "month"; // 'week', 'month', 'year', 'all'

    // Calculate date range based on timeframe
    const endDate = new Date();
    let startDate = new Date();

    if (timeframe === "week") {
      startDate.setDate(endDate.getDate() - 7);
    } else if (timeframe === "month") {
      startDate.setMonth(endDate.getMonth() - 1);
    } else if (timeframe === "year") {
      startDate.setFullYear(endDate.getFullYear() - 1);
    } else if (timeframe === "all") {
      startDate = new Date(0); // Beginning of time
    }

    // User growth analytics
    const userGrowth = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    // Tournament analytics
    const tournamentAnalytics = await Tournament.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
          entryFeeTotal: { $sum: "$entryFee" },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    // Transaction analytics
    const transactionAnalytics = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            type: "$type",
          },
          count: { $sum: 1 },
          amount: { $sum: "$amount" },
        },
      },
      {
        $sort: { "_id.date": 1 },
      },
    ]);

    // Category distribution of tournaments
    const categoryDistribution = await Tournament.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
    ]);

    // User verification rate
    const totalUsers = await User.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate },
    });

    const verifiedUsers = await User.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate },
      isVerified: true,
    });

    const verificationRate =
      totalUsers > 0 ? (verifiedUsers / totalUsers) * 100 : 0;

    res.status(200).json({
      success: true,
      data: {
        userGrowth,
        tournamentAnalytics,
        transactionAnalytics,
        categoryDistribution,
        verificationStats: {
          total: totalUsers,
          verified: verifiedUsers,
          rate: verificationRate.toFixed(2),
        },
        timeframe,
      },
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching analytics",
      error: error.message,
    });
  }
};

/**
 * @desc    Get recent activity feed
 * @route   GET /api/admin/activity
 * @access  Private/Admin
 */
exports.getActivityFeed = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    // Get recent transactions
    const transactions = await Transaction.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("user", "fullName email lichessUsername")
      .populate("tournament", "title")
      .lean();

    // Get recent tournament creations
    const tournaments = await Tournament.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("organizer", "fullName email lichessUsername")
      .lean()
      .then((tournaments) =>
        tournaments.map((t) => ({
          ...t,
          activityType: "tournament_created",
          createdAt: t.createdAt,
        }))
      );

    // Get recent user registrations
    const users = await User.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("fullName email lichessUsername createdAt")
      .lean()
      .then((users) =>
        users.map((u) => ({
          ...u,
          activityType: "user_registered",
          createdAt: u.createdAt,
        }))
      );

    // Get recent verification requests
    const verifications = await VerificationRequest.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("user", "fullName email lichessUsername")
      .lean()
      .then((verifications) =>
        verifications.map((v) => ({
          ...v,
          activityType: "verification_request",
          createdAt: v.createdAt,
        }))
      );

    // Combine all activities and sort by date
    const allActivities = [
      ...transactions.map((t) => ({
        ...t,
        activityType: `transaction_${t.type}`,
        timestamp: t.createdAt,
      })),
      ...tournaments.map((t) => ({
        ...t,
        activityType: "tournament_created",
        timestamp: t.createdAt,
      })),
      ...users.map((u) => ({
        ...u,
        activityType: "user_registered",
        timestamp: u.createdAt,
      })),
      ...verifications.map((v) => ({
        ...v,
        activityType: `verification_${v.status}`,
        timestamp: v.createdAt,
      })),
    ];

    // Sort by timestamp descending and limit results
    const sortedActivities = allActivities
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

    res.status(200).json({
      success: true,
      data: sortedActivities,
    });
  } catch (error) {
    console.error("Error fetching activity feed:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching activity feed",
      error: error.message,
    });
  }
};

/**
 * @desc    Generate monthly report
 * @route   GET /api/admin/reports/monthly
 * @access  Private/Admin
 */
exports.getMonthlyReport = async (req, res) => {
  try {
    const month = parseInt(req.query.month) || new Date().getMonth() + 1; // 1-12
    const year = parseInt(req.query.year) || new Date().getFullYear();

    // Create date range for the requested month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59); // Last day of month

    // User statistics
    const newUsers = await User.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate },
    });

    const verifiedUsers = await User.countDocuments({
      isVerified: true,
      createdAt: { $gte: startDate, $lte: endDate },
    });

    // Tournament statistics
    const newTournaments = await Tournament.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate },
    });

    const completedTournaments = await Tournament.countDocuments({
      status: "completed",
      startDate: { $gte: startDate, $lte: endDate },
    });

    // Transaction statistics
    const transactionStats = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    // Format transaction stats
    const formattedTransactions = {};
    let totalRevenue = 0;

    transactionStats.forEach((stat) => {
      formattedTransactions[stat._id] = {
        count: stat.count,
        totalAmount: stat.totalAmount,
      };

      // Calculate revenue
      if (
        ["deposit", "tournament_entry", "tournament_funding"].includes(stat._id)
      ) {
        totalRevenue += stat.totalAmount;
      }

      if (["withdrawal", "prize_payout", "refund"].includes(stat._id)) {
        totalRevenue -= stat.totalAmount;
      }
    });

    // Category-wise tournament distribution
    const categoryDistribution = await Tournament.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
    ]);

    // Daily statistics for charts
    const dailyStats = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            type: "$type",
          },
          count: { $sum: 1 },
          amount: { $sum: "$amount" },
        },
      },
      {
        $sort: { "_id.date": 1 },
      },
    ]);

    res.status(200).json({
      success: true,
      data: {
        period: {
          month,
          year,
          startDate,
          endDate,
        },
        users: {
          new: newUsers,
          verified: verifiedUsers,
          verificationRate:
            newUsers > 0 ? ((verifiedUsers / newUsers) * 100).toFixed(2) : 0,
        },
        tournaments: {
          new: newTournaments,
          completed: completedTournaments,
          categoryDistribution,
        },
        transactions: formattedTransactions,
        financials: {
          totalRevenue,
          dailyStats,
        },
      },
    });
  } catch (error) {
    console.error("Error generating monthly report:", error);
    res.status(500).json({
      success: false,
      message: "Error generating monthly report",
      error: error.message,
    });
  }
};

/**
 * @desc    Get all players with stats and pagination
 * @route   GET /api/admin/players
 * @access  Private/Admin
 */
exports.getAllPlayers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const filter = req.query.filter || "all"; // 'all', 'verified', 'unverified', 'declined', 'registered', 'pending'
    const search = req.query.search || "";
    const sortBy = req.query.sortBy || "createdAt"; // field to sort by
    const sortOrder = req.query.sortOrder || "desc"; // 'asc' or 'desc'

    // Build match criteria
    const matchCriteria = { role: "user" };

    // Apply filter
    if (filter === "verified") {
      matchCriteria.isVerified = true;
    } else if (filter === "pending") {
      // For pending, get users who have pending verification requests
      const pendingUserIds = await VerificationRequest.find({
        status: "pending",
      }).distinct("user");
      matchCriteria._id = { $in: pendingUserIds };
    } else if (filter === "unverified") {
      matchCriteria.isVerified = false;
      // Exclude declined users and pending users
      const excludedUserIds = await VerificationRequest.find({
        status: { $in: ["rejected", "pending"] },
      }).distinct("user");
      if (excludedUserIds.length > 0) {
        matchCriteria._id = { $nin: excludedUserIds };
      }
    } else if (filter === "declined") {
      // For declined, get users who have rejected verification requests
      const declinedUserIds = await VerificationRequest.find({
        status: "rejected",
      }).distinct("user");
      matchCriteria._id = { $in: declinedUserIds };
    } else if (filter === "registered") {
      // For registered, find users who have registered for at least one tournament
      matchCriteria.registeredTournaments = { $exists: true, $ne: [] };
    }
    // For 'all', no additional criteria needed

    // Add search functionality
    if (search) {
      matchCriteria.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { lichessUsername: { $regex: search, $options: "i" } },
        { phoneNumber: { $regex: search, $options: "i" } },
      ];
    }

    // Build sort object
    const buildSortObject = (sortBy, sortOrder) => {
      const order = sortOrder === "asc" ? 1 : -1;

      // Define valid sort fields and their mappings
      const sortFields = {
        name: { fullName: order },
        fullName: { fullName: order },
        email: { email: order },
        createdAt: { createdAt: order },
        registeredTournaments: { registeredTournamentsCount: order },
        createdTournaments: { createdTournamentsCount: order },
        walletBalance: { walletBalance: order },
        lichessUsername: { lichessUsername: order },
        phoneNumber: { phoneNumber: order },
        verified: { isVerified: order },
      };

      // Return the sort object or default to createdAt descending
      return sortFields[sortBy] || { createdAt: -1 };
    };

    const sortObject = buildSortObject(sortBy, sortOrder);

    // Count total documents for pagination
    const totalDocs = await User.countDocuments(matchCriteria);

    // Get players with pagination and sorting
    const playersData = await User.aggregate([
      {
        $match: matchCriteria,
      },
      {
        $lookup: {
          from: "verificationrequests",
          localField: "_id",
          foreignField: "user",
          as: "verificationRequests",
        },
      },
      {
        $project: {
          fullName: 1,
          email: 1,
          profilePic: 1,
          lichessUsername: 1,
          isVerified: 1,
          createdAt: 1,
          registeredTournamentsCount: {
            $size: { $ifNull: ["$registeredTournaments", []] },
          },
          createdTournamentsCount: {
            $size: { $ifNull: ["$createdTournaments", []] },
          },
          walletBalance: 1,
          phoneNumber: 1,
          verificationRequests: 1,
        },
      },
      {
        $sort: sortObject,
      },
      {
        $skip: skip,
      },
      {
        $limit: limit,
      },
    ]);

    // Process players to add status field
    const players = playersData.map((player) => {
      let status = "unverified";

      if (player.isVerified) {
        status = "verified";
      } else {
        // Check for pending verification requests
        const hasPendingRequest =
          player.verificationRequests &&
          player.verificationRequests.some((req) => req.status === "pending");

        // Check for rejected verification requests
        const hasRejectedRequest =
          player.verificationRequests &&
          player.verificationRequests.some((req) => req.status === "rejected");

        if (hasPendingRequest) {
          status = "pending";
        } else if (hasRejectedRequest) {
          status = "declined";
        }
      }

      // Remove verificationRequests from response
      const { verificationRequests, ...playerData } = player;

      return {
        ...playerData,
        status,
      };
    });

    // Get counts for different filter types
    // Count of verified users
    const verifiedCount = await User.countDocuments({
      role: "user",
      isVerified: true,
    });

    // Count of users with pending verification requests
    const pendingUserIds = await VerificationRequest.find({
      status: "pending",
    }).distinct("user");
    const pendingCount = pendingUserIds.length;

    // Count of users with rejected verification requests (declined)
    const declinedUserIds = await VerificationRequest.find({
      status: "rejected",
    }).distinct("user");
    const declinedCount = declinedUserIds.length;

    // Count of unverified users (exclude declined and pending)
    const excludedUserIds = [...pendingUserIds, ...declinedUserIds];
    const unverifiedCount = await User.countDocuments({
      role: "user",
      isVerified: false,
      _id: { $nin: excludedUserIds },
    });

    // Count of registered users (in tournaments)
    const registeredCount = await User.countDocuments({
      role: "user",
      registeredTournaments: { $exists: true, $ne: [] },
    });

    // Total user count
    const totalCount = await User.countDocuments({ role: "user" });

    res.status(200).json({
      success: true,
      pagination: {
        total: totalDocs,
        page,
        limit,
        pages: Math.ceil(totalDocs / limit),
      },
      sorting: {
        sortBy,
        sortOrder,
        availableFields: [
          "name",
          "fullName",
          "email",
          "createdAt",
          "registeredTournaments",
          "createdTournaments",
          "walletBalance",
          "lichessUsername",
          "phoneNumber",
          "verified",
        ],
      },
      counts: {
        verified: verifiedCount,
        unverified: unverifiedCount,
        pending: pendingCount,
        declined: declinedCount,
        registered: registeredCount,
        total: totalCount,
      },
      data: players,
    });
  } catch (error) {
    console.error("Error fetching players:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching players",
      error: error.message,
    });
  }
};

/**
 * @desc    Get single player detailed stats
 * @route   GET /api/admin/players/:userId
 * @access  Private/Admin
 */
exports.getPlayerDetails = async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const user = await User.findById(userId).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get created tournaments with category aggregation
    const createdTournamentsAggregation = await Tournament.aggregate([
      { $match: { organizer: new mongoose.Types.ObjectId(userId) } },
      {
        $facet: {
          tournaments: [
            {
              $project: {
                title: 1,
                startDate: 1,
                status: 1,
                participants: 1,
                category: 1,
                participantCount: { $size: "$participants" },
              },
            },
            { $sort: { startDate: -1 } },
          ],
          categoryStats: [
            {
              $group: {
                _id: "$category",
                count: { $sum: 1 },
                totalParticipants: { $sum: { $size: "$participants" } },
              },
            },
          ],
        },
      },
    ]);

    // Get registered tournaments with category aggregation
    const registeredTournamentsAggregation = await Tournament.aggregate([
      { $match: { participants: new mongoose.Types.ObjectId(userId) } },
      {
        $facet: {
          tournaments: [
            {
              $project: {
                title: 1,
                startDate: 1,
                status: 1,
                category: 1,
                organizer: 1,
              },
            },
            { $sort: { startDate: -1 } },
          ],
          categoryStats: [
            {
              $group: {
                _id: "$category",
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]);

    // Extract results
    const createdTournaments =
      createdTournamentsAggregation[0]?.tournaments || [];
    const createdCategoryStats =
      createdTournamentsAggregation[0]?.categoryStats || [];

    const registeredTournaments =
      registeredTournamentsAggregation[0]?.tournaments || [];
    const registeredCategoryStats =
      registeredTournamentsAggregation[0]?.categoryStats || [];

    // Process category statistics for created tournaments
    const createdCategoryBreakdown = {
      bullet: 0,
      blitz: 0,
      rapid: 0,
      classical: 0,
    };

    const createdCategoryDetails = {
      bullet: { count: 0, totalParticipants: 0 },
      blitz: { count: 0, totalParticipants: 0 },
      rapid: { count: 0, totalParticipants: 0 },
      classical: { count: 0, totalParticipants: 0 },
    };

    createdCategoryStats.forEach((stat) => {
      if (createdCategoryBreakdown.hasOwnProperty(stat._id)) {
        createdCategoryBreakdown[stat._id] = stat.count;
        createdCategoryDetails[stat._id] = {
          count: stat.count,
          totalParticipants: stat.totalParticipants || 0,
        };
      }
    });

    // Process category statistics for registered tournaments
    const registeredCategoryBreakdown = {
      bullet: 0,
      blitz: 0,
      rapid: 0,
      classical: 0,
    };

    registeredCategoryStats.forEach((stat) => {
      if (registeredCategoryBreakdown.hasOwnProperty(stat._id)) {
        registeredCategoryBreakdown[stat._id] = stat.count;
      }
    });

    // Get transaction history
    const transactions = await Transaction.find({
      user: userId,
    })
      .sort({ createdAt: -1 })
      .lean();

    // Get verification status history
    const verificationHistory = await VerificationRequest.find({
      user: userId,
    })
      .sort({ updatedAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: {
        user: {
          _id: user._id,
          fullName: user.fullName,
          email: user.email,
          profilePic: user.profilePic,
          lichessUsername: user.lichessUsername,
          phoneNumber: user.phoneNumber,
          isVerified: user.isVerified,
          walletBalance: user.walletBalance,
          createdAt: user.createdAt,
          bankDetails: user.bankDetails || {},
        },
        stats: {
          createdTournaments: {
            tournaments: createdTournaments,
            total: createdTournaments.length,
            categoryBreakdown: createdCategoryBreakdown,
            categoryDetails: createdCategoryDetails,
          },
          registeredTournaments: {
            tournaments: registeredTournaments,
            total: registeredTournaments.length,
            categoryBreakdown: registeredCategoryBreakdown,
          },
          // Legacy fields for backward compatibility
          totalCreated: createdTournaments.length,
          totalRegistered: registeredTournaments.length,
        },
        categoryStats: {
          created: {
            summary: createdCategoryBreakdown,
            details: createdCategoryDetails,
            mostActive:
              Object.entries(createdCategoryBreakdown).sort(
                ([, a], [, b]) => b - a
              )[0]?.[0] || null,
          },
          registered: {
            summary: registeredCategoryBreakdown,
            mostPlayed:
              Object.entries(registeredCategoryBreakdown).sort(
                ([, a], [, b]) => b - a
              )[0]?.[0] || null,
          },
        },
        transactions: transactions,
        verificationHistory: verificationHistory,
      },
    });
  } catch (error) {
    console.error("Error fetching player details:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching player details",
      error: error.message,
    });
  }
};

/**
 * @desc    Download player data
 * @route   GET /api/admin/players/:userId/download
 * @access  Private/Admin
 */
exports.downloadPlayerData = async (req, res) => {
  try {
    const userId = req.params.userId;
    const format = req.query.format?.toLowerCase() || "pdf"; // Default to PDF if format not specified

    if (!["pdf", "csv"].includes(format)) {
      return res.status(400).json({
        success: false,
        message: "Invalid format. Supported formats: pdf, csv",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const user = await User.findById(userId).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get all user-related data
    const createdTournaments = await Tournament.find({
      organizer: userId,
    })
      .select("title startDate status participants category")
      .lean();

    const registeredTournaments = await Tournament.find({
      participants: userId,
    })
      .select("title startDate status category")
      .lean();

    const transactions = await Transaction.find({
      user: userId,
    })
      .sort({ createdAt: -1 })
      .lean();

    const verificationHistory = await VerificationRequest.find({
      user: userId,
    })
      .sort({ updatedAt: -1 })
      .lean();

    // Handle PDF format
    if (format === "pdf") {
      try {
        // Try to require PDFKit
        const PDFDocument = require("pdfkit");
        const doc = new PDFDocument({ margin: 50 });

        // Set response headers for PDF download
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=player_${userId}.pdf`
        );

        // Pipe the PDF document to the response
        doc.pipe(res);

        // Add content to the PDF
        doc.fontSize(20).text("Player Data Report", { align: "center" });
        doc.moveDown();

        // Add user information section
        doc.fontSize(16).text("Personal Information", { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(12).text(`Full Name: ${user.fullName || "N/A"}`);
        doc.fontSize(12).text(`Email: ${user.email || "N/A"}`);
        doc
          .fontSize(12)
          .text(`Lichess Username: ${user.lichessUsername || "N/A"}`);
        doc.fontSize(12).text(`Phone Number: ${user.phoneNumber || "N/A"}`);
        doc
          .fontSize(12)
          .text(
            `Verification Status: ${
              user.isVerified ? "Verified" : "Not Verified"
            }`
          );
        doc.fontSize(12).text(`Wallet Balance: ${user.walletBalance || 0}`);
        doc
          .fontSize(12)
          .text(
            `Account Created: ${
              new Date(user.createdAt).toLocaleDateString() || "N/A"
            }`
          );

        // Add bank details if available
        if (user.bankDetails && Object.keys(user.bankDetails).length > 0) {
          doc.moveDown();
          doc.fontSize(14).text("Bank Details");
          doc
            .fontSize(12)
            .text(`Bank Name: ${user.bankDetails.bankName || "N/A"}`);
          doc
            .fontSize(12)
            .text(`Account Number: ${user.bankDetails.accountNumber || "N/A"}`);
          doc
            .fontSize(12)
            .text(`Account Name: ${user.bankDetails.accountName || "N/A"}`);
        }

        // Add created tournaments section
        doc.moveDown();
        doc.fontSize(16).text("Created Tournaments", { underline: true });
        doc.moveDown(0.5);

        if (createdTournaments.length === 0) {
          doc.fontSize(12).text("No tournaments created by this user.");
        } else {
          createdTournaments.forEach((tournament, index) => {
            doc.fontSize(12).text(`${index + 1}. ${tournament.title || "N/A"}`);
            doc
              .fontSize(10)
              .text(`   Category: ${tournament.category || "N/A"}`);
            doc
              .fontSize(10)
              .text(
                `   Start Date: ${
                  tournament.startDate
                    ? new Date(tournament.startDate).toLocaleDateString()
                    : "N/A"
                }`
              );
            doc.fontSize(10).text(`   Status: ${tournament.status || "N/A"}`);
            doc
              .fontSize(10)
              .text(
                `   Participants: ${
                  tournament.participants ? tournament.participants.length : 0
                }`
              );
            doc.moveDown(0.5);
          });
        }

        // Add registered tournaments section
        doc.moveDown();
        doc.fontSize(16).text("Registered Tournaments", { underline: true });
        doc.moveDown(0.5);

        if (registeredTournaments.length === 0) {
          doc.fontSize(12).text("No tournaments registered by this user.");
        } else {
          registeredTournaments.forEach((tournament, index) => {
            doc.fontSize(12).text(`${index + 1}. ${tournament.title || "N/A"}`);
            doc
              .fontSize(10)
              .text(`   Category: ${tournament.category || "N/A"}`);
            doc
              .fontSize(10)
              .text(
                `   Start Date: ${
                  tournament.startDate
                    ? new Date(tournament.startDate).toLocaleDateString()
                    : "N/A"
                }`
              );
            doc.fontSize(10).text(`   Status: ${tournament.status || "N/A"}`);
            doc.moveDown(0.5);
          });
        }

        // Add transactions section
        doc.moveDown();
        doc.fontSize(16).text("Transaction History", { underline: true });
        doc.moveDown(0.5);

        if (transactions.length === 0) {
          doc.fontSize(12).text("No transaction history found for this user.");
        } else {
          transactions.forEach((transaction, index) => {
            doc
              .fontSize(12)
              .text(
                `${index + 1}. ${
                  transaction.type.charAt(0).toUpperCase() +
                    transaction.type.slice(1) || "N/A"
                }`
              );
            doc.fontSize(10).text(`   Amount: ${transaction.amount || 0}`);
            doc.fontSize(10).text(`   Status: ${transaction.status || "N/A"}`);
            doc
              .fontSize(10)
              .text(
                `   Date: ${
                  transaction.createdAt
                    ? new Date(transaction.createdAt).toLocaleDateString()
                    : "N/A"
                }`
              );
            doc
              .fontSize(10)
              .text(`   Reference: ${transaction.reference || "N/A"}`);
            if (transaction.notes)
              doc.fontSize(10).text(`   Notes: ${transaction.notes}`);
            doc.moveDown(0.5);
          });
        }

        // Add verification history section
        doc.moveDown();
        doc.fontSize(16).text("Verification History", { underline: true });
        doc.moveDown(0.5);

        if (verificationHistory.length === 0) {
          doc.fontSize(12).text("No verification history found for this user.");
        } else {
          verificationHistory.forEach((verification, index) => {
            doc.fontSize(12).text(`${index + 1}. Request ${verification._id}`);
            doc.fontSize(10).text(`   Status: ${verification.status || "N/A"}`);
            doc
              .fontSize(10)
              .text(
                `   Created: ${
                  verification.createdAt
                    ? new Date(verification.createdAt).toLocaleDateString()
                    : "N/A"
                }`
              );
            doc
              .fontSize(10)
              .text(
                `   Updated: ${
                  verification.updatedAt
                    ? new Date(verification.updatedAt).toLocaleDateString()
                    : "N/A"
                }`
              );
            if (verification.rejectionReason)
              doc
                .fontSize(10)
                .text(`   Rejection Reason: ${verification.rejectionReason}`);
            doc.moveDown(0.5);
          });
        }

        // Finalize the PDF
        doc.end();
      } catch (error) {
        if (error.code === "MODULE_NOT_FOUND") {
          return res.status(500).json({
            success: false,
            message: "PDF generation module not installed",
            error: "Please run: npm install pdfkit",
          });
        }
        throw error; // Re-throw if it's a different error
      }
    }
    // Handle CSV format
    else if (format === "csv") {
      try {
        // Try to require csv-writer
        const createCsvStringifier =
          require("csv-writer").createObjectCsvStringifier;

        // Format data for CSV
        // For personal info
        const personalInfo = {
          "User ID": userId,
          "Full Name": user.fullName || "N/A",
          Email: user.email || "N/A",
          "Lichess Username": user.lichessUsername || "N/A",
          "Phone Number": user.phoneNumber || "N/A",
          "Is Verified": user.isVerified ? "Yes" : "No",
          "Wallet Balance": user.walletBalance || 0,
          "Created At": user.createdAt
            ? new Date(user.createdAt).toLocaleDateString()
            : "N/A",
          "Bank Name": user.bankDetails?.bankName || "N/A",
          "Account Number": user.bankDetails?.accountNumber || "N/A",
          "Account Name": user.bankDetails?.accountName || "N/A",
        };

        // For created tournaments
        const createdTournamentsFormatted = createdTournaments.map(
          (t, index) => ({
            "Data Type": "Created Tournament",
            Title: t.title || "N/A",
            Category: t.category || "N/A",
            "Start Date": t.startDate
              ? new Date(t.startDate).toLocaleDateString()
              : "N/A",
            Status: t.status || "N/A",
            Participants: t.participants ? t.participants.length : 0,
          })
        );

        // For registered tournaments
        const registeredTournamentsFormatted = registeredTournaments.map(
          (t, index) => ({
            "Data Type": "Registered Tournament",
            Title: t.title || "N/A",
            Category: t.category || "N/A",
            "Start Date": t.startDate
              ? new Date(t.startDate).toLocaleDateString()
              : "N/A",
            Status: t.status || "N/A",
          })
        );

        // For transactions
        const transactionsFormatted = transactions.map((t, index) => ({
          "Data Type": "Transaction",
          Type: t.type || "N/A",
          Amount: t.amount || 0,
          Status: t.status || "N/A",
          "Created At": t.createdAt
            ? new Date(t.createdAt).toLocaleDateString()
            : "N/A",
          Reference: t.reference || "N/A",
          Notes: t.notes || "N/A",
        }));

        // For verification history
        const verificationHistoryFormatted = verificationHistory.map(
          (v, index) => ({
            "Data Type": "Verification Request",
            "Request ID": v._id,
            Status: v.status || "N/A",
            "Created At": v.createdAt
              ? new Date(v.createdAt).toLocaleDateString()
              : "N/A",
            "Updated At": v.updatedAt
              ? new Date(v.updatedAt).toLocaleDateString()
              : "N/A",
            "Rejection Reason": v.rejectionReason || "N/A",
          })
        );

        // Combine all data for CSV export
        const csvData = [
          { "Data Type": "Personal Information", ...personalInfo },
          ...createdTournamentsFormatted,
          ...registeredTournamentsFormatted,
          ...transactionsFormatted,
          ...verificationHistoryFormatted,
        ];

        // Create CSV headers from all possible keys
        const allKeys = new Set();
        csvData.forEach((item) => {
          Object.keys(item).forEach((key) => allKeys.add(key));
        });

        const headers = Array.from(allKeys).map((key) => ({
          id: key,
          title: key,
        }));

        const csvStringifier = createCsvStringifier({
          header: headers,
        });

        const headerString = csvStringifier.getHeaderString();
        const recordsString = csvStringifier.stringifyRecords(csvData);
        const csvContent = headerString + recordsString;

        // Set headers for CSV download
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=player_${userId}.csv`
        );

        // Send the CSV content
        res.send(csvContent);
      } catch (error) {
        if (error.code === "MODULE_NOT_FOUND") {
          return res.status(500).json({
            success: false,
            message: "CSV generation module not installed",
            error: "Please run: npm install csv-writer",
          });
        }
        throw error; // Re-throw if it's a different error
      }
    }
  } catch (error) {
    console.error("Error downloading player data:", error);
    res.status(500).json({
      success: false,
      message: "Error downloading player data",
      error: error.message,
    });
  }
};

/**
 * @desc    Download player data with pagination
 * @route   GET /api/admin/players/download
 * @access  Private/Admin
 */
exports.downloadPaginatedPlayerData = async (req, res) => {
  console.log("downloadingPaginatedPlayerData");
  try {
    // Get the format from the query (pdf or csv, default to json)
    const format = req.query.format?.toLowerCase() || "json";

    if (!["json", "pdf", "csv"].includes(format)) {
      return res.status(400).json({
        success: false,
        message: "Invalid format. Supported formats: json, pdf, csv",
      });
    }

    // Extract pagination parameters from query
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get total count for pagination info
    const totalUsers = await User.countDocuments();
    const totalPages = Math.ceil(totalUsers / limit);

    // Get users with pagination
    const users = await User.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Prepare data array to hold all user data
    const usersData = [];

    // Process each user to gather their data
    for (const user of users) {
      // Get all user-related data
      const createdTournaments = await Tournament.find({
        organizer: user._id,
      })
        .select("title startDate status participants category")
        .lean();

      const registeredTournaments = await Tournament.find({
        participants: user._id,
      })
        .select("title startDate status category")
        .lean();

      const transactions = await Transaction.find({
        user: user._id,
      })
        .sort({ createdAt: -1 })
        .lean();

      const verificationHistory = await VerificationRequest.find({
        user: user._id,
      })
        .sort({ updatedAt: -1 })
        .lean();

      // Create data object for each user
      const userData = {
        personalInfo: {
          _id: user._id,
          fullName: user.fullName,
          email: user.email,
          lichessUsername: user.lichessUsername,
          phoneNumber: user.phoneNumber,
          isVerified: user.isVerified,
          walletBalance: user.walletBalance,
          createdAt: user.createdAt,
          bankDetails: user.bankDetails || {},
        },
        tournaments: {
          created: createdTournaments.map((t) => ({
            title: t.title,
            startDate: t.startDate,
            status: t.status,
            participantsCount: t.participants?.length || 0,
            category: t.category,
          })),
          registered: registeredTournaments.map((t) => ({
            title: t.title,
            startDate: t.startDate,
            status: t.status,
            category: t.category,
          })),
        },
        transactions: transactions.map((t) => ({
          type: t.type,
          amount: t.amount,
          status: t.status,
          reference: t.reference,
          createdAt: t.createdAt,
        })),
        verificationHistory: verificationHistory.map((v) => ({
          status: v.status,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
        })),
      };

      usersData.push(userData);
    }

    // Create response object with pagination info
    const responseData = {
      success: true,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        limit: limit,
        totalUsers: totalUsers,
      },
      data: usersData,
    };

    // Create a filename based on parameters
    const filename = `players_page${page}_limit${limit}`;

    // Handle different formats
    if (format === "json") {
      // Set headers for JSON file download
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=${filename}.json`
      );

      // Send the data as a downloadable file
      return res.status(200).json(responseData);
    } else if (format === "pdf") {
      try {
        // Try to require PDFKit
        const PDFDocument = require("pdfkit");
        const doc = new PDFDocument({ margin: 50, size: "A4" });

        // Set response headers for PDF download
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=${filename}.pdf`
        );

        // Pipe the PDF document to the response
        doc.pipe(res);

        // Add title
        doc.fontSize(20).text("Player Data Report", { align: "center" });
        doc.moveDown();

        // Add pagination info
        doc.fontSize(12).text(`Page: ${page} of ${totalPages}`);
        doc.fontSize(12).text(`Records per page: ${limit}`);
        doc.fontSize(12).text(`Total players: ${totalUsers}`);
        doc.moveDown();

        // For each user, add a section
        usersData.forEach((user, index) => {
          // Add a horizontal line before each user except the first one
          if (index > 0) {
            doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown();
          }

          // Personal Info Section
          doc.fontSize(16).text(`Player: ${user.personalInfo.fullName}`);
          doc.fontSize(12).text(`Email: ${user.personalInfo.email}`);
          doc
            .fontSize(12)
            .text(
              `Lichess Username: ${user.personalInfo.lichessUsername || "N/A"}`
            );
          doc
            .fontSize(12)
            .text(`Phone: ${user.personalInfo.phoneNumber || "N/A"}`);
          doc
            .fontSize(12)
            .text(
              `Verification Status: ${
                user.personalInfo.isVerified ? "Verified" : "Not Verified"
              }`
            );
          doc
            .fontSize(12)
            .text(`Wallet Balance: ${user.personalInfo.walletBalance || 0}`);
          doc
            .fontSize(12)
            .text(
              `Joined: ${new Date(
                user.personalInfo.createdAt
              ).toLocaleString()}`
            );
          doc.moveDown();

          // Tournaments Section
          doc.fontSize(14).text("Tournaments");

          // Created Tournaments
          if (user.tournaments.created.length > 0) {
            doc.fontSize(12).text("Created Tournaments:");
            user.tournaments.created.forEach((tournament, i) => {
              doc
                .fontSize(10)
                .text(
                  `  ${i + 1}. ${tournament.title} (${
                    tournament.category || "N/A"
                  }) - ${tournament.status} - ${new Date(
                    tournament.startDate
                  ).toLocaleDateString()}`
                );
            });
          } else {
            doc.fontSize(12).text("Created Tournaments: None");
          }
          doc.moveDown(0.5);

          // Registered Tournaments
          if (user.tournaments.registered.length > 0) {
            doc.fontSize(12).text("Registered Tournaments:");
            user.tournaments.registered.forEach((tournament, i) => {
              doc
                .fontSize(10)
                .text(
                  `  ${i + 1}. ${tournament.title} (${
                    tournament.category || "N/A"
                  }) - ${tournament.status} - ${new Date(
                    tournament.startDate
                  ).toLocaleDateString()}`
                );
            });
          } else {
            doc.fontSize(12).text("Registered Tournaments: None");
          }
          doc.moveDown();

          // Transactions Section
          doc.fontSize(14).text("Transactions");
          if (user.transactions.length > 0) {
            user.transactions.forEach((transaction, i) => {
              if (i < 5) {
                // Limit to 5 transactions to save space
                doc
                  .fontSize(10)
                  .text(
                    `  ${i + 1}. ${transaction.type} - ${
                      transaction.amount
                    } - ${transaction.status} - ${new Date(
                      transaction.createdAt
                    ).toLocaleDateString()}`
                  );
              } else if (i === 5) {
                doc
                  .fontSize(10)
                  .text(
                    `  ... and ${
                      user.transactions.length - 5
                    } more transactions`
                  );
              }
            });
          } else {
            doc.fontSize(12).text("Transactions: None");
          }
          doc.moveDown();

          // Check if adding another user would exceed page
          if (index < usersData.length - 1 && doc.y > 700) {
            doc.addPage();
          }
        });

        // Finalize the PDF
        doc.end();
      } catch (error) {
        if (error.code === "MODULE_NOT_FOUND") {
          return res.status(500).json({
            success: false,
            message: "PDF generation module not installed",
            error: "Please run: npm install pdfkit",
          });
        }
        throw error; // Re-throw if it's a different error
      }
    } else if (format === "csv") {
      try {
        // Try to require csv-writer
        const createCsvStringifier =
          require("csv-writer").createObjectCsvStringifier;

        // Flatten the user data for CSV export
        const flattenedData = usersData.map((user) => {
          const createdTournamentCount = user.tournaments.created.length;
          const registeredTournamentCount = user.tournaments.registered.length;
          const transactionCount = user.transactions.length;

          return {
            id: user.personalInfo._id.toString(),
            fullName: user.personalInfo.fullName,
            email: user.personalInfo.email,
            lichessUsername: user.personalInfo.lichessUsername || "N/A",
            phoneNumber: user.personalInfo.phoneNumber || "N/A",
            isVerified: user.personalInfo.isVerified ? "Yes" : "No",
            walletBalance: user.personalInfo.walletBalance || 0,
            joinDate: new Date(
              user.personalInfo.createdAt
            ).toLocaleDateString(),
            bankName: user.personalInfo.bankDetails?.bankName || "N/A",
            accountName: user.personalInfo.bankDetails?.accountName || "N/A",
            tournamentCreated: createdTournamentCount,
            tournamentRegistered: registeredTournamentCount,
            transactionCount: transactionCount,
            // Add more fields as needed
          };
        });

        // Define CSV header
        const csvStringifier = createCsvStringifier({
          header: [
            { id: "id", title: "ID" },
            { id: "fullName", title: "Full Name" },
            { id: "email", title: "Email" },
            { id: "lichessUsername", title: "Lichess Username" },
            { id: "phoneNumber", title: "Phone Number" },
            { id: "isVerified", title: "Verified" },
            { id: "walletBalance", title: "Wallet Balance" },
            { id: "joinDate", title: "Join Date" },
            { id: "bankName", title: "Bank Name" },
            { id: "accountName", title: "Account Name" },
            { id: "tournamentCreated", title: "Tournaments Created" },
            { id: "tournamentRegistered", title: "Tournaments Registered" },
            { id: "transactionCount", title: "Transactions" },
          ],
        });

        // Create CSV content
        const headerString = csvStringifier.getHeaderString();
        const recordsString = csvStringifier.stringifyRecords(flattenedData);
        const csvContent = headerString + recordsString;

        // Set response headers for CSV download
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=${filename}.csv`
        );

        // Send the CSV data
        res.send(csvContent);
      } catch (error) {
        if (error.code === "MODULE_NOT_FOUND") {
          return res.status(500).json({
            success: false,
            message: "CSV generation module not installed",
            error: "Please run: npm install csv-writer",
          });
        }
        throw error; // Re-throw if it's a different error
      }
    }
  } catch (error) {
    console.error("Error downloading paginated player data:", error);
    res.status(500).json({
      success: false,
      message: "Error downloading paginated player data",
      error: error.message,
    });
  }
};

/**
 * @desc    Download profile picture
 * @route   GET /api/admin/players/:userId/profilepic
 * @access  Private/Admin
 */
exports.downloadProfilePicture = async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const user = await User.findById(userId)
      .select("profilePic fullName")
      .lean();

    if (!user || !user.profilePic) {
      return res.status(404).json({
        success: false,
        message: "User or profile picture not found",
      });
    }

    // Determine if the profile picture is a URL or a file path
    if (
      user.profilePic.startsWith("http://") ||
      user.profilePic.startsWith("https://")
    ) {
      try {
        // Create a safe filename from the user's name
        const safeName = user.fullName
          ? user.fullName.replace(/[^a-z0-9]/gi, "_").toLowerCase()
          : `user_${userId}`;

        // Get file extension from URL
        const urlParts = user.profilePic.split(".");
        const fileExtension =
          urlParts.length > 1
            ? `.${urlParts[urlParts.length - 1].split("?")[0]}`
            : ".jpg"; // Default to jpg if no extension found

        const fileName = `${safeName}_profile${fileExtension}`;

        // Import required modules
        const https = require("https");
        const http = require("http");

        // Determine which module to use
        const requester = user.profilePic.startsWith("https://") ? https : http;

        // Set headers for the response
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${fileName}"`
        );
        res.setHeader("Content-Type", "image/jpeg"); // Set appropriate content type

        // Create a pipe from the URL response to our response
        requester
          .get(user.profilePic, (response) => {
            // If the image URL returns a redirect, follow it
            if (response.statusCode === 301 || response.statusCode === 302) {
              const newUrl = response.headers.location;
              const newRequester = newUrl.startsWith("https://") ? https : http;

              newRequester
                .get(newUrl, (redirectResponse) => {
                  redirectResponse.pipe(res);
                })
                .on("error", (err) => {
                  console.error("Error following redirect:", err);
                  res.status(500).json({
                    success: false,
                    message: "Error downloading image after redirect",
                    error: err.message,
                  });
                });
            } else {
              // No redirect, pipe the response directly
              response.pipe(res);
            }
          })
          .on("error", (err) => {
            console.error("Error downloading image from URL:", err);
            res.status(500).json({
              success: false,
              message: "Error downloading image from URL",
              error: err.message,
            });
          });
      } catch (error) {
        console.error("Error processing remote image:", error);
        res.status(500).json({
          success: false,
          message: "Error processing remote image",
          error: error.message,
        });
      }
    } else {
      // Handle local file
      try {
        const fs = require("fs");
        const path = require("path");

        // Ensure the path is valid and secure (prevent directory traversal)
        const filePath = path.resolve(user.profilePic);

        // Check if file exists
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({
            success: false,
            message: "Profile picture file not found",
          });
        }

        // Get file extension
        const fileExtension = path.extname(filePath);
        const safeName = user.fullName
          ? user.fullName.replace(/[^a-z0-9]/gi, "_").toLowerCase()
          : `user_${userId}`;
        const fileName = `${safeName}_profile${fileExtension}`;

        // Set headers for file download
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${fileName}"`
        );

        // Use file extension to set appropriate content type
        const contentTypeMap = {
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png",
          ".gif": "image/gif",
          ".webp": "image/webp",
        };
        const contentType =
          contentTypeMap[fileExtension.toLowerCase()] ||
          "application/octet-stream";
        res.setHeader("Content-Type", contentType);

        // Stream the file to the response
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

        // Handle errors in file stream
        fileStream.on("error", (err) => {
          console.error("Error reading local file:", err);
          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              message: "Error reading profile picture file",
              error: err.message,
            });
          }
        });
      } catch (error) {
        console.error("Error processing local image:", error);
        res.status(500).json({
          success: false,
          message: "Error processing local image",
          error: error.message,
        });
      }
    }
  } catch (error) {
    console.error("Error fetching profile picture:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching profile picture",
      error: error.message,
    });
  }
};

/**
 * @desc    Change user verification status
 * @route   PUT /api/admin/players/:userId/status
 * @access  Private/Admin
 */
exports.updatePlayerStatus = async (req, res) => {
  try {
    const userId = req.params.userId;
    const { status, reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    if (!status || !["verified", "unverified", "declined"].includes(status)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid status. Must be one of: verified, unverified, declined",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update user verification status
    if (status === "verified") {
      user.isVerified = true;
      await user.save();

      // Update any pending verification requests
      await VerificationRequest.updateMany(
        { user: userId, status: "pending" },
        { status: "approved", updatedAt: Date.now() }
      );
    } else if (status === "unverified") {
      user.isVerified = false;
      await user.save();
    } else if (status === "declined") {
      user.isVerified = false;
      await user.save();

      // Update any pending verification requests
      if (!reason) {
        return res.status(400).json({
          success: false,
          message: "Reason is required for declining verification",
        });
      }

      await VerificationRequest.updateMany(
        { user: userId, status: "pending" },
        {
          status: "rejected",
          rejectionReason: reason,
          updatedAt: Date.now(),
        }
      );
    }

    res.status(200).json({
      success: true,
      message: `User status updated to ${status}`,
      data: {
        userId: user._id,
        isVerified: user.isVerified,
        status,
      },
    });
  } catch (error) {
    console.error("Error updating user status:", error);
    res.status(500).json({
      success: false,
      message: "Error updating user status",
      error: error.message,
    });
  }
};

/**
 * @desc    Ban a player (disable account)
 * @route   PUT /api/admin/players/:userId/ban
 * @access  Private/Admin
 */
exports.banPlayer = async (req, res) => {
  try {
    const userId = req.params.userId;
    const { reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Ban reason is required",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Add a new field to track banned status
    user.isBanned = true;
    user.banReason = reason;
    user.bannedAt = Date.now();
    await user.save();

    res.status(200).json({
      success: true,
      message: "User has been banned",
      data: {
        userId: user._id,
        isBanned: user.isBanned,
        banReason: user.banReason,
        bannedAt: user.bannedAt,
      },
    });
  } catch (error) {
    console.error("Error banning user:", error);
    res.status(500).json({
      success: false,
      message: "Error banning user",
      error: error.message,
    });
  }
};

/**
 * @desc    Unban a player
 * @route   PUT /api/admin/players/:userId/unban
 * @access  Private/Admin
 */
exports.unbanPlayer = async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.isBanned = false;
    user.banReason = undefined;
    user.bannedAt = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: "User has been unbanned",
      data: {
        userId: user._id,
        isBanned: user.isBanned,
      },
    });
  } catch (error) {
    console.error("Error unbanning user:", error);
    res.status(500).json({
      success: false,
      message: "Error unbanning user",
      error: error.message,
    });
  }
};

/**
 * @desc    Get withdrawal statistics - counts for different statuses
 * @route   GET /api/admin/withdrawals/stats
 * @access  Private/Admin
 */
exports.getWithdrawalStats = async (req, res) => {
  try {
    // Get counts for each withdrawal status
    const totalCount = await Transaction.countDocuments({
      type: "withdrawal",
    });

    const pendingCount = await Transaction.countDocuments({
      type: "withdrawal",
      status: "pending",
    });

    const completedCount = await Transaction.countDocuments({
      type: "withdrawal",
      status: "completed",
    });

    const declinedCount = await Transaction.countDocuments({
      type: "withdrawal",
      status: "declined",
    });

    // Get total withdrawal amount stats
    const totalAmountStats = await Transaction.aggregate([
      { $match: { type: "withdrawal" } },
      {
        $group: {
          _id: "$status",
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    // Format total amounts by status
    const amountByStatus = {};
    totalAmountStats.forEach((stat) => {
      amountByStatus[stat._id] = stat.totalAmount;
    });

    // Calculate total amount of all withdrawals
    const totalWithdrawnAmount = totalAmountStats.reduce((sum, stat) => {
      return sum + (stat._id === "completed" ? stat.totalAmount : 0);
    }, 0);

    // Get recent trend - withdrawals by day for the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const dailyTrend = await Transaction.aggregate([
      {
        $match: {
          type: "withdrawal",
          createdAt: { $gte: sevenDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            status: "$status",
          },
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        counts: {
          total: totalCount,
          pending: pendingCount,
          completed: completedCount,
          declined: declinedCount,
        },
        amounts: {
          total: totalWithdrawnAmount,
          byStatus: amountByStatus,
        },
        trend: dailyTrend,
      },
    });
  } catch (error) {
    console.error("Error fetching withdrawal stats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching withdrawal statistics",
      error: error.message,
    });
  }
};

/**
 * Get admin activity logs with filtering and pagination
 * @route GET /api/admin/activity
 * @access Private/Admin
 */
exports.getActivityLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = {};

    // Apply type filter if provided
    if (req.query.type) {
      filter.type = req.query.type;
    }

    // Apply status filter if provided
    if (req.query.status) {
      filter.status = req.query.status;
    }

    // Apply date range filter if provided
    if (req.query.startDate && req.query.endDate) {
      filter.createdAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate),
      };
    }

    // Get total count for pagination
    const total = await ActivityLog.countDocuments(filter);

    // Get activity logs with pagination
    const activityLogs = await ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("user", "fullName email lichessUsername")
      .populate("adminUser", "fullName email")
      .lean();

    // Format the response data
    const formattedLogs = activityLogs.map((log) => {
      // Format the date to a readable string
      const date = new Date(log.createdAt);
      const formattedDate = date.toLocaleDateString("en-US", {
        weekday: "short",
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      return {
        id: log._id,
        type: log.type,
        action: log.action,
        user: log.user ? log.user.fullName : "System",
        email: log.user ? log.user.email : "-",
        admin: log.adminUser ? log.adminUser.fullName : "System",
        status: log.status,
        date: formattedDate,
        details: log.details,
      };
    });

    // Return response with pagination metadata
    res.status(200).json({
      success: true,
      data: formattedLogs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error getting activity logs:", error);
    res.status(500).json({
      success: false,
      message: "Error getting activity logs",
      error: error.message,
    });
  }
};

/**
 * Get activity summary by type
 * @route GET /api/admin/activity/summary
 * @access Private/Admin
 */
exports.getActivitySummary = async (req, res) => {
  try {
    // Get counts by type for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activitySummary = await ActivityLog.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    // Get counts by status
    const statusSummary = await ActivityLog.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    // Get daily activity counts for the last 30 days
    const dailyActivity = await ActivityLog.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
      },
    ]);

    // Format the daily activity data
    const formattedDailyActivity = dailyActivity.map((day) => {
      const date = new Date(day._id.year, day._id.month - 1, day._id.day);
      return {
        date: date.toISOString().split("T")[0],
        count: day.count,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        byType: activitySummary,
        byStatus: statusSummary,
        dailyActivity: formattedDailyActivity,
      },
    });
  } catch (error) {
    console.error("Error getting activity summary:", error);
    res.status(500).json({
      success: false,
      message: "Error getting activity summary",
      error: error.message,
    });
  }
};

/**
 * Create manual activity log (for testing or manual entries)
 * @route POST /api/admin/activity
 * @access Private/Admin
 */
exports.createActivityLog = async (req, res) => {
  try {
    const { type, action, status, userId, details } = req.body;

    // Validate required fields
    if (!type || !action || !status) {
      return res.status(400).json({
        success: false,
        message: "Type, action, and status are required",
      });
    }

    // Create activity log
    const activityLog = await ActivityLog.create({
      type,
      action,
      status,
      user: userId || null,
      adminUser: req.user._id,
      details: details || {},
    });

    res.status(201).json({
      success: true,
      data: activityLog,
    });
  } catch (error) {
    console.error("Error creating activity log:", error);
    res.status(500).json({
      success: false,
      message: "Error creating activity log",
      error: error.message,
    });
  }
};

/**
 * @desc    Get all withdrawals with pagination and filtering
 * @route   GET /api/admin/withdrawals
 * @access  Private/Admin
 */
exports.getAllWithdrawals = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;
    const status = req.query.status; // 'pending', 'completed', 'declined', or undefined for all
    const search = req.query.search || "";
    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    // Build query
    const query = { type: "withdrawal" };

    // Add status filter if provided
    if (status && ["pending", "completed", "declined"].includes(status)) {
      query.status = status;
    }

    // Add search functionality
    if (search) {
      // We'll need to look up users by the search term, then find transactions for those users
      const users = await User.find({
        $or: [
          { fullName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { lichessUsername: { $regex: search, $options: "i" } },
        ],
      }).select("_id");

      const userIds = users.map((user) => user._id);

      // Add user IDs to the query
      if (userIds.length > 0) {
        query.user = { $in: userIds };
      } else {
        // If no users match the search, return empty results
        return res.status(200).json({
          success: true,
          pagination: {
            total: 0,
            page,
            limit,
            pages: 0,
          },
          counts: {
            pending: 0,
            completed: 0,
            declined: 0,
            total: 0,
          },
          data: [],
        });
      }
    }

    // Count total documents for pagination
    const totalDocs = await Transaction.countDocuments(query);

    // Create sort object
    const sort = {};
    sort[sortBy] = sortOrder;

    // Get withdrawals with user details using aggregation
    const withdrawals = await Transaction.aggregate([
      { $match: query },
      { $sort: sort },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      { $unwind: "$userDetails" },
      {
        $project: {
          _id: 1,
          amount: 1,
          status: 1,
          createdAt: 1,
          updatedAt: 1,
          notes: 1,
          rejectionReason: 1,
          reference: 1,
          bankDetails: 1,
          "userDetails._id": 1,
          "userDetails.fullName": 1,
          "userDetails.email": 1,
          "userDetails.lichessUsername": 1,
          "userDetails.walletBalance": 1,
        },
      },
    ]);

    // Get counts for each status
    const pendingCount = await Transaction.countDocuments({
      type: "withdrawal",
      status: "pending",
    });
    const completedCount = await Transaction.countDocuments({
      type: "withdrawal",
      status: "completed",
    });
    const declinedCount = await Transaction.countDocuments({
      type: "withdrawal",
      status: "declined",
    });

    res.status(200).json({
      success: true,
      pagination: {
        total: totalDocs,
        page,
        limit,
        pages: Math.ceil(totalDocs / limit),
      },
      counts: {
        pending: pendingCount,
        completed: completedCount,
        declined: declinedCount,
        total: totalDocs,
      },
      data: withdrawals,
    });
  } catch (error) {
    console.error("Error fetching withdrawals:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching withdrawals",
      error: error.message,
    });
  }
};

/**
 * @desc    Get withdrawal by ID
 * @route   GET /api/admin/withdrawals/:id
 * @access  Private/Admin
 */
exports.getWithdrawalById = async (req, res) => {
  try {
    const withdrawalId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(withdrawalId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid withdrawal ID",
      });
    }

    const withdrawal = await Transaction.findOne({
      _id: withdrawalId,
      type: "withdrawal",
    });

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: "Withdrawal not found",
      });
    }

    // Get user details
    const user = await User.findById(withdrawal.user).select(
      "fullName email lichessUsername walletBalance bankDetails"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User associated with this withdrawal not found",
      });
    }

    // Get withdrawal history for this user
    const withdrawalHistory = await Transaction.find({
      user: withdrawal.user,
      type: "withdrawal",
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("amount status createdAt reference");

    res.status(200).json({
      success: true,
      data: {
        withdrawal,
        user,
        withdrawalHistory,
      },
    });
  } catch (error) {
    console.error("Error fetching withdrawal details:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching withdrawal details",
      error: error.message,
    });
  }
};

/**
 * @desc    Update withdrawal status
 * @route   PUT /api/admin/withdrawals/:id/status
 * @access  Private/Admin
 */
exports.updateWithdrawalStatus = async (req, res) => {
  try {
    const withdrawalId = req.params.id;
    const { status, notes } = req.body;

    if (!mongoose.Types.ObjectId.isValid(withdrawalId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid withdrawal ID",
      });
    }

    if (!status || !["pending", "completed", "declined"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be one of: pending, completed, declined",
      });
    }

    const withdrawal = await Transaction.findOne({
      _id: withdrawalId,
      type: "withdrawal",
    });

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: "Withdrawal not found",
      });
    }

    // If declining, we need a reason
    if (status === "declined" && (!notes || notes.trim() === "")) {
      return res.status(400).json({
        success: false,
        message: "A reason is required when declining a withdrawal",
      });
    }

    // If we're changing from pending to completed or declined, handle wallet balance
    const user = await User.findById(withdrawal.user);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User associated with this withdrawal not found",
      });
    }

    // Get the original status for the change tracking
    const originalStatus = withdrawal.status;

    // If the status is changing from pending to declined, refund the amount to user's wallet
    if (originalStatus === "pending" && status === "declined") {
      user.walletBalance += withdrawal.amount;
      await user.save();
    }

    // If the status is changing from declined to pending or completed, deduct the amount from wallet
    // (but only if it wasn't already taken out previously)
    if (
      originalStatus === "declined" &&
      (status === "pending" || status === "completed")
    ) {
      // Only deduct if user has sufficient balance
      if (user.walletBalance >= withdrawal.amount) {
        user.walletBalance -= withdrawal.amount;
        await user.save();
      } else {
        return res.status(400).json({
          success: false,
          message: "User has insufficient balance for this withdrawal",
        });
      }
    }

    // Update the withdrawal status
    withdrawal.status = status;

    // Add notes if provided
    if (notes) {
      withdrawal.notes = notes;
      if (status === "declined") {
        withdrawal.rejectionReason = notes;
      }
    }

    // Add reference number if status is completed
    if (status === "completed" && !withdrawal.reference) {
      withdrawal.reference = `WD-${Date.now()}-${Math.floor(
        Math.random() * 1000
      )}`;
    }

    // Update the timestamp
    withdrawal.updatedAt = Date.now();

    // Save the withdrawal
    await withdrawal.save();

    res.status(200).json({
      success: true,
      message: `Withdrawal status updated to ${status}`,
      data: {
        withdrawal,
        user: {
          _id: user._id,
          fullName: user.fullName,
          walletBalance: user.walletBalance,
        },
      },
    });
  } catch (error) {
    console.error("Error updating withdrawal status:", error);
    res.status(500).json({
      success: false,
      message: "Error updating withdrawal status",
      error: error.message,
    });
  }
};

/**
 * @desc    Download all withdrawals data
 * @route   GET /api/admin/withdrawals/download
 * @access  Private/Admin
 */
exports.downloadWithdrawals = async (req, res) => {
  try {
    const format = req.query.format?.toLowerCase() || "pdf"; // Default to PDF if format not specified
    const status = req.query.status; // 'pending', 'completed', 'declined', or undefined for all
    const startDate = req.query.startDate
      ? new Date(req.query.startDate)
      : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

    if (!["pdf", "csv"].includes(format)) {
      return res.status(400).json({
        success: false,
        message: "Invalid format. Supported formats: pdf, csv",
      });
    }

    // Build query
    const query = { type: "withdrawal" };

    // Add status filter if provided
    if (status && ["pending", "completed", "declined"].includes(status)) {
      query.status = status;
    }

    // Add date range filter if provided
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = startDate;
      }
      if (endDate) {
        // Set end date to the end of the day
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }

    // Get withdrawals with user details
    const withdrawals = await Transaction.aggregate([
      { $match: query },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      { $unwind: "$userDetails" },
      {
        $project: {
          amount: 1,
          status: 1,
          createdAt: 1,
          updatedAt: 1,
          notes: 1,
          rejectionReason: 1,
          reference: 1,
          bankDetails: 1,
          "user.fullName": "$userDetails.fullName",
          "user.email": "$userDetails.email",
          "user.lichessUsername": "$userDetails.lichessUsername",
          "user.walletBalance": "$userDetails.walletBalance",
        },
      },
    ]);

    // Format data for export
    const formattedData = withdrawals.map((w) => ({
      fullName: w.user.fullName || "N/A",
      email: w.user.email || "N/A",
      lichessUsername: w.user.lichessUsername || "N/A",
      amount: w.amount || 0,
      status: w.status || "N/A",
      walletBalance: w.user.walletBalance || 0,
      reference: w.reference || "N/A",
      bankName: w.bankDetails?.bankName || "N/A",
      accountNumber: w.bankDetails?.accountNumber || "N/A",
      accountName: w.bankDetails?.accountName || "N/A",
      createdAt: w.createdAt ? new Date(w.createdAt).toLocaleString() : "N/A",
      updatedAt: w.updatedAt ? new Date(w.updatedAt).toLocaleString() : "N/A",
      notes: w.notes || "N/A",
      rejectionReason: w.rejectionReason || "N/A",
    }));

    // Set filename based on filters
    let filename = "withdrawals";
    if (status) filename += `_${status}`;
    if (startDate && endDate) {
      filename += `_${startDate.toISOString().split("T")[0]}_to_${
        endDate.toISOString().split("T")[0]
      }`;
    } else if (startDate) {
      filename += `_from_${startDate.toISOString().split("T")[0]}`;
    } else if (endDate) {
      filename += `_until_${endDate.toISOString().split("T")[0]}`;
    }

    // Handle PDF format
    if (format === "pdf") {
      try {
        // Try to require PDFKit
        const PDFDocument = require("pdfkit");
        const doc = new PDFDocument({ margin: 50 });

        // Set response headers for PDF download
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=${filename}.pdf`
        );

        // Pipe the PDF document to the response
        doc.pipe(res);

        // Add content to the PDF
        doc.fontSize(20).text("Withdrawals Report", { align: "center" });
        doc.moveDown();

        // Add filters information
        if (status) doc.fontSize(12).text(`Status: ${status}`);
        if (startDate)
          doc
            .fontSize(12)
            .text(`Start Date: ${startDate.toLocaleDateString()}`);
        if (endDate)
          doc.fontSize(12).text(`End Date: ${endDate.toLocaleDateString()}`);
        doc.fontSize(12).text(`Total Records: ${formattedData.length}`);
        doc.moveDown();

        // Add a horizontal line
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

        // If no withdrawals found
        if (formattedData.length === 0) {
          doc
            .fontSize(14)
            .text("No withdrawals found matching the criteria.", {
              align: "center",
            });
        } else {
          // For each withdrawal, add a section
          formattedData.forEach((withdrawal, index) => {
            doc
              .fontSize(16)
              .text(`${index + 1}. Withdrawal - ${withdrawal.reference}`);
            doc.moveDown(0.5);
            doc
              .fontSize(12)
              .text(`User: ${withdrawal.fullName} (${withdrawal.email})`);
            doc
              .fontSize(12)
              .text(`Lichess Username: ${withdrawal.lichessUsername}`);
            doc.fontSize(12).text(`Amount: ${withdrawal.amount}`);
            doc.fontSize(12).text(`Status: ${withdrawal.status}`);
            doc
              .fontSize(12)
              .text(`Wallet Balance: ${withdrawal.walletBalance}`);
            doc
              .fontSize(12)
              .text(
                `Bank Details: ${withdrawal.bankName}, ${withdrawal.accountNumber}, ${withdrawal.accountName}`
              );
            doc.fontSize(12).text(`Created At: ${withdrawal.createdAt}`);
            doc.fontSize(12).text(`Updated At: ${withdrawal.updatedAt}`);

            if (withdrawal.notes)
              doc.fontSize(12).text(`Notes: ${withdrawal.notes}`);
            if (withdrawal.rejectionReason)
              doc
                .fontSize(12)
                .text(`Rejection Reason: ${withdrawal.rejectionReason}`);

            // Add space between withdrawals
            if (index < formattedData.length - 1) {
              doc.moveDown();
              doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
              doc.moveDown();
            }
          });
        }

        // Finalize the PDF
        doc.end();
      } catch (error) {
        if (error.code === "MODULE_NOT_FOUND") {
          return res.status(500).json({
            success: false,
            message: "PDF generation module not installed",
            error: "Please run: npm install pdfkit",
          });
        }
        throw error; // Re-throw if it's a different error
      }
    }
    // Handle CSV format
    else if (format === "csv") {
      try {
        // Try to require csv-writer
        const createCsvStringifier =
          require("csv-writer").createObjectCsvStringifier;

        // Define headers for CSV
        const headers = [
          { id: "fullName", title: "Full Name" },
          { id: "email", title: "Email" },
          { id: "lichessUsername", title: "Lichess Username" },
          { id: "amount", title: "Amount" },
          { id: "status", title: "Status" },
          { id: "walletBalance", title: "Wallet Balance" },
          { id: "reference", title: "Reference" },
          { id: "bankName", title: "Bank Name" },
          { id: "accountNumber", title: "Account Number" },
          { id: "accountName", title: "Account Name" },
          { id: "createdAt", title: "Created At" },
          { id: "updatedAt", title: "Updated At" },
          { id: "notes", title: "Notes" },
          { id: "rejectionReason", title: "Rejection Reason" },
        ];

        const csvStringifier = createCsvStringifier({
          header: headers,
        });

        // Create CSV content
        const headerString = csvStringifier.getHeaderString();
        const recordsString = csvStringifier.stringifyRecords(formattedData);
        const csvContent = headerString + recordsString;

        // Set response headers for CSV download
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=${filename}.csv`
        );

        // Send the CSV data
        res.send(csvContent);
      } catch (error) {
        if (error.code === "MODULE_NOT_FOUND") {
          return res.status(500).json({
            success: false,
            message: "CSV generation module not installed",
            error: "Please run: npm install csv-writer",
          });
        }
        throw error; // Re-throw if it's a different error
      }
    }
  } catch (error) {
    console.error("Error in downloadWithdrawals:", error);
    res.status(500).json({
      success: false,
      message: "Failed to download withdrawals",
      error: error.message,
    });
  }
};

// Add these functions to your adminController

/**
 * GET TOURNAMENT ACTIVITY OVERVIEW
 * Route: GET /api/admin/tournaments/activity
 * Description: Shows all tournament activities across the platform
 */
/**
 * Helper function to validate ObjectId
 */
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id) && /^[0-9a-fA-F]{24}$/.test(id);
}

/**
 * GET TOURNAMENT ACTIVITY OVERVIEW
 * Route: GET /api/admin/tournaments/activity
 * Description: Shows all tournament activities across the platform
 */
exports.getTournamentActivity = async (req, res) => {
  try {
    const {
      status = "all",
      category = "all",
      payoutStatus = "all",
      page = 1,
      limit = 20,
      startDate,
      endDate,
    } = req.query;

    // Build filter query
    let matchQuery = {};

    if (status !== "all") {
      matchQuery.status = status;
    }

    if (category !== "all") {
      matchQuery.category = category;
    }

    if (startDate || endDate) {
      matchQuery.startDate = {};
      if (startDate) matchQuery.startDate.$gte = new Date(startDate);
      if (endDate) matchQuery.startDate.$lte = new Date(endDate);
    }

    // Aggregate pipeline to get comprehensive tournament data
    const tournaments = await Tournament.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: "users",
          localField: "organizer",
          foreignField: "_id",
          as: "organizerDetails",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "participants",
          foreignField: "_id",
          as: "participantDetails",
        },
      },
      {
        $lookup: {
          from: "transactions",
          let: { tournamentId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$tournament", "$$tournamentId"] },
                    {
                      $in: [
                        "$type",
                        [
                          "tournament_entry",
                          "tournament_funding",
                          "prize_payout",
                        ],
                      ],
                    },
                  ],
                },
              },
            },
          ],
          as: "transactions",
        },
      },
      {
        $addFields: {
          organizerInfo: { $arrayElemAt: ["$organizerDetails", 0] },
          participantCount: { $size: "$participants" },

          // Calculate financial data
          entryFeeCollected: {
            $multiply: ["$entryFee", { $size: "$participants" }],
          },

          // Get funding transactions
          fundingTransactions: {
            $filter: {
              input: "$transactions",
              cond: { $eq: ["$$this.type", "tournament_funding"] },
            },
          },

          // Get payout transactions
          payoutTransactions: {
            $filter: {
              input: "$transactions",
              cond: { $eq: ["$$this.type", "prize_payout"] },
            },
          },

          // Get entry fee transactions
          entryTransactions: {
            $filter: {
              input: "$transactions",
              cond: { $eq: ["$$this.type", "tournament_entry"] },
            },
          },
        },
      },
      {
        $addFields: {
          // Calculate total prize pool
          totalPrizePool: {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$prizeType", "fixed"] },
                  then: {
                    // Sum first five elements of fixed.amounts array and any additional prizes
                    $add: [
                      {
                        $sum: {
                          $map: {
                            input: { $ifNull: ["$prizes.fixed.amounts", []] },
                            as: "amt",
                            in: { $ifNull: ["$$amt", 0] },
                          },
                        },
                      },
                      {
                        $sum: {
                          $map: {
                            input: {
                              $ifNull: ["$prizes.fixed.additional", []],
                            },
                            as: "prize",
                            in: { $ifNull: ["$$prize.amount", 0] },
                          },
                        },
                      },
                    ],
                  },
                },
                {
                  case: { $eq: ["$prizeType", "percentage"] },
                  then: { $ifNull: ["$prizes.percentage.basePrizePool", 0] },
                },
              ],
              default: 0,
            },
          },

          // Calculate funding status
          totalFunded: {
            $sum: {
              $map: {
                input: "$fundingTransactions",
                as: "funding",
                in: {
                  $cond: [
                    { $eq: ["$$funding.status", "completed"] },
                    "$$funding.amount",
                    0,
                  ],
                },
              },
            },
          },

          // Calculate total paid out
          totalPaidOut: {
            $sum: {
              $map: {
                input: "$payoutTransactions",
                as: "payout",
                in: {
                  $cond: [
                    { $eq: ["$$payout.status", "completed"] },
                    "$$payout.amount",
                    0,
                  ],
                },
              },
            },
          },
        },
      },
      {
        $addFields: {
          // Determine payout status
          payoutStatus: {
            $cond: [
              { $eq: ["$status", "completed"] },
              {
                $cond: [
                  { $gte: ["$totalPaidOut", "$totalPrizePool"] },
                  "fully_paid",
                  {
                    $cond: [
                      { $gt: ["$totalPaidOut", 0] },
                      "partially_paid",
                      "unpaid",
                    ],
                  },
                ],
              },
              "pending",
            ],
          },

          // Check if properly funded
          fundingStatus: {
            $cond: [
              { $gte: ["$totalFunded", "$totalPrizePool"] },
              "fully_funded",
              {
                $cond: [
                  { $gt: ["$totalFunded", 0] },
                  "partially_funded",
                  "unfunded",
                ],
              },
            ],
          },
        },
      },
      {
        $project: {
          title: 1,
          category: 1,
          status: 1,
          startDate: 1,
          startTime: 1,
          tournamentLink: 1,
          participantCount: 1,
          entryFee: 1,
          entryFeeCollected: 1,
          totalPrizePool: 1,
          totalFunded: 1,
          totalPaidOut: 1,
          payoutStatus: 1,
          fundingStatus: 1,
          prizeType: 1,
          prizes: 1,
          organizerInfo: {
            _id: 1,
            fullName: 1,
            email: 1,
            lichessUsername: 1,
          },
          participantDetails: {
            _id: 1,
            fullName: 1,
            lichessUsername: 1,
          },
          createdAt: 1,
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: parseInt(limit) },
    ]);

    // Apply payout status filter if specified
    let filteredTournaments = tournaments;
    if (payoutStatus !== "all") {
      filteredTournaments = tournaments.filter(
        (t) => t.payoutStatus === payoutStatus
      );
    }

    // Get summary statistics
    const totalCount = await Tournament.countDocuments(matchQuery);

    const summaryStats = await Tournament.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalTournaments: { $sum: 1 },
          upcomingTournaments: {
            $sum: { $cond: [{ $eq: ["$status", "upcoming"] }, 1, 0] },
          },
          activeTournaments: {
            $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
          },
          completedTournaments: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: {
        tournaments: filteredTournaments,
        pagination: {
          currentPage: parseInt(page),
          limit: parseInt(limit),
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
        summary: summaryStats[0] || {
          totalTournaments: 0,
          upcomingTournaments: 0,
          activeTournaments: 0,
          completedTournaments: 0,
        },
      },
    });
  } catch (error) {
    console.error("Error getting tournament activity:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving tournament activity",
      error: error.message,
    });
  }
};

/**
 * GET SPECIFIC TOURNAMENT ACTIVITY DETAILS
 * Route: GET /api/admin/tournaments/:tournamentId/activity
 * Description: Shows detailed activity for a specific tournament
 */
exports.getTournamentActivityDetails = async (req, res) => {
  try {
    const { tournamentId } = req.params;

    // Validate ObjectId
    if (!isValidObjectId(tournamentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tournament ID format",
      });
    }

    // Get tournament with all related data
    const tournament = await Tournament.findById(tournamentId)
      .populate("organizer", "fullName email lichessUsername walletBalance")
      .populate("participants", "fullName email lichessUsername walletBalance")
      .lean();

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    // Get all transactions related to this tournament
    const transactions = await Transaction.find({ tournament: tournamentId })
      .populate("user", "fullName email lichessUsername")
      .sort({ createdAt: -1 })
      .lean();

    // Categorize transactions
    const transactionsByType = {
      funding: transactions.filter((t) => t.type === "tournament_funding"),
      entries: transactions.filter((t) => t.type === "tournament_entry"),
      payouts: transactions.filter((t) => t.type === "prize_payout"),
      refunds: transactions.filter((t) => t.type === "refund"),
    };

    // Calculate financial summary
    const financialSummary = {
      entryFeeCollected: tournament.participants.length * tournament.entryFee,
      totalFunded: transactionsByType.funding
        .filter((t) => t.status === "completed")
        .reduce((sum, t) => sum + t.amount, 0),
      totalPaidOut: transactionsByType.payouts
        .filter((t) => t.status === "completed")
        .reduce((sum, t) => sum + t.amount, 0),
      pendingPayouts: transactionsByType.payouts
        .filter((t) => t.status === "pending")
        .reduce((sum, t) => sum + t.amount, 0),
    };

    // Calculate expected prize distribution
    let expectedPrizes = [];
    if (tournament.prizeType === "fixed") {
      const fixed = tournament.prizes.fixed || {};
      const amounts = Array.isArray(fixed.amounts) ? fixed.amounts : [];
      const labels = ["1st", "2nd", "3rd", "4th", "5th"];

      amounts.forEach((amt, index) => {
        const amount = parseFloat(amt) || 0;
        if (amount > 0) {
          expectedPrizes.push({
            position:
              labels[index] || `${index + 1}${getOrdinalSuffix(index + 1)}`,
            amount: amount,
            positionNumber: index + 1,
          });
        }
      });

      // Add additional prizes
      if (fixed.additional && fixed.additional.length > 0) {
        fixed.additional.forEach((prize) => {
          expectedPrizes.push({
            position: `${prize.position}${getOrdinalSuffix(prize.position)}`,
            amount: prize.amount,
            positionNumber: prize.position,
          });
        });
      }
    }

    // Sort expected prizes by position
    expectedPrizes.sort((a, b) => a.positionNumber - b.positionNumber);

    // Check payout status for each expected prize
    const prizePayoutStatus = expectedPrizes.map((prize) => {
      const payout = transactionsByType.payouts.find(
        (t) => t.metadata && t.metadata.position === prize.position
      );

      return {
        ...prize,
        isPaid: payout ? payout.status === "completed" : false,
        payoutTransaction: payout || null,
        recipient: payout ? payout.user : null,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        tournament,
        transactions: transactionsByType,
        financialSummary,
        expectedPrizes: prizePayoutStatus,
        payoutStatus: {
          totalExpected: expectedPrizes.reduce((sum, p) => sum + p.amount, 0),
          totalPaid: financialSummary.totalPaidOut,
          remainingToPay: Math.max(
            0,
            expectedPrizes.reduce((sum, p) => sum + p.amount, 0) -
              financialSummary.totalPaidOut
          ),
          isFullyPaid:
            financialSummary.totalPaidOut >=
            expectedPrizes.reduce((sum, p) => sum + p.amount, 0),
        },
      },
    });
  } catch (error) {
    console.error("Error getting tournament activity details:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving tournament details",
      error: error.message,
    });
  }
};

/**
 * ADMIN PRIZE PAYOUT
 * Route: POST /api/admin/tournaments/:tournamentId/payout
 * Description: Allows admin to manually payout prizes when organizer hasn't paid
 */
exports.adminPrizesPayout = async (req, res) => {
  try {
    const { tournamentId } = req.params;

    // Validate ObjectId FIRST
    if (!isValidObjectId(tournamentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tournament ID format",
      });
    }

    // Validate request body
    let payouts, reason;
    try {
      ({ payouts, reason } = req.body);
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        message: "Invalid JSON in request body",
        error: parseError.message,
      });
    }

    if (!payouts || !Array.isArray(payouts) || payouts.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Payouts array is required and must not be empty",
      });
    }

    // Get tournament details
    const tournament = await Tournament.findById(tournamentId)
      .populate("organizer", "fullName email lichessUsername")
      .lean();

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    if (tournament.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Can only payout completed tournaments",
      });
    }

    const results = [];
    const errors = [];

    // Process each payout
    for (const payout of payouts) {
      try {
        const { userId, position, amount } = payout;

        // Validate payout data
        if (!userId || !position || !amount || amount <= 0) {
          errors.push({
            payout,
            error:
              "Invalid payout data: userId, position, and amount are required",
          });
          continue;
        }

        // Validate userId
        if (!isValidObjectId(userId)) {
          errors.push({
            payout,
            error: "Invalid user ID format",
          });
          continue;
        }

        // Check if user exists
        const user = await User.findById(userId);
        if (!user) {
          errors.push({
            payout,
            error: "User not found",
          });
          continue;
        }

        // Check if payout already exists for this position
        const existingPayout = await Transaction.findOne({
          tournament: tournamentId,
          type: "prize_payout",
          "metadata.position": position,
          status: { $in: ["completed", "pending"] },
        });

        if (existingPayout) {
          errors.push({
            payout,
            error: `Payout for position ${position} already exists`,
          });
          continue;
        }

        // Create payout transaction
        const payoutTransaction = new Transaction({
          user: userId,
          tournament: tournamentId,
          type: "prize_payout",
          amount: amount,
          reference: `ADMIN_PAYOUT_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`,
          paymentMethod: "wallet",
          status: "completed",
          details: {
            paidBy: "admin",
            adminId: req.user._id,
            adminName: req.user.fullName,
            reason: reason || "Admin manual payout",
            originalOrganizer: tournament.organizer._id,
          },
          metadata: {
            position: position,
            tournamentTitle: tournament.title,
            adminPayout: true,
          },
        });

        await payoutTransaction.save();

        // Update user's wallet balance
        await User.findByIdAndUpdate(userId, {
          $inc: { walletBalance: amount },
        });

        // Create notification for user
        const notification = new Notification({
          user: userId,
          title: "Prize Payment Received",
          message: `You've received ₦${amount.toLocaleString()} for finishing ${position} in "${
            tournament.title
          }"`,
          type: "transaction_success",
          relatedId: payoutTransaction._id,
          relatedModel: "Transaction",
        });

        await notification.save();

        results.push({
          success: true,
          payout: {
            userId,
            userName: user.fullName,
            position,
            amount,
            transactionId: payoutTransaction._id,
          },
        });
      } catch (error) {
        console.error("Error processing individual payout:", error);
        errors.push({
          payout,
          error: error.message,
        });
      }
    }

    // Create activity log (if you have an ActivityLog model)
    const activityLog = {
      adminId: req.user._id,
      action: "admin_prize_payout",
      details: {
        tournamentId,
        tournamentTitle: tournament.title,
        totalPayouts: results.length,
        totalAmount: results.reduce((sum, r) => sum + r.payout.amount, 0),
        errors: errors.length,
        reason,
      },
      timestamp: new Date(),
    };

    // Log the activity (uncomment if you have ActivityLog model)
    // await ActivityLog.create(activityLog);

    res.status(200).json({
      success: true,
      message: `Processed ${results.length} payouts successfully`,
      data: {
        successfulPayouts: results,
        errors: errors,
        summary: {
          totalProcessed: payouts.length,
          successful: results.length,
          failed: errors.length,
          totalAmountPaid: results.reduce((sum, r) => sum + r.payout.amount, 0),
        },
      },
    });
  } catch (error) {
    console.error("Error processing admin prize payout:", error);
    res.status(500).json({
      success: false,
      message: "Error processing prize payouts",
      error: error.message,
    });
  }
};

exports.getAllDeposits = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;
    const transactionType = req.query.type || "withdrawal"; // Changed from 'deposit' to 'withdrawal'
    const status = req.query.status; // 'pending', 'withdrawal', 'failed', or undefined for all
    const search = req.query.search || "";
    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
    const dateFrom = req.query.dateFrom;
    const dateTo = req.query.dateTo;

    // Build query based on transaction type
    const query = { type: transactionType };

    // Add status filter if provided - map 'withdrawal' to 'completed' for database query
    if (status && ["pending", "withdrawal", "failed"].includes(status)) {
      // If frontend sends 'withdrawal', query for 'completed' in database
      query.status = status === "withdrawal" ? "completed" : status;
    }

    // Add date range filter
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) {
        query.createdAt.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        query.createdAt.$lte = new Date(dateTo);
      }
    }

    // Add search functionality
    if (search) {
      // Look up users by the search term, then find transactions for those users
      const users = await User.find({
        $or: [
          { fullName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { lichessUsername: { $regex: search, $options: "i" } },
        ],
      }).select("_id");

      const userIds = users.map((user) => user._id);

      // Add user IDs to the query or search by reference
      if (userIds.length > 0) {
        query.$or = [
          { user: { $in: userIds } },
          { reference: { $regex: search, $options: "i" } },
        ];
      } else {
        // If no users match, search by reference only
        query.reference = { $regex: search, $options: "i" };
      }
    }

    // Count total documents for pagination
    const totalDocs = await Transaction.countDocuments(query);

    // Create sort object
    const sort = {};
    sort[sortBy] = sortOrder;

    // Get transactions with user details using aggregation
    const transactions = await Transaction.aggregate([
      { $match: query },
      { $sort: sort },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      { $unwind: "$userDetails" },
      {
        $addFields: {
          // Add formatted date field
          date: {
            $dateToString: {
              format: "%B %d, %Y",
              date: "$createdAt",
            },
          },
          // Map 'completed' status to 'withdrawal' in response
          displayStatus: {
            $cond: {
              if: { $eq: ["$status", "completed"] },
              then: "withdrawal",
              else: "$status",
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          amount: 1,
          status: "$displayStatus", // Use the mapped status instead of original
          createdAt: 1,
          updatedAt: 1,
          reference: 1,
          paymentMethod: 1,
          details: 1,
          metadata: 1,
          type: 1,
          date: 1, // Include the formatted date
          "userDetails._id": 1,
          "userDetails.fullName": 1,
          "userDetails.email": 1,
          "userDetails.lichessUsername": 1,
          "userDetails.walletBalance": 1,
        },
      },
    ]);

    // Get counts for each status for the specific transaction type - use 'completed' for database query
    const pendingCount = await Transaction.countDocuments({
      type: transactionType,
      status: "pending",
    });
    const withdrawalCount = await Transaction.countDocuments({
      type: transactionType,
      status: "completed",
    }); // Query 'completed' but display as 'withdrawal'
    const failedCount = await Transaction.countDocuments({
      type: transactionType,
      status: "failed",
    });

    // Get total amount for completed transactions (displayed as withdrawal)
    const totalAmountResult = await Transaction.aggregate([
      { $match: { type: transactionType, status: "completed" } }, // Query for 'completed' status
      { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
    ]);
    const totalAmount =
      totalAmountResult.length > 0 ? totalAmountResult[0].totalAmount : 0;

    res.status(200).json({
      success: true,
      pagination: {
        total: totalDocs,
        page,
        limit,
        pages: Math.ceil(totalDocs / limit),
      },
      counts: {
        pending: pendingCount,
        withdrawal: withdrawalCount, // Changed from 'completed' to 'withdrawal'
        failed: failedCount,
        total: totalDocs,
      },
      stats: {
        totalAmount,
        transactionType,
      },
      data: transactions,
    });
  } catch (error) {
    console.error(`Error fetching ${transactionType}s:`, error);
    res.status(500).json({
      success: false,
      message: `Error fetching ${transactionType}s`,
      error: error.message,
    });
  }
};

/**
 * @desc    Get transaction by ID (works for both deposits and withdrawals)
 * @route   GET /api/admin/deposits/:id or /api/admin/withdrawals/:id
 * @access  Private/Admin
 */
exports.getDepositById = async (req, res) => {
  try {
    const transactionId = req.params.id;
    const transactionType = req.query.type || "withdrawal"; // Changed default to 'withdrawal'

    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid transaction ID",
      });
    }

    const transaction = await Transaction.findOne({
      _id: transactionId,
      type: transactionType,
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: `${
          transactionType.charAt(0).toUpperCase() + transactionType.slice(1)
        } not found`,
      });
    }

    // Get user details
    const user = await User.findById(transaction.user).select(
      "fullName email lichessUsername walletBalance profilePic phoneNumber"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User associated with this transaction not found",
      });
    }

    // Get transaction history for this user of the same type with formatted dates
    const transactionHistory = await Transaction.aggregate([
      {
        $match: {
          user: transaction.user,
          type: transactionType,
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $limit: 10,
      },
      {
        $addFields: {
          date: {
            $dateToString: {
              format: "%B %d, %Y",
              date: "$createdAt",
            },
          },
          // Map 'completed' status to 'withdrawal' in response
          displayStatus: {
            $cond: {
              if: { $eq: ["$status", "completed"] },
              then: "withdrawal",
              else: "$status",
            },
          },
        },
      },
      {
        $project: {
          amount: 1,
          status: "$displayStatus", // Use mapped status
          createdAt: 1,
          reference: 1,
          paymentMethod: 1,
          date: 1,
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: {
        transaction: {
          ...transaction.toObject(),
          // Map the status for display
          status:
            transaction.status === "completed"
              ? "withdrawal"
              : transaction.status,
          date: transaction.createdAt.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
        },
        user,
        transactionHistory,
      },
    });
  } catch (error) {
    console.error("Error fetching transaction details:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching transaction details",
      error: error.message,
    });
  }
};

/**
 * GET TOURNAMENT PAYOUTS
 * Route: GET /api/admin/tournaments/:tournamentId/payouts
 * Description: Get payout history for a specific tournament
 */
exports.getTournamentPayouts = async (req, res) => {
  try {
    const { tournamentId } = req.params;

    // Validate ObjectId
    if (!isValidObjectId(tournamentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tournament ID format",
      });
    }

    // Get tournament details
    const tournament = await Tournament.findById(tournamentId)
      .select("title status prizeType prizes")
      .lean();

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    // Get all payout transactions for this tournament
    const payouts = await Transaction.find({
      tournament: tournamentId,
      type: "prize_payout",
    })
      .populate("user", "fullName email lichessUsername")
      .sort({ createdAt: -1 })
      .lean();

    // Calculate summary
    const summary = {
      totalPayouts: payouts.length,
      completedPayouts: payouts.filter((p) => p.status === "completed").length,
      pendingPayouts: payouts.filter((p) => p.status === "pending").length,
      failedPayouts: payouts.filter((p) => p.status === "failed").length,
      totalAmountPaid: payouts
        .filter((p) => p.status === "completed")
        .reduce((sum, p) => sum + p.amount, 0),
      adminPayouts: payouts.filter((p) => p.metadata && p.metadata.adminPayout)
        .length,
    };

    res.status(200).json({
      success: true,
      data: {
        tournament: {
          _id: tournament._id,
          title: tournament.title,
          status: tournament.status,
        },
        payouts,
        summary,
      },
    });
  } catch (error) {
    console.error("Error getting tournament payouts:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving tournament payouts",
      error: error.message,
    });
  }
};

// Helper function for ordinal suffixes
function getOrdinalSuffix(num) {
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) return "st";
  if (j === 2 && k !== 12) return "nd";
  if (j === 3 && k !== 13) return "rd";
  return "th";
}
