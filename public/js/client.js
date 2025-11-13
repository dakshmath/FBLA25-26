// public/js/client.js - Enhanced with Dialog UI

document.addEventListener('DOMContentLoaded', () => {
    // Determine which page we are on and initialize the correct logic
    const path = window.location.pathname;

    if (path.includes('report.html')) {
        document.getElementById('report-form')?.addEventListener('submit', handleReportSubmission);
    } else if (path.includes('search.html')) {
        loadItems();
        document.getElementById('search-input')?.addEventListener('input', loadItems);
        document.getElementById('sort-select')?.addEventListener('change', loadItems);
    } else if (path.includes('claim.html')) {
        handleClaimPageLoad();
        document.getElementById('claim-form')?.addEventListener('submit', handleClaimSubmission);
    } else if (path.includes('admin.html')) {
        // Only load data if the admin content passed the security gate in admin.html
        if (document.getElementById('admin-main')?.style.display !== 'none') {
             loadAdminData();
        }
    }
    
    // Initialize dialog event listeners
    setupDialogListeners();
});

// --- CUSTOM DIALOG/MODAL IMPLEMENTATION (Replaces alert() and confirm()) ---
const dialogEl = document.getElementById('custom-dialog');
const dialogTitleEl = document.getElementById('dialog-title');
const dialogMessageEl = document.getElementById('dialog-message');
const dialogOkBtn = document.getElementById('dialog-ok');
const dialogCancelBtn = document.getElementById('dialog-cancel');

let currentConfirmCallback = null;

function setupDialogListeners() {
    dialogOkBtn?.addEventListener('click', () => {
        dialogEl.classList.remove('open');
        if (currentConfirmCallback) {
            currentConfirmCallback(true);
            currentConfirmCallback = null;
        }
    });

    dialogCancelBtn?.addEventListener('click', () => {
        dialogEl.classList.remove('open');
        if (currentConfirmCallback) {
            currentConfirmCallback(false);
            currentConfirmCallback = null;
        }
    });
}

/**
 * Shows a custom alert or confirmation dialog.
 * @param {string} title - The dialog title.
 * @param {string} message - The dialog message.
 * @param {boolean} isConfirm - If true, shows the cancel button and expects a callback.
 * @param {function(boolean): void} [callback] - Callback for confirm actions (true/false).
 */
function showDialog(title, message, isConfirm = false, callback = null) {
    dialogTitleEl.textContent = title;
    dialogMessageEl.textContent = message;
    
    if (isConfirm) {
        dialogCancelBtn.style.display = 'inline-block';
        dialogOkBtn.textContent = 'Confirm';
        currentConfirmCallback = callback;
    } else {
        dialogCancelBtn.style.display = 'none';
        dialogOkBtn.textContent = 'OK';
        currentConfirmCallback = callback ? (confirmed) => callback() : null; // Wrap for simple alerts
    }
    
    dialogEl.classList.add('open');
}

// --- Submission Form (report.html) ---

async function handleReportSubmission(event) {
    event.preventDefault();
    const form = event.target;
    // Use FormData directly to handle multipart (file upload)
    const formData = new FormData(form); 
    const messageEl = document.getElementById('report-message');
    messageEl.style.display = 'none';

    try {
        const response = await fetch('/api/items', {
            method: 'POST',
            body: formData, 
        });
        const result = await response.json();

        if (response.ok) {
            messageEl.textContent = '✅ Item successfully reported! Pending admin review.';
            messageEl.className = 'status-message message-success';
            form.reset();
        } else {
            messageEl.textContent = `❌ Submission failed: ${result.error || 'Server error'}`;
            messageEl.className = 'status-message message-error';
        }
        messageEl.style.display = 'block';
    } catch (error) {
        messageEl.textContent = '⚠️ An unexpected network error occurred.';
        messageEl.className = 'status-message message-error';
        messageEl.style.display = 'block';
    }
}

// --- Searchable Listing (search.html) ---

async function loadItems() {
    const listEl = document.getElementById('item-list');
    const query = document.getElementById('search-input')?.value || '';
    const sort = document.getElementById('sort-select')?.value || 'newest';
    listEl.innerHTML = '<p class="loading-indicator">🔍 Searching for items...</p>';

    try {
        const response = await fetch(`/api/items?query=${encodeURIComponent(query)}&sort=${sort}`);
        const items = await response.json();

        listEl.innerHTML = '';
        if (items.length === 0) {
            listEl.innerHTML = '<p class="status-message info" style="display:block;">No matching items found. Try a different search term or check back later!</p>';
            return;
        }

        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'item-card';
            // Use placeholder image if photo_url is null or empty
            const imageUrl = item.photo_url || 'https://placehold.co/400x250/C8D9E8/FFFFFF?text=No+Photo+Uploaded';
            const itemDescription = item.description.substring(0, 100) + (item.description.length > 100 ? '...' : '');

            card.innerHTML = `
                <img src="${imageUrl}" alt="${item.name} image" onerror="this.onerror=null;this.src='https://placehold.co/400x250/C8D9E8/FFFFFF?text=Image+Load+Error';" loading="lazy">
                <div class="card-details">
                    <h3>${item.name}</h3>
                    <p>${itemDescription}</p>
                    <p style="margin-top:0.75rem; font-size:0.9rem;">Found: 📍 <strong>${item.location_found}</strong></p>
                    <p style="font-size:0.9rem;">Date: ${new Date(item.date_found).toLocaleDateString()}</p>
                    <a href="claim.html?itemId=${item.id}" class="btn claim-btn">Claim This Item</a>
                </div>
            `;
            listEl.appendChild(card);
        });
    } catch (error) {
        listEl.innerHTML = '<p class="status-message message-error" style="display:block;">Error loading items from the server.</p>';
        console.error("Error loading items:", error);
    }
}

// --- Claim/Inquiry Form (claim.html) ---

function handleClaimPageLoad() {
    const urlParams = new URLSearchParams(window.location.search);
    const itemId = urlParams.get('itemId');

    if (itemId) {
        document.getElementById('item-id').value = itemId;
        document.getElementById('item-id-display').textContent = itemId;
    } else {
        document.getElementById('claim-title').textContent = 'Error: Item Not Selected';
        document.getElementById('claim-form').innerHTML = '<p class="status-message message-error" style="display:block; margin: 0;">Please use the **Search Lost Items** page to select the item you wish to claim.</p>';
    }
}

async function handleClaimSubmission(event) {
    event.preventDefault();
    const form = event.target;
    const data = Object.fromEntries(new FormData(form).entries());
    const messageEl = document.getElementById('claim-message');
    messageEl.style.display = 'none';

    try {
        const response = await fetch('/api/claims', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        if (response.ok) {
            messageEl.textContent = '🎉 Claim submitted! An admin will review your proof soon and contact you.';
            messageEl.className = 'status-message message-success';
            form.reset();
        } else {
            messageEl.textContent = '❌ Failed to submit claim. Check your input and try again.';
            messageEl.className = 'status-message message-error';
        }
        messageEl.style.display = 'block';
    } catch (error) {
        messageEl.textContent = '⚠️ Network error during claim submission.';
        messageEl.className = 'status-message message-error';
        messageEl.style.display = 'block';
    }
}

// --- Admin Dashboard (admin.html) ---
const ADMIN_KEY_FOR_DEMO = 'fbla-secret'; 

async function loadAdminData() {
    const pendingList = document.getElementById('pending-items-list');
    const claimsList = document.getElementById('new-claims-list');
    
    pendingList.innerHTML = '<p class="loading-indicator">Loading pending items...</p>';
    claimsList.innerHTML = '<p class="loading-indicator">Loading new claims...</p>';

    try {
        const response = await fetch(`/api/admin/data?admin_key=${ADMIN_KEY_FOR_DEMO}`);
        const data = await response.json();
        
        // Filter items
        const pendingItems = data.items.filter(i => i.status === 'Pending Review');
        document.getElementById('pending-count').textContent = pendingItems.length;
        
        // Filter claims
        const newClaims = data.claims.filter(c => c.status === 'New Claim');
        document.getElementById('claim-count').textContent = newClaims.length;
        
        // Render Pending Items
        pendingList.innerHTML = pendingItems.length === 0 ? '<p class="status-message info" style="display:block;">✅ No items are currently pending review.</p>' : '';
        pendingItems.forEach(item => {
            const div = document.createElement('div');
            div.className = 'admin-card pending-item';
            div.innerHTML = `
                <div class="admin-card-content">
                    <h4>[ID ${item.id}] ${item.name}</h4>
                    <p><strong>Description:</strong> ${item.description.substring(0, 100)}...</p>
                    <p style="font-size:0.9rem;"><strong>Reported By:</strong> ${item.contact_info}</p>
                </div>
                <div class="actions">
                    <button onclick="handleItemStatusChange(${item.id}, 'Approved')" class="btn btn-approve">Approve Post</button>
                    <button onclick="handleItemStatusChange(${item.id}, 'Rejected')" class="btn btn-reject">Reject Post</button>
                </div>
            `;
            pendingList.appendChild(div);
        });

        // Render New Claims
        claimsList.innerHTML = newClaims.length === 0 ? '<p class="status-message info" style="display:block;">✅ No new claims to review.</p>' : '';
        newClaims.forEach(claim => {
            const div = document.createElement('div');
            div.className = 'admin-card new-claim';
            div.innerHTML = `
                <div class="admin-card-content">
                    <h4>Claim for Item ID ${claim.item_id} (${claim.item_name})</h4>
                    <p><strong>Claimer:</strong> ${claim.claimer_name} (${claim.claimer_email})</p>
                    <p style="font-style: italic;"><strong>Proof:</strong> ${claim.match_details}</p>
                </div>
                <div class="actions">
                    <button onclick="handleClaimStatusChange(${claim.id}, ${claim.item_id}, 'Approved')" class="btn btn-approve">Approve Claim & Finalize</button>
                    <button onclick="handleClaimStatusChange(${claim.id}, ${claim.item_id}, 'Rejected')" class="btn btn-reject">Reject Claim</button>
                </div>
            `;
            claimsList.appendChild(div);
        });

    } catch (error) {
        pendingList.innerHTML = '<p class="status-message message-error" style="display:block;">Failed to load pending items.</p>';
        claimsList.innerHTML = '<p class="status-message message-error" style="display:block;">Failed to load new claims.</p>';
        console.error("Error loading admin data:", error);
    }
}

// Global function handlers using the custom dialog

function handleItemStatusChange(itemId, status) {
    const title = `Confirm Item ${status}`;
    const message = `Are you sure you want to change Item #${itemId} status to **${status.toUpperCase()}**? This action is final.`;
    
    showDialog(title, message, true, (confirmed) => {
        if (confirmed) {
            updateItemStatus(itemId, status);
        }
    });
}

function handleClaimStatusChange(claimId, itemId, status) {
    const title = `Confirm Claim ${status}`;
    let message = `Are you sure you want to change Claim #${claimId} status to **${status.toUpperCase()}**?`;
    if (status === 'Approved') {
        message += ' The associated item will also be marked as claimed/resolved.';
    }

    showDialog(title, message, true, (confirmed) => {
        if (confirmed) {
            updateClaimStatus(claimId, itemId, status);
        }
    });
}

async function updateItemStatus(itemId, status) {
    try {
        const response = await fetch(`/api/admin/item/${itemId}?admin_key=${ADMIN_KEY_FOR_DEMO}`, { 
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: status }),
        });
        
        if (response.ok) {
            showDialog('Success', `Item #${itemId} status updated to ${status}.`, false, loadAdminData);
        } else {
            showDialog('Error', `Failed to update item status. Server responded with an error.`, false);
        }
    } catch (error) {
        showDialog('Network Error', 'Failed to connect to the server to update item status.', false);
        console.error("Update Item Status Error:", error);
    }
}

async function updateClaimStatus(claimId, itemId, status) {
    try {
        const response = await fetch(`/api/admin/claim/${claimId}?admin_key=${ADMIN_KEY_FOR_DEMO}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: status, itemId: itemId }),
        });
        
        if (response.ok) {
            showDialog('Success', `Claim #${claimId} status updated to ${status}.`, false, loadAdminData);
        } else {
            showDialog('Error', `Failed to update claim status. Server responded with an error.`, false);
        }
    } catch (error) {
        showDialog('Network Error', 'Failed to connect to the server to update claim status.', false);
        console.error("Update Claim Status Error:", error);
    }
}