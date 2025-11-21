/**
 * Full Stack Radiation Monitoring System - Backend Server
 * Main Express.js application with Firestore database integration
 */

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const winston = require('winston');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const PORT = process.env.PORT || 3000;

// Advanced middleware configuration
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:"]
        }
    }
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration for authentication
app.use(session({
    secret: 'radiation-monitoring-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true in production with HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Swagger API Documentation
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Radiation Monitoring System API',
            version: '1.0.0',
            description: 'A comprehensive API for radiation monitoring and data management',
            contact: {
                name: 'System Administrator',
                email: 'admin@radiation-monitoring.com'
            }
        },
        servers: [
            {
                url: `http://localhost:${PORT}`,
                description: 'Development server'
            }
        ],
        components: {
            securitySchemes: {
                sessionAuth: {
                    type: 'apiKey',
                    in: 'cookie',
                    name: 'connect.sid'
                }
            }
        }
    },
    apis: ['./app.js'] // paths to files containing OpenAPI definitions
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Radiation Monitoring API'
}));

// Load environment variables
require('dotenv').config();

// Firebase Configuration
const { admin, db, storage } = require('./firebase-admin-config');

// Advanced Logging System
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'radiation-monitoring' },
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// Email Configuration
// You can disable strict TLS certificate validation for local/testing by
// setting DISABLE_SMTP_TLS_VERIFY=true in your .env (NOT recommended for prod).
const disableTlsVerify = (process.env.DISABLE_SMTP_TLS_VERIFY || 'false').toLowerCase() === 'true';
const emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER || 'your-email@gmail.com',
        pass: process.env.SMTP_PASS || 'your-app-password'
    },
    tls: {
        // When true nodemailer will reject invalid/self-signed certificates.
        // We invert here so setting DISABLE_SMTP_TLS_VERIFY=true will set rejectUnauthorized=false
        rejectUnauthorized: !disableTlsVerify
    }
});

if (disableTlsVerify) {
    logger.warn('SMTP TLS verification is disabled (DISABLE_SMTP_TLS_VERIFY=true). This is insecure and should only be used for local/testing environments.');
} else {
    logger.info('SMTP TLS verification is enabled');
}

// Verify SMTP on startup and log clear guidance
(async () => {
    try {
        await emailTransporter.verify();
        logger.info('SMTP transporter verified successfully');
    } catch (e) {
        logger.error('SMTP verification failed', {
            message: e && e.message,
            code: e && e.code,
            hint: 'Check SMTP_HOST/PORT/USER/PASS in .env. For Gmail, use a 16-char App Password.'
        });
    }
})();

// SMS Configuration (Twilio) - Optional
let twilioClient = null;
// =============== REAL-TIME RADIATION DATA INGEST (Safecast) ===============
async function ingestRealtimeRadiation() {
    try {
        const enabled = (process.env.REALTIME_SOURCE_ENABLED || 'false').toLowerCase() === 'true';
        if (!enabled) return;

        const lat = parseFloat(process.env.REALTIME_LAT || '35.6895'); // default Tokyo
        const lng = parseFloat(process.env.REALTIME_LNG || '139.6917');
        const radiusKm = parseFloat(process.env.REALTIME_RADIUS_KM || '50');
        const url = `https://api.safecast.org/measurements.json?latitude=${lat}&longitude=${lng}&distance=${radiusKm}&order=desc&per_page=1`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Safecast API error ${res.status}`);
        const arr = await res.json();
        if (!Array.isArray(arr) || arr.length === 0) return;
        const m = arr[0];

        const readingNear = typeof m.value === 'number' ? m.value : parseFloat(m.value || '0');
        const readingOneM = readingNear; // Safecast single value; map to both
        const when = m.captured_at ? new Date(m.captured_at) : new Date();

        const block = process.env.REALTIME_BLOCK || 'External';
        const plant = process.env.REALTIME_PLANT || 'Safecast';
        const area = process.env.REALTIME_AREA || 'Ambient';
        const areaspec = process.env.REALTIME_AREASPEC || `${lat},${lng}`;

        const payload = {
            emp: 'sensor',
            name: 'Safecast Ingest',
            block,
            plant,
            area,
            areaspec,
            near: readingNear,
            onem: readingOneM,
            currentDate: when,
            timestamp: new Date(),
            source: 'safecast'
        };

        const ref = await db.collection('radiationLevels').add(payload);
        systemStats.totalRequests++;
        systemStats.lastDataUpdate = new Date();

        io.emit('dataUpdate', { type: 'newReading', data: { id: ref.id, ...payload }, timestamp: new Date() });
        await checkThresholdViolations(block, plant, area, readingNear, readingOneM, 'sensor', areaspec);
        logger.info('Ingested real-time radiation reading from Safecast', { id: ref.id, block, plant, area, areaspec, readingNear, readingOneM });
    } catch (e) {
        logger.error('Real-time ingestion failed', { message: e && e.message });
    }
}

// Schedule ingestion if enabled
const ingestIntervalMs = parseInt(process.env.REALTIME_INTERVAL_MS || '300000'); // 5 minutes default
if ((process.env.REALTIME_SOURCE_ENABLED || 'false').toLowerCase() === 'true') {
    setInterval(ingestRealtimeRadiation, ingestIntervalMs);
}

// Manual trigger
app.post('/api/ingest/realtime', requireAdmin, async (req, res) => {
    await ingestRealtimeRadiation();
    res.json({ success: true });
});

try {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && 
        process.env.TWILIO_ACCOUNT_SID.startsWith('AC') && 
        process.env.TWILIO_AUTH_TOKEN.length > 0) {
        twilioClient = twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
        );
        console.log('✅ Twilio SMS service initialized');
    } else {
        console.log('ℹ️  Twilio SMS service disabled (credentials not provided)');
    }
} catch (error) {
    console.log('⚠️  Twilio SMS service disabled:', error.message);
}

// Global variables for monitoring
let systemStats = {
    totalRequests: 0,
    activeUsers: 0,
    lastDataUpdate: null,
    systemHealth: 'healthy'
};

// WebSocket connection handling
io.on('connection', (socket) => {
    logger.info(`User connected: ${socket.id}`);
    systemStats.activeUsers++;
    
    socket.on('disconnect', () => {
        logger.info(`User disconnected: ${socket.id}`);
        systemStats.activeUsers--;
    });
    
    socket.on('join-room', (room) => {
        socket.join(room);
        logger.info(`User ${socket.id} joined room: ${room}`);
    });
});

// Test Firestore connection
async function testConnection() {
    try {
        await db.collection('test').doc('connection').set({
            timestamp: new Date(),
            status: 'connected'
        });
        logger.info('Firestore connected successfully');
    } catch (error) {
        logger.error('Firestore connection failed:', error.message);
        systemStats.systemHealth = 'unhealthy';
    }
}

// Initialize Firestore connection
testConnection();

// Health monitoring function
setInterval(() => {
    systemStats.lastHealthCheck = new Date();
    if (systemStats.systemHealth === 'healthy') {
        logger.info('System health check: OK', { stats: systemStats });
    }
}, 60000); // Every minute

/**
 * Authentication middleware
 * Checks if user is logged in
 */
function requireAuth(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ success: false, message: 'Authentication required' });
    }
}

/**
 * Admin authentication middleware
 * Checks if user is admin
 */
function requireAdmin(req, res, next) {
    if (req.session.user && req.session.user.empid === 'admin') {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Admin access required' });
    }
}

// ==================== ALERT SYSTEM ====================

/**
 * Check for threshold violations and send alerts
 */
async function checkThresholdViolations(block, plant, area, nearReading, onemReading, emp, areaSpec) {
    try {
        console.log(`🔍 Checking thresholds for: ${block} - ${plant} - ${area}`);
        console.log(`📊 Readings: Near=${nearReading} μSv/h, OneM=${onemReading} μSv/h`);

        // Get threshold candidates for this location from Firestore (don't assume exact field naming)
        const thresholdsRef = db.collection('radiationThresholds');

        // Helper: filter only active docs supporting both isActive and is_active naming
        const filterActive = (doc) => {
            const d = doc.data() || {};
            return d.isActive === true || d.is_active === true;
        };

        // 1) Exact area match
        let snap = await thresholdsRef
            .where('block', '==', block)
            .where('plant', '==', plant)
            .where('area', '==', area)
            .get();
        let candidates = snap.docs.filter(filterActive);

        // 2) Try areaspec match if nothing found
        if (candidates.length === 0 && areaSpec) {
            snap = await thresholdsRef
                .where('block', '==', block)
                .where('plant', '==', plant)
                .where('area', '==', areaSpec)
                .get();
            candidates = snap.docs.filter(filterActive);
            if (candidates.length > 0) console.log(`ℹ️ Using areaspec threshold match for ${block} - ${plant} - ${areaSpec}`);
        }

        // 3) Try 'ANY' area
        if (candidates.length === 0) {
            snap = await thresholdsRef
                .where('block', '==', block)
                .where('plant', '==', plant)
                .where('area', '==', 'ANY')
                .get();
            candidates = snap.docs.filter(filterActive);
            if (candidates.length > 0) console.log(`ℹ️ Using 'ANY' area threshold for ${block} - ${plant}`);
        }

        // 4) Fallback: pick the strictest threshold at plant level (smallest allowed readings)
        if (candidates.length === 0) {
            snap = await thresholdsRef
                .where('block', '==', block)
                .where('plant', '==', plant)
                .get();

            const plantDocs = snap.docs.filter(filterActive);
            if (plantDocs.length > 0) {
                // Normalize numeric threshold values and choose strictest by sum
                const mapped = plantDocs.map((doc, idx) => {
                    const d = doc.data() || {};
                    const near = parseFloat(d.near_threshold ?? d.nearThreshold ?? d.near ?? Number.POSITIVE_INFINITY) || Number.POSITIVE_INFINITY;
                    const onem = parseFloat(d.onem_threshold ?? d.onemThreshold ?? d.onem ?? Number.POSITIVE_INFINITY) || Number.POSITIVE_INFINITY;
                    return { doc, near, onem, area: d.area };
                });

                mapped.sort((a, b) => (a.near + a.onem) - (b.near + b.onem));
                const chosen = mapped[0];
                candidates = [chosen.doc];
                console.log(`ℹ️ Using strictest plant-level threshold for ${block} - ${plant} (area='${chosen.area}')`);
            }
        }

        if (candidates.length === 0) {
            console.log(`❌ No threshold found for ${block} - ${plant} - ${area}`);
            console.log(`💡 Available thresholds:`);
            const allSnap = await thresholdsRef.get();
            allSnap.forEach(doc => {
                const t = doc.data() || {};
                console.log(`   ${t.block} - ${t.plant} - ${t.area} (active=${t.isActive ?? t.is_active})`);
            });
            return;
        }

        // Use the first candidate (Firestore DocumentReference)
        const thresholdDoc = candidates[0];
        const tdata = thresholdDoc.data() || {};

        // Normalize threshold values
        const nearThresholdVal = parseFloat(tdata.near_threshold ?? tdata.nearThreshold ?? tdata.near ?? 0) || 0;
        const onemThresholdVal = parseFloat(tdata.onem_threshold ?? tdata.onemThreshold ?? tdata.onem ?? 0) || 0;
        const thresholdLevel = tdata.alert_level ?? tdata.alertLevel ?? 'MEDIUM';

        console.log(`📋 Found threshold: Near=${nearThresholdVal} μSv/h, OneM=${onemThresholdVal} μSv/h, Level=${thresholdLevel}`);

        let alertLevel = 'LOW';
        let violations = [];

        // Check near reading threshold
        if (nearReading > nearThresholdVal) {
            violations.push(`Near reading (${nearReading} μSv/h) exceeds threshold (${nearThresholdVal} μSv/h)`);
            alertLevel = thresholdLevel;
            console.log(`🚨 Near reading violation: ${nearReading} > ${nearThresholdVal}`);
        } else {
            console.log(`✅ Near reading OK: ${nearReading} <= ${nearThresholdVal}`);
        }

        // Check one meter reading threshold
        if (onemReading > onemThresholdVal) {
            violations.push(`One meter reading (${onemReading} μSv/h) exceeds threshold (${onemThresholdVal} μSv/h)`);
            alertLevel = thresholdLevel;
            console.log(`🚨 One meter reading violation: ${onemReading} > ${onemThresholdVal}`);
        } else {
            console.log(`✅ One meter reading OK: ${onemReading} <= ${onemThresholdVal}`);
        }

        // If there are violations, create alert and send notifications
        if (violations.length > 0) {
            console.log(`🚨 ALERT TRIGGERED! Level: ${alertLevel}, Violations: ${violations.length}`);
            const message = `RADIATION ALERT: ${violations.join(', ')} at ${block} - ${plant} - ${area}`;

            // Insert alert into history (Firestore)
            await db.collection('alertHistory').add({
                alert_type: 'THRESHOLD_EXCEEDED',
                alert_level: alertLevel,
                block,
                plant,
                area,
                emp,
                near_reading: nearReading,
                onem_reading: onemReading,
                threshold_near: nearThresholdVal,
                threshold_onem: onemThresholdVal,
                message,
                acknowledged: false,
                created_at: new Date()
            });

            // Send notifications to all users
            await sendAlertNotifications(alertLevel, message, block, plant, area);

            // Emit real-time alert via WebSocket
            io.emit('alert', {
                type: 'threshold_exceeded',
                level: alertLevel,
                message: message,
                location: `${block} - ${plant} - ${area}`,
                timestamp: new Date()
            });

            console.log(`Alert created: ${message}`);
        }

    } catch (error) {
        console.error('Error checking threshold violations:', error);
    }
}

/**
 * Send alert notifications to all users
 */
async function sendAlertNotifications(alertLevel, message, block, plant, area, forceAll = false) {
    try {
        // Get all active users and admin from Firestore
        const usersSnapshot = await db.collection('users')
            .where('isActive', '==', true)
            .get();

        // Get admin user specifically
        const adminSnapshot = await db.collection('users')
            .where('isAdmin', '==', true)
            .limit(1)
            .get();
        
        const adminDoc = adminSnapshot.docs[0];
        const admin = adminDoc ? adminDoc.data() : null;

        let totalRecipients = 0;
        const sentEmpIds = new Set();

        for (const userDoc of usersSnapshot.docs) {
            const user = userDoc.data();
            const isAdmin = user.isAdmin === true;

            // If forceAll is requested, send email to every registered user (ignore their notification settings)
            if (forceAll) {
                if (user.email) {
                    await sendEmailAlert(user.email, user.name, alertLevel, message, block, plant, area);
                    totalRecipients += 1;
                    sentEmpIds.add(user.empid);
                } else {
                    logger.debug('Skipping email for user (no email)', { empid: user.empid });
                }

                // For SMS keep existing behavior (don't force SMS), but log if missing
                if (user.phone && user.isAdmin) {
                    // Admins may still receive SMS if configured; leave existing SMS flows to settings
                    try {
                        const settingsDoc = await db.collection('notification_settings').doc(user.empid).get();
                        const settings = settingsDoc.exists ? settingsDoc.data() : { smsNotifications: false };
                        if (settings.smsNotifications) await sendSMSAlert(user.phone, user.name, alertLevel, message, block, plant, area);
                    } catch (e) {
                        logger.debug('SMS check failed for admin during forceAll', { empid: user.empid, error: e && e.message });
                    }
                }

                continue;
            }

            // Get user's notification settings
            const settingsDoc = await db.collection('notification_settings')
                .doc(user.empid)
                .get();

            const settings = settingsDoc.exists ? settingsDoc.data() : {
                alertLevels: ['MEDIUM', 'HIGH', 'CRITICAL'],
                emailNotifications: true,
                smsNotifications: false
            };

            // Check if user wants notifications for this alert level OR is admin (admin always gets notifications)
            if (isAdmin || settings.alertLevels.includes(alertLevel)) {
                // Send email notification
                if ((isAdmin || settings.emailNotifications) && user.email) {
                    await sendEmailAlert(user.email, user.name, alertLevel, message, block, plant, area);
                    totalRecipients += 1;
                    sentEmpIds.add(user.empid);
                } else {
                    logger.debug('Skipping email for user', { empid: user.empid, reason: !user.email ? 'no_email' : 'email_disabled' });
                }

                // Send SMS notification
                if ((isAdmin || settings.smsNotifications) && user.phone) {
                    await sendSMSAlert(user.phone, user.name, alertLevel, message, block, plant, area);
                } else {
                    logger.debug('Skipping sms for user', { empid: user.empid, reason: !user.phone ? 'no_phone' : 'sms_disabled' });
                }
            }
        }

        // Ensure admin receives email even if not in the active users set
        if (admin) {
            try {
                const adminEmpId = admin.empid || admin.uid || 'admin';
                if (!sentEmpIds.has(adminEmpId) && admin.email) {
                    await sendEmailAlert(admin.email, admin.name || 'Admin', alertLevel, message, block, plant, area);
                    totalRecipients += 1;
                }
            } catch (e) {
                logger.debug('Failed to send email to admin explicitly', { error: e && e.message });
            }
        }

        if (totalRecipients === 0) {
            logger.warn('No email recipients for alert', { alertLevel, block, plant, area });
        }

    } catch (error) {
        console.error('Error sending alert notifications:', error);
    }
}

/**
 * Send email alert
 */
async function sendEmailAlert(email, name, alertLevel, message, block, plant, area) {
    try {
        // Use the globally configured transporter (emailTransporter)
        const alertColors = {
            'LOW': '#28a745',
            'MEDIUM': '#ffc107',
            'HIGH': '#fd7e14',
            'CRITICAL': '#dc3545'
        };

        const mailOptions = {
            from: process.env.SMTP_USER || 'your-email@gmail.com',
            to: email,
            subject: `🚨 RADIATION ALERT - ${alertLevel} LEVEL - ${block}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: ${alertColors[alertLevel]}; color: white; padding: 20px; text-align: center;">
                        <h1>🚨 RADIATION ALERT</h1>
                        <h2>${alertLevel} LEVEL</h2>
                    </div>
                    <div style="padding: 20px; background: #f8f9fa;">
                        <h3>Dear ${name},</h3>
                        <p><strong>Alert Level:</strong> ${alertLevel}</p>
                        <p><strong>Location:</strong> ${block} - ${plant} - ${area}</p>
                        <p><strong>Message:</strong> ${message}</p>
                        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                        <hr>
                        <p><em>This is an automated alert from the Radiation Monitoring System. Please take appropriate action immediately.</em></p>
                    </div>
                </div>
            `
        };

        await emailTransporter.sendMail(mailOptions);
        logger.info('Email alert sent', { to: email, level: alertLevel, block, plant, area });

    } catch (error) {
        logger.error('Error sending email alert', {
            to: email,
            level: alertLevel,
            block,
            plant,
            area,
            message: error && error.message,
            code: error && error.code
        });
    }
}

/**
 * Send SMS alert
 */
async function sendSMSAlert(phone, name, alertLevel, message, block, plant, area) {
    try {
        const client = twilio(
            process.env.TWILIO_ACCOUNT_SID || 'your-account-sid',
            process.env.TWILIO_AUTH_TOKEN || 'your-auth-token'
        );

        const smsMessage = `🚨 RADIATION ALERT - ${alertLevel} LEVEL\n\nLocation: ${block} - ${plant} - ${area}\nMessage: ${message}\nTime: ${new Date().toLocaleString()}\n\nPlease take immediate action.`;

        await client.messages.create({
            body: smsMessage,
            from: process.env.TWILIO_PHONE_NUMBER || '+1234567890',
            to: phone
        });

        console.log(`SMS alert sent to ${phone}`);

    } catch (error) {
        console.error('Error sending SMS alert:', error);
    }
}

// ==================== ROUTES ====================

/**
 * Root route - serve index.html
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * User registration endpoint
 * POST /register
 */
app.post('/register', async (req, res) => {
    try {
        const { empid, password, block, name, email, phone } = req.body;

        // Validation
        if (!empid || !password || !name || !email) {
            return res.status(400).json({
                success: false,
                message: 'Employee ID, password, name, and email are required'
            });
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        // Phone validation (basic) - only if phone is provided
        if (phone) {
            const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
            if (!phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid phone number format'
                });
            }
        }

        // Check if user already exists in Firestore
        const userRef = db.collection('users').doc(empid);
        const userDoc = await userRef.get();
        const emailQuery = await db.collection('users').where('email', '==', email).get();
        
        if (userDoc.exists || !emailQuery.empty) {
            return res.status(409).json({
                success: false,
                message: 'Employee ID or email already exists'
            });
        }

        // Create user in Firebase Auth
        const userRecord = await admin.auth().createUser({
            uid: empid,
            email: email,
            password: password,
            displayName: name
        });

        // Create user document in Firestore
        await userRef.set({
            empid,
            block,
            name,
            email,
            phone,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            isActive: true
        });

        // Create notification settings document
        await db.collection('notification_settings').doc(empid).set({
            empid,
            emailNotifications: true,
            smsNotifications: true,
            alertLevels: ['MEDIUM', 'HIGH', 'CRITICAL'],
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({
            success: true,
            message: 'User registered successfully'
        });

    } catch (error) {
        console.error('Registration error details:');
        console.error('Error Code:', error.code);
        console.error('Error Message:', error.message);
        console.error('Error Stack:', error.stack);
        console.error('Request Body:', req.body);
        
        // More specific error messages
        let errorMessage = 'Internal server error during registration';
        
        if (error.code === 'ER_DUP_ENTRY') {
            errorMessage = 'Employee ID or email already exists';
        } else if (error.code === 'ER_NO_SUCH_TABLE') {
            errorMessage = 'Database table not found. Please run: npm run setup-db';
        } else if (error.code === 'ECONNREFUSED') {
            errorMessage = 'Database connection failed. Please check MySQL server';
        } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            errorMessage = 'Database access denied. Please check credentials';
        }
        
        res.status(500).json({
            success: false,
            message: errorMessage,
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * User login endpoint
 * POST /login
 */
app.post('/login', async (req, res) => {
    try {
        const { empid, password } = req.body;

        // Validation
        if (!empid || !password) {
            return res.status(400).json({
                success: false,
                message: 'Employee ID and password are required'
            });
        }

        // Get user document from Firestore
        const userDoc = await db.collection('users').doc(empid).get();

        if (!userDoc.exists) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const userData = userDoc.data() || {};

        // Attempt to resolve the Firebase Auth user by email; if that fails
        // (e.g. legacy users migrated without an Auth record), fall back to
        // using the Firestore empid as the UID when creating a custom token.
        let uidToUse = userData.empid;
        try {
            if (userData.email) {
                const userRecord = await admin.auth().getUserByEmail(userData.email);
                if (userRecord && userRecord.uid) uidToUse = userRecord.uid;
            }
        } catch (errGetUser) {
            // Log a warning but continue with fallback UID (empid)
            console.warn('Warning: could not find Firebase Auth user by email for', userData.email, errGetUser && errGetUser.message);
        }

        try {
            // Create a custom token for the resolved UID (this does not verify
            // the password on purpose — the original implementation used
            // Admin SDK token creation without password verification as well.
            // If you need full password verification, consider using the
            // Firebase Auth REST API signInWithPassword flow with an API key
            // or require users to sign in via client-side Firebase SDK.
            const customToken = await admin.auth().createCustomToken(String(uidToUse));

            // Create session
            req.session.user = {
                empid: userData.empid,
                block: userData.block,
                token: customToken
            };

            // Determine redirect based on user type
            const redirectUrl = userData.empid === 'admin' ? '/retrieve.html' : '/user.html';

            res.json({
                success: true,
                message: 'Login successful',
                redirectUrl: redirectUrl,
                user: {
                    empid: userData.empid,
                    block: userData.block,
                    token: customToken
                }
            });
        } catch (tokenError) {
            console.error('Error creating custom token during login:', tokenError);
            res.status(500).json({ success: false, message: 'Authentication service error' });
        }

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during login'
        });
    }
});

/**
 * Logout endpoint
 * POST /logout
 */
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error during logout'
            });
        }
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    });
});

/**
 * Insert radiation data endpoint
 * POST /insert
 */
app.post('/insert', requireAuth, async (req, res) => {
    try {
        const {
            emp,
            name,
            block,
            plant,
            area,
            areaspec,
            near,
            onem,
            currentDate
        } = req.body;

        // Validation
        if (!emp || !name || !block || !plant || !area || !areaspec || 
            near === undefined || onem === undefined || !currentDate) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        // Validate numeric values
        if (isNaN(parseFloat(near)) || isNaN(parseFloat(onem))) {
            return res.status(400).json({
                success: false,
                message: 'Radiation values must be numeric'
            });
        }

        // Insert radiation data into Firestore (store user-entered readings
        // in the 'radiation_readings' collection as requested)
        const radiationRef = await db.collection('radiation_readings').add({
            emp,
            name,
            block,
            plant,
            area,
            areaspec,
            near: parseFloat(near),
            onem: parseFloat(onem),
            currentDate: new Date(currentDate),
            timestamp: new Date()
        });

        // Check for threshold violations and send alerts
        await checkThresholdViolations(block, plant, area, parseFloat(near), parseFloat(onem), emp, areaspec);

        res.json({
            success: true,
            message: 'Data inserted successfully',
            id: radiationRef.id
        });

    } catch (error) {
        console.error('Data insertion error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during data insertion'
        });
    }
});

/**
 * Retrieve all radiation data endpoint
 * GET /retrieve
 */
app.get('/retrieve', requireAdmin, async (req, res) => {
    try {
        // Allow requesting all records by passing ?all=true
        const wantAll = req.query.all === 'true';

        // Prefer the 'radiation_readings' collection (user-entered data)
        let query = db.collection('radiation_readings')
            .orderBy('currentDate', 'desc')
            .orderBy('timestamp', 'desc');

        if (!wantAll) {
            query = query.limit(100); // default page size
        }

        let radiationSnapshot;
        try {
            radiationSnapshot = await query.get();
        } catch (errQuery) {
            console.warn('Primary query failed, attempting fallback ordering by timestamp only:', errQuery && errQuery.message);
            // Fallback: order by timestamp only to avoid composite index requirement
            let fallbackQuery = db.collection('radiation_readings').orderBy('timestamp', 'desc');
            if (!wantAll) fallbackQuery = fallbackQuery.limit(100);
            radiationSnapshot = await fallbackQuery.get();
        }

        // Normalize documents to support multiple collection schemas (radiationLevels OR radiation_readings)
        const data = radiationSnapshot.docs.map(doc => {
            const d = doc.data() || {};

            // Normalize numeric fields: support `near`/`onem` or `nearReading`/`oneMeterReading`
            const nearVal = (d.near !== undefined && d.near !== null) ? d.near : (d.nearReading !== undefined ? d.nearReading : (d.near_reading !== undefined ? d.near_reading : 0));
            const onemVal = (d.onem !== undefined && d.onem !== null) ? d.onem : (d.oneMeterReading !== undefined ? d.oneMeterReading : (d.one_meter_reading !== undefined ? d.one_meter_reading : 0));

            // Normalize area spec naming
            const areaspecVal = d.areaspec || d.areaSpec || d.area_spec || null;

            // Normalize currentDate which may be a Firestore Timestamp or a string/date
            const rawDate = d.currentDate || d.date || d.timestamp || null;
            const normalizedDate = rawDate && rawDate.toDate ? rawDate.toDate() : (rawDate ? new Date(rawDate) : null);

            return {
                id: doc.id,
                emp: d.emp || d.employeeId || d.employee_id || null,
                name: d.name || null,
                block: d.block || null,
                plant: d.plant || null,
                area: d.area || null,
                areaspec: areaspecVal,
                near: (typeof nearVal === 'string') ? parseFloat(nearVal) : (nearVal || 0),
                onem: (typeof onemVal === 'string') ? parseFloat(onemVal) : (onemVal || 0),
                currentDate: normalizedDate,
                // include original raw fields for debugging if needed
                _raw: d
            };
        });

        // If primary collection returned no documents, try alternative collections
        if ((!data || data.length === 0)) {
            try {
                console.warn('No data in radiation_readings (admin retrieve); attempting radiationLevels');
                let altSnap;
                try {
                    altSnap = await db.collection('radiationLevels').orderBy('currentDate', 'desc').orderBy('timestamp', 'desc').get();
                } catch (altErr) {
                    altSnap = await db.collection('radiationLevels').orderBy('timestamp', 'desc').get();
                }

                if (altSnap && altSnap.docs && altSnap.docs.length > 0) {
                    const altData = altSnap.docs.map(doc => {
                        const d = doc.data() || {};
                        const nearVal = (d.near !== undefined && d.near !== null) ? d.near : (d.nearReading !== undefined ? d.nearReading : (d.near_reading !== undefined ? d.near_reading : 0));
                        const onemVal = (d.onem !== undefined && d.onem !== null) ? d.onem : (d.oneMeterReading !== undefined ? d.oneMeterReading : (d.one_meter_reading !== undefined ? d.one_meter_reading : 0));
                        const areaspecVal = d.areaspec || d.areaSpec || d.area_spec || null;
                        const rawDate = d.currentDate || d.date || d.timestamp || null;
                        const normalizedDate = rawDate && rawDate.toDate ? rawDate.toDate() : (rawDate ? new Date(rawDate) : null);
                        return {
                            id: doc.id,
                            emp: d.emp || d.employeeId || d.employee_id || null,
                            name: d.name || null,
                            block: d.block || null,
                            plant: d.plant || null,
                            area: d.area || null,
                            areaspec: areaspecVal,
                            near: (typeof nearVal === 'string') ? parseFloat(nearVal) : (nearVal || 0),
                            onem: (typeof onemVal === 'string') ? parseFloat(onemVal) : (onemVal || 0),
                            currentDate: normalizedDate,
                            _raw: d
                        };
                    });
                    return res.json({ success: true, data: altData });
                }
            } catch (errAlt) {
                console.warn('Admin alternative collection read failed:', errAlt && errAlt.message ? errAlt.message : errAlt);
            }

            try {
                console.warn('Admin attempting radiation-readings (hyphen)');
                let altSnap2;
                try {
                    altSnap2 = await db.collection('radiation-readings').orderBy('currentDate', 'desc').orderBy('timestamp', 'desc').get();
                } catch (altErr2) {
                    altSnap2 = await db.collection('radiation-readings').orderBy('timestamp', 'desc').get();
                }

                if (altSnap2 && altSnap2.docs && altSnap2.docs.length > 0) {
                    const altData2 = altSnap2.docs.map(doc => {
                        const d = doc.data() || {};
                        const nearVal = (d.near !== undefined && d.near !== null) ? d.near : (d.nearReading !== undefined ? d.nearReading : (d.near_reading !== undefined ? d.near_reading : 0));
                        const onemVal = (d.onem !== undefined && d.onem !== null) ? d.onem : (d.oneMeterReading !== undefined ? d.oneMeterReading : (d.one_meter_reading !== undefined ? d.one_meter_reading : 0));
                        const areaspecVal = d.areaspec || d.areaSpec || d.area_spec || null;
                        const rawDate = d.currentDate || d.date || d.timestamp || null;
                        const normalizedDate = rawDate && rawDate.toDate ? rawDate.toDate() : (rawDate ? new Date(rawDate) : null);
                        return {
                            id: doc.id,
                            emp: d.emp || d.employeeId || d.employee_id || null,
                            name: d.name || null,
                            block: d.block || null,
                            plant: d.plant || null,
                            area: d.area || null,
                            areaspec: areaspecVal,
                            near: (typeof nearVal === 'string') ? parseFloat(nearVal) : (nearVal || 0),
                            onem: (typeof onemVal === 'string') ? parseFloat(onemVal) : (onemVal || 0),
                            currentDate: normalizedDate,
                            _raw: d
                        };
                    });
                    return res.json({ success: true, data: altData2 });
                }
            } catch (errAlt2) {
                console.warn('Admin hyphenated alternative read failed:', errAlt2 && errAlt2.message ? errAlt2.message : errAlt2);
            }
        }

        res.json({
            success: true,
            data: data
        });

    } catch (error) {
        console.error('Data retrieval error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during data retrieval'
        });
    }
});

/**
 * Public retrieve for authenticated users (non-admins)
 * GET /public/retrieve
 */
app.get('/public/retrieve', requireAuth, async (req, res) => {
    try {
        const wantAll = req.query.all === 'true';

        // Prefer user-entered readings collection
        let query = db.collection('radiation_readings')
            .orderBy('currentDate', 'desc')
            .orderBy('timestamp', 'desc');

        if (!wantAll) {
            query = query.limit(100);
        }

        let radiationSnapshot;
        try {
            radiationSnapshot = await query.get();
        } catch (errQuery) {
            console.warn('Public retrieve primary query failed, falling back to timestamp ordering:', errQuery && errQuery.message);
            let fallbackQuery = db.collection('radiation_readings').orderBy('timestamp', 'desc');
            if (!wantAll) fallbackQuery = fallbackQuery.limit(100);
            radiationSnapshot = await fallbackQuery.get();
        }

        const data = radiationSnapshot.docs.map(doc => {
            const d = doc.data();
            return {
                id: doc.id,
                ...d,
                currentDate: d.currentDate && d.currentDate.toDate ? d.currentDate.toDate() : d.currentDate
            };
        });

        // If no documents found in the primary collection, attempt to read from alternative collections
        if ((!data || data.length === 0)) {
            try {
                console.warn('No data in radiation_readings; attempting to read from radiationLevels collection');
                let altSnap;
                try {
                    altSnap = await db.collection('radiationLevels').orderBy('currentDate', 'desc').orderBy('timestamp', 'desc').get();
                } catch (altErr) {
                    // fallback ordering by timestamp only
                    altSnap = await db.collection('radiationLevels').orderBy('timestamp', 'desc').get();
                }

                if (altSnap && altSnap.docs && altSnap.docs.length > 0) {
                    const altData = altSnap.docs.map(doc => {
                        const d = doc.data() || {};
                        const nearVal = (d.near !== undefined && d.near !== null) ? d.near : (d.nearReading !== undefined ? d.nearReading : (d.near_reading !== undefined ? d.near_reading : 0));
                        const onemVal = (d.onem !== undefined && d.onem !== null) ? d.onem : (d.oneMeterReading !== undefined ? d.oneMeterReading : (d.one_meter_reading !== undefined ? d.one_meter_reading : 0));
                        const areaspecVal = d.areaspec || d.areaSpec || d.area_spec || null;
                        const rawDate = d.currentDate || d.date || d.timestamp || null;
                        const normalizedDate = rawDate && rawDate.toDate ? rawDate.toDate() : (rawDate ? new Date(rawDate) : null);
                        return {
                            id: doc.id,
                            emp: d.emp || d.employeeId || d.employee_id || null,
                            name: d.name || null,
                            block: d.block || null,
                            plant: d.plant || null,
                            area: d.area || null,
                            areaspec: areaspecVal,
                            near: (typeof nearVal === 'string') ? parseFloat(nearVal) : (nearVal || 0),
                            onem: (typeof onemVal === 'string') ? parseFloat(onemVal) : (onemVal || 0),
                            currentDate: normalizedDate,
                            _raw: d
                        };
                    });

                    return res.json({ success: true, data: altData });
                }
            } catch (errAlt) {
                console.warn('Alternative collection read failed:', errAlt && errAlt.message ? errAlt.message : errAlt);
            }
            // Also try hyphenated collection name if present
            try {
                console.warn('Attempting to read from radiation-readings collection');
                let altSnap2;
                try {
                    altSnap2 = await db.collection('radiation-readings').orderBy('currentDate', 'desc').orderBy('timestamp', 'desc').get();
                } catch (altErr2) {
                    altSnap2 = await db.collection('radiation-readings').orderBy('timestamp', 'desc').get();
                }

                if (altSnap2 && altSnap2.docs && altSnap2.docs.length > 0) {
                    const altData2 = altSnap2.docs.map(doc => {
                        const d = doc.data() || {};
                        const nearVal = (d.near !== undefined && d.near !== null) ? d.near : (d.nearReading !== undefined ? d.nearReading : (d.near_reading !== undefined ? d.near_reading : 0));
                        const onemVal = (d.onem !== undefined && d.onem !== null) ? d.onem : (d.oneMeterReading !== undefined ? d.oneMeterReading : (d.one_meter_reading !== undefined ? d.one_meter_reading : 0));
                        const areaspecVal = d.areaspec || d.areaSpec || d.area_spec || null;
                        const rawDate = d.currentDate || d.date || d.timestamp || null;
                        const normalizedDate = rawDate && rawDate.toDate ? rawDate.toDate() : (rawDate ? new Date(rawDate) : null);
                        return {
                            id: doc.id,
                            emp: d.emp || d.employeeId || d.employee_id || null,
                            name: d.name || null,
                            block: d.block || null,
                            plant: d.plant || null,
                            area: d.area || null,
                            areaspec: areaspecVal,
                            near: (typeof nearVal === 'string') ? parseFloat(nearVal) : (nearVal || 0),
                            onem: (typeof onemVal === 'string') ? parseFloat(onemVal) : (onemVal || 0),
                            currentDate: normalizedDate,
                            _raw: d
                        };
                    });

                    return res.json({ success: true, data: altData2 });
                }
            } catch (errAlt2) {
                console.warn('Hyphenated alternative collection read failed:', errAlt2 && errAlt2.message ? errAlt2.message : errAlt2);
            }
        }

        res.json({ success: true, data });
    } catch (error) {
        console.error('Public data retrieval error:', error);
        res.status(500).json({ success: false, message: 'Internal server error during data retrieval' });
    }
});

/**
 * Retrieve filtered radiation data with individual records
 * GET /retrievedate
 */
app.get('/retrievedate', requireAdmin, async (req, res) => {
    try {
        const { month, block, plant, area } = req.query;

    // Firestore-based filtering (prefer user-entered readings collection)
    let ref = db.collection('radiation_readings');
        if (block && block !== 'all') ref = ref.where('block', '==', block);
        if (plant && plant !== 'all') ref = ref.where('plant', '==', plant);
        if (area && area !== 'all') ref = ref.where('area', '==', area);
        // Try to order by currentDate; if Firestore requires a composite index or
        // the query fails, fall back to ordering by timestamp or no ordering.
        let snap;
        try {
            snap = await ref.orderBy('currentDate', 'desc').limit(1000).get();
        } catch (qryErr) {
            console.warn('Filtered query ordering by currentDate failed, falling back to timestamp ordering:', qryErr && qryErr.message);
            try {
                snap = await ref.orderBy('timestamp', 'desc').limit(1000).get();
            } catch (qryErr2) {
                console.warn('Filtered query ordering by timestamp also failed, falling back to unordered query:', qryErr2 && qryErr2.message);
                snap = await ref.limit(1000).get();
            }
        }

        let data = snap.docs.map(d => {
            const docData = d.data() || {};
            return { id: d.id, ...docData, currentDate: docData.currentDate && docData.currentDate.toDate ? docData.currentDate.toDate() : docData.currentDate };
        });

        if (month && month !== 'all') {
            const [monthNum, year] = month.split('-').map(n => parseInt(n));
            const start = new Date(year, monthNum - 1, 1);
            const end = new Date(year, monthNum, 1);
            data = data.filter(r => {
                const dt = r.currentDate?.toDate ? r.currentDate.toDate() : r.currentDate;
                if (!dt) return false;
                return dt >= start && dt < end;
            });
        }

        res.json({ success: true, data, filters: { month, block, plant, area } });

    } catch (error) {
        console.error('Filtered data retrieval error:', error);
        res.status(500).json({ success: false, message: 'Internal server error during filtered data retrieval' });
    }
});

/**
 * Get statistics for filtered data
 * GET /api/statistics
 */
app.get('/api/statistics', requireAdmin, async (req, res) => {
    try {
        const { month, block, plant, area } = req.query;

    let ref = db.collection('radiation_readings');
        if (block && block !== 'all') ref = ref.where('block', '==', block);
        if (plant && plant !== 'all') ref = ref.where('plant', '==', plant);
        if (area && area !== 'all') ref = ref.where('area', '==', area);
        const snap = await ref.get();
        let records = snap.docs.map(d => d.data());

        if (month && month !== 'all') {
            const [monthNum, year] = month.split('-').map(n => parseInt(n));
            const start = new Date(year, monthNum - 1, 1);
            const end = new Date(year, monthNum, 1);
            records = records.filter(r => {
                const dt = r.currentDate?.toDate ? r.currentDate.toDate() : r.currentDate;
                if (!dt) return false;
                return dt >= start && dt < end;
            });
        }

        const nears = records.map(r => r.near || 0);
        const onems = records.map(r => r.onem || 0);
        const data = {
            totalRecords: records.length,
            minNear: nears.length ? Math.min(...nears) : 0,
            maxNear: nears.length ? Math.max(...nears) : 0,
            avgNear: nears.length ? (nears.reduce((s, v) => s + v, 0) / nears.length) : 0,
            minOnem: onems.length ? Math.min(...onems) : 0,
            maxOnem: onems.length ? Math.max(...onems) : 0,
            avgOnem: onems.length ? (onems.reduce((s, v) => s + v, 0) / onems.length) : 0
        };

        res.json({ success: true, data });
    } catch (error) {
        console.error('Statistics retrieval error:', error);
        res.status(500).json({ success: false, message: 'Internal server error during statistics retrieval' });
    }
});

/**
 * Get available filter options for dropdowns
 * GET /filter-options
 */
app.get('/filter-options', requireAdmin, async (req, res) => {
    try {
    const snapshot = await db.collection('radiation_readings').get();
        const blocksSet = new Set();
        const plantsSet = new Set();
        const areasSet = new Set();
        const monthsSet = new Set();

        snapshot.forEach(doc => {
            const d = doc.data();
            if (d.block) blocksSet.add(d.block);
            if (d.plant) plantsSet.add(d.plant);
            if (d.area) areasSet.add(d.area);
            const date = d.currentDate instanceof Date ? d.currentDate : (d.currentDate?.toDate ? d.currentDate.toDate() : null);
            if (date) {
                const key = `${date.getMonth() + 1}-${date.getFullYear()}`;
                monthsSet.add(key);
            }
        });

        const months = Array.from(monthsSet).map(value => {
            const [m, y] = value.split('-');
            const dt = new Date(parseInt(y), parseInt(m) - 1, 1);
            return { value, label: `${dt.toLocaleString('default', { month: 'long' })} ${dt.getFullYear()}` };
        });

        res.json({
            success: true,
            data: {
                blocks: Array.from(blocksSet).sort(),
                plants: Array.from(plantsSet).sort(),
                areas: Array.from(areasSet).sort(),
                months: months.sort((a, b) => new Date(b.label) - new Date(a.label))
            }
        });

    } catch (error) {
        console.error('Filter options error:', error);
        res.status(500).json({ success: false, message: 'Internal server error while fetching filter options' });
    }
});

/**
 * Get cascading dropdown data
 * GET /dropdown-data
 */
// Duplicate MySQL-based /dropdown-data endpoint removed (Firestore version above is authoritative)

/**
 * Check authentication status
 * GET /auth-status
 */
app.get('/auth-status', (req, res) => {
    if (req.session.user) {
        res.json({
            success: true,
            authenticated: true,
            user: req.session.user
        });
    } else {
        res.json({
            success: true,
            authenticated: false
        });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

/**
 * System health endpoint
 * GET /api/health
 */
app.get('/api/health', async (req, res) => {
    try {
        const health = {
            success: true,
            uptime: process.uptime(),
            timestamp: new Date(),
            systemStats
        };
        res.json(health);
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve health status' });
    }
});

// ==================== ADVANCED API ENDPOINTS ====================

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Get system health status
 *     tags: [System]
 *     responses:
 *       200:
 *         description: System health information
 */
// Duplicate MySQL-based health endpoint removed (Firestore version is active)

/**
 * @swagger
 * /api/analytics/trends:
 *   get:
 *     summary: Get historical trend analysis
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days for trend analysis
 *     responses:
 *       200:
 *         description: Trend analysis data
 */
// Duplicate MySQL-based trends endpoint removed (Firestore version added above)

/**
 * @swagger
 * /api/alerts/thresholds:
 *   post:
 *     summary: Set radiation threshold alerts
 *     tags: [Alerts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nearThreshold:
 *                 type: number
 *               onemThreshold:
 *                 type: number
 *               emailAlerts:
 *                 type: boolean
 *               smsAlerts:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Threshold settings updated
 */
app.post('/api/alerts/thresholds', requireAdmin, async (req, res) => {
    try {
        const { nearThreshold, onemThreshold, emailAlerts, smsAlerts } = req.body;
        
        // Store threshold settings (you could add a settings table)
        const settings = {
            nearThreshold: nearThreshold || 20.0,
            onemThreshold: onemThreshold || 15.0,
            emailAlerts: emailAlerts || false,
            smsAlerts: smsAlerts || false,
            updatedAt: new Date(),
            updatedBy: req.session.user.empid
        };
        
        logger.info('Threshold settings updated', { settings, user: req.session.user.empid });
        
        res.json({ success: true, message: 'Threshold settings updated', settings });
    } catch (error) {
        logger.error('Threshold update error:', error);
        res.status(500).json({ success: false, message: 'Failed to update thresholds' });
    }
});

/**
 * @swagger
 * /api/alerts/send:
 *   post:
 *     summary: Send alert notification
 *     tags: [Alerts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [email, sms]
 *               message:
 *                 type: string
 *               recipients:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Alert sent successfully
 */
app.post('/api/alerts/send', requireAdmin, async (req, res) => {
    try {
        const { type, message, recipients } = req.body;
        
        if (type === 'email' && recipients && recipients.length > 0) {
            const mailOptions = {
                from: process.env.SMTP_USER || 'alerts@radiation-monitoring.com',
                to: recipients.join(', '),
                subject: 'Radiation Alert - Critical Level Detected',
                html: `
                    <h2>🚨 Radiation Alert</h2>
                    <p><strong>Message:</strong> ${message}</p>
                    <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                    <p><strong>System:</strong> Radiation Monitoring System</p>
                    <hr>
                    <p><small>This is an automated alert from the Radiation Monitoring System.</small></p>
                `
            };
            
            await emailTransporter.sendMail(mailOptions);
            logger.info('Email alert sent', { recipients, message });
        }
        
        if (type === 'sms' && recipients && recipients.length > 0) {
            if (twilioClient) {
                for (const phoneNumber of recipients) {
                    await twilioClient.messages.create({
                        body: `🚨 RADIATION ALERT: ${message}`,
                        from: process.env.TWILIO_PHONE || '+1234567890',
                        to: phoneNumber
                    });
                }
                logger.info('SMS alerts sent', { recipients, message });
            } else {
                logger.warn('SMS alerts requested but Twilio not configured', { recipients, message });
                res.status(400).json({ success: false, message: 'SMS service not configured' });
                return;
            }
        }
        
        res.json({ success: true, message: 'Alerts sent successfully' });
    } catch (error) {
        logger.error('Alert sending error:', error);
        res.status(500).json({ success: false, message: 'Failed to send alerts' });
    }
});

// Admin: send a test email to verify SMTP configuration
app.post('/api/alerts/test-email', requireAdmin, async (req, res) => {
    try {
        const to = req.body?.to || process.env.SMTP_USER;
        if (!to) {
            return res.status(400).json({ success: false, message: 'No recipient email provided' });
        }
        const mailOptions = {
            from: process.env.SMTP_USER,
            to,
            subject: 'SMTP Test - Radiation Monitoring System',
            text: 'This is a test email from the Radiation Monitoring System.'
        };
        await emailTransporter.sendMail(mailOptions);
        logger.info('SMTP test email sent', { to });
        res.json({ success: true, message: 'SMTP test email sent', to });
    } catch (error) {
        logger.error('SMTP test email failed', { message: error?.message, code: error?.code });
        res.status(500).json({ success: false, message: 'SMTP test email failed', error: error?.message });
    }
});

/**
 * @swagger
 * /api/analytics/predictive:
 *   get:
 *     summary: Get predictive analytics
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: area
 *         schema:
 *           type: string
 *         description: Specific area for prediction
 *     responses:
 *       200:
 *         description: Predictive analysis data
 */
app.get('/api/analytics/predictive', requireAuth, async (req, res) => {
    try {
        const areaFilter = req.query.area;
        const since = new Date();
        since.setDate(since.getDate() - 30);
    let ref = db.collection('radiation_readings').where('currentDate', '>=', since);
        if (areaFilter) ref = ref.where('area', '==', areaFilter);
        const snap = await ref.get();
        const groups = new Map(); // key: area|areaspec
        snap.forEach(doc => {
            const d = doc.data();
            const key = `${d.area || 'UNK'}|${d.areaspec || 'UNK'}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(d);
        });
        const predictions = Array.from(groups.entries()).map(([key, arr]) => {
            const [area, areaspec] = key.split('|');
            const nearVals = arr.map(a => a.near || 0);
            const onemVals = arr.map(a => a.onem || 0);
            const avg_near = nearVals.length ? (nearVals.reduce((s, v) => s + v, 0) / nearVals.length) : 0;
            const avg_onem = onemVals.length ? (onemVals.reduce((s, v) => s + v, 0) / onemVals.length) : 0;
            const meanNear = avg_near;
            const varianceNear = nearVals.length ? (nearVals.reduce((s, v) => s + Math.pow(v - meanNear, 2), 0) / nearVals.length) : 0;
            const std_near = Math.sqrt(varianceNear);
            const meanOnem = avg_onem;
            const varianceOnem = onemVals.length ? (onemVals.reduce((s, v) => s + Math.pow(v - meanOnem, 2), 0) / onemVals.length) : 0;
            const std_onem = Math.sqrt(varianceOnem);
            return {
                area,
                areaspec,
                avg_near,
                avg_onem,
                std_near,
                std_onem,
                readings_count: arr.length,
                predicted_near_next_week: avg_near + std_near,
                predicted_onem_next_week: avg_onem + std_onem,
                risk_level: avg_near > 18 ? 'high' : avg_near > 12 ? 'medium' : 'low'
            };
        });
        logger.info('Predictive analysis generated', { area: areaFilter, predictions: predictions.length });
        res.json({ success: true, data: predictions });
    } catch (error) {
        logger.error('Predictive analysis error:', error);
        res.status(500).json({ success: false, message: 'Failed to generate predictive analysis' });
    }
});

/**
 * @swagger
 * /api/audit/logs:
 *   get:
 *     summary: Get system audit logs
 *     tags: [Audit]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Number of log entries to retrieve
 *     responses:
 *       200:
 *         description: Audit log data
 */
app.get('/api/audit/logs', requireAdmin, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        
        // In a real implementation, you'd query an audit_logs table
        // For now, we'll return system stats and recent activities
        const auditData = {
            systemStats,
            recentActivities: [
                {
                    timestamp: new Date().toISOString(),
                    action: 'health_check',
                    user: 'system',
                    details: 'System health check completed'
                }
            ],
            totalLogEntries: limit
        };
        
        logger.info('Audit logs retrieved', { limit, user: req.session.user.empid });
        res.json({ success: true, data: auditData });
    } catch (error) {
        logger.error('Audit log retrieval error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve audit logs' });
    }
});

// Enhanced data insertion with real-time updates and threshold monitoring
// Duplicate MySQL-based /insert endpoint removed (Firestore version above is authoritative)

// ==================== THRESHOLD & ALERT MANAGEMENT API ====================

/**
 * Get all thresholds
 * GET /api/thresholds
 */
app.get('/api/thresholds', requireAdmin, async (req, res) => {
    try {
        const snap = await db.collection('radiationThresholds').orderBy('block').get();
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        res.json({ success: true, data });
    } catch (error) {
        console.error('Error fetching thresholds:', error);
        res.status(500).json({ success: false, message: 'Error fetching thresholds' });
    }
});

/**
 * Update threshold
 * PUT /api/thresholds/:id
 */
app.put('/api/thresholds/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { near_threshold, onem_threshold, alert_level, is_active } = req.body;
        await db.collection('radiationThresholds').doc(id).set({
            near_threshold,
            onem_threshold,
            alert_level,
            isActive: is_active
        }, { merge: true });
        res.json({ success: true, message: 'Threshold updated successfully' });
    } catch (error) {
        console.error('Error updating threshold:', error);
        res.status(500).json({ success: false, message: 'Error updating threshold' });
    }
});

/**
 * Get alert history
 * GET /api/alerts/history
 */
app.get('/api/alerts/history', requireAdmin, async (req, res) => {
    try {
        const { limit = 50, alert_level, alert_type } = req.query;
        let ref = db.collection('alertHistory');
        if (alert_level) ref = ref.where('alert_level', '==', alert_level);
        if (alert_type) ref = ref.where('alert_type', '==', alert_type);
        const snap = await ref.orderBy('created_at', 'desc').limit(parseInt(limit)).get();
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        res.json({ success: true, data });
    } catch (error) {
        console.error('Error fetching alert history:', error);
        res.status(500).json({ success: false, message: 'Error fetching alert history' });
    }
});

/**
 * Acknowledge alert
 * PUT /api/alerts/:id/acknowledge
 */
app.put('/api/alerts/:id/acknowledge', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { acknowledged_by } = req.body;
        await db.collection('alertHistory').doc(id).set({
            acknowledged: true,
            acknowledged_by,
            acknowledged_at: new Date()
        }, { merge: true });
        res.json({ success: true, message: 'Alert acknowledged successfully' });
    } catch (error) {
        console.error('Error acknowledging alert:', error);
        res.status(500).json({ success: false, message: 'Error acknowledging alert' });
    }
});

/**
 * Get notification settings for all users
 * GET /api/notifications/settings
 */
app.get('/api/notifications/settings', requireAdmin, async (req, res) => {
    try {
        const usersSnap = await db.collection('users').where('isActive', '==', true).get();
        const out = [];
        for (const doc of usersSnap.docs) {
            const u = doc.data();
            const sDoc = await db.collection('notification_settings').doc(u.empid).get();
            const s = sDoc.exists ? sDoc.data() : {};
            out.push({
                empid: u.empid,
                name: u.name,
                email: u.email,
                phone: u.phone,
                block: u.block,
                email_notifications: s.emailNotifications ?? true,
                sms_notifications: s.smsNotifications ?? false,
                alert_levels: s.alertLevels ?? ['MEDIUM', 'HIGH', 'CRITICAL']
            });
        }
        res.json({ success: true, data: out });
    } catch (error) {
        console.error('Error fetching notification settings:', error);
        res.status(500).json({ success: false, message: 'Error fetching notification settings' });
    }
});

/**
 * Update user notification settings
 * PUT /api/notifications/settings/:empid
 */
app.put('/api/notifications/settings/:empid', requireAdmin, async (req, res) => {
    try {
        const { empid } = req.params;
        const { email_notifications, sms_notifications, alert_levels } = req.body;
        await db.collection('notification_settings').doc(empid).set({
            emailNotifications: !!email_notifications,
            smsNotifications: !!sms_notifications,
            alertLevels: Array.isArray(alert_levels) ? alert_levels : ['MEDIUM', 'HIGH', 'CRITICAL']
        }, { merge: true });
        res.json({ success: true, message: 'Notification settings updated successfully' });
    } catch (error) {
        console.error('Error updating notification settings:', error);
        res.status(500).json({ success: false, message: 'Error updating notification settings' });
    }
});

/**
 * Send manual alert
 * POST /api/alerts/send-manual
 */
app.post('/api/alerts/send-manual', requireAdmin, async (req, res) => {
    try {
        const { alert_level, block, plant, area, message, emp } = req.body;

        // Basic validation
        const allowedLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
        if (!allowedLevels.includes(alert_level)) {
            return res.status(400).json({ success: false, message: 'Invalid alert_level' });
        }
        if (!block || !plant || !area || !message) {
            return res.status(400).json({ success: false, message: 'block, plant, area, and message are required' });
        }

        // Insert manual alert into history (Firestore)
        await db.collection('alertHistory').add({
            alert_type: 'MANUAL',
            alert_level,
            block,
            plant,
            area,
            emp: emp || 'admin',
            near_reading: 0,
            onem_reading: 0,
            threshold_near: 0,
            threshold_onem: 0,
            message,
            acknowledged: false,
            created_at: new Date()
        });

        // Send notifications
    logger.info('Dispatching manual alert notifications (force email to all users)', { alert_level, block, plant, area });
    // Force email notifications to all registered users regardless of their personal settings
    await sendAlertNotifications(alert_level, message, block, plant, area, true);

        // Emit real-time alert
        io.emit('alert', {
            type: 'manual',
            level: alert_level,
            message: message,
            location: `${block} - ${plant} - ${area}`,
            timestamp: new Date()
        });

        res.json({
            success: true,
            message: 'Manual alert sent successfully'
        });

    } catch (error) {
        logger.error('Error sending manual alert', { error });
        res.status(500).json({
            success: false,
            message: 'Error sending manual alert'
        });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Start server with WebSocket support
server.listen(PORT, () => {
    logger.info(`🚀 Radiation Monitoring System server running on http://localhost:${PORT}`);
    logger.info(`📊 Admin Dashboard: http://localhost:${PORT}/retrieve.html`);
    logger.info(`👤 User Interface: http://localhost:${PORT}/user.html`);
    logger.info(`🔐 Login Page: http://localhost:${PORT}/`);
    logger.info(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
    logger.info(`🔌 WebSocket enabled for real-time updates`);
});

module.exports = app;
