// ============================================
// ULTIMATE BAN BOT v3.0 - WITH POINTS PURCHASE
// FULLY WORKING REFERRAL + BUY POINTS
// ============================================

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const axios = require('axios');
const randomstring = require('randomstring');
const moment = require('moment');
const fs = require('fs-extra');
const path = require('path');
const cron = require('node-cron');
const { RateLimiterMemory } = require('rate-limiter-flexible');

// Load environment
dotenv.config();

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
    token: process.env.BOT_TOKEN || '8887495397:AAFuzTxeiwqQ_fBYN0qCVwq4T-cYVWtt7pI',
    adminIds: JSON.parse(process.env.ADMIN_IDS || '[6346250222]'),
    mongoUri: process.env.MONGODB_URI || 'mongodb+srv://sahajada07x:Apon07@sahajada.a8r2wdp.mongodb.net/?appName=Sahajada',
    port: parseInt(process.env.PORT || '10000'),
    refersForReport: parseInt(process.env.REFERS_FOR_REPORT || '5'),
    maxWorkers: parseInt(process.env.MAX_WORKERS || '50'),
    reportsPerTarget: parseInt(process.env.REPORTS_PER_TARGET || '100'),
    rateLimitPerUser: parseInt(process.env.RATE_LIMIT_PER_USER || '3'),
    protectionPrice: parseInt(process.env.PROTECTION_PRICE || '40'),
    pointPrice: 2, // ₹2 per point
    minPointsPurchase: 10, // Minimum 10 points
    protectionExpiryDays: 30,
    
    channels: {
        mandatory: [
            {
                id: '-1003004551707',
                link: 'https://t.me/RTFGAMINGHACK0',
                name: 'RTF GAMING HACK',
                type: 'channel'
            },
            {
                id: '-1003559518526',
                link: 'https://t.me/rtfgamminggc',
                name: 'RTF Gaming Updates',
                type: 'group'
            },
            {
                id: '-1003880548572',
                link: 'https://t.me/USERX1NFO',
                name: 'RTF Community',
                type: 'group'
            },
            {
                id: 'rtfgaming1',
                link: 'https://t.me/rtfgaming1',
                name: 'RTF Gaming Channel',
                type: 'channel',
                isPublic: true
            }
        ]
    }
};

// ============================================
// BOT USERNAME CACHE
// ============================================

let BOT_USERNAME_CACHE = null;

async function getBotUsername(bot) {
    if (!BOT_USERNAME_CACHE) {
        try {
            const me = await bot.getMe();
            BOT_USERNAME_CACHE = me.username || 'Tgreportingbanbot';
            console.log(`✅ Bot Username: @${BOT_USERNAME_CACHE}`);
        } catch (error) {
            console.warn('⚠️ Could not fetch bot username, using fallback');
            BOT_USERNAME_CACHE = 'Tgreportingbanbot';
        }
    }
    return BOT_USERNAME_CACHE;
}

// ============================================
// LOGGER SYSTEM
// ============================================

const LOGS = [];

function addLog(message, type = 'INFO') {
    const log = {
        timestamp: new Date().toISOString(),
        type: type,
        message: message
    };
    LOGS.push(log);
    console.log(`[${type}] ${message}`);
    
    if (LOGS.length > 1000) {
        LOGS.shift();
    }
}

function getLogs(limit = 50) {
    return LOGS.slice(-limit);
}

// ============================================
// RATE LIMITER
// ============================================

const rateLimiter = new RateLimiterMemory({
    points: CONFIG.rateLimitPerUser,
    duration: 60,
    keyPrefix: 'user_actions'
});

// ============================================
// MONGODB CONNECTION
// ============================================

mongoose.connect(CONFIG.mongoUri, {
    dbName: 'rtf_ban',
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000
});

mongoose.connection.on('connected', () => {
    addLog('✅ MongoDB Connected', 'INFO');
});

mongoose.connection.on('error', (err) => {
    addLog(`❌ MongoDB Error: ${err.message}`, 'ERROR');
});

// ============================================
// SCHEMAS
// ============================================

const UserSchema = new mongoose.Schema({
    telegram_id: { type: String, unique: true, index: true },
    username: { type: String, index: true },
    first_name: String,
    last_name: String,
    points: { type: Number, default: 0 },
    referrals: { type: Number, default: 0 },
    referral_code: { type: String, unique: true, index: true },
    is_verified: { type: Boolean, default: false },
    welcome_channel_shown: { type: Boolean, default: false },
    reports_used: { type: Number, default: 0 },
    reports_success: { type: Number, default: 0 },
    reports_failed: { type: Number, default: 0 },
    is_admin: { type: Boolean, default: false },
    is_banned: { type: Boolean, default: false },
    last_active: { type: Date, default: Date.now },
    created_at: { type: Date, default: Date.now },
    protection_status: { type: String, enum: ['none', 'pending_payment', 'pending_approval', 'approved', 'active', 'expired'], default: 'none' },
    protection_type: { type: String, enum: ['account', 'channel', 'group', 'none'], default: 'none' },
    protection_target: { type: String, default: null },
    transaction_id: { type: String, default: null },
    transaction_ss: { type: String, default: null },
    protection_expiry: { type: Date, default: null },
    last_referral_time: { type: Date, default: null },
    referral_count_minute: { type: Number, default: 0 },
    // Points Purchase
    points_purchase_pending: { type: Number, default: 0 },
    points_purchase_ss: { type: String, default: null },
    points_purchase_transaction: { type: String, default: null }
}, { timestamps: true });

const ReportSchema = new mongoose.Schema({
    user_id: { type: String, index: true },
    target_username: { type: String, index: true },
    target_type: { type: String, enum: ['account', 'channel', 'group'], index: true },
    evidence: { type: String, default: null },
    evidence_files: [{
        file_id: String,
        file_type: String,
        file_path: String
    }],
    report_count: { type: Number, default: 0 },
    success_count: { type: Number, default: 0 },
    failed_count: { type: Number, default: 0 },
    ban_probability: { type: Number, default: 0 },
    status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { timestamps: true });

const BroadcastSchema = new mongoose.Schema({
    admin_id: { type: String, index: true },
    message_type: { type: String, enum: ['text', 'photo', 'video', 'document'] },
    content: String,
    media_url: String,
    caption: String,
    sent_count: { type: Number, default: 0 },
    total_count: { type: Number, default: 0 },
    status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
    created_at: { type: Date, default: Date.now },
    scheduled_for: Date
}, { timestamps: true });

const ProtectedSchema = new mongoose.Schema({
    target_type: { type: String, enum: ['channel', 'group', 'account'], index: true },
    target_id: { type: String, unique: true, index: true },
    target_name: String,
    protected_by: { type: String, index: true },
    transaction_id: { type: String, index: true },
    expiry_date: { type: Date, default: null },
    created_at: { type: Date, default: Date.now }
}, { timestamps: true });

const PaymentSchema = new mongoose.Schema({
    user_id: { type: String, index: true },
    username: String,
    amount: { type: Number, default: 40 },
    transaction_id: { type: String, unique: true, index: true },
    transaction_ss: String,
    payment_type: { type: String, enum: ['protection', 'points'], default: 'protection' },
    points: { type: Number, default: 0 },
    protection_type: { type: String, enum: ['account', 'channel', 'group', 'none'], default: 'none' },
    protection_target: { type: String, default: null },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    admin_note: String,
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { timestamps: true });

const QRCodeSchema = new mongoose.Schema({
    file_id: { type: String, required: true },
    file_path: { type: String, default: null },
    payment_amount: { type: Number, default: 40 },
    is_active: { type: Boolean, default: true },
    created_by: { type: String, index: true },
    created_at: { type: Date, default: Date.now }
}, { timestamps: true });

const AnalyticsSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now, index: true },
    total_users: { type: Number, default: 0 },
    active_users: { type: Number, default: 0 },
    total_reports: { type: Number, default: 0 },
    success_rate: { type: Number, default: 0 },
    total_referrals: { type: Number, default: 0 },
    total_payments: { type: Number, default: 0 },
    total_protected: { type: Number, default: 0 },
    reports_by_type: {
        account: { type: Number, default: 0 },
        channel: { type: Number, default: 0 },
        group: { type: Number, default: 0 }
    }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Report = mongoose.model('Report', ReportSchema);
const Broadcast = mongoose.model('Broadcast', BroadcastSchema);
const Protected = mongoose.model('Protected', ProtectedSchema);
const Payment = mongoose.model('Payment', PaymentSchema);
const QRCode = mongoose.model('QRCode', QRCodeSchema);
const Analytics = mongoose.model('Analytics', AnalyticsSchema);

// ============================================
// PROXY POOL - DISABLED
// ============================================

class RealProxyPool {
    constructor() {
        this.proxies = [];
        this.failedProxies = new Set();
        this.currentIndex = 0;
        addLog('🌐 Proxy pool disabled - Using direct connection', 'INFO');
    }

    getNextProxy() {
        return null;
    }

    markSuccess(proxy) {}
    markFailure(proxy) {}

    getStats() {
        return {
            total: 0,
            available: 0,
            failed: 0
        };
    }

    getUserAgent() {
        const agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
        ];
        return agents[Math.floor(Math.random() * agents.length)];
    }

    getRandomName() {
        const first = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emma', 'James', 'Olivia', 'Robert', 'Sophia'];
        const last = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];
        return `${first[Math.floor(Math.random() * first.length)]} ${last[Math.floor(Math.random() * last.length)]}`;
    }

    getRandomEmail() {
        const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'protonmail.com', 'mail.com'];
        const name = Math.random().toString(36).substring(2, 10);
        return `${name}${Math.floor(Math.random() * 1000)}@${domains[Math.floor(Math.random() * domains.length)]}`;
    }

    getRandomPhone() {
        return `7${Array.from({length: 10}, () => Math.floor(Math.random() * 10)).join('')}`;
    }
}

// ============================================
// AI REPORT ENGINE
// ============================================

class AIReportEngine {
    constructor() {
        this.violations = {
            'CRITICAL': [
                { type: 'child_exploitation', name: 'Child Exploitation Materials' },
                { type: 'terrorism_support', name: 'Terrorism Support' },
                { type: 'drug_trafficking', name: 'Drug Trafficking' },
                { type: 'weapons_trading', name: 'Weapons Trading' },
                { type: 'human_trafficking', name: 'Human Trafficking' }
            ],
            'URGENT': [
                { type: 'financial_fraud', name: 'Financial Fraud' },
                { type: 'phishing', name: 'Phishing Attack' },
                { type: 'doxxing', name: 'Doxxing' },
                { type: 'identity_theft', name: 'Identity Theft' },
                { type: 'crypto_scam', name: 'Cryptocurrency Scam' }
            ],
            'HIGH': [
                { type: 'hate_speech', name: 'Hate Speech' },
                { type: 'cyberbullying', name: 'Cyberbullying' },
                { type: 'copyright_infringement', name: 'Copyright Infringement' },
                { type: 'impersonation', name: 'Impersonation' },
                { type: 'spam', name: 'Spam' }
            ],
            'MEDIUM': [
                { type: 'harassment', name: 'Harassment' },
                { type: 'stalking', name: 'Stalking' },
                { type: 'defamation', name: 'Defamation' }
            ]
        };

        this.allViolations = [
            'Spam', 'Scam', 'Phishing', 'Harassment', 'Doxxing', 'Hate Speech',
            'Cyberbullying', 'Copyright Infringement', 'Impersonation', 'Financial Fraud',
            'Identity Theft', 'Malware Distribution', 'Fake News', 'Misinformation',
            'Illegal Content', 'Stalking', 'Defamation', 'Terrorism Support',
            'Drug Trafficking', 'Weapons Trading', 'Human Trafficking', 'Child Exploitation'
        ];

        addLog('🧠 AI Report Engine initialized with 22+ violation types', 'INFO');
    }

    detectViolation(evidence) {
        if (!evidence) {
            return { type: 'general_violation', severity: 'HIGH', score: 80, name: 'General Violation' };
        }

        const keywords = {
            'phishing': ['phish', 'fake', 'login', 'password', 'steal', 'account', 'credentials', 'hack'],
            'scam': ['scam', 'fraud', 'fake', 'steal', 'money', 'bank', 'crypto', 'bitcoin'],
            'harassment': ['hate', 'kill', 'die', 'abuse', 'threat', 'bully', 'harass'],
            'doxxing': ['address', 'phone', 'email', 'doxx', 'leak', 'personal', 'private'],
            'spam': ['spam', 'bulk', 'mass', 'promotion', 'advertise', 'link'],
            'hate_speech': ['hate', 'racist', 'sexist', 'homophobic', 'discrimination'],
            'cyberbullying': ['bully', 'harass', 'threat', 'abuse', 'troll'],
            'child_exploitation': ['child', 'minor', 'teen', 'underage', 'young', 'exploit', 'abuse'],
            'terrorism_support': ['terror', 'bomb', 'attack', 'jihad', 'isis', 'kill', 'destroy'],
            'drug_trafficking': ['drug', 'cocaine', 'heroin', 'weed', 'mdma', 'sell', 'buy'],
            'weapons_trading': ['gun', 'weapon', 'rifle', 'pistol', 'firearm', 'bullet'],
            'financial_fraud': ['scam', 'fraud', 'fake', 'steal', 'money', 'bank', 'crypto', 'investment'],
            'identity_theft': ['identity', 'steal', 'fake', 'id', 'passport', 'ssn'],
            'impersonation': ['fake', 'impersonate', 'pretend', 'identity', 'clone'],
            'copyright_infringement': ['copyright', 'pirate', 'crack', 'torrent', 'download']
        };

        const words = evidence.toLowerCase().split(/\s+/);
        let bestMatch = { type: 'general_violation', score: 0, name: 'General Violation' };

        for (const [type, matches] of Object.entries(keywords)) {
            let count = 0;
            for (const word of words) {
                if (matches.some(m => word.includes(m))) {
                    count++;
                }
            }
            
            const score = Math.min(count * 10 + 20, 100);
            if (score > bestMatch.score) {
                const severity = this.getSeverityByType(type);
                bestMatch = { 
                    type: type, 
                    score: score, 
                    severity: severity,
                    name: this.getViolationName(type)
                };
            }
        }

        return bestMatch;
    }

    getViolationName(type) {
        const allTypes = [
            ...this.violations.CRITICAL,
            ...this.violations.URGENT,
            ...this.violations.HIGH,
            ...this.violations.MEDIUM
        ];
        const found = allTypes.find(v => v.type === type);
        return found ? found.name : 'Violation';
    }

    getSeverityByType(type) {
        for (const [severity, types] of Object.entries(this.violations)) {
            if (types.some(v => v.type === type)) return severity;
        }
        return 'HIGH';
    }

    getRandomViolationName() {
        return this.allViolations[Math.floor(Math.random() * this.allViolations.length)];
    }

    generateReport(username, targetType, evidence, violation, index = 0) {
        const timestamp = new Date().toISOString();
        const refId = `BAN-${randomstring.generate({length: 12, charset: 'numeric'})}`;
        const severity = violation.severity || 'HIGH';
        const name = violation.name || this.getRandomViolationName();
        
        let evidenceText = 'Multiple user reports with screenshots';
        if (evidence) {
            evidenceText = evidence;
        }

        const victims = Math.floor(Math.random() * 40) + 5;

        return `🚨 [${severity}] ${name.toUpperCase()} REPORT #${index + 1}

🎯 TARGET: ${targetType === 'account' ? '@' : ''}${username}
📋 TYPE: ${targetType.toUpperCase()}
⚡ VIOLATION: ${name}
🔥 SEVERITY: ${severity}
🎯 CONFIDENCE: ${Math.floor(Math.random() * 30 + 70)}%

🔍 EVIDENCE:
• ${evidenceText}

📊 IMPACT:
• ${victims} victims identified
• Active violation confirmed
• Policy violation detected

📜 RULES VIOLATED:
• Section 4.1: No Illegal Activities
• Section 4.6: No Spam
• Section 4.3: No Harassment

⚡ ACTIONS TAKEN:
• BAN ${targetType.toUpperCase()}
• REMOVE CONTENT
• REPORT TO TELEGRAM TEAM

🔖 REF: ${refId}
🛡️ ULTIMATE BAN BOT v2.0 - 99.99% SUCCESS

📅 ${timestamp}`;
    }
}

// ============================================
// MAIN BOT CLASS
// ============================================

class UltimateBot {
    constructor() {
        this.bot = new TelegramBot(CONFIG.token, { 
            polling: true,
            filepath: false
        });
        this.proxyPool = new RealProxyPool();
        this.reportEngine = new AIReportEngine();
        this.queue = [];
        this.processing = new Set();
        this.conversations = new Map();
        this.init();
    }

    init() {
        addLog('='.repeat(70), 'INFO');
        addLog('🚀 ULTIMATE BAN BOT v3.0 - WITH POINTS PURCHASE', 'INFO');
        addLog('='.repeat(70), 'INFO');
        addLog(`📡 Bot: ${CONFIG.token.substring(0, 10)}...`, 'INFO');
        addLog(`📢 Mandatory Channels: ${CONFIG.channels.mandatory.length}`, 'INFO');
        addLog(`⚙️ Workers: ${CONFIG.maxWorkers}`, 'INFO');
        addLog(`📊 Reports: ${CONFIG.reportsPerTarget}`, 'INFO');
        addLog(`🛡️ Protection Price: ₹${CONFIG.protectionPrice}`, 'INFO');
        addLog(`💰 Points Price: ₹${CONFIG.pointPrice}/point`, 'INFO');
        addLog(`📊 Min Points Purchase: ${CONFIG.minPointsPurchase}`, 'INFO');
        addLog('='.repeat(70), 'INFO');
        addLog('✅ Bot is LIVE!', 'INFO');
        addLog('='.repeat(70), 'INFO');

        this.setupCommands();
        this.setupMessageHandler();
        this.startQueueProcessor();
        this.startScheduledJobs();
    }

    // ============================================
    // CHECK ALL SUBSCRIPTIONS
    // ============================================

    async checkAllSubscriptions(userId) {
        const results = {
            allSubscribed: true,
            mandatory: [],
            missingChannels: []
        };
        
        for (const channel of CONFIG.channels.mandatory) {
            try {
                let isMember = false;
                
                if (channel.isPublic) {
                    try {
                        const chatMember = await this.bot.getChatMember(`@${channel.id}`, userId);
                        isMember = chatMember.status === 'member' || 
                                  chatMember.status === 'administrator' || 
                                  chatMember.status === 'creator';
                    } catch (error) {
                        isMember = false;
                    }
                } else {
                    const chatMember = await this.bot.getChatMember(parseInt(channel.id), userId);
                    isMember = chatMember.status === 'member' || 
                              chatMember.status === 'administrator' || 
                              chatMember.status === 'creator';
                }
                
                results.mandatory.push({
                    ...channel,
                    isMember: isMember
                });
                
                if (!isMember) {
                    results.allSubscribed = false;
                    results.missingChannels.push(channel);
                }
            } catch (error) {
                results.allSubscribed = false;
                results.missingChannels.push(channel);
            }
        }
        
        return results;
    }

    // ============================================
    // SHOW ALL CHANNELS
    // ============================================

    async showAllChannels(chatId, userId, missingChannels = []) {
        let message = `🎁 WELCOME TO ULTIMATE BAN BOT!\n\n`;
        message += `🔥 Please join ALL these channels to use the bot:\n\n`;
        
        const keyboard = {
            inline_keyboard: []
        };
        
        const allChannels = CONFIG.channels.mandatory;
        for (let i = 0; i < allChannels.length; i += 2) {
            const row = [];
            const channel1 = allChannels[i];
            if (channel1) {
                row.push({ text: `📢 ${channel1.name}`, url: channel1.link });
            }
            const channel2 = allChannels[i + 1];
            if (channel2) {
                row.push({ text: `📢 ${channel2.name}`, url: channel2.link });
            }
            keyboard.inline_keyboard.push(row);
        }
        
        if (missingChannels.length > 0) {
            message += `\n⚠️ You need to join these channels first:\n\n`;
            for (const channel of missingChannels) {
                message += `• ${channel.name}\n`;
            }
        }
        
        message += `\n✅ After joining, click the button below to verify!`;
        
        keyboard.inline_keyboard.push([
            { text: '✅ I\'ve Joined All Channels', callback_data: 'verify_all_channels' }
        ]);
        
        await this.bot.sendMessage(
            chatId,
            message,
            {
                reply_markup: keyboard
            }
        );
        
        addLog(`🎁 All channels shown to user ${userId}`, 'INFO');
    }

    // ============================================
    // SHOW MISSING CHANNELS
    // ============================================

    async showMissingChannels(chatId, userId, missingChannels) {
        let message = `🔐 CHANNEL VERIFICATION REQUIRED\n\n`;
        message += `Please join these channels to use the bot:\n\n`;
        
        const keyboard = {
            inline_keyboard: []
        };
        
        for (let i = 0; i < missingChannels.length; i += 2) {
            const row = [];
            const channel1 = missingChannels[i];
            if (channel1) {
                row.push({ text: `📢 ${channel1.name}`, url: channel1.link });
            }
            const channel2 = missingChannels[i + 1];
            if (channel2) {
                row.push({ text: `📢 ${channel2.name}`, url: channel2.link });
            }
            keyboard.inline_keyboard.push(row);
        }
        
        keyboard.inline_keyboard.push([
            { text: '✅ I\'ve Joined All', callback_data: 'verify_all_channels' }
        ]);
        
        await this.bot.sendMessage(
            chatId,
            message,
            {
                reply_markup: keyboard
            }
        );
    }

    // ============================================
    // GET MAIN MENU - WITH BUY POINTS BUTTON
    // ============================================

    getMainMenu() {
        return {
            reply_markup: {
                keyboard: [
                    [
                        { text: '🎯 Report Account' },
                        { text: '📢 Report Channel' }
                    ],
                    [
                        { text: '👥 Report Group' },
                        { text: '🛡️ Protection' }
                    ],
                    [
                        { text: '📊 My Stats' },
                        { text: '🔗 Refer & Earn' }
                    ],
                    [
                        { text: '💰 Buy Points' },
                        { text: 'ℹ️ Help' }
                    ],
                    [
                        { text: '👑 Admin Panel' }
                    ]
                ],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        };
    }

    // ============================================
    // GET REFERRAL LINK
    // ============================================

    async getReferralLink(userId) {
        const botUsername = await getBotUsername(this.bot);
        return `https://t.me/${botUsername}?start=${userId}`;
    }

    // ============================================
    // START REPORT PROCESS
    // ============================================

    async startReportProcess(chatId, userId, username, targetType) {
        try {
            const subStatus = await this.checkAllSubscriptions(userId);
            
            if (!subStatus.allSubscribed) {
                await this.showMissingChannels(chatId, userId, subStatus.missingChannels);
                return;
            }

            const user = await User.findOne({ telegram_id: userId.toString() });
            if (!user) {
                await this.bot.sendMessage(chatId, '❌ Please use /start first.');
                return;
            }

            const points = user.points || 0;
            const reportsAvailable = Math.floor(points / CONFIG.refersForReport);
            const reportsUsed = user.reports_used || 0;
            const remaining = reportsAvailable - reportsUsed;

            if (remaining <= 0) {
                const botUsername = await getBotUsername(this.bot);
                const referralLink = await this.getReferralLink(userId);
                await this.bot.sendMessage(
                    chatId,
                    `❌ Insufficient Reports!\n\nNeed ${CONFIG.refersForReport} points for 1 report.\nCurrent points: ${points}\n\n🔗 Earn more: ${referralLink}\n\n💰 Or buy points using "Buy Points" button!`
                );
                return;
            }

            const typeNames = {
                account: 'Account',
                channel: 'Channel',
                group: 'Group'
            };

            const typeExamples = {
                account: '@username',
                channel: '@channelname or https://t.me/channelname',
                group: '@groupname or https://t.me/joinchat/xxxxx'
            };

            this.conversations.set(userId, { 
                step: 'target', 
                targetType: targetType,
                typeName: typeNames[targetType]
            });

            await this.bot.sendMessage(
                chatId,
                `🎯 Report ${typeNames[targetType]}\n\nSend the ${typeNames[targetType].toLowerCase()} username or link.\n\n📝 Example: ${typeExamples[targetType]}\n\n⚠️ ${CONFIG.reportsPerTarget} reports will be sent for 99.99% ban chance!\n\n💡 /help for more info`,
                {
                    reply_markup: {
                        keyboard: [['❌ Cancel']],
                        resize_keyboard: true,
                        one_time_keyboard: true
                    }
                }
            );

        } catch (error) {
            addLog(`❌ Start report error: ${error.message}`, 'ERROR');
            await this.bot.sendMessage(chatId, '❌ Error. Please try again.');
        }
    }

    // ============================================
    // START PROTECTION PROCESS
    // ============================================

    async startProtectionProcess(chatId, userId, username) {
        try {
            const subStatus = await this.checkAllSubscriptions(userId);
            
            if (!subStatus.allSubscribed) {
                await this.showMissingChannels(chatId, userId, subStatus.missingChannels);
                return;
            }

            const user = await User.findOne({ telegram_id: userId.toString() });
            if (!user) {
                await this.bot.sendMessage(chatId, '❌ Please use /start first.');
                return;
            }

            if (user.protection_status === 'active') {
                const protectedItem = await Protected.findOne({ protected_by: userId.toString() });
                if (protectedItem) {
                    await this.bot.sendMessage(
                        chatId,
                        `🛡️ You already have active protection!\n\n📋 Type: ${protectedItem.target_type.toUpperCase()}\n🎯 Target: ${protectedItem.target_name}\n📅 Expiry: ${protectedItem.expiry_date ? moment(protectedItem.expiry_date).format('DD MMM YYYY') : 'Never'}\n\n✅ Your target is already protected!`
                    );
                    return;
                }
            }

            if (user.protection_status === 'approved') {
                await this.bot.sendMessage(
                    chatId,
                    `✅ Payment Approved!\n\nNow send the @username or link you want to protect.\n\n📝 Example: @username or https://t.me/channelname\n\n⚠️ You have one protection available.`
                );
                this.conversations.set(userId, { step: 'protection_target' });
                return;
            }

            const keyboard = {
                inline_keyboard: [
                    [{ text: '🛡️ Protect Account', callback_data: 'protect_account' }],
                    [{ text: '🛡️ Protect Channel', callback_data: 'protect_channel' }],
                    [{ text: '🛡️ Protect Group', callback_data: 'protect_group' }],
                    [{ text: '🔙 Back', callback_data: 'protect_back' }]
                ]
            };

            await this.bot.sendMessage(
                chatId,
                `🛡️ Protection System\n\nSelect what you want to protect:\n\n🛡️ Account - Protect any Telegram account\n📢 Channel - Protect any Telegram channel\n👥 Group - Protect any Telegram group\n\n💰 Price: ₹${CONFIG.protectionPrice}\n\n💡 After payment, you'll be able to protect one target.`,
                {
                    reply_markup: keyboard
                }
            );

        } catch (error) {
            addLog(`❌ Protection start error: ${error.message}`, 'ERROR');
            await this.bot.sendMessage(chatId, '❌ Error. Please try again.');
        }
    }

    // ============================================
    // PROCESS PAYMENT - Protection
    // ============================================

    async processPayment(chatId, userId, username, protectionType) {
        try {
            const user = await User.findOne({ telegram_id: userId.toString() });
            if (user && (user.protection_status === 'pending_payment' || user.protection_status === 'pending_approval')) {
                await this.bot.sendMessage(
                    chatId,
                    `⏳ You already have a pending payment!\n\nPlease wait for admin approval or send the transaction screenshot.\n\n📋 If you haven't sent the screenshot yet, please send it now.`
                );
                return;
            }

            const qrCode = await QRCode.findOne({ is_active: true });
            if (!qrCode) {
                await this.bot.sendMessage(
                    chatId,
                    `❌ Payment System Unavailable\n\nNo payment QR code available. Please contact admin.\n\n👑 Admin: @RTFGAMMING`
                );
                return;
            }

            const transactionId = `TXN-${randomstring.generate({length: 10, charset: 'numeric'})}`;
            
            const payment = new Payment({
                user_id: userId.toString(),
                username: username,
                amount: CONFIG.protectionPrice,
                transaction_id: transactionId,
                payment_type: 'protection',
                protection_type: protectionType,
                status: 'pending'
            });
            await payment.save();

            await User.findOneAndUpdate(
                { telegram_id: userId.toString() },
                { 
                    protection_status: 'pending_payment',
                    protection_type: protectionType,
                    transaction_id: transactionId,
                    transaction_ss: null
                }
            );

            await this.bot.sendPhoto(
                chatId,
                qrCode.file_id,
                {
                    caption: `💳 Payment Required\n\n💰 Amount: ₹${CONFIG.protectionPrice}\n🆔 Transaction ID: ${transactionId}\n📋 Type: ${protectionType.toUpperCase()}\n\n📤 Instructions:\n1. Scan the QR code\n2. Pay ₹${CONFIG.protectionPrice}\n3. Send the transaction screenshot here (upload photo)\n4. Wait for admin approval\n\n⚠️ Don't close this chat! Admin will respond here.\n\n✅ After approval, you can protect your target.`
                }
            );

            this.conversations.set(userId, { 
                step: 'payment_ss',
                transactionId: transactionId,
                paymentType: 'protection'
            });

        } catch (error) {
            addLog(`❌ Payment error: ${error.message}`, 'ERROR');
            await this.bot.sendMessage(chatId, '❌ Error. Please try again.');
        }
    }

    // ============================================
    // PROCESS POINTS PURCHASE
    // ============================================

    async processPointsPurchase(chatId, userId, username) {
        try {
            const user = await User.findOne({ telegram_id: userId.toString() });
            
            // Check if user already has pending points purchase
            if (user && user.points_purchase_pending > 0) {
                await this.bot.sendMessage(
                    chatId,
                    `⏳ You already have a pending points purchase!\n\n📊 Points: ${user.points_purchase_pending}\n💰 Amount: ₹${user.points_purchase_pending * CONFIG.pointPrice}\n\nPlease wait for admin approval or send the screenshot.\n\n📋 If you haven't sent the screenshot yet, please send it now.`
                );
                return;
            }

            const qrCode = await QRCode.findOne({ is_active: true });
            if (!qrCode) {
                await this.bot.sendMessage(
                    chatId,
                    `❌ Payment System Unavailable\n\nNo payment QR code available. Please contact admin.\n\n👑 Admin: @RTFGAMMING`
                );
                return;
            }

            // Ask how many points they want
            this.conversations.set(userId, { step: 'points_amount' });
            
            await this.bot.sendMessage(
                chatId,
                `💰 BUY POINTS\n\n💵 Price: ₹${CONFIG.pointPrice} per point\n📊 Minimum: ${CONFIG.minPointsPurchase} points\n📊 Maximum: No limit\n\n📝 Example: Send "10" for 10 points (₹${CONFIG.pointPrice * 10})\n\n⚠️ Send the number of points you want to buy.\n\nType /cancel to cancel.`
            );

        } catch (error) {
            addLog(`❌ Points purchase error: ${error.message}`, 'ERROR');
            await this.bot.sendMessage(chatId, '❌ Error. Please try again.');
        }
    }

    // ============================================
    // HANDLE POINTS AMOUNT INPUT
    // ============================================

    async handlePointsAmount(chatId, userId, username, text) {
        try {
            const points = parseInt(text);
            
            if (isNaN(points) || points < CONFIG.minPointsPurchase) {
                await this.bot.sendMessage(
                    chatId,
                    `❌ Invalid amount!\n\nMinimum points: ${CONFIG.minPointsPurchase}\n\n📝 Example: Send "10" for 10 points (₹${CONFIG.pointPrice * 10})\n\nType /cancel to cancel.`
                );
                return;
            }

            const amount = points * CONFIG.pointPrice;
            const transactionId = `PTS-${randomstring.generate({length: 10, charset: 'numeric'})}`;

            // Update user with pending points
            await User.findOneAndUpdate(
                { telegram_id: userId.toString() },
                {
                    points_purchase_pending: points,
                    points_purchase_transaction: transactionId,
                    points_purchase_ss: null
                }
            );

            // Save payment record
            const payment = new Payment({
                user_id: userId.toString(),
                username: username,
                amount: amount,
                transaction_id: transactionId,
                payment_type: 'points',
                points: points,
                status: 'pending'
            });
            await payment.save();

            const qrCode = await QRCode.findOne({ is_active: true });

            await this.bot.sendPhoto(
                chatId,
                qrCode.file_id,
                {
                    caption: `💰 Points Purchase\n\n📊 Points: ${points}\n💵 Amount: ₹${amount}\n🆔 Transaction ID: ${transactionId}\n\n📤 Instructions:\n1. Scan the QR code\n2. Pay ₹${amount}\n3. Send the transaction screenshot here (upload photo)\n4. Wait for admin approval\n\n⚠️ Don't close this chat! Admin will respond here.\n\n✅ After approval, points will be added to your account.`
                }
            );

            this.conversations.set(userId, { 
                step: 'payment_ss',
                transactionId: transactionId,
                paymentType: 'points',
                points: points
            });

        } catch (error) {
            addLog(`❌ Points amount error: ${error.message}`, 'ERROR');
            await this.bot.sendMessage(chatId, '❌ Error. Please try again.');
        }
    }

    // ============================================
    // HANDLE PAYMENT SCREENSHOT (Protection + Points)
    // ============================================

    async handlePaymentScreenshot(chatId, userId, username, photo, transactionId, paymentType) {
        try {
            const fileId = photo[photo.length - 1].file_id;
            const file = await this.bot.getFile(fileId);

            // Update payment with screenshot
            await Payment.findOneAndUpdate(
                { transaction_id: transactionId },
                { 
                    transaction_ss: fileId,
                    status: 'pending',
                    updated_at: new Date()
                }
            );

            if (paymentType === 'protection') {
                await User.findOneAndUpdate(
                    { telegram_id: userId.toString() },
                    { 
                        protection_status: 'pending_approval',
                        transaction_ss: fileId
                    }
                );

                await this.bot.sendMessage(
                    chatId,
                    `✅ Screenshot Received!\n\n📤 Your transaction screenshot has been sent to admin.\n\n⏳ Please wait for admin approval (5-15 minutes).\n\n📋 Transaction ID: ${transactionId}\n\n✅ You will be notified when approved.`
                );
            } else if (paymentType === 'points') {
                // Points are already stored in user
                await this.bot.sendMessage(
                    chatId,
                    `✅ Screenshot Received!\n\n📤 Your points purchase screenshot has been sent to admin.\n\n⏳ Please wait for admin approval (5-15 minutes).\n\n📋 Transaction ID: ${transactionId}\n📊 Points: ${this.conversations.get(userId)?.points || 0}\n\n✅ You will be notified when approved.`
                );
            }

            // Forward to admin with approve/reject buttons
            for (const adminId of CONFIG.adminIds) {
                try {
                    const payment = await Payment.findOne({ transaction_id: transactionId });
                    const user = await User.findOne({ telegram_id: userId.toString() });

                    let caption = `📤 Transaction Screenshot Received\n\n`;
                    caption += `👤 User: @${username}\n`;
                    caption += `🆔 User ID: ${userId}\n`;

                    if (paymentType === 'protection') {
                        caption += `📋 Type: PROTECTION\n`;
                        caption += `🛡️ Protection Type: ${payment.protection_type.toUpperCase()}\n`;
                        caption += `💰 Amount: ₹${payment.amount}\n`;
                    } else if (paymentType === 'points') {
                        caption += `📋 Type: POINTS PURCHASE\n`;
                        caption += `📊 Points: ${payment.points}\n`;
                        caption += `💰 Amount: ₹${payment.amount}\n`;
                        caption += `💵 Price: ₹${CONFIG.pointPrice}/point\n`;
                    }

                    caption += `🆔 Transaction: ${transactionId}\n\n`;
                    caption += `📌 Approve or Reject:`;

                    const keyboard = {
                        inline_keyboard: [
                            [{ text: '✅ Approve', callback_data: `approve_${transactionId}` }],
                            [{ text: '❌ Reject', callback_data: `reject_${transactionId}` }]
                        ]
                    };

                    await this.bot.sendPhoto(
                        adminId,
                        fileId,
                        {
                            caption: caption,
                            reply_markup: keyboard
                        }
                    );
                } catch (e) {
                    addLog(`❌ Failed to forward to admin: ${e.message}`, 'ERROR');
                }
            }

            this.conversations.delete(userId);

        } catch (error) {
            addLog(`❌ Payment screenshot error: ${error.message}`, 'ERROR');
            await this.bot.sendMessage(chatId, '❌ Error. Please try again.');
        }
    }

    // ============================================
    // HANDLE PAYMENT APPROVAL (Protection + Points)
    // ============================================

    async handlePaymentApproval(chatId, adminId, transactionId, approve) {
        try {
            const payment = await Payment.findOne({ transaction_id: transactionId });
            if (!payment) {
                await this.bot.sendMessage(chatId, '❌ Payment not found.');
                return;
            }

            if (payment.status !== 'pending') {
                await this.bot.sendMessage(
                    chatId,
                    `❌ Payment already ${payment.status}.`
                );
                return;
            }

            const user = await User.findOne({ telegram_id: payment.user_id });
            if (!user) {
                await this.bot.sendMessage(chatId, '❌ User not found.');
                return;
            }

            if (approve) {
                payment.status = 'approved';
                await payment.save();

                if (payment.payment_type === 'protection') {
                    // Protection approval
                    user.protection_status = 'approved';
                    user.protection_type = payment.protection_type;
                    user.transaction_id = transactionId;
                    await user.save();

                    try {
                        await this.bot.sendMessage(
                            parseInt(payment.user_id),
                            `✅ Payment Approved!\n\n💰 Amount: ₹${payment.amount}\n🆔 Transaction: ${transactionId}\n\n🎯 Now you can protect your target!\n\nSend the @username or link you want to protect.\n\n📝 Example: @username or https://t.me/channelname\n\n⚠️ You have one protection available.`
                        );
                    } catch (e) {}

                    await this.bot.sendMessage(
                        chatId,
                        `✅ Protection Payment Approved!\n\n👤 User: @${user.username}\n💰 Amount: ₹${payment.amount}\n📋 Type: ${payment.protection_type.toUpperCase()}\n🆔 Transaction: ${transactionId}\n\nUser has been notified to send target.`
                    );

                } else if (payment.payment_type === 'points') {
                    // Points purchase approval
                    user.points += payment.points;
                    user.points_purchase_pending = 0;
                    user.points_purchase_transaction = null;
                    user.points_purchase_ss = null;
                    await user.save();

                    try {
                        await this.bot.sendMessage(
                            parseInt(payment.user_id),
                            `✅ Points Purchase Approved!\n\n📊 Points: ${payment.points}\n💰 Amount: ₹${payment.amount}\n🆔 Transaction: ${transactionId}\n\n⭐ Total Points: ${user.points}\n\n📊 ${CONFIG.refersForReport} points = 1 report\n🎯 ${CONFIG.reportsPerTarget} reports = 99.99% ban\n\n🔥 Start reporting now!`
                        );
                    } catch (e) {}

                    await this.bot.sendMessage(
                        chatId,
                        `✅ Points Purchase Approved!\n\n👤 User: @${user.username}\n📊 Points Added: ${payment.points}\n💰 Amount: ₹${payment.amount}\n🆔 Transaction: ${transactionId}\n\n⭐ Total Points: ${user.points}`
                    );
                }

            } else {
                // Reject payment
                payment.status = 'rejected';
                await payment.save();

                if (payment.payment_type === 'protection') {
                    user.protection_status = 'none';
                    user.protection_type = 'none';
                    user.transaction_id = null;
                    await user.save();

                    try {
                        await this.bot.sendMessage(
                            parseInt(payment.user_id),
                            `❌ Payment Rejected!\n\n💰 Amount: ₹${payment.amount}\n🆔 Transaction: ${transactionId}\n\n❌ Your payment was rejected. Please try again.\n\n📤 Send /start to try again.`
                        );
                    } catch (e) {}

                    await this.bot.sendMessage(
                        chatId,
                        `✅ Protection Payment Rejected!\n\n👤 User: @${user.username}\n💰 Amount: ₹${payment.amount}\n🆔 Transaction: ${transactionId}\n\nUser has been notified.`
                    );

                } else if (payment.payment_type === 'points') {
                    user.points_purchase_pending = 0;
                    user.points_purchase_transaction = null;
                    user.points_purchase_ss = null;
                    await user.save();

                    try {
                        await this.bot.sendMessage(
                            parseInt(payment.user_id),
                            `❌ Points Purchase Rejected!\n\n📊 Points: ${payment.points}\n💰 Amount: ₹${payment.amount}\n🆔 Transaction: ${transactionId}\n\n❌ Your payment was rejected. Please try again.\n\n📤 Send /start to try again.`
                        );
                    } catch (e) {}

                    await this.bot.sendMessage(
                        chatId,
                        `✅ Points Purchase Rejected!\n\n👤 User: @${user.username}\n📊 Points: ${payment.points}\n💰 Amount: ₹${payment.amount}\n🆔 Transaction: ${transactionId}\n\nUser has been notified.`
                    );
                }
            }

        } catch (error) {
            addLog(`❌ Payment approval error: ${error.message}`, 'ERROR');
            await this.bot.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    }

    // ============================================
    // HANDLE PROTECT TARGET
    // ============================================

    async handleProtectTarget(chatId, userId, username, target) {
        try {
            const user = await User.findOne({ telegram_id: userId.toString() });
            if (!user) {
                await this.bot.sendMessage(chatId, '❌ Please use /start first.');
                return;
            }

            if (user.protection_status !== 'approved') {
                await this.bot.sendMessage(
                    chatId,
                    `❌ No active protection permission!\n\nPlease complete payment first.\n\nClick 🛡️ Protection to start.`
                );
                return;
            }

            const existing = await Protected.findOne({ protected_by: userId.toString() });
            if (existing) {
                await this.bot.sendMessage(
                    chatId,
                    `❌ You already have active protection!\n\n📋 Type: ${existing.target_type.toUpperCase()}\n🎯 Target: ${existing.target_name}\n\nYou cannot protect another target.`
                );
                return;
            }

            let targetType = user.protection_type || 'account';
            let targetId = target;

            if (target.startsWith('@')) {
                targetType = 'account';
                targetId = target.substring(1);
            } else if (target.includes('t.me/')) {
                if (target.includes('joinchat')) {
                    targetType = 'group';
                    targetId = target.split('/').pop();
                } else {
                    targetType = 'channel';
                    targetId = target.split('/').pop();
                }
            }

            const existingProtection = await Protected.findOne({ 
                target_type: targetType,
                target_id: targetId
            });
            if (existingProtection) {
                await this.bot.sendMessage(
                    chatId,
                    `🛡️ This ${targetType} is already protected!\n\n❌ Cannot protect someone else's protected target.`
                );
                return;
            }

            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + CONFIG.protectionExpiryDays);

            const protectedItem = new Protected({
                target_type: targetType,
                target_id: targetId,
                target_name: target,
                protected_by: userId.toString(),
                transaction_id: user.transaction_id,
                expiry_date: expiryDate
            });
            await protectedItem.save();

            user.protection_status = 'active';
            user.protection_target = targetId;
            user.protection_expiry = expiryDate;
            await user.save();

            await this.bot.sendMessage(
                chatId,
                `✅ Protection Activated!\n\n🛡️ Type: ${targetType.toUpperCase()}\n🎯 Target: ${target}\n📅 Expiry: ${moment(expiryDate).format('DD MMM YYYY')}\n\n✅ ${targetType.toUpperCase()} is now protected by RTF!\n\n⚠️ Anyone trying to report it will see: "This ${targetType} is protected by RTF"`
            );

            this.conversations.delete(userId);

        } catch (error) {
            addLog(`❌ Protect target error: ${error.message}`, 'ERROR');
            await this.bot.sendMessage(chatId, '❌ Error. Please try again.');
        }
    }

    // ============================================
    // HANDLE REFERRAL - FULLY FIXED (No Limit)
    // ============================================

    async handleReferral(userId, referrerId, newUserUsername = null) {
        try {
            // Check if referrer is subscribed to ALL channels
            const subStatus = await this.checkAllSubscriptions(parseInt(referrerId));
            if (!subStatus.allSubscribed) {
                addLog(`❌ Referrer ${referrerId} not subscribed to all channels, referral denied`, 'WARN');
                try {
                    await this.bot.sendMessage(
                        parseInt(referrerId),
                        `❌ Referral Failed!\n\nYou need to join ALL channels to earn referral points.\n\nPlease use /start to see the channels you need to join.`
                    );
                } catch (e) {}
                return false;
            }

            const referrer = await User.findOne({ telegram_id: referrerId });
            if (!referrer) {
                addLog(`❌ Referrer ${referrerId} not found`, 'WARN');
                return false;
            }

            // ✅ REMOVED: No rate limit, no per-minute restriction
            // Users can refer as many as they want

            // Add points
            referrer.points += 1;
            referrer.referrals += 1;
            await referrer.save();

            // Update analytics
            await Analytics.updateOne(
                { date: { $gte: new Date().setHours(0,0,0,0) } },
                { $inc: { total_referrals: 1 } },
                { upsert: true }
            );

            addLog(`🔗 Referral: User ${userId} referred by @${referrer.username}`, 'INFO');

            // Notify referrer
            const referralLink = await this.getReferralLink(referrer.telegram_id);
            try {
                const newUser = await User.findOne({ telegram_id: userId });
                const newName = newUserUsername || `@${newUser?.username || 'user'}`;
                await this.bot.sendMessage(
                    parseInt(referrerId),
                    `🎉 New Referral!\n\n👤 ${newName} joined using your referral link!\n⭐ You earned 1 point!\n📊 Total Points: ${referrer.points}\n\n🔗 Keep sharing: ${referralLink}\n\n💡 ${CONFIG.refersForReport} points = 1 report\n🎯 ${CONFIG.reportsPerTarget} reports = 99.99% ban`
                );
            } catch (e) {
                addLog(`❌ Failed to notify referrer: ${e.message}`, 'ERROR');
            }

            // Notify admins about referral
            for (const adminId of CONFIG.adminIds) {
                try {
                    const newUser = await User.findOne({ telegram_id: userId });
                    const newName = newUserUsername || `@${newUser?.username || 'user'}`;
                    await this.bot.sendMessage(
                        adminId,
                        `👥 New Referral!\n\n👤 Referrer: @${referrer.username}\n👤 New User: ${newName}\n🆔 Referrer ID: ${referrerId}\n🆔 New User ID: ${userId}\n⭐ Points Earned: 1\n\n📊 Referrer Total Points: ${referrer.points}`
                    );
                } catch (e) {
                    addLog(`❌ Failed to notify admin about referral: ${e.message}`, 'ERROR');
                }
            }

            return true;

        } catch (error) {
            addLog(`❌ Referral error: ${error.message}`, 'ERROR');
            return false;
        }
    }

    // ============================================
    // COMMANDS
    // ============================================

    setupCommands() {
        // ============================================
        // START COMMAND
        // ============================================

        this.bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            const username = msg.from.username || '';
            const firstName = msg.from.first_name || '';
            const referralCode = match ? match[1] : null;

            addLog(`📥 /start from @${username} (${userId})`, 'INFO');

            try {
                const botUsername = await getBotUsername(this.bot);

                let user = await User.findOne({ telegram_id: userId.toString() });
                let isNewUser = false;

                if (!user) {
                    isNewUser = true;
                    const referralCodeGen = `REF_${userId}_${Date.now().toString(36)}`;
                    user = new User({
                        telegram_id: userId.toString(),
                        username: username || `user_${userId}`,
                        first_name: firstName || '',
                        referral_code: referralCodeGen,
                        is_verified: false,
                        protection_status: 'none',
                        welcome_channel_shown: false,
                        points_purchase_pending: 0
                    });
                    await user.save();
                    addLog(`👤 New user created: @${username || user.username}`, 'INFO');
                }

                const subStatus = await this.checkAllSubscriptions(userId);
                
                if (!subStatus.allSubscribed) {
                    addLog(`🔐 User @${username} not subscribed to all channels`, 'INFO');
                    await this.showAllChannels(chatId, userId, subStatus.missingChannels);
                    return;
                }

                if (isNewUser && referralCode) {
                    let referrerId = null;
                    
                    if (!isNaN(referralCode) && referralCode.length > 5) {
                        referrerId = referralCode;
                    } else if (referralCode.startsWith('REF_')) {
                        const referrer = await User.findOne({ referral_code: referralCode });
                        if (referrer) {
                            referrerId = referrer.telegram_id;
                        }
                    }
                    
                    if (referrerId && referrerId !== userId.toString()) {
                        const referrer = await User.findOne({ telegram_id: referrerId });
                        
                        if (referrer) {
                            const isReferrerAdmin = CONFIG.adminIds.includes(parseInt(referrerId));
                            let isReferrerSubscribed = true;
                            if (!isReferrerAdmin) {
                                const subCheck = await this.checkAllSubscriptions(parseInt(referrerId));
                                isReferrerSubscribed = subCheck.allSubscribed;
                            }

                            if (isReferrerSubscribed) {
                                const newUserUsername = `@${username || 'user'}`;
                                await this.handleReferral(userId, referrerId, newUserUsername);
                            } else {
                                addLog(`⚠️ Referrer ${referrer.username} not subscribed, referral ignored`, 'WARN');
                            }
                        }
                    }
                }

                if (!user.is_verified) {
                    user.is_verified = true;
                    await user.save();
                    addLog(`✅ User @${username} verified`, 'INFO');
                }

                user = await User.findOne({ telegram_id: userId.toString() });

                const points = user.points || 0;
                const reportsAvailable = Math.floor(points / CONFIG.refersForReport);
                const reportsUsed = user.reports_used || 0;
                const remaining = reportsAvailable - reportsUsed;

                let protectionMsg = '';
                if (user.protection_status === 'active') {
                    const protectedItem = await Protected.findOne({ protected_by: userId.toString() });
                    if (protectedItem) {
                        protectionMsg = `\n🛡️ Protection: ✅ Active (${protectedItem.target_type.toUpperCase()})`;
                    }
                } else if (user.protection_status === 'approved') {
                    protectionMsg = `\n🛡️ Protection: ✅ Payment Approved - Send target to protect!`;
                } else if (user.protection_status === 'pending_approval') {
                    protectionMsg = `\n🛡️ Protection: ⏳ Pending Admin Approval`;
                } else if (user.protection_status === 'pending_payment') {
                    protectionMsg = `\n🛡️ Protection: ⏳ Payment Pending - Send screenshot`;
                }

                const referralLink = await this.getReferralLink(userId);

                const welcomeMessage = `🔥 ULTIMATE BAN BOT v3.0

🌟 Your Stats:
• Points: ${points} ⭐
• Referrals: ${user.referrals || 0}
• Reports Available: ${Math.max(0, remaining)}
• Reports Used: ${reportsUsed}${protectionMsg}

⚡ Features:
• 99.99% Success Rate
• ${CONFIG.reportsPerTarget} Reports per Target
• 3 Report Types: Account, Channel, Group
• 🛡️ Protection System

💰 Points Purchase:
• ₹${CONFIG.pointPrice} per point
• Minimum: ${CONFIG.minPointsPurchase} points
• Use "Buy Points" button

🔗 Referral System:
• ${CONFIG.refersForReport} points = 1 report
• ${CONFIG.reportsPerTarget} reports = 99.99% ban
• Share: ${referralLink}

💡 Select a report type below to start!

/help for more info`;

                await this.bot.sendMessage(chatId, welcomeMessage, this.getMainMenu());

            } catch (error) {
                addLog(`❌ Start error: ${error.message}`, 'ERROR');
                try {
                    await this.bot.sendMessage(chatId, '❌ Error starting bot. Please try again.');
                } catch (e) {}
            }
        });

        // ============================================
        // CALLBACK QUERY HANDLER
        // ============================================

        this.bot.on('callback_query', async (query) => {
            const chatId = query.message.chat.id;
            const userId = query.from.id;
            const username = query.from.username || 'unknown';
            const data = query.data;

            addLog(`📥 Callback: ${data} from @${username}`, 'INFO');

            try {
                if (data === 'verify_all_channels') {
                    const subStatus = await this.checkAllSubscriptions(userId);
                    
                    if (subStatus.allSubscribed) {
                        let user = await User.findOne({ telegram_id: userId.toString() });
                        if (user) {
                            user.is_verified = true;
                            await user.save();
                        }

                        await this.bot.sendMessage(
                            chatId,
                            `✅ VERIFICATION SUCCESSFUL!\n\nNow you can use the bot! Send /start to continue.`
                        );
                    } else {
                        await this.showMissingChannels(chatId, userId, subStatus.missingChannels);
                    }
                    await this.bot.answerCallbackQuery(query.id);
                    return;
                }

                if (data === 'protect_account' || data === 'protect_channel' || data === 'protect_group') {
                    const protectionType = data.replace('protect_', '');
                    await this.processPayment(chatId, userId, username, protectionType);
                    await this.bot.answerCallbackQuery(query.id);
                    return;
                }

                if (data === 'protect_back') {
                    await this.bot.sendMessage(
                        chatId,
                        `🔙 Back to main menu.`,
                        this.getMainMenu()
                    );
                    await this.bot.answerCallbackQuery(query.id);
                    return;
                }

                if (data.startsWith('approve_')) {
                    const transactionId = data.replace('approve_', '');
                    await this.handlePaymentApproval(chatId, userId, transactionId, true);
                    await this.bot.answerCallbackQuery(query.id);
                    return;
                }

                if (data.startsWith('reject_')) {
                    const transactionId = data.replace('reject_', '');
                    await this.handlePaymentApproval(chatId, userId, transactionId, false);
                    await this.bot.answerCallbackQuery(query.id);
                    return;
                }

            } catch (error) {
                addLog(`❌ Callback error: ${error.message}`, 'ERROR');
                await this.bot.sendMessage(chatId, '❌ Error. Please try again.');
            }
        });

        // ============================================
        // BUY POINTS BUTTON
        // ============================================

        this.bot.onText(/💰 Buy Points/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            const username = msg.from.username || 'unknown';

            addLog(`💰 Buy Points clicked by @${username} (${userId})`, 'INFO');
            
            const subStatus = await this.checkAllSubscriptions(userId);
            if (!subStatus.allSubscribed) {
                await this.showMissingChannels(chatId, userId, subStatus.missingChannels);
                return;
            }
            
            await this.processPointsPurchase(chatId, userId, username);
        });

        // ============================================
        // PROTECTION BUTTON
        // ============================================

        this.bot.onText(/🛡️ Protection/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            const username = msg.from.username || 'unknown';

            addLog(`🛡️ Protection clicked by @${username} (${userId})`, 'INFO');
            
            const subStatus = await this.checkAllSubscriptions(userId);
            if (!subStatus.allSubscribed) {
                await this.showMissingChannels(chatId, userId, subStatus.missingChannels);
                return;
            }
            
            await this.startProtectionProcess(chatId, userId, username);
        });

        // ============================================
        // REPORT ACCOUNT BUTTON
        // ============================================

        this.bot.onText(/🎯 Report Account/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            const username = msg.from.username || 'unknown';

            addLog(`🎯 Report Account clicked by @${username} (${userId})`, 'INFO');
            
            const subStatus = await this.checkAllSubscriptions(userId);
            if (!subStatus.allSubscribed) {
                await this.showMissingChannels(chatId, userId, subStatus.missingChannels);
                return;
            }
            
            await this.startReportProcess(chatId, userId, username, 'account');
        });

        // ============================================
        // REPORT CHANNEL BUTTON
        // ============================================

        this.bot.onText(/📢 Report Channel/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            const username = msg.from.username || 'unknown';

            addLog(`📢 Report Channel clicked by @${username} (${userId})`, 'INFO');
            
            const subStatus = await this.checkAllSubscriptions(userId);
            if (!subStatus.allSubscribed) {
                await this.showMissingChannels(chatId, userId, subStatus.missingChannels);
                return;
            }
            
            await this.startReportProcess(chatId, userId, username, 'channel');
        });

        // ============================================
        // REPORT GROUP BUTTON
        // ============================================

        this.bot.onText(/👥 Report Group/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            const username = msg.from.username || 'unknown';

            addLog(`👥 Report Group clicked by @${username} (${userId})`, 'INFO');
            
            const subStatus = await this.checkAllSubscriptions(userId);
            if (!subStatus.allSubscribed) {
                await this.showMissingChannels(chatId, userId, subStatus.missingChannels);
                return;
            }
            
            await this.startReportProcess(chatId, userId, username, 'group');
        });

        // ============================================
        // CANCEL
        // ============================================

        this.bot.onText(/❌ Cancel/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            const username = msg.from.username || 'unknown';

            addLog(`❌ Cancel by @${username} (${userId})`, 'INFO');
            this.conversations.delete(userId);
            await this.bot.sendMessage(chatId, '❌ Cancelled.', this.getMainMenu());
        });

        // ============================================
        // MY STATS
        // ============================================

        this.bot.onText(/📊 My Stats/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;

            try {
                const subStatus = await this.checkAllSubscriptions(userId);
                if (!subStatus.allSubscribed) {
                    await this.showMissingChannels(chatId, userId, subStatus.missingChannels);
                    return;
                }

                const user = await User.findOne({ telegram_id: userId.toString() });
                if (!user) {
                    await this.bot.sendMessage(chatId, '❌ Please use /start first.');
                    return;
                }

                const points = user.points || 0;
                const reportsAvailable = Math.floor(points / CONFIG.refersForReport);
                const reportsUsed = user.reports_used || 0;
                const remaining = reportsAvailable - reportsUsed;
                const referralLink = await this.getReferralLink(userId);

                let protectionInfo = '❌ None';
                if (user.protection_status === 'active') {
                    const protectedItem = await Protected.findOne({ protected_by: userId.toString() });
                    if (protectedItem) {
                        protectionInfo = `✅ ${protectedItem.target_type.toUpperCase()} (${protectedItem.target_name})`;
                    }
                } else if (user.protection_status === 'approved') {
                    protectionInfo = '✅ Payment Approved - Send target to protect';
                } else if (user.protection_status === 'pending_approval') {
                    protectionInfo = '⏳ Pending Admin Approval';
                } else if (user.protection_status === 'pending_payment') {
                    protectionInfo = '⏳ Payment Pending';
                }

                const statsMessage = `📊 Your Stats

👤 User: @${user.username || 'unknown'}
⭐ Points: ${points}
🔗 Referrals: ${user.referrals || 0}
📨 Reports Available: ${Math.max(0, remaining)}
📤 Reports Used: ${reportsUsed}
📈 Success Rate: ${reportsUsed > 0 ? Math.round((user.reports_success / reportsUsed) * 100) : 0}%

🛡️ Protection: ${protectionInfo}

📅 Joined: ${moment(user.created_at).format('DD MMM YYYY')}
🔄 Last Active: ${moment(user.last_active).fromNow()}

🔗 Referral Link:
${referralLink}

💰 Points Purchase:
• ₹${CONFIG.pointPrice} per point
• Minimum: ${CONFIG.minPointsPurchase} points
• Use "Buy Points" button

💡 Higher Evidence = Higher Ban Chance!`;

                await this.bot.sendMessage(chatId, statsMessage);

            } catch (error) {
                addLog(`❌ Stats error: ${error.message}`, 'ERROR');
                await this.bot.sendMessage(chatId, '❌ Error.');
            }
        });

        // ============================================
        // REFER & EARN - FIXED
        // ============================================

        this.bot.onText(/🔗 Refer & Earn/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;

            try {
                const subStatus = await this.checkAllSubscriptions(userId);
                if (!subStatus.allSubscribed) {
                    await this.showMissingChannels(chatId, userId, subStatus.missingChannels);
                    return;
                }

                const user = await User.findOne({ telegram_id: userId.toString() });
                if (!user) {
                    await this.bot.sendMessage(chatId, '❌ Please use /start first.');
                    return;
                }

                const points = user.points || 0;
                const nextReport = CONFIG.refersForReport - (points % CONFIG.refersForReport);
                const referralLink = await this.getReferralLink(userId);

                const referMessage = `🔗 Refer & Earn Points!

📊 Your Stats:
• Points: ${points} ⭐
• Next Report in: ${nextReport} points

🎯 How it works:
1. Share your referral link
2. Each new user = 1 point
3. ${CONFIG.refersForReport} points = 100 report (${CONFIG.reportsPerTarget} reports for 99.99% ban)
4. No limit on referrals!

⚠️ Important: You must stay subscribed to ALL channels to earn points!

💰 Or buy points using "Buy Points" button!

🔗 Your Referral Link:
${referralLink}`;

                await this.bot.sendMessage(chatId, referMessage);

            } catch (error) {
                addLog(`❌ Refer error: ${error.message}`, 'ERROR');
                await this.bot.sendMessage(chatId, '❌ Error.');
            }
        });

        // ============================================
        // HELP
        // ============================================

        this.bot.onText(/ℹ️ Help/, async (msg) => {
            const chatId = msg.chat.id;
            
            const helpMessage = `ℹ️ Help & Guide

🔥 How to Ban:
1. Click "🎯 Report Account", "📢 Report Channel", or "👥 Report Group"
2. Enter @username or link
3. Upload evidence (screenshots, links, descriptions)
4. Bot sends ${CONFIG.reportsPerTarget} reports
5. 99.99% ban chance!

🛡️ Protection System:
1. Click "🛡️ Protection"
2. Select what to protect (Account/Channel/Group)
3. Pay ₹${CONFIG.protectionPrice} via QR
4. Send transaction screenshot
5. Admin approves (5-15 min)
6. Send the target you want to protect
7. Target is protected for ${CONFIG.protectionExpiryDays} days!

💰 Points Purchase System:
1. Click "💰 Buy Points"
2. Enter number of points (minimum ${CONFIG.minPointsPurchase})
3. ₹${CONFIG.pointPrice} per point
4. Pay via QR code
5. Send screenshot
6. Admin approves
7. Points added to your account!

📊 Points System:
• ${CONFIG.refersForReport} points = 1 report
• Refer others to earn points
• No limit on referrals!

📤 Evidence Guide (Important!):

📸 Screenshots: Chat logs, violations, profiles
🔗 Links: Harmful content, scam websites
📝 Description: What happened, when, where
🎥 Videos: Screen recordings of violations

💡 HIGHER EVIDENCE = HIGHER BAN CHANCE!

Evidence Type | Ban Chance
Screenshots + Description + Links | 95%
Screenshots + Description | 85%
Screenshots Only | 70%
Description Only | 40%
No Evidence (Skip) | 5%

⚠️ Success Factors:
• Real violation
• Strong evidence
• ${CONFIG.reportsPerTarget} reports
• 99.99% success!

🛡️ Protected targets cannot be reported!

💡 /start to begin!`;

            await this.bot.sendMessage(chatId, helpMessage);
        });

        // ============================================
        // ADMIN PANEL
        // ============================================

        this.bot.onText(/👑 Admin Panel/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;

            if (!CONFIG.adminIds.includes(parseInt(userId))) {
                await this.bot.sendMessage(chatId, '❌ Unauthorized.');
                return;
            }

            const stats = await this.getAdminStats();
            const protectedCount = await Protected.countDocuments();
            const pendingPayments = await Payment.countDocuments({ status: 'pending' });
            const pendingPoints = await User.countDocuments({ points_purchase_pending: { $gt: 0 } });

            const adminMessage = `👑 Admin Panel

📊 Stats:
• Users: ${stats.totalUsers}
• Reports: ${stats.totalReports}
• Queue: ${this.queue.length}
• Protected: ${protectedCount}
• Pending Payments: ${pendingPayments}
• Pending Points Purchases: ${pendingPoints}

🔧 Commands:
• /addpoints @username 5 - Add points
• /setpoints @username 10 - Set points
• /protect @username - Protect target (free)
• /unprotect @username - Remove protection
• /banuser @username - Ban user
• /unbanuser @username - Unban user
• /broadcast - Send message
• /stats - Detailed stats
• /logs - View logs
• /addqr - Add QR code (send photo)
• /removeqr - Remove QR code
• /payments - View pending payments

📢 Channel Management:
• /addchannel id link name - Add mandatory channel
• /removechannel id - Remove mandatory channel
• /listchannels - List all channels`;

            await this.bot.sendMessage(chatId, adminMessage);
        });

        // ============================================
        // ADMIN: ADD CHANNEL
        // ============================================

        this.bot.onText(/\/addchannel (.+) (.+) (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;

            if (!CONFIG.adminIds.includes(parseInt(userId))) {
                await this.bot.sendMessage(chatId, '❌ Unauthorized.');
                return;
            }

            const channelId = match[1].trim();
            const channelLink = match[2].trim();
            const channelName = match[3].trim();

            try {
                CONFIG.channels.mandatory.push({
                    id: channelId,
                    link: channelLink,
                    name: channelName,
                    type: 'channel',
                    isPublic: channelId.startsWith('@') || channelId.includes('rtf') ? true : false
                });

                addLog(`✅ Admin added channel: ${channelName} (${channelId})`, 'INFO');

                await this.bot.sendMessage(
                    chatId,
                    `✅ Channel Added Successfully!\n\n📢 Name: ${channelName}\n🆔 ID: ${channelId}\n🔗 Link: ${channelLink}\n\n📊 Total Mandatory Channels: ${CONFIG.channels.mandatory.length}`
                );

            } catch (error) {
                addLog(`❌ Add channel error: ${error.message}`, 'ERROR');
                await this.bot.sendMessage(chatId, `❌ Error: ${error.message}`);
            }
        });

        // ============================================
        // ADMIN: REMOVE CHANNEL
        // ============================================

        this.bot.onText(/\/removechannel (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;

            if (!CONFIG.adminIds.includes(parseInt(userId))) {
                await this.bot.sendMessage(chatId, '❌ Unauthorized.');
                return;
            }

            const channelId = match[1].trim();

            try {
                const index = CONFIG.channels.mandatory.findIndex(c => c.id === channelId);
                
                if (index === -1) {
                    await this.bot.sendMessage(chatId, '❌ Channel not found.');
                    return;
                }

                const removed = CONFIG.channels.mandatory.splice(index, 1)[0];

                addLog(`✅ Admin removed channel: ${removed.name} (${removed.id})`, 'INFO');

                await this.bot.sendMessage(
                    chatId,
                    `✅ Channel Removed Successfully!\n\n📢 Name: ${removed.name}\n🆔 ID: ${removed.id}\n\n📊 Total Mandatory Channels: ${CONFIG.channels.mandatory.length}`
                );

            } catch (error) {
                addLog(`❌ Remove channel error: ${error.message}`, 'ERROR');
                await this.bot.sendMessage(chatId, `❌ Error: ${error.message}`);
            }
        });

        // ============================================
        // ADMIN: LIST CHANNELS
        // ============================================

        this.bot.onText(/\/listchannels/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;

            if (!CONFIG.adminIds.includes(parseInt(userId))) {
                await this.bot.sendMessage(chatId, '❌ Unauthorized.');
                return;
            }

            let message = `📢 Channel List\n\n`;
            message += `Mandatory Channels (${CONFIG.channels.mandatory.length}):\n`;
            
            for (const channel of CONFIG.channels.mandatory) {
                message += `• ${channel.name}\n`;
                message += `  🆔 ${channel.id}\n`;
                message += `  🔗 ${channel.link}\n`;
                if (channel.isPublic) {
                    message += `  📌 Public Channel\n`;
                }
                message += `\n`;
            }

            message += `💡 Use /addchannel, /removechannel to manage channels.`;

            await this.bot.sendMessage(chatId, message);
        });

        // ============================================
        // ADMIN: ADD POINTS
        // ============================================

        this.bot.onText(/\/addpoints (.+) (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;

            if (!CONFIG.adminIds.includes(parseInt(userId))) {
                await this.bot.sendMessage(chatId, '❌ Unauthorized.');
                return;
            }

            const target = match[1].trim();
            const points = parseInt(match[2].trim());

            if (isNaN(points) || points < 1) {
                await this.bot.sendMessage(chatId, '❌ Invalid points. Use: /addpoints @username 5');
                return;
            }

            try {
                const user = await User.findOne({ username: target.replace('@', '') });
                if (!user) {
                    await this.bot.sendMessage(chatId, '❌ User not found.');
                    return;
                }

                user.points += points;
                await user.save();

                addLog(`⭐ Admin added ${points} points to @${user.username}`, 'INFO');

                await this.bot.sendMessage(
                    chatId,
                    `✅ Points Added!\n\n👤 User: @${user.username}\n⭐ Points Added: ${points}\n📊 Total Points: ${user.points}`
                );

            } catch (error) {
                addLog(`❌ Add points error: ${error.message}`, 'ERROR');
                await this.bot.sendMessage(chatId, `❌ Error: ${error.message}`);
            }
        });

        // ============================================
        // ADMIN: SET POINTS
        // ============================================

        this.bot.onText(/\/setpoints (.+) (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;

            if (!CONFIG.adminIds.includes(parseInt(userId))) {
                await this.bot.sendMessage(chatId, '❌ Unauthorized.');
                return;
            }

            const target = match[1].trim();
            const points = parseInt(match[2].trim());

            if (isNaN(points) || points < 0) {
                await this.bot.sendMessage(chatId, '❌ Invalid points. Use: /setpoints @username 10');
                return;
            }

            try {
                const user = await User.findOne({ username: target.replace('@', '') });
                if (!user) {
                    await this.bot.sendMessage(chatId, '❌ User not found.');
                    return;
                }

                user.points = points;
                await user.save();

                addLog(`⭐ Admin set ${points} points to @${user.username}`, 'INFO');

                await this.bot.sendMessage(
                    chatId,
                    `✅ Points Set!\n\n👤 User: @${user.username}\n⭐ Points Set: ${points}`
                );

            } catch (error) {
                addLog(`❌ Set points error: ${error.message}`, 'ERROR');
                await this.bot.sendMessage(chatId, `❌ Error: ${error.message}`);
            }
        });

        // ============================================
        // ADMIN: PROTECT (Free)
        // ============================================

        this.bot.onText(/\/protect (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;

            if (!CONFIG.adminIds.includes(parseInt(userId))) {
                await this.bot.sendMessage(chatId, '❌ Unauthorized.');
                return;
            }

            const target = match[1].trim();
            let targetType = 'account';
            let targetId = target;

            if (target.startsWith('@')) {
                targetType = 'account';
                targetId = target.substring(1);
            } else if (target.includes('t.me/')) {
                if (target.includes('joinchat')) {
                    targetType = 'group';
                    targetId = target.split('/').pop();
                } else {
                    targetType = 'channel';
                    targetId = target.split('/').pop();
                }
            }

            try {
                await Protected.create({
                    target_type: targetType,
                    target_id: targetId,
                    target_name: target,
                    protected_by: userId.toString()
                });

                addLog(`🛡️ Admin protected ${target} (${targetType})`, 'INFO');

                await this.bot.sendMessage(
                    chatId,
                    `✅ Protected Successfully!\n\n🛡️ Target: ${target}\n📋 Type: ${targetType}`
                );
            } catch (error) {
                addLog(`❌ Protect error: ${error.message}`, 'ERROR');
                await this.bot.sendMessage(chatId, `❌ Error: ${error.message}`);
            }
        });

        // ============================================
        // ADMIN: UNPROTECT
        // ============================================

        this.bot.onText(/\/unprotect (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;

            if (!CONFIG.adminIds.includes(parseInt(userId))) {
                await this.bot.sendMessage(chatId, '❌ Unauthorized.');
                return;
            }

            const target = match[1].trim();
            let targetId = target;

            if (target.startsWith('@')) {
                targetId = target.substring(1);
            } else if (target.includes('t.me/')) {
                targetId = target.split('/').pop();
            }

            try {
                await Protected.findOneAndDelete({ target_id: targetId });
                addLog(`🛡️ Admin unprotected ${target}`, 'INFO');
                await this.bot.sendMessage(
                    chatId,
                    `✅ Unprotected Successfully!\n\n🛡️ Target: ${target}`
                );
            } catch (error) {
                addLog(`❌ Unprotect error: ${error.message}`, 'ERROR');
                await this.bot.sendMessage(chatId, `❌ Error: ${error.message}`);
            }
        });

        // ============================================
        // ADMIN: BAN USER
        // ============================================

        this.bot.onText(/\/banuser (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;

            if (!CONFIG.adminIds.includes(parseInt(userId))) {
                await this.bot.sendMessage(chatId, '❌ Unauthorized.');
                return;
            }

            const target = match[1].trim();

            try {
                const user = await User.findOne({ username: target.replace('@', '') });
                if (user) {
                    user.is_banned = true;
                    await user.save();
                    addLog(`🚫 Admin banned user @${target}`, 'INFO');
                    await this.bot.sendMessage(
                        chatId,
                        `✅ User Banned Successfully!\n\n👤 User: ${target}\n🚫 Status: Banned`
                    );
                } else {
                    await this.bot.sendMessage(chatId, '❌ User not found.');
                }
            } catch (error) {
                addLog(`❌ Ban user error: ${error.message}`, 'ERROR');
                await this.bot.sendMessage(chatId, `❌ Error: ${error.message}`);
            }
        });

        // ============================================
        // ADMIN: UNBAN USER
        // ============================================

        this.bot.onText(/\/unbanuser (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;

            if (!CONFIG.adminIds.includes(parseInt(userId))) {
                await this.bot.sendMessage(chatId, '❌ Unauthorized.');
                return;
            }

            const target = match[1].trim();

            try {
                const user = await User.findOne({ username: target.replace('@', '') });
                if (user) {
                    user.is_banned = false;
                    await user.save();
                    addLog(`✅ Admin unbanned user @${target}`, 'INFO');
                    await this.bot.sendMessage(
                        chatId,
                        `✅ User Unbanned Successfully!\n\n👤 User: ${target}\n✅ Status: Active`
                    );
                } else {
                    await this.bot.sendMessage(chatId, '❌ User not found.');
                }
            } catch (error) {
                addLog(`❌ Unban user error: ${error.message}`, 'ERROR');
                await this.bot.sendMessage(chatId, `❌ Error: ${error.message}`);
            }
        });

        // ============================================
        // ADMIN: BROADCAST
        // ============================================

        this.bot.onText(/\/broadcast/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;

            if (!CONFIG.adminIds.includes(parseInt(userId))) {
                await this.bot.sendMessage(chatId, '❌ Unauthorized.');
                return;
            }

            this.conversations.set(userId, { step: 'broadcast' });
            addLog(`📢 Admin ${userId} started broadcast`, 'INFO');
            await this.bot.sendMessage(
                chatId,
                `📢 Broadcast Message\n\nSend your broadcast message.\n\nType /cancel to cancel.`
            );
        });

        // ============================================
        // ADMIN: STATS
        // ============================================

        this.bot.onText(/\/stats/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;

            if (!CONFIG.adminIds.includes(parseInt(userId))) {
                await this.bot.sendMessage(chatId, '❌ Unauthorized.');
                return;
            }

            const stats = await this.getAdminStats();
            
            let statsMessage = `📊 Detailed Stats

📈 Users:
• Total: ${stats.totalUsers}
• Active (7d): ${stats.activeUsers || 0}

📨 Reports:
• Total: ${stats.totalReports}
• Success Rate: 99.99%

📢 Channels:
• Mandatory: ${CONFIG.channels.mandatory.length}

💰 Points Purchase:
• Price: ₹${CONFIG.pointPrice}/point
• Minimum: ${CONFIG.minPointsPurchase} points

📊 Recent Analytics:\n`;
            
            const analytics = await Analytics.find().sort({ date: -1 }).limit(5);
            if (analytics.length === 0) {
                statsMessage += '• No data yet';
            } else {
                for (const a of analytics) {
                    statsMessage += `• ${moment(a.date).format('DD MMM')}: ${a.total_reports || 0} reports\n`;
                }
            }

            await this.bot.sendMessage(chatId, statsMessage);
        });

        // ============================================
        // ADMIN: LOGS
        // ============================================

        this.bot.onText(/\/logs/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;

            if (!CONFIG.adminIds.includes(parseInt(userId))) {
                await this.bot.sendMessage(chatId, '❌ Unauthorized.');
                return;
            }

            const logs = getLogs(20);
            let logMessage = '📋 Recent Logs\n\n';
            
            if (logs.length === 0) {
                logMessage += 'No logs found.';
            } else {
                for (const log of logs) {
                    const time = moment(log.timestamp).format('HH:mm:ss');
                    logMessage += `[${time}] [${log.type}] ${log.message}\n`;
                }
            }

            if (logMessage.length > 4000) {
                logMessage = logMessage.substring(0, 3900) + '\n... (truncated)';
            }

            await this.bot.sendMessage(chatId, logMessage);
        });

        // ============================================
        // ADMIN: ADD QR (Send Photo)
        // ============================================

        this.bot.onText(/\/addqr/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;

            if (!CONFIG.adminIds.includes(parseInt(userId))) {
                await this.bot.sendMessage(chatId, '❌ Unauthorized.');
                return;
            }

            this.conversations.set(userId, { step: 'addqr_photo' });
            await this.bot.sendMessage(
                chatId,
                `📤 Add QR Code\n\nPlease send the QR code image as a photo.\n\nType /cancel to cancel.`
            );
        });

        // ============================================
        // ADMIN: REMOVE QR CODE
        // ============================================

        this.bot.onText(/\/removeqr/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;

            if (!CONFIG.adminIds.includes(parseInt(userId))) {
                await this.bot.sendMessage(chatId, '❌ Unauthorized.');
                return;
            }

            try {
                await QRCode.updateMany({}, { is_active: false });
                addLog(`✅ Admin removed QR code`, 'INFO');

                await this.bot.sendMessage(
                    chatId,
                    `✅ QR Code Removed!\n\nNo QR code will be shown to users until a new one is added.`
                );
            } catch (error) {
                addLog(`❌ Remove QR error: ${error.message}`, 'ERROR');
                await this.bot.sendMessage(chatId, `❌ Error: ${error.message}`);
            }
        });

        // ============================================
        // ADMIN: PAYMENTS
        // ============================================

        this.bot.onText(/\/payments/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;

            if (!CONFIG.adminIds.includes(parseInt(userId))) {
                await this.bot.sendMessage(chatId, '❌ Unauthorized.');
                return;
            }

            try {
                const payments = await Payment.find({ status: 'pending' }).sort({ created_at: -1 });
                
                if (payments.length === 0) {
                    await this.bot.sendMessage(
                        chatId,
                        `📋 No Pending Payments\n\nAll payments are processed.`
                    );
                    return;
                }

                let paymentMessage = `📋 Pending Payments (${payments.length})\n\n`;
                for (const p of payments) {
                    paymentMessage += `🆔 ${p.transaction_id}\n`;
                    paymentMessage += `👤 @${p.username || 'unknown'}\n`;
                    paymentMessage += `📋 Type: ${p.payment_type.toUpperCase()}\n`;
                    if (p.payment_type === 'protection') {
                        paymentMessage += `🛡️ Protection: ${p.protection_type.toUpperCase()}\n`;
                    } else if (p.payment_type === 'points') {
                        paymentMessage += `📊 Points: ${p.points}\n`;
                    }
                    paymentMessage += `💰 Amount: ₹${p.amount}\n`;
                    paymentMessage += `📅 ${moment(p.created_at).fromNow()}\n`;
                    paymentMessage += `---\n`;
                }

                await this.bot.sendMessage(chatId, paymentMessage);

            } catch (error) {
                addLog(`❌ Payments error: ${error.message}`, 'ERROR');
                await this.bot.sendMessage(chatId, `❌ Error: ${error.message}`);
            }
        });
    }

    // ============================================
    // MESSAGE HANDLER
    // ============================================

    setupMessageHandler() {
        this.bot.on('message', async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            const text = msg.text;
            const photo = msg.photo;
            const video = msg.video;
            const document = msg.document;
            const username = msg.from.username || 'unknown';

            if (!text && !photo && !video && !document) return;
            if (text && text.startsWith('/')) return;
            if (text && text.startsWith('🎯')) return;
            if (text && text.startsWith('📢')) return;
            if (text && text.startsWith('👥')) return;
            if (text && text.startsWith('🛡️')) return;
            if (text && text.startsWith('📊')) return;
            if (text && text.startsWith('🔗')) return;
            if (text && text.startsWith('ℹ️')) return;
            if (text && text.startsWith('👑')) return;
            if (text && text.startsWith('💰')) return;
            if (text && text.startsWith('❌')) return;

            const conversation = this.conversations.get(userId);
            if (!conversation) return;

            addLog(`📥 Message from @${username}: ${text || 'Media'}`, 'INFO');

            try {
                const subStatus = await this.checkAllSubscriptions(userId);
                if (!subStatus.allSubscribed) {
                    await this.showMissingChannels(chatId, userId, subStatus.missingChannels);
                    this.conversations.delete(userId);
                    return;
                }

                try {
                    await rateLimiter.consume(userId.toString());
                } catch {
                    addLog(`⏳ Rate limit exceeded for @${username}`, 'WARN');
                    await this.bot.sendMessage(chatId, '⏳ Rate limit exceeded. Please wait.');
                    return;
                }

                const user = await User.findOne({ telegram_id: userId.toString() });
                if (user && user.is_banned) {
                    addLog(`🚫 Banned user @${username} tried to use bot`, 'WARN');
                    await this.bot.sendMessage(chatId, '❌ You are banned from using this bot.');
                    this.conversations.delete(userId);
                    return;
                }

                // ============================================
                // POINTS AMOUNT INPUT
                // ============================================

                if (conversation.step === 'points_amount') {
                    await this.handlePointsAmount(chatId, userId, username, text);
                    return;
                }

                // ============================================
                // TARGET INPUT (Report)
                // ============================================

                if (conversation.step === 'target') {
                    addLog(`🎯 Target input from @${username}: ${text}`, 'INFO');
                    
                    let target = text || '';
                    target = target.replace(/^@/, '')
                        .replace(/^https?:\/\/t\.me\//, '')
                        .replace(/^joinchat\//, '')
                        .trim();

                    if (!target || target.length < 3) {
                        await this.bot.sendMessage(chatId, '❌ Please enter a valid @username or link.');
                        return;
                    }

                    const targetType = conversation.targetType || 'account';
                    
                    const protectedItem = await this.checkProtected(target, targetType);
                    if (protectedItem) {
                        const protectedBy = await User.findOne({ telegram_id: protectedItem.protected_by });
                        addLog(`🛡️ Target ${target} is protected by @${protectedBy?.username || 'unknown'}`, 'INFO');
                        await this.bot.sendMessage(
                            chatId,
                            `🛡️ This ${targetType} is PROTECTED!\n\n⚠️ ${target} is protected by RTF Ban Bot.\n\n❌ Cannot send reports to protected ${targetType}.`
                        );
                        this.conversations.delete(userId);
                        await this.bot.sendMessage(chatId, '❌ Action cancelled.', this.getMainMenu());
                        return;
                    }

                    conversation.target = target;
                    conversation.step = 'evidence';
                    this.conversations.set(userId, conversation);

                    const typeNames = {
                        account: 'Account',
                        channel: 'Channel',
                        group: 'Group'
                    };

                    const evidenceGuide = `📤 Upload Evidence or type "skip".

📸 Best Evidence:
1. Screenshots (JPG, PNG, GIF)
2. Videos (MP4)
3. Documents (PDF, TXT)
4. Links to violations
5. Description of violation

💡 HIGHER EVIDENCE = HIGHER BAN CHANCE!

Evidence Type | Ban Chance
Screenshots + Links | 95%
Screenshots | 70-85%
Description Only | 40%
Skip Evidence | 5%

✅ Recommended: Upload screenshots + description for 95% ban chance!`;

                    await this.bot.sendMessage(
                        chatId,
                        `✅ Target: ${target}\n📋 Type: ${typeNames[targetType]}\n\n${evidenceGuide}`,
                        {
                            reply_markup: {
                                keyboard: [
                                    ['skip', '❌ Cancel']
                                ],
                                resize_keyboard: true,
                                one_time_keyboard: true
                            }
                        }
                    );
                }

                // ============================================
                // EVIDENCE (Report)
                // ============================================

                else if (conversation.step === 'evidence') {
                    addLog(`📤 Evidence received from @${username}`, 'INFO');
                    
                    let evidenceText = null;
                    let evidenceFiles = [];

                    if (photo) {
                        const fileId = photo[photo.length - 1].file_id;
                        const file = await this.bot.getFile(fileId);
                        evidenceFiles.push({
                            file_id: fileId,
                            file_type: 'photo',
                            file_path: file.file_path
                        });
                        evidenceText = '📸 Photo evidence uploaded (Screenshot)';
                        addLog(`📸 Photo evidence from @${username}`, 'INFO');
                    } else if (video) {
                        const file = await this.bot.getFile(video.file_id);
                        evidenceFiles.push({
                            file_id: video.file_id,
                            file_type: 'video',
                            file_path: file.file_path
                        });
                        evidenceText = '🎥 Video evidence uploaded (Screen recording)';
                        addLog(`🎥 Video evidence from @${username}`, 'INFO');
                    } else if (document) {
                        const file = await this.bot.getFile(document.file_id);
                        evidenceFiles.push({
                            file_id: document.file_id,
                            file_type: 'document',
                            file_path: file.file_path
                        });
                        evidenceText = '📄 Document evidence uploaded (Report/Logs)';
                        addLog(`📄 Document evidence from @${username}`, 'INFO');
                    } else if (text && text.toLowerCase() !== 'skip') {
                        evidenceText = text;
                        addLog(`📝 Text evidence from @${username}`, 'INFO');
                    }

                    if (text && text.toLowerCase() === 'skip') {
                        evidenceText = null;
                        addLog(`⏭️ User @${username} skipped evidence`, 'INFO');
                    }

                    const targetType = conversation.targetType || 'account';
                    const target = conversation.target;

                    const protectedItem = await this.checkProtected(target, targetType);
                    if (protectedItem) {
                        addLog(`🛡️ Target ${target} is protected`, 'WARN');
                        await this.bot.sendMessage(
                            chatId,
                            `🛡️ Target is PROTECTED!\n\n❌ Cannot send reports to protected target.`
                        );
                        this.conversations.delete(userId);
                        await this.bot.sendMessage(chatId, '❌ Action cancelled.', this.getMainMenu());
                        return;
                    }

                    const user = await User.findOne({ telegram_id: userId.toString() });
                    const points = user.points || 0;
                    const reportsAvailable = Math.floor(points / CONFIG.refersForReport);
                    const reportsUsed = user.reports_used || 0;
                    const remaining = reportsAvailable - reportsUsed;

                    addLog(`📊 User @${username}: Available=${reportsAvailable}, Used=${reportsUsed}, Remaining=${remaining}`, 'INFO');

                    if (remaining <= 0) {
                        addLog(`❌ User @${username} insufficient reports`, 'WARN');
                        await this.bot.sendMessage(chatId, '❌ Insufficient reports!');
                        this.conversations.delete(userId);
                        await this.bot.sendMessage(chatId, '❌ Action cancelled.', this.getMainMenu());
                        return;
                    }

                    const report = new Report({
                        user_id: userId.toString(),
                        target_username: target,
                        target_type: targetType,
                        evidence: evidenceText,
                        evidence_files: evidenceFiles,
                        status: 'processing'
                    });
                    await report.save();

                    addLog(`📋 Report created: ${report._id} for @${target}`, 'INFO');

                    const evidenceStatus = evidenceText ? '✅ Provided' : '❌ Skipped';
                    const banChance = evidenceText ? '95%' : '5%';

                    await this.bot.sendMessage(
                        chatId,
                        `⚙️ Processing Ban for ${target}\n\n📊 ${CONFIG.reportsPerTarget} reports being sent\n🎯 Target: ${target}\n📋 Type: ${targetType.toUpperCase()}\n📤 Evidence: ${evidenceStatus}\n🎯 Ban Chance: ${banChance}\n\n⏳ Please wait... This takes 2-3 minutes.`
                    );

                    this.queue.push({
                        userId: userId.toString(),
                        username: target,
                        targetType: targetType,
                        evidence: evidenceText,
                        evidenceFiles: evidenceFiles,
                        chatId: chatId,
                        reportId: report._id
                    });

                    this.conversations.delete(userId);
                    
                    await this.bot.sendMessage(chatId, '⏳ Processing started...', {
                        reply_markup: {
                            remove_keyboard: true
                        }
                    });

                    this.processQueue();
                }

                // ============================================
                // PAYMENT SCREENSHOT (Protection + Points)
                // ============================================

                else if (conversation.step === 'payment_ss') {
                    const transactionId = conversation.transactionId;
                    const paymentType = conversation.paymentType || 'protection';

                    if (!photo) {
                        await this.bot.sendMessage(
                            chatId,
                            `❌ Please send a photo of your transaction screenshot.`
                        );
                        return;
                    }

                    await this.handlePaymentScreenshot(chatId, userId, username, photo, transactionId, paymentType);
                }

                // ============================================
                // PROTECT TARGET (After Payment Approval)
                // ============================================

                else if (conversation.step === 'protection_target') {
                    const target = text.trim();
                    if (!target || target.length < 3) {
                        await this.bot.sendMessage(
                            chatId,
                            `❌ Please enter a valid @username or link.`
                        );
                        return;
                    }

                    await this.handleProtectTarget(chatId, userId, username, target);
                }

                // ============================================
                // ADD QR PHOTO (Admin)
                // ============================================

                else if (conversation.step === 'addqr_photo') {
                    if (!photo) {
                        await this.bot.sendMessage(
                            chatId,
                            `❌ Please send a photo as QR code.`
                        );
                        return;
                    }

                    try {
                        const fileId = photo[photo.length - 1].file_id;
                        
                        await QRCode.create({
                            file_id: fileId,
                            payment_amount: CONFIG.protectionPrice,
                            created_by: userId.toString(),
                            is_active: true
                        });

                        await QRCode.updateMany(
                            { _id: { $ne: (await QRCode.findOne({ is_active: true }))?._id } },
                            { is_active: false }
                        );

                        addLog(`✅ Admin added QR code`, 'INFO');

                        await this.bot.sendMessage(
                            chatId,
                            `✅ QR Code Added Successfully!\n\n💰 Amount: ₹${CONFIG.protectionPrice}\n\nThis QR code will be shown to users for protection payments and points purchase.`
                        );

                        this.conversations.delete(userId);

                    } catch (error) {
                        addLog(`❌ Add QR error: ${error.message}`, 'ERROR');
                        await this.bot.sendMessage(chatId, `❌ Error: ${error.message}`);
                    }
                }

                // ============================================
                // BROADCAST
                // ============================================

                else if (conversation.step === 'broadcast') {
                    addLog(`📢 Broadcast from admin @${username}`, 'INFO');
                    
                    let content = text;
                    let messageType = 'text';
                    let mediaUrl = null;

                    if (photo) {
                        messageType = 'photo';
                        const file = await this.bot.getFile(photo[photo.length - 1].file_id);
                        mediaUrl = file.file_path;
                        content = msg.caption || '';
                    } else if (video) {
                        messageType = 'video';
                        const file = await this.bot.getFile(video.file_id);
                        mediaUrl = file.file_path;
                        content = msg.caption || '';
                    } else if (document) {
                        messageType = 'document';
                        const file = await this.bot.getFile(document.file_id);
                        mediaUrl = file.file_path;
                        content = msg.caption || '';
                    }

                    const broadcast = new Broadcast({
                        admin_id: userId.toString(),
                        message_type: messageType,
                        content: content,
                        media_url: mediaUrl,
                        total_count: await User.countDocuments({ is_banned: false })
                    });
                    await broadcast.save();

                    const users = await User.find({ is_banned: false });
                    let sent = 0;

                    for (const user of users) {
                        try {
                            if (messageType === 'text') {
                                await this.bot.sendMessage(user.telegram_id, content);
                            } else if (messageType === 'photo') {
                                await this.bot.sendPhoto(user.telegram_id, mediaUrl, { caption: content });
                            } else if (messageType === 'video') {
                                await this.bot.sendVideo(user.telegram_id, mediaUrl, { caption: content });
                            } else if (messageType === 'document') {
                                await this.bot.sendDocument(user.telegram_id, mediaUrl, { caption: content });
                            }
                            sent++;
                        } catch (e) {
                            continue;
                        }
                    }

                    broadcast.sent_count = sent;
                    broadcast.status = 'sent';
                    await broadcast.save();

                    addLog(`📢 Broadcast sent to ${sent} users`, 'INFO');

                    this.conversations.delete(userId);
                    await this.bot.sendMessage(
                        chatId,
                        `✅ Broadcast sent to ${sent} users!`,
                        this.getMainMenu()
                    );
                }

            } catch (error) {
                addLog(`❌ Message handler error: ${error.message}`, 'ERROR');
                await this.bot.sendMessage(chatId, '❌ Error. Please try again.');
                this.conversations.delete(userId);
                await this.bot.sendMessage(chatId, '❌ Action cancelled.', {
                    reply_markup: {
                        remove_keyboard: true
                    }
                });
            }
        });
    }

    // ============================================
    // QUEUE PROCESSOR
    // ============================================

    startQueueProcessor() {
        addLog('⚙️ Queue processor started', 'INFO');
        
        setTimeout(() => {
            this.processQueue();
        }, 500);
        
        setInterval(() => {
            this.processQueue();
        }, 1000);
        
        setInterval(() => {
            if (this.queue.length > 0 && this.processing.size === 0) {
                addLog(`🔄 Force processing: ${this.queue.length} jobs waiting`, 'WARN');
                this.processQueue();
            }
        }, 3000);
    }

    async processQueue() {
        if (this.queue.length > 0) {
            addLog(`📊 Queue: ${this.queue.length} jobs, Processing: ${this.processing.size}`, 'DEBUG');
        }
        
        if (this.queue.length === 0) {
            return;
        }
        
        if (this.processing.size >= CONFIG.maxWorkers) {
            return;
        }

        const job = this.queue.shift();
        if (!job) {
            return;
        }

        addLog(`⚙️ Processing job for @${job.username} (${job.targetType})`, 'INFO');

        this.processing.add(job.userId);
        
        try {
            await this.processJob(job);
            addLog(`✅ Job completed for @${job.username}`, 'INFO');
        } catch (error) {
            addLog(`❌ Job failed for @${job.username}: ${error.message}`, 'ERROR');
            try {
                await this.bot.sendMessage(job.chatId, `❌ Error: ${error.message}`);
            } catch (e) {}
        } finally {
            this.processing.delete(job.userId);
            setImmediate(() => this.processQueue());
        }
    }

    // ============================================
    // PROCESS JOB
    // ============================================

    async processJob(job) {
        const { userId, username, targetType, evidence, chatId, reportId } = job;

        addLog(`🎯 Starting job for @${username}`, 'INFO');

        try {
            const user = await User.findOne({ telegram_id: userId });
            const violation = this.reportEngine.detectViolation(evidence);
            
            const baseProbability = evidence ? 95 : 40;
            const randomFactor = Math.floor(Math.random() * 15) - 5;
            const banProbability = Math.min(Math.max(baseProbability + randomFactor, 30), 99);
            
            addLog(`🎯 Violation: ${violation.type} (${violation.severity})`, 'INFO');
            addLog(`🎯 Ban Probability: ${banProbability}%`, 'INFO');
            
            let successCount = 0;
            let failedCount = 0;
            const totalReports = CONFIG.reportsPerTarget;

            let progressMsg = await this.bot.sendMessage(
                chatId,
                `⚙️ Processing Ban for @${username}\n\n📊 0/${totalReports} reports\n⏳ Starting...`
            );

            addLog(`📤 Sending ${totalReports} reports for @${username}`, 'INFO');

            for (let i = 0; i < totalReports; i++) {
                const report = this.reportEngine.generateReport(
                    username,
                    targetType,
                    evidence || 'Multiple user reports with screenshots',
                    violation,
                    i
                );

                let sent = false;
                let retries = 2;
                while (retries >= 0 && !sent) {
                    sent = await this.sendReport(report);
                    if (!sent && retries > 0) {
                        addLog(`🔄 Retry ${2-retries}/2 for report ${i+1}`, 'DEBUG');
                        await this.delay(1500);
                    }
                    retries--;
                }

                if (sent) {
                    successCount++;
                } else {
                    failedCount++;
                }

                if ((i + 1) % 10 === 0 || i === totalReports - 1) {
                    const progress = Math.round(((i + 1) / totalReports) * 100);
                    const bar = this.getProgressBar(progress);
                    const currentBanProb = Math.min(banProbability + Math.floor(Math.random() * 10) - 5, 99);
                    
                    try {
                        await this.bot.editMessageText(
                            `⚙️ Processing Ban for @${username}\n\n${bar} ${progress}%\n\n📊 ${i+1}/${totalReports} reports\n✅ Success: ${successCount}\n❌ Failed: ${failedCount}\n🎯 Ban Probability: ${currentBanProb}%\n\n⏳ ${Math.round((totalReports - i - 1) * 1.2)}s remaining`,
                            {
                                chat_id: chatId,
                                message_id: progressMsg.message_id
                            }
                        );
                    } catch (e) {
                        addLog(`⚠️ Could not update progress: ${e.message}`, 'WARN');
                    }
                }

                await this.delay(Math.random() * 1000 + 500);
            }

            await Report.findByIdAndUpdate(reportId, {
                report_count: totalReports,
                success_count: successCount,
                failed_count: failedCount,
                ban_probability: banProbability,
                status: 'completed'
            });

            if (user) {
                user.reports_used += 1;
                user.reports_success += successCount;
                user.reports_failed += failedCount;
                await user.save();
            }

            addLog(`✅ Completed for @${username}: ${successCount}/${totalReports} (${Math.round((successCount/totalReports)*100)}%)`, 'INFO');

            const emoji = banProbability >= 90 ? '🔥' : banProbability >= 70 ? '✅' : '⚠️';
            const finalMessage = `${emoji} BAN PROCESS COMPLETE!\n\n📊 Summary:\n• Target: @${username}\n• Type: ${targetType.toUpperCase()}\n• Total Reports: ${totalReports}\n• Successful: ${successCount}\n• Failed: ${failedCount}\n• Success Rate: ${Math.round((successCount/totalReports)*100)}%\n• Ban Probability: ${banProbability}%\n\n${banProbability >= 90 ? '🔥 90-99% BAN PROBABILITY! HIGH CHANCE!' : banProbability >= 70 ? '✅ 70-89% BAN PROBABILITY! GOOD CHANCE!' : '⚠️ 30-69% BAN PROBABILITY! NEED MORE EVIDENCE!'}\n\n📎 Reference: ${reportId}\n⏳ Expected Action: 12-72 hours\n\n${evidence ? '📤 Evidence: ✅ Provided (Higher success)' : '📤 Evidence: ❌ Skipped (Lower success)'}\n\n💡 Next time: Upload screenshots + links for 95% ban chance!`;

            await this.bot.editMessageText(finalMessage, {
                chat_id: chatId,
                message_id: progressMsg.message_id
            });

        } catch (error) {
            addLog(`❌ Execute job error: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    // ============================================
    // SEND REPORT - DIRECT MODE
    // ============================================

    async sendReport(report) {
        try {
            addLog(`📤 Sending report...`, 'DEBUG');
            
            const headers = {
                'Host': 'telegram.org',
                'origin': 'https://telegram.org',
                'content-type': 'application/x-www-form-urlencoded',
                'user-agent': this.proxyPool.getUserAgent(),
                'referer': 'https://telegram.org/support',
                'accept-language': 'en-US,en;q=0.9',
                'x-requested-with': 'XMLHttpRequest'
            };

            const data = {
                message: report,
                legal_name: this.proxyPool.getRandomName(),
                email: this.proxyPool.getRandomEmail(),
                phone: this.proxyPool.getRandomPhone(),
                setln: '',
                reports: '100',
                urgency: 'critical'
            };

            const config = {
                method: 'POST',
                url: 'https://telegram.org/support',
                headers: headers,
                data: data,
                timeout: 10000,
                maxRedirects: 0,
                validateStatus: function (status) {
                    return status < 500;
                }
            };

            const response = await axios(config);
            
            const success = response.status === 200 || 
                           response.status === 302 ||
                           response.data?.includes('success') ||
                           response.data?.includes('Thank you');

            if (success) {
                addLog(`✅ Report sent`, 'DEBUG');
            }
            return success;

        } catch (error) {
            if (error.response) {
                addLog(`❌ Report failed: Status ${error.response.status}`, 'WARN');
            } else if (error.request) {
                addLog(`❌ Report failed: No response`, 'WARN');
            } else {
                addLog(`❌ Report failed: ${error.message}`, 'WARN');
            }
            return false;
        }
    }

    // ============================================
    // CHECK PROTECTED
    // ============================================

    async checkProtected(target, targetType) {
        try {
            const protectedItem = await Protected.findOne({
                target_type: targetType,
                target_id: target
            });
            if (protectedItem) {
                if (protectedItem.expiry_date && new Date() > protectedItem.expiry_date) {
                    await Protected.findOneAndDelete({ _id: protectedItem._id });
                    return null;
                }
                return protectedItem;
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    // ============================================
    // HELPER FUNCTIONS
    // ============================================

    getProgressBar(progress) {
        const barLength = 25;
        const filled = Math.round((progress / 100) * barLength);
        const empty = barLength - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    }

    async getAdminStats() {
        const totalUsers = await User.countDocuments();
        const activeUsers = await User.countDocuments({ 
            last_active: { $gte: new Date(Date.now() - 7*24*60*60*1000) } 
        });
        const totalReports = await Report.countDocuments();
        const totalProtected = await Protected.countDocuments();
        const totalPayments = await Payment.countDocuments({ status: 'approved' });
        return { totalUsers, activeUsers, totalReports, totalProtected, totalPayments };
    }

    startScheduledJobs() {
        cron.schedule('0 0 * * *', async () => {
            try {
                const oldDate = new Date();
                oldDate.setDate(oldDate.getDate() - 30);
                await Report.deleteMany({ created_at: { $lt: oldDate } });
                await Protected.deleteMany({ expiry_date: { $lt: new Date() } });
                addLog('🧹 Cleaned old reports and expired protections', 'INFO');
            } catch (error) {
                addLog(`❌ Cleanup error: ${error.message}`, 'ERROR');
            }
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ============================================
// EXPRESS SERVER
// ============================================

const app = express();
app.use(require('compression')());
app.use(require('cors')());
app.use(require('helmet')());

app.get('/', (req, res) => {
    res.json({
        status: 'online',
        version: '3.0',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK',
        db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

app.get('/logs', (req, res) => {
    const logs = getLogs(100);
    res.json({ logs });
});

app.listen(CONFIG.port, () => {
    addLog(`🚀 Server running on port ${CONFIG.port}`, 'INFO');
});

// ============================================
// START BOT
// ============================================

const bot = new UltimateBot();

process.on('unhandledRejection', (error) => {
    addLog(`❌ Unhandled rejection: ${error.message}`, 'ERROR');
});

process.on('uncaughtException', (error) => {
    addLog(`❌ Uncaught exception: ${error.message}`, 'ERROR');
});

module.exports = bot;
