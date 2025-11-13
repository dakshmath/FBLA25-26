// server.js
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json()); // To parse incoming JSON payloads
app.use(express.urlencoded({ extended: true })); // To parse form data
app.use(express.static(path.join(__dirname, 'public'))); // Serve all files in the 'public' folder

// --- PostgreSQL Pool Setup (Using Connection String for Reliability) ---

// This structure forces the connection to use the exact DB_NAME specified in .env
const connectionString = `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

const pool = new Pool({
    connectionString: connectionString,
});

// Test DB Connection
pool.query('SELECT NOW()')
    .then(res => console.log('Database connected successfully at:', res.rows[0].now))
    .catch(err => console.error('DB Connection Error:', err.stack));

// --- API Endpoints ---

// 1. POST: Report Found Item
app.post('/api/items', async (req, res) => {
    const { name, description, location_found, contact_info, photo_url } = req.body;
    try {
        const query = `
            INSERT INTO items (name, description, location_found, contact_info, photo_url, status)
            VALUES ($1, $2, $3, $4, $5, 'Pending Review')
            RETURNING *;
        `;
        const result = await pool.query(query, [name, description, location_found, contact_info, photo_url]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error reporting item:', err.stack);
        res.status(500).json({ error: 'Failed to report item.' });
    }
});

// 2. GET: Searchable Listing of Approved Items (Includes Search/Filter logic)
app.get('/api/items', async (req, res) => {
    const { query, sort } = req.query; 
    let sql = `SELECT * FROM items WHERE status = 'Approved'`;
    const params = [];

    if (query) {
        params.push(`%${query}%`);
        sql += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length})`;
    }

    if (sort === 'oldest') {
        sql += ` ORDER BY date_found ASC`;
    } else {
        sql += ` ORDER BY date_found DESC`; // Default to newest
    }

    try {
        const result = await pool.query(sql, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching items:', err.stack);
        res.status(500).json({ error: 'Failed to retrieve items.' });
    }
});

// 3. POST: Submit a Claim/Inquiry
app.post('/api/claims', async (req, res) => {
    const { item_id, claimer_name, claimer_email, match_details } = req.body;
    try {
        const query = `
            INSERT INTO claims (item_id, claimer_name, claimer_email, match_details)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `;
        const result = await pool.query(query, [item_id, claimer_name, claimer_email, match_details]);
        res.status(201).json({ message: 'Claim submitted successfully.', claim: result.rows[0] });
    } catch (err) {
        console.error('Error submitting claim:', err.stack);
        res.status(500).json({ error: 'Failed to submit claim.' });
    }
});

// 4. GET: Admin Dashboard Data (All items and claims)
app.get('/api/admin/data', async (req, res) => {
    try {
        const items = await pool.query('SELECT * FROM items ORDER BY created_at DESC');
        const claims = await pool.query(`
            SELECT c.*, i.name AS item_name, i.status AS item_status
            FROM claims c 
            JOIN items i ON c.item_id = i.id 
            ORDER BY c.claimed_at DESC
        `);
        res.json({ items: items.rows, claims: claims.rows });
    } catch (err) {
        console.error('Error fetching admin data:', err.stack);
        res.status(500).json({ error: 'Failed to retrieve admin data.' });
    }
});

// 5. PUT: Admin Action to Manage Item Status (Approve/Reject Posting)
app.put('/api/admin/item/:id', async (req, res) => {
    const itemId = req.params.id;
    const { status } = req.body; 
    try {
        const result = await pool.query('UPDATE items SET status = $1 WHERE id = $2 RETURNING *', [status, itemId]);
        res.json({ message: `Item ${itemId} status updated to ${status}.`, item: result.rows[0] });
    } catch (err) {
        console.error('Error updating item status:', err.stack);
        res.status(500).json({ error: 'Failed to update item status.' });
    }
});

// 6. PUT: Admin Action to Manage Claim Status (Fulfills management requirement)
app.put('/api/admin/claim/:id', async (req, res) => {
    const claimId = req.params.id;
    const { status, itemId } = req.body; // status: 'Approved' or 'Rejected'
    try {
        // 1. Update the claim status
        const claimResult = await pool.query('UPDATE claims SET status = $1 WHERE id = $2 RETURNING *', [status, claimId]);
        
        // 2. If claim is approved, update the related item status to 'Claimed'
        if (status === 'Approved' && itemId) {
             await pool.query('UPDATE items SET status = $1, claim_id = $2 WHERE id = $3', ['Claimed', claimId, itemId]);
        }
        
        res.json({ message: `Claim ${claimId} status updated to ${status}.` });
    } catch (err) {
        console.error('Error updating claim status:', err.stack);
        res.status(500).json({ error: 'Failed to update claim status.' });
    }
});


// --- Start Server ---
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});