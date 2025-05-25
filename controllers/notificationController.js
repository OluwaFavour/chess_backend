// Enhanced Notification Controller with Email and Push Notifications
const Notification = require('../models/Notification');
const User = require('../models/User');
const Tournament = require('../models/Tournament');
const VerificationRequest = require('../models/verification');
const Transaction = require('../models/Transaction');
const asyncHandler = require('express-async-handler');
const nodemailer = require('nodemailer');
const webpush = require('web-push');

// ==================== EMAIL CONFIGURATION ====================

// Gmail transporter setup - FIXED: Changed createTransporter to createTransport
const createEmailTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER, // Your Gmail address
      pass: process.env.GMAIL_APP_PASSWORD // Gmail App Password
    }
  });
};

// ==================== PUSH NOTIFICATION CONFIGURATION ====================

// Configure web-push
webpush.setVapidDetails(
  'mailto:' + process.env.GMAIL_USER,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// ==================== NOTIFICATION DELIVERY SERVICES ====================

// Email notification service
const sendEmailNotification = async (user, title, message, type) => {
  try {
    // Skip email if user has disabled email notifications
    if (user.emailNotifications === false) {
      return { success: false, reason: 'User disabled email notifications' };
    }

    const transporter = createEmailTransporter();
    
    // Email template based on notification type
    const emailTemplates = {
      'system_message': {
        subject: `64SQURS - ${title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0;">64SQURS</h1>
              <p style="color: white; margin: 5px 0;">Your Premier Chess Tournament Platform</p>
            </div>
            <div style="padding: 30px; background: #f9f9f9;">
              <h2 style="color: #333; margin-bottom: 20px;">${title}</h2>
              <p style="color: #666; line-height: 1.6; font-size: 16px;">${message}</p>
              <div style="margin-top: 30px; text-align: center;">
                <a href="${process.env.FRONTEND_URL}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Visit 64SQURS</a>
              </div>
            </div>
            <div style="padding: 20px; text-align: center; color: #888; font-size: 12px;">
              <p>This is an automated notification from 64SQURS. If you no longer wish to receive these emails, you can disable them in your account settings.</p>
            </div>
          </div>
        `
      },
      'tournament_created': {
        subject: `Tournament Created - ${title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0;">🏆 Tournament Created!</h1>
            </div>
            <div style="padding: 30px; background: #f9f9f9;">
              <h2 style="color: #333;">${title}</h2>
              <p style="color: #666; line-height: 1.6;">${message}</p>
              <div style="margin-top: 30px; text-align: center;">
                <a href="${process.env.FRONTEND_URL}/tournaments" style="background: #11998e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Tournaments</a>
              </div>
            </div>
          </div>
        `
      },
      'tournament_registration': {
        subject: `Tournament Registration - ${title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0;">⚡ Registration Confirmed!</h1>
            </div>
            <div style="padding: 30px; background: #f9f9f9;">
              <h2 style="color: #333;">${title}</h2>
              <p style="color: #666; line-height: 1.6;">${message}</p>
              <div style="margin-top: 30px; text-align: center;">
                <a href="${process.env.FRONTEND_URL}/my-tournaments" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">My Tournaments</a>
              </div>
            </div>
          </div>
        `
      },
      'tournament_reminder': {
        subject: `Tournament Reminder - ${title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%); padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0;">⏰ Tournament Starting Soon!</h1>
            </div>
            <div style="padding: 30px; background: #f9f9f9;">
              <h2 style="color: #333;">${title}</h2>
              <p style="color: #666; line-height: 1.6;">${message}</p>
              <div style="margin-top: 30px; text-align: center;">
                <a href="${process.env.FRONTEND_URL}/tournaments" style="background: #ff9a9e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Join Tournament</a>
              </div>
            </div>
          </div>
        `
      },
      'tournament_result': {
        subject: `Tournament Results - ${title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%); padding: 20px; text-align: center;">
              <h1 style="color: #333; margin: 0;">🎉 Tournament Results</h1>
            </div>
            <div style="padding: 30px; background: #f9f9f9;">
              <h2 style="color: #333;">${title}</h2>
              <p style="color: #666; line-height: 1.6;">${message}</p>
              <div style="margin-top: 30px; text-align: center;">
                <a href="${process.env.FRONTEND_URL}/tournaments" style="background: #fcb69f; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Results</a>
              </div>
            </div>
          </div>
        `
      },
      'transaction_success': {
        subject: `Transaction Successful - ${title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0;">✅ Transaction Successful</h1>
            </div>
            <div style="padding: 30px; background: #f9f9f9;">
              <h2 style="color: #333;">${title}</h2>
              <p style="color: #666; line-height: 1.6;">${message}</p>
              <div style="margin-top: 30px; text-align: center;">
                <a href="${process.env.FRONTEND_URL}/wallet" style="background: #11998e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Wallet</a>
              </div>
            </div>
          </div>
        `
      },
      'transaction_failed': {
        subject: `Transaction Failed - ${title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%); padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0;">❌ Transaction Failed</h1>
            </div>
            <div style="padding: 30px; background: #f9f9f9;">
              <h2 style="color: #333;">${title}</h2>
              <p style="color: #666; line-height: 1.6;">${message}</p>
              <div style="margin-top: 30px; text-align: center;">
                <a href="${process.env.FRONTEND_URL}/wallet" style="background: #ff416c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Try Again</a>
              </div>
            </div>
          </div>
        `
      },
      'account_verification': {
        subject: `Account Verification - ${title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0;">🔐 Account Verification</h1>
            </div>
            <div style="padding: 30px; background: #f9f9f9;">
              <h2 style="color: #333;">${title}</h2>
              <p style="color: #666; line-height: 1.6;">${message}</p>
              <div style="margin-top: 30px; text-align: center;">
                <a href="${process.env.FRONTEND_URL}/verification" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Verification</a>
              </div>
            </div>
          </div>
        `
      },
      'wallet_update': {
        subject: `Wallet Update - ${title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%); padding: 20px; text-align: center;">
              <h1 style="color: #333; margin: 0;">💰 Wallet Update</h1>
            </div>
            <div style="padding: 30px; background: #f9f9f9;">
              <h2 style="color: #333;">${title}</h2>
              <p style="color: #666; line-height: 1.6;">${message}</p>
              <div style="margin-top: 30px; text-align: center;">
                <a href="${process.env.FRONTEND_URL}/wallet" style="background: #fcb69f; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Wallet</a>
              </div>
            </div>
          </div>
        `
      }
    };

    const template = emailTemplates[type] || emailTemplates['system_message'];
    
    const mailOptions = {
      from: `"64SQURS" <${process.env.GMAIL_USER}>`,
      to: user.email,
      subject: template.subject,
      html: template.html
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
    
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
};

// Push notification service - FIXED: Added better validation for push subscriptions
const sendPushNotification = async (user, title, message, type, relatedId = null) => {
  try {
    // Skip push notification if user has disabled them or no valid subscription
    if (user.pushNotifications === false) {
      return { success: false, reason: 'User disabled push notifications' };
    }

    // FIXED: Better validation for push subscription
    if (!user.pushSubscription || 
        !user.pushSubscription.endpoint || 
        typeof user.pushSubscription.endpoint !== 'string' ||
        user.pushSubscription.endpoint.trim() === '') {
      return { success: false, reason: 'No valid push subscription found' };
    }

    const payload = JSON.stringify({
      title,
      body: message,
      icon: '/icon-192x192.png', // Your app icon
      badge: '/badge-72x72.png', // Small badge icon
      data: {
        type,
        relatedId,
        url: getNotificationUrl(type, relatedId),
        timestamp: new Date().toISOString()
      },
      actions: [
        {
          action: 'view',
          title: 'View',
          icon: '/view-icon.png'
        },
        {
          action: 'dismiss',
          title: 'Dismiss',
          icon: '/dismiss-icon.png'
        }
      ],
      requireInteraction: ['tournament_reminder', 'transaction_failed'].includes(type),
      vibrate: [200, 100, 200]
    });

    const result = await webpush.sendNotification(user.pushSubscription, payload);
    console.log('Push notification sent successfully');
    return { success: true, result };
    
  } catch (error) {
    console.error('Error sending push notification:', error);
    
    // If subscription is invalid, remove it from user
    if (error.statusCode === 410 || error.statusCode === 404) {
      await User.findByIdAndUpdate(user._id, { 
        $unset: { pushSubscription: 1 } 
      });
    }
    
    return { success: false, error: error.message };
  }
};

// Helper function to get URL for notification
const getNotificationUrl = (type, relatedId) => {
  const baseUrl = process.env.FRONTEND_URL;
  
  switch (type) {
    case 'tournament_created':
    case 'tournament_registration':
    case 'tournament_reminder':
    case 'tournament_result':
      return `${baseUrl}/tournaments/${relatedId}`;
    case 'transaction_success':
    case 'transaction_failed':
      return `${baseUrl}/wallet/transactions/${relatedId}`;
    case 'account_verification':
      return `${baseUrl}/verification`;
    case 'wallet_update':
      return `${baseUrl}/wallet`;
    default:
      return `${baseUrl}/notifications`;
  }
};

// @desc    Get user notifications with pagination and filtering
// @route   GET /api/notifications
// @access  Private
exports.getUserNotifications = asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    limit = 20, 
    type, 
    read, 
    sortBy = 'createdAt',
    order = 'desc' 
  } = req.query;

  // Build filter query
  const filterQuery = { user: req.user.id };
  
  if (type) {
    filterQuery.type = type;
  }
  
  if (read !== undefined) {
    filterQuery.isRead = read === 'true';
  }

  // Calculate pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const sortOrder = order === 'asc' ? 1 : -1;

  try {
    // Get notifications with pagination
    const notifications = await Notification.find(filterQuery)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(parseInt(limit))
      .populate({
        path: 'relatedId',
        select: 'title name amount', // Adjust fields based on your related models
      });

    // Get total count for pagination
    const totalNotifications = await Notification.countDocuments(filterQuery);
    const totalPages = Math.ceil(totalNotifications / parseInt(limit));

    // Get unread count
    const unreadCount = await Notification.countDocuments({
      user: req.user.id,
      isRead: false
    });

    res.status(200).json({
      success: true,
      data: {
        notifications,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalNotifications,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        },
        unreadCount
      }
    });

  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications'
    });
  }
});

// @desc    Get notification statistics for user
// @route   GET /api/notifications/stats
// @access  Private
exports.getNotificationStats = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;

    // Get overall stats
    const totalNotifications = await Notification.countDocuments({ user: userId });
    const unreadCount = await Notification.countDocuments({ user: userId, isRead: false });
    const readCount = totalNotifications - unreadCount;

    // Get stats by type
    const typeStats = await Notification.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: '$type',
          total: { $sum: 1 },
          unread: {
            $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          type: '$_id',
          total: 1,
          unread: 1,
          read: { $subtract: ['$total', '$unread'] },
          _id: 0
        }
      }
    ]);

    // Get notifications from last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentCount = await Notification.countDocuments({
      user: userId,
      createdAt: { $gte: sevenDaysAgo }
    });

    res.status(200).json({
      success: true,
      data: {
        overview: {
          total: totalNotifications,
          unread: unreadCount,
          read: readCount,
          recent: recentCount,
          unreadPercentage: totalNotifications > 0 ? Math.round((unreadCount / totalNotifications) * 100) : 0
        },
        byType: typeStats
      }
    });

  } catch (error) {
    console.error('Error fetching notification stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notification statistics'
    });
  }
});

// @desc    Mark all notifications as read for user
// @route   PUT /api/notifications/read-all
// @access  Private
exports.markAllNotificationsRead = asyncHandler(async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { 
        user: req.user.id, 
        isRead: false 
      },
      { 
        isRead: true,
        readAt: new Date()
      }
    );

    res.status(200).json({
      success: true,
      message: `Marked ${result.modifiedCount} notifications as read`,
      data: {
        modifiedCount: result.modifiedCount
      }
    });

  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking notifications as read'
    });
  }
});

// @desc    Clear all read notifications for user
// @route   DELETE /api/notifications/clear-read
// @access  Private
exports.clearReadNotifications = asyncHandler(async (req, res) => {
  try {
    // Optional: Only delete notifications older than a certain time
    const { olderThan = 7 } = req.query; // days
    const cutoffDate = new Date(Date.now() - parseInt(olderThan) * 24 * 60 * 60 * 1000);

    const deleteQuery = {
      user: req.user.id,
      isRead: true
    };

    // If olderThan is specified, only delete old read notifications
    if (olderThan) {
      deleteQuery.createdAt = { $lte: cutoffDate };
    }

    const result = await Notification.deleteMany(deleteQuery);

    res.status(200).json({
      success: true,
      message: `Cleared ${result.deletedCount} read notifications`,
      data: {
        deletedCount: result.deletedCount
      }
    });

  } catch (error) {
    console.error('Error clearing read notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Error clearing read notifications'
    });
  }
});

// @desc    Mark specific notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
exports.markNotificationRead = asyncHandler(async (req, res) => {
  try {
    const notificationId = req.params.id;

    // Find and update the specific notification
    const notification = await Notification.findOneAndUpdate(
      { 
        _id: notificationId, 
        user: req.user.id 
      },
      { 
        isRead: true
      },
      { 
        new: true,
        runValidators: true 
      }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found or unauthorized'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });

  } catch (error) {
    console.error('Error marking notification as read:', error);
    
    // Handle invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification ID format'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error marking notification as read'
    });
  }
});

// ==================== ENHANCED UTILITY FUNCTIONS ====================

// Enhanced base utility function to create notifications with email and push
exports.createNotification = async (userId, title, message, type, relatedId = null, relatedModel = null, options = {}) => {
  try {
    // Create database notification
    const notification = await Notification.create({
      user: userId,
      title,
      message,
      type,
      relatedId,
      relatedModel
    });
    
    // Get user details for email and push notifications
    const user = await User.findById(userId);
    if (!user) {
      console.error('User not found for notification:', userId);
      return notification;
    }

    // Send email notification (unless disabled in options)
    if (options.sendEmail !== false) {
      const emailResult = await sendEmailNotification(user, title, message, type);
      notification.emailSent = emailResult.success;
      notification.emailError = emailResult.success ? null : emailResult.error;
    }

    // Send push notification (unless disabled in options)
    if (options.sendPush !== false) {
      const pushResult = await sendPushNotification(user, title, message, type, relatedId);
      notification.pushSent = pushResult.success;
      notification.pushError = pushResult.success ? null : pushResult.error;
    }

    // Save notification with delivery status
    await notification.save();
    
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};

// Enhanced bulk notifications with email and push - FIXED: Better error handling for push subscriptions
exports.createBulkNotifications = async (userIds, title, message, type, relatedId = null, relatedModel = null, options = {}) => {
  try {
    // Get all users with their notification preferences
    const users = await User.find({ _id: { $in: userIds } });
    
    const notifications = [];
    const emailPromises = [];
    const pushPromises = [];
    
    for (const user of users) {
      // Create notification record
      const notificationData = {
        user: user._id,
        title,
        message,
        type,
        relatedId,
        relatedModel,
        emailSent: false,
        pushSent: false
      };
      
      notifications.push(notificationData);
      
      // Queue email notification
      if (options.sendEmail !== false) {
        emailPromises.push(
          sendEmailNotification(user, title, message, type)
            .then(result => ({ userId: user._id, ...result }))
            .catch(error => ({ userId: user._id, success: false, error: error.message }))
        );
      }
      
      // Queue push notification - FIXED: Only add if user has valid push subscription
      if (options.sendPush !== false && 
          user.pushSubscription && 
          user.pushSubscription.endpoint &&
          typeof user.pushSubscription.endpoint === 'string' &&
          user.pushSubscription.endpoint.trim() !== '') {
        pushPromises.push(
          sendPushNotification(user, title, message, type, relatedId)
            .then(result => ({ userId: user._id, ...result }))
            .catch(error => ({ userId: user._id, success: false, error: error.message }))
        );
      }
    }
    
    // Create all notifications in database
    const createdNotifications = await Notification.insertMany(notifications);
    
    // Send emails in parallel
    if (emailPromises.length > 0) {
      const emailResults = await Promise.allSettled(emailPromises);
      
      // Update notification records with email status
      for (let i = 0; i < emailResults.length; i++) {
        const result = emailResults[i];
        if (result.status === 'fulfilled' && result.value) {
          const { userId, success, error } = result.value;
          const notificationIndex = users.findIndex(user => user._id.toString() === userId.toString());
          if (notificationIndex >= 0 && createdNotifications[notificationIndex]) {
            await Notification.findByIdAndUpdate(
              createdNotifications[notificationIndex]._id,
              { 
                emailSent: success,
                emailError: success ? null : error
              }
            );
          }
        }
      }
    }
    
    // Send push notifications in parallel
    if (pushPromises.length > 0) {
      const pushResults = await Promise.allSettled(pushPromises);
      
      // Update notification records with push status
      for (let i = 0; i < pushResults.length; i++) {
        const result = pushResults[i];
        if (result.status === 'fulfilled' && result.value) {
          const { userId, success, error } = result.value;
          const notificationIndex = users.findIndex(user => user._id.toString() === userId.toString());
          if (notificationIndex >= 0 && createdNotifications[notificationIndex]) {
            await Notification.findByIdAndUpdate(
              createdNotifications[notificationIndex]._id,
              { 
                pushSent: success,
                pushError: success ? null : error
              }
            );
          }
        }
      }
    }
    
    return createdNotifications;
  } catch (error) {
    console.error('Error creating bulk notifications:', error);
    return null;
  }
};

// ==================== USER PREFERENCE MANAGEMENT ====================

// @desc    Update user notification preferences
// @route   PUT /api/notifications/preferences
// @access  Private
exports.updateNotificationPreferences = asyncHandler(async (req, res) => {
  const { emailNotifications, pushNotifications, notificationTypes } = req.body;
  
  const updateData = {};
  
  if (typeof emailNotifications === 'boolean') {
    updateData.emailNotifications = emailNotifications;
  }
  
  if (typeof pushNotifications === 'boolean') {
    updateData.pushNotifications = pushNotifications;
  }
  
  if (notificationTypes && typeof notificationTypes === 'object') {
    updateData.notificationTypes = notificationTypes;
  }
  
  const user = await User.findByIdAndUpdate(
    req.user.id,
    updateData,
    { new: true, select: 'emailNotifications pushNotifications notificationTypes' }
  );
  
  res.status(200).json({
    success: true,
    message: 'Notification preferences updated',
    data: user
  });
});

// @desc    Subscribe to push notifications
// @route   POST /api/notifications/subscribe-push
// @access  Private
exports.subscribeToPush = asyncHandler(async (req, res) => {
  const { subscription } = req.body;
  
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({
      success: false,
      message: 'Valid push subscription required'
    });
  }
  
  await User.findByIdAndUpdate(req.user.id, {
    pushSubscription: subscription,
    pushNotifications: true
  });
  
  res.status(200).json({
    success: true,
    message: 'Push notification subscription saved'
  });
});

// @desc    Unsubscribe from push notifications
// @route   DELETE /api/notifications/unsubscribe-push
// @access  Private
exports.unsubscribeFromPush = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, {
    $unset: { pushSubscription: 1 },
    pushNotifications: false
  });
  
  res.status(200).json({
    success: true,
    message: 'Push notification unsubscribed'
  });
});

// ==================== NOTIFICATION TESTING ENDPOINTS ====================

// @desc    Send test notification
// @route   POST /api/notifications/test
// @access  Private
exports.sendTestNotification = asyncHandler(async (req, res) => {
  const { type = 'system_message' } = req.body;
  
  const result = await exports.createNotification(
    req.user.id,
    'Test Notification',
    'This is a test notification to verify email and push delivery.',
    type
  );
  
  res.status(200).json({
    success: true,
    message: 'Test notification sent',
    data: result
  });
});

// 👋 Welcome to 64SQURS
// Trigger: When a user logs in for the first time using their Lichess ID
exports.notifyUserWelcome = async (userId) => {
  try {
    // Upon successful authentication and first-time sign-in detection (is_first_login == true)
    const title = "👋 Welcome to 64SQURS";
    
    // Message content matches documentation exactly
    const message = "Welcome to 64SQURS! You've successfully signed in using your Lichess ID. Explore tournaments, track your progress, and be part of a growing community of chess lovers. Let's get started!";
    
    // Triggered once per account, and only at first login
    return await exports.createNotification(
      userId,
      title,
      message,
      'system_message',
      null,
      null,
      { sendEmail: true, sendPush: true }
    );
  } catch (error) {
    console.error('Error sending welcome notification:', error);
    return null;
  }
};

// ==================== VERIFICATION NOTIFICATIONS ====================

// Notify user when verification is submitted
exports.notifyVerificationSubmitted = async (userId) => {
  try {
    const title = "Verification Submitted Successfully";
    const message = "Your account verification documents have been submitted successfully. Our team will review your documents within 24-48 hours. You'll be notified once the review is complete.";
    
    return await exports.createNotification(
      userId,
      title,
      message,
      'account_verification'
    );
  } catch (error) {
    console.error('Error sending verification submitted notification:', error);
    return null;
  }
};

// Notify user when verification is approved
exports.notifyVerificationApproved = async (userId) => {
  try {
    const title = "Account Verification Approved! ✅";
    const message = "Congratulations! Your account has been successfully verified. You now have access to all tournament features, withdrawals, and premium benefits on 64SQURS.";
    
    return await exports.createNotification(
      userId,
      title,
      message,
      'account_verification'
    );
  } catch (error) {
    console.error('Error sending verification approved notification:', error);
    return null;
  }
};

// Notify user when verification is rejected
exports.notifyVerificationRejected = async (userId, reason = '') => {
  try {
    const title = "Account Verification Needs Attention";
    const message = `Your account verification was not approved. ${reason ? `Reason: ${reason}` : ''} Please review the requirements and submit new documents. Contact support if you need assistance.`;
    
    return await exports.createNotification(
      userId,
      title,
      message,
      'account_verification'
    );
  } catch (error) {
    console.error('Error sending verification rejected notification:', error);
    return null;
  }
};

// Notify admins of new verification request
exports.notifyAdminsNewVerification = async (userId, userName) => {
  try {
    const User = require('../models/User');
    const admins = await User.find({ role: 'admin' });
    const adminIds = admins.map(admin => admin._id);

    if (adminIds.length === 0) return null;

    const title = "New Verification Request";
    const message = `${userName} has submitted new verification documents for review. Please check the admin panel to review and approve/reject the verification.`;
    
    return await exports.createBulkNotifications(
      adminIds,
      title,
      message,
      'system_message',
      userId
    );
  } catch (error) {
    console.error('Error notifying admins of new verification:', error);
    return null;
  }
};

// ==================== TOURNAMENT NOTIFICATIONS ====================

// Notify when a tournament is created
exports.notifyTournamentCreated = async (organizerId, tournamentId, tournamentTitle) => {
  try {
    const title = "Tournament Created Successfully! 🏆";
    const message = `Your tournament "${tournamentTitle}" has been created successfully and is now live on 64SQURS. Players can now register and join your tournament.`;
    
    return await exports.createNotification(
      organizerId,
      title,
      message,
      'tournament_created',
      tournamentId,
      'Tournament'
    );
  } catch (error) {
    console.error('Error sending tournament created notification:', error);
    return null;
  }
};

// ✅ You have successfully registered for [Tournament Title].
// Trigger: Immediately after a user completes payment and registration for any tournament
exports.notifyTournamentRegistration = async (userId, tournamentId, tournamentTitle) => {
  try {
    // Dynamic tournament title insertion as per documentation
    const title = `✅ You have successfully registered for ${tournamentTitle}.`;
    
    // Message content matches documentation exactly
    const message = `Your seat is secured! You've successfully registered for the ${tournamentTitle}. Make sure to prepare ahead and bring your A-game. We'll notify you when it's about to begin. Good luck!`;
    
    // Real-time trigger (within seconds after successful registration and payment confirmation)
    return await exports.createNotification(
      userId,
      title,
      message,
      'tournament_registration',
      tournamentId,
      'Tournament'
    );
  } catch (error) {
    console.error('Error sending tournament registration notification:', error);
    return null;
  }
};
// Notify organizer when someone registers for their tournament
exports.notifyOrganizerNewRegistration = async (organizerId, tournamentId, tournamentTitle, participantName) => {
  try {
    const title = "New Tournament Registration";
    const message = `${participantName} has registered for your tournament "${tournamentTitle}". Your tournament is gaining momentum!`;
    
    return await exports.createNotification(
      organizerId,
      title,
      message,
      'tournament_registration',
      tournamentId,
      'Tournament'
    );
  } catch (error) {
    console.error('Error sending organizer registration notification:', error);
    return null;
  }
};

// 🕐 [Tournament Title] is starting in 5 minutes.
// Trigger: Exactly 5 minutes before a tournament that a user has registered for begins
exports.notifyTournamentStartingInFiveMinutes = async (tournamentId) => {
  try {
    const Tournament = require('../models/Tournament');
    const tournament = await Tournament.findById(tournamentId).populate('participants');
    
    if (!tournament || tournament.participants.length === 0) {
      return null;
    }

    // Background job runs scheduled check for all tournaments user has registered for
    const participantIds = tournament.participants.map(p => p._id);
    
    // Dynamic Tournament Title insertion based on specific tournament
    const title = `🕐 ${tournament.title} is starting in 5 minutes.`;
    
    // Message content matches documentation exactly
    const message = `Get ready! The ${tournament.title} you registered for is kicking off in just 5 minutes. Make sure your board is set, and your focus is sharp. Click here to join the action now.`;
    
    // Uses tournament_start_time to calculate when to trigger this notification
    return await exports.createBulkNotifications(
      participantIds,  
      title,
      message,
      'tournament_reminder',
      tournamentId,
      'Tournament'
    );
  } catch (error) {
    console.error('Error sending 5-minute tournament notification:', error);
    return null;
  }
};

// General tournament reminder (hours before)
exports.notifyTournamentReminder = async (tournamentId, hoursBeforeStart = 1) => {
  try {
    const Tournament = require('../models/Tournament');
    const tournament = await Tournament.findById(tournamentId).populate('participants');
    
    if (!tournament || tournament.participants.length === 0) {
      return null;
    }

    const participantIds = tournament.participants.map(p => p._id);
    const timeText = hoursBeforeStart === 1 ? '1 hour' : `${hoursBeforeStart} hours`;
    const title = `Tournament Reminder - Starting in ${timeText}`;
    const message = `Don't forget! "${tournament.title}" is starting in ${timeText}. Make sure you're prepared and ready to compete for the prizes!`;
    
    return await exports.createBulkNotifications(
      participantIds,
      title,
      message,
      'tournament_reminder',
      tournamentId,
      'Tournament'
    );
  } catch (error) {
    console.error('Error sending tournament reminder:', error);
    return null;
  }
};

// Notify when tournament has started
exports.notifyTournamentStarted = async (tournamentId) => {
  try {
    const Tournament = require('../models/Tournament');
    const tournament = await Tournament.findById(tournamentId).populate('participants');
    
    if (!tournament || tournament.participants.length === 0) {
      return null;
    }

    const participantIds = tournament.participants.map(p => p._id);
    const title = "Tournament Has Started! 🚀";
    const message = `"${tournament.title}" has officially started! Head over to the tournament page and begin your matches. May the best player win!`;
    
    return await exports.createBulkNotifications(
      participantIds,
      title,
      message,
      'tournament_reminder',
      tournamentId,
      'Tournament'
    );
  } catch (error) {
    console.error('Error sending tournament started notification:', error);
    return null;
  }
};

// Notify when tournament is completed
exports.notifyTournamentCompleted = async (tournamentId) => {
  try {
    const Tournament = require('../models/Tournament');
    const tournament = await Tournament.findById(tournamentId).populate('participants');
    
    if (!tournament || tournament.participants.length === 0) {
      return null;
    }

    const participantIds = tournament.participants.map(p => p._id);
    const title = "Tournament Completed! 🏁";
    const message = `"${tournament.title}" has been completed! Check the final results and see how you performed. Thanks for participating!`;
    
    return await exports.createBulkNotifications(
      participantIds,
      title,
      message,
      'tournament_result',
      tournamentId,
      'Tournament'
    );
  } catch (error) {
    console.error('Error sending tournament completed notification:', error);
    return null;
  }
};

// 🏆 Congratulations! You won 50,000.
// Trigger: Immediately after a user wins a tournament and their prize has been computed
exports.notifyTournamentWinner = async (userId, tournamentId, tournamentTitle, position = 1, prizeAmount = 0) => {
  try {
    // Calculate prize based on position using tournament prize distribution logic
    const title = `🏆 Congratulations! You won ${prizeAmount.toLocaleString()}.`;
    
    // Message format matches documentation - no mention of position
    const message = `You've just claimed a prize of ₦${prizeAmount.toLocaleString()} in your recent tournament victory! Your gameplay was impressive, and your effort paid off. Keep playing and keep winning—more prizes await you in upcoming tournaments.`;
    
    // Triggered within 1 minute after tournament ends and results are processed
    return await exports.createNotification(
      userId,
      title,
      message,
      'tournament_result',
      tournamentId,
      'Tournament'
    );
  } catch (error) {
    console.error('Error sending tournament winner notification:', error);
    return null;
  }
};

// Notify when tournament is cancelled
exports.notifyTournamentCancelled = async (tournamentId, reason = '') => {
  try {
    const Tournament = require('../models/Tournament');
    const tournament = await Tournament.findById(tournamentId).populate('participants');
    
    if (!tournament || tournament.participants.length === 0) {
      return null;
    }

    const participantIds = tournament.participants.map(p => p._id);
    const title = "Tournament Cancelled";
    const message = `Unfortunately, "${tournament.title}" has been cancelled. ${reason ? `Reason: ${reason}` : ''} Any entry fees will be refunded to your wallet within 24 hours.`;
    
    return await exports.createBulkNotifications(
      participantIds,
      title,
      message,
      'system_message',
      tournamentId,
      'Tournament'
    );
  } catch (error) {
    console.error('Error sending tournament cancelled notification:', error);
    return null;
  }
};

// ==================== TRANSACTION NOTIFICATIONS ====================

// Notify successful transaction
exports.notifyTransactionSuccess = async (userId, transactionId, amount, type = 'payment') => {
  try {
    const title = "Transaction Successful! ✅";
    const message = `Your ${type} of ₦${amount.toLocaleString()} has been processed successfully. Your wallet has been updated accordingly.`;
    
    return await exports.createNotification(
      userId,
      title,
      message,
      'transaction_success',
      transactionId,
      'Transaction'
    );
  } catch (error) {
    console.error('Error sending transaction success notification:', error);
    return null;
  }
};

// Notify failed transaction
exports.notifyTransactionFailed = async (userId, transactionId, amount, type = 'payment', reason = '') => {
  try {
    const title = "Transaction Failed ❌";
    const message = `Your ${type} of ₦${amount.toLocaleString()} could not be processed. ${reason ? `Reason: ${reason}` : ''} Please try again or contact support if the issue persists.`;
    
    return await exports.createNotification(
      userId,
      title,
      message,
      'transaction_failed',
      transactionId,
      'Transaction'
    );
  } catch (error) {
    console.error('Error sending transaction failed notification:', error);
    return null;
  }
};

// Notify pending transaction
exports.notifyTransactionPending = async (userId, transactionId, amount, type = 'payment') => {
  try {
    const title = "Transaction Pending ⏳";
    const message = `Your ${type} of ₦${amount.toLocaleString()} is being processed. You'll be notified once the transaction is completed.`;
    
    return await exports.createNotification(
      userId,
      title,
      message,
      'transaction_success',
      transactionId,
      'Transaction'
    );
  } catch (error) {
    console.error('Error sending transaction pending notification:', error);
    return null;
  }
};

// ==================== WALLET NOTIFICATIONS ====================

// Notify wallet update
exports.notifyWalletUpdate = async (userId, amount, type, balance) => {
  try {
    const isCredit = amount > 0;
    const title = isCredit ? "Wallet Credited 💰" : "Wallet Debited 💸";
    const amountText = isCredit ? `+₦${amount.toLocaleString()}` : `-₦${Math.abs(amount).toLocaleString()}`;
    const message = `Your wallet has been ${isCredit ? 'credited' : 'debited'} with ${amountText}. Current balance: ₦${balance.toLocaleString()}.`;
    
    return await exports.createNotification(
      userId,
      title,
      message,
      'wallet_update'
    );
  } catch (error) {
    console.error('Error sending wallet update notification:', error);
    return null;
  }
};

// Notify low balance
exports.notifyLowBalance = async (userId, currentBalance, threshold = 1000) => {
  try {
    const title = "Low Wallet Balance ⚠️";
    const message = `Your wallet balance is low (₦${currentBalance.toLocaleString()}). Add funds to continue participating in tournaments and enjoy uninterrupted gaming.`;
    
    return await exports.createNotification(
      userId,
      title,
      message,
      'wallet_update'
    );
  } catch (error) {
    console.error('Error sending low balance notification:', error);
    return null;
  }
};


// 💸 Withdrawal Successful
// Trigger: Immediately after a user's withdrawal request is processed and approved
exports.notifyWithdrawalSuccess = async (userId, withdrawalAmount, transactionId = null) => {
  try {
    // Check withdrawal_status == "completed" or success == true logic
    const title = `💸 Withdrawal of ₦${withdrawalAmount.toLocaleString()} Successful!`;
    
    // Amount withdrawn is dynamically pulled from the approved request
    const message = `Your withdrawal of ₦${withdrawalAmount.toLocaleString()} has been successfully processed. The funds have been sent to your registered account. Please allow a short while for it to reflect, depending on your payment provider. Thank you for using 64SQURS!`;
    
    // Real-time trigger (as soon as payment API or internal payout confirms success)
    return await exports.createNotification(
      userId,
      title,
      message,
      'transaction_success',
      transactionId,
      'Transaction'
    );
  } catch (error) {
    console.error('Error sending withdrawal success notification:', error);
    return null;
  }
};

// ==================== SYSTEM NOTIFICATIONS ====================

// Send system announcement to all users or specific role
exports.sendSystemAnnouncement = async (title, message, userRole = 'all', options = {}) => {
  try {
    const User = require('../models/User');
    
    let users;
    if (userRole === 'all') {
      users = await User.find({});
    } else {
      users = await User.find({ role: userRole });
    }
    
    if (users.length === 0) return null;
    
    const userIds = users.map(user => user._id);
    
    return await exports.createBulkNotifications(
      userIds,
      title,
      message,
      'system_message',
      null,
      null,
      options
    );
  } catch (error) {
    console.error('Error sending system announcement:', error);
    return null;
  }
};

// ==================== SCHEDULED FUNCTIONS ====================

// Function to send 5-minute tournament reminders (called by cron job)
exports.sendFiveMinuteTournamentReminders = async () => {
  try {
    const Tournament = require('../models/Tournament');
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    
    // Find tournaments starting in exactly 5 minutes
    const tournaments = await Tournament.find({
      status: 'upcoming',
      startDate: {
        $gte: now,
        $lte: fiveMinutesFromNow
      }
    });
    
    let sentCount = 0;
    for (const tournament of tournaments) {
      const result = await exports.notifyTournamentStartingInFiveMinutes(tournament._id);
      if (result) sentCount++;
    }
    
    console.log(`Sent 5-minute reminders for ${sentCount} tournaments`);
    return sentCount;
  } catch (error) {
    console.error('Error sending 5-minute tournament reminders:', error);
    return 0;
  }
};

// Function to send general tournament reminders (called by cron job)
exports.sendScheduledTournamentReminders = async (hoursBeforeStart = 1) => {
  try {
    const Tournament = require('../models/Tournament');
    const now = new Date();
    const reminderTime = new Date(now.getTime() + hoursBeforeStart * 60 * 60 * 1000);
    
    const tournaments = await Tournament.find({
      status: 'upcoming',
      startDate: {
        $gte: now,
        $lte: reminderTime
      }
    });
    
    let sentCount = 0;
    for (const tournament of tournaments) {
      const result = await exports.notifyTournamentReminder(tournament._id, hoursBeforeStart);
      if (result) sentCount++;
    }
    
    console.log(`Sent ${hoursBeforeStart}-hour reminders for ${sentCount} tournaments`);
    return sentCount;
  } catch (error) {
    console.error('Error sending scheduled tournament reminders:', error);
    return 0;
  }
};

// Function to cleanup old notifications (called by cron job)
exports.cleanupOldNotifications = async (daysOld = 30) => {
  try {
    const Notification = require('../models/Notification');
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    
    const result = await Notification.deleteMany({
      createdAt: { $lt: cutoffDate },
      read: true
    });
    
    console.log(`Cleaned up ${result.deletedCount} old notifications`);
    return result;
  } catch (error) {
    console.error('Error cleaning up old notifications:', error);
    return { deletedCount: 0 };
  }
};

module.exports = exports;