const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// DATABASE CONFIGURATION

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('❌ Unexpected database error:', err);
    process.exit(-1);
});

// FILE UPLOAD CONFIGURATION

const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('📁 Created uploads directory');
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'item-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only JPEG, JPG, and PNG images are allowed'));
        }
    }
});

// MIDDLEWARE

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

const ADMIN_KEY = 'fbla';

function checkAdminKey(req, res, next) {
    const adminKey = req.query.admin_key;
    if (adminKey === ADMIN_KEY) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized: Invalid admin key' });
    }
}

// PUBLIC API ENDPOINTS

/**
 * Report a found item (with optional photo upload)
 */
app.post('/api/items', upload.single('item_image'), async (req, res) => {
    const { name, description, location_found, contact_info } = req.body;
    const photo_url = req.file ? `/uploads/${req.file.filename}` : null;
    
    if (!name || !description || !contact_info) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ 
            error: 'Missing required fields: name, description, and contact info are required' 
        });
    }
    
    try {
        const query = `
            INSERT INTO items (name, description, location_found, contact_info, photo_url, status, date_found)
            VALUES ($1, $2, $3, $4, $5, 'Pending Review', NOW())
            RETURNING *;
        `;
        const result = await pool.query(query, [
            name, 
            description, 
            location_found || 'Not specified', 
            contact_info, 
            photo_url
        ]);
        
        console.log(`✅ New item reported: ${name} (ID: ${result.rows[0].id})`);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('❌ Error reporting item:', err);
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: 'Failed to report item. Please try again.' });
    }
});

/**
 * GET /api/items
 * Search and retrieve approved items (public access)
 */
app.get('/api/items', async (req, res) => {
    const { query, sort } = req.query;
    
    let dbQuery = `
        SELECT id, name, description, location_found, photo_url, date_found 
        FROM items 
        WHERE status = 'Approved'
    `;
    const params = [];

    if (query) {
        params.push(`%${query}%`);
        dbQuery += ` AND (name ILIKE $1 OR description ILIKE $1 OR location_found ILIKE $1)`;
    }

    if (sort === 'oldest') {
        dbQuery += ' ORDER BY date_found ASC';
    } else {
        dbQuery += ' ORDER BY date_found DESC';
    }

    try {
        const result = await pool.query(dbQuery, params);
        res.json(result.rows);
    } catch (err) {
        console.error('❌ Error fetching items:', err);
        res.status(500).json({ error: 'Failed to fetch items' });
    }
});

/**
 * POST /api/claims
 * Submit a claim for an item
 */
app.post('/api/claims', async (req, res) => {
    const { item_id, claimer_name, claimer_email, match_details } = req.body;
    
    // Input validation
    if (!item_id || !claimer_name || !claimer_email || !match_details) {
        return res.status(400).json({ 
            error: 'All fields are required: item_id, claimer_name, claimer_email, and match_details' 
        });
    }

    try {
        const query = `
            INSERT INTO claims (item_id, claimer_name, claimer_email, match_details, status, date_claimed)
            VALUES ($1, $2, $3, $4, 'New Claim', NOW())
            RETURNING *;
        `;
        const result = await pool.query(query, [
            item_id, 
            claimer_name, 
            claimer_email, 
            match_details
        ]);
        
        console.log(`✅ New claim submitted for item ${item_id} by ${claimer_name}`);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('❌ Error submitting claim:', err);
        res.status(500).json({ error: 'Failed to submit claim. Please try again.' });
    }
});

// ADMIN API ENDPOINTS (Protected)

/**
 * GET /api/admin/data
 * Get all items and claims for admin dashboard
 */
app.get('/api/admin/data', checkAdminKey, async (req, res) => {
    try {
        const itemsResult = await pool.query(`
            SELECT * FROM items 
            ORDER BY date_found DESC
        `);
        
        const claimsResult = await pool.query(`
            SELECT 
                c.id, c.item_id, c.claimer_name, c.claimer_email, 
                c.match_details, c.status, c.date_claimed,
                i.name AS item_name, i.photo_url 
            FROM claims c
            JOIN items i ON c.item_id = i.id
            ORDER BY c.date_claimed DESC
        `);
        
        res.json({
            items: itemsResult.rows,
            claims: claimsResult.rows
        });
    } catch (err) {
        console.error('❌ Error fetching admin data:', err);
        res.status(500).json({ error: 'Failed to fetch admin data' });
    }
});

/**
 * PUT /api/admin/item/:itemId
 * Update item status (Approve/Reject)
 */
app.put('/api/admin/item/:itemId', checkAdminKey, async (req, res) => {
    const { itemId } = req.params;
    const { status } = req.body;
    
    const validStatuses = ['Approved', 'Rejected', 'Claimed'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be: Approved, Rejected, or Claimed' });
    }

    try {
        let dateField = '';
        if (status === 'Approved') {
            dateField = ', date_approved = NOW()';
        }
        
        const query = `
            UPDATE items 
            SET status = $1${dateField} 
            WHERE id = $2 
            RETURNING *;
        `;
        const result = await pool.query(query, [status, itemId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        console.log(`✅ Item ${itemId} status updated to: ${status}`);
        res.json(result.rows[0]);
    } catch (err) {
        console.error(`❌ Error updating item ${itemId}:`, err);
        res.status(500).json({ error: 'Failed to update item status' });
    }
});

/**
 * PUT /api/admin/claim/:claimId
 * Update claim status (Approve/Reject) and mark item as claimed if approved
 */
app.put('/api/admin/claim/:claimId', checkAdminKey, async (req, res) => {
    const { claimId } = req.params;
    const { status, itemId } = req.body;
    
    const validStatuses = ['Approved', 'Rejected'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be: Approved or Rejected' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const claimQuery = `
            UPDATE claims 
            SET status = $1, date_reviewed = NOW() 
            WHERE id = $2 
            RETURNING *;
        `;
        const claimResult = await client.query(claimQuery, [status, claimId]);
        
        if (claimResult.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Claim not found' });
        }

        if (status === 'Approved' && itemId) {
            const itemQuery = `
                UPDATE items 
                SET status = 'Claimed' 
                WHERE id = $1 
                RETURNING *;
            `;
            await client.query(itemQuery, [itemId]);
            console.log(`✅ Item ${itemId} marked as claimed`);
        }

        await client.query('COMMIT');
        console.log(`✅ Claim ${claimId} ${status.toLowerCase()}`);
        
        res.json({ 
            claim: claimResult.rows[0], 
            itemStatusUpdated: status === 'Approved' 
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ Error processing claim ${claimId}:`, err);
        res.status(500).json({ error: 'Failed to process claim' });
    } finally {
        client.release();
    }
});

// ERROR HANDLING

app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// SERVER STARTUP

app.listen(port, () => {
    console.log('='.repeat(50));
    console.log('🚀 FBLA Lost & Found Server Started');
    console.log('='.repeat(50));
    console.log(`📍 Server running at: http://localhost:${port}`);
    console.log(`🗄️  Database: ${process.env.DB_NAME}`);
    console.log(`🔐 Admin key configured: Yes`);
    console.log('='.repeat(50));
});

process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM signal received: closing HTTP server');
    pool.end(() => {
        console.log('Database pool closed');
        process.exit(0);
    });
});