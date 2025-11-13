document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;

    if (path.includes('report.html')) {
        setupReportPage();
    } else if (path.includes('search.html')) {
        setupSearchPage();
    } else if (path.includes('claim.html')) {
        setupClaimPage();
    } else if (path.includes('admin.html')) {
        setupAdminPage();
    }
    
    setupDialogListeners();
});

// CUSTOM DIALOG SYSTEM

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

function showDialog(title, message, isConfirm = false, callback = null) {
    dialogTitleEl.textContent = title;
    dialogMessageEl.innerHTML = message;
    
    if (isConfirm) {
        dialogCancelBtn.style.display = 'inline-block';
        dialogOkBtn.textContent = 'Confirm';
        currentConfirmCallback = callback;
    } else {
        dialogCancelBtn.style.display = 'none';
        dialogOkBtn.textContent = 'OK';
        currentConfirmCallback = callback ? () => callback() : null;
    }
    
    dialogEl.classList.add('open');
}

// REPORT PAGE

function setupReportPage() {
    const form = document.getElementById('report-form');
    form?.addEventListener('submit', handleReportSubmission);
}

async function handleReportSubmission(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const messageEl = document.getElementById('report-message');
    const submitBtn = form.querySelector('button[type="submit"]');
    
    messageEl.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
        const response = await fetch('/api/items', {
            method: 'POST',
            body: formData,
        });

        const result = await response.json();

        if (response.ok) {
            messageEl.textContent = '✅ Item successfully reported! It will appear after admin approval.';
            messageEl.className = 'status-message message-success';
            form.reset();
        } else {
            messageEl.textContent = `❌ Submission failed: ${result.error || 'Server error'}`;
            messageEl.className = 'status-message message-error';
        }
        messageEl.style.display = 'block';
    } catch (error) {
        messageEl.textContent = '⚠️ Network error. Please check your connection and try again.';
        messageEl.className = 'status-message message-error';
        messageEl.style.display = 'block';
        console.error('Submission error:', error);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Item for Review';
    }
}

// SEARCH PAGE

function setupSearchPage() {
    loadItems();
    document.getElementById('search-input')?.addEventListener('input', debounce(loadItems, 300));
    document.getElementById('sort-select')?.addEventListener('change', loadItems);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

async function loadItems() {
    const listEl = document.getElementById('item-list');
    const query = document.getElementById('search-input')?.value || '';
    const sort = document.getElementById('sort-select')?.value || 'newest';
    
    listEl.innerHTML = '<p class="loading-indicator">🔍 Searching for items...</p>';

    try {
        const response = await fetch(`/api/items?query=${encodeURIComponent(query)}&sort=${sort}`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch items');
        }
        
        const items = await response.json();

        listEl.innerHTML = '';
        
        if (items.length === 0) {
            listEl.innerHTML = '<p class="status-message info">No matching items found. Try a different search term or check back later!</p>';
            return;
        }

        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'item-card';
            
            const imageUrl = item.photo_url || 'https://placehold.co/400x250/003865/FFFFFF?text=No+Photo';
            const itemDescription = item.description.length > 120 
                ? item.description.substring(0, 120) + '...' 
                : item.description;
            const dateFound = new Date(item.date_found).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            card.innerHTML = `
                <img src="${escapeHtml(imageUrl)}" 
                     alt="${escapeHtml(item.name)}" 
                     onerror="this.onerror=null;this.src='https://placehold.co/400x250/003865/FFFFFF?text=Image+Error';" 
                     loading="lazy">
                <div class="card-details">
                    <h3>${escapeHtml(item.name)}</h3>
                    <p>${escapeHtml(itemDescription)}</p>
                    <p style="margin-top:1rem; font-size:0.95rem;">
                        <strong>📍 Location:</strong> ${escapeHtml(item.location_found)}
                    </p>
                    <p style="font-size:0.9rem; color: var(--text-muted);">
                        <strong>Found:</strong> ${dateFound}
                    </p>
                    <a href="claim.html?itemId=${item.id}" class="button claim-btn">
                        Claim This Item
                    </a>
                </div>
            `;
            listEl.appendChild(card);
        });
    } catch (error) {
        listEl.innerHTML = '<p class="status-message message-error">Error loading items. Please try again later.</p>';
        console.error('Error loading items:', error);
    }
}

// CLAIM PAGE

function setupClaimPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const itemId = urlParams.get('itemId');
    const form = document.getElementById('claim-form');

    if (itemId) {
        document.getElementById('item-id').value = itemId;
        document.getElementById('item-id-display').textContent = itemId;
        form?.addEventListener('submit', handleClaimSubmission);
    } else {
        document.getElementById('claim-title').textContent = 'Error: No Item Selected';
        if (form) {
            form.innerHTML = '<p class="status-message message-error">Please use the <strong>Search Lost Items</strong> page to select an item to claim.</p>';
        }
    }
}

async function handleClaimSubmission(event) {
    event.preventDefault();
    const form = event.target;
    const data = Object.fromEntries(new FormData(form).entries());
    const messageEl = document.getElementById('claim-message');
    const submitBtn = form.querySelector('button[type="submit"]');
    
    messageEl.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting Claim...';

    try {
        const response = await fetch('/api/claims', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        const result = await response.json();

        if (response.ok) {
            messageEl.textContent = '🎉 Claim submitted successfully! An administrator will review your proof and contact you soon.';
            messageEl.className = 'status-message message-success';
            form.reset();
        } else {
            messageEl.textContent = `❌ Failed to submit claim: ${result.error || 'Server error'}`;
            messageEl.className = 'status-message message-error';
        }
        messageEl.style.display = 'block';
    } catch (error) {
        messageEl.textContent = '⚠️ Network error during claim submission. Please try again.';
        messageEl.className = 'status-message message-error';
        messageEl.style.display = 'block';
        console.error('Claim submission error:', error);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Claim for Review';
    }
}

// ADMIN PAGE

const ADMIN_KEY = 'fbla';
const STORAGE_KEY = 'lf_admin_key';

function setupAdminPage() {
    const loginSection = document.getElementById('admin-login');
    const mainSection = document.getElementById('admin-main');
    const logoutBtn = document.getElementById('admin-logout');
    
    loginSection.style.display = 'block';
    mainSection.style.display = 'none';
    logoutBtn.style.display = 'none';
    
    sessionStorage.removeItem(STORAGE_KEY);
    
    document.getElementById('admin-login-form')?.addEventListener('submit', handleAdminLogin);
}

function handleAdminLogin(event) {
    event.preventDefault();
    const passwordInput = document.getElementById('admin-password');
    const password = passwordInput.value.trim();
    const messageEl = document.getElementById('login-message');
    
    messageEl.textContent = '';
    messageEl.style.display = 'none';
    
    if (password === ADMIN_KEY) {
        sessionStorage.setItem(STORAGE_KEY, ADMIN_KEY);
        
        document.getElementById('admin-login').style.display = 'none';
        document.getElementById('admin-main').style.display = 'block';
        document.getElementById('admin-logout').style.display = 'inline-block';
        
        document.getElementById('admin-logout').addEventListener('click', handleAdminLogout);
        
        loadAdminData();
    } else {
        messageEl.textContent = '❌ Incorrect password. Please try again.';
        messageEl.className = 'status-message message-error';
        messageEl.style.display = 'block';
        passwordInput.value = '';
        passwordInput.focus();
    }
}

function handleAdminLogout() {
    sessionStorage.removeItem(STORAGE_KEY);
    window.location.href = 'index.html';
}

async function loadAdminData() {
    const pendingList = document.getElementById('pending-items-list');
    const claimsList = document.getElementById('new-claims-list');
    const key = sessionStorage.getItem(STORAGE_KEY);
    
    if (!key) {
        console.error('Admin key missing');
        window.location.href = 'index.html';
        return;
    }

    pendingList.innerHTML = '<p class="loading-indicator">Loading pending items...</p>';
    claimsList.innerHTML = '<p class="loading-indicator">Loading new claims...</p>';

    try {
        const response = await fetch(`/api/admin/data?admin_key=${key}`);
        
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }
        
        const data = await response.json();
        
        const pendingItems = data.items.filter(i => i.status === 'Pending Review');
        const newClaims = data.claims.filter(c => c.status === 'New Claim');
        
        document.getElementById('pending-count').textContent = pendingItems.length;
        document.getElementById('claim-count').textContent = newClaims.length;
        
        renderPendingItems(pendingList, pendingItems);
        renderNewClaims(claimsList, newClaims);

    } catch (error) {
        console.error('Error loading admin data:', error);
        const errorMsg = `
            <p class="status-message message-error">
                <strong>⚠️ Failed to Load Data</strong><br>
                Unable to connect to the server. Please ensure the backend is running.
            </p>
        `;
        pendingList.innerHTML = errorMsg;
        claimsList.innerHTML = errorMsg;
    }
}

function renderPendingItems(container, items) {
    if (items.length === 0) {
        container.innerHTML = '<p class="status-message info">✅ No items pending review.</p>';
        return;
    }

    container.innerHTML = '';
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'admin-card pending-item';
        
        const dateReported = new Date(item.date_found).toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short'
        });
        
        const imageUrl = item.photo_url || 'https://placehold.co/150x100/003865/FFFFFF?text=No+Image';
        const description = item.description.length > 150 
            ? item.description.substring(0, 150) + '...' 
            : item.description;

        div.innerHTML = `
            <div class="admin-card-content">
                <h4>[Item #${item.id}] ${escapeHtml(item.name)}</h4>
                <p><strong>Description:</strong> ${escapeHtml(description)}</p>
                <p><strong>Location Found:</strong> ${escapeHtml(item.location_found)}</p>
                <p><strong>Reported By:</strong> ${escapeHtml(item.contact_info)}</p>
                <p style="font-size:0.9rem; color: var(--text-muted);">
                    <strong>Submitted:</strong> ${dateReported}
                </p>
                <img src="${escapeHtml(imageUrl)}" 
                     alt="Item photo" 
                     class="admin-thumbnail" 
                     onerror="this.onerror=null;this.src='https://placehold.co/150x100/003865/FFFFFF?text=Error';">
            </div>
            <div class="actions">
                <button onclick="handleItemApproval(${item.id})" class="btn btn-approve">
                    ✅ Approve Post
                </button>
                <button onclick="handleItemRejection(${item.id})" class="btn btn-reject">
                    ❌ Reject Post
                </button>
            </div>
        `;
        container.appendChild(div);
    });
}

function renderNewClaims(container, claims) {
    if (claims.length === 0) {
        container.innerHTML = '<p class="status-message info">✅ No new claims to review.</p>';
        return;
    }

    container.innerHTML = '';
    claims.forEach(claim => {
        const div = document.createElement('div');
        div.className = 'admin-card new-claim';
        
        const dateClaimed = new Date(claim.date_claimed).toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short'
        });
        
        const proof = claim.match_details.length > 200 
            ? claim.match_details.substring(0, 200) + '...' 
            : claim.match_details;

        div.innerHTML = `
            <div class="admin-card-content">
                <h4>Claim for Item #${claim.item_id}: ${escapeHtml(claim.item_name)}</h4>
                <p><strong>Claimer Name:</strong> ${escapeHtml(claim.claimer_name)}</p>
                <p><strong>Contact Email:</strong> ${escapeHtml(claim.claimer_email)}</p>
                <div class="proof">
                    <strong>Proof of Ownership:</strong><br>
                    ${escapeHtml(proof)}
                </div>
                <p style="font-size:0.9rem; color: var(--text-muted);">
                    <strong>Submitted:</strong> ${dateClaimed}
                </p>
            </div>
            <div class="actions">
                <button onclick="handleClaimApproval(${claim.id}, ${claim.item_id})" class="btn btn-approve">
                    ✅ Approve & Finalize
                </button>
                <button onclick="handleClaimRejection(${claim.id})" class="btn btn-reject">
                    ❌ Reject Claim
                </button>
            </div>
        `;
        container.appendChild(div);
    });
}

// ADMIN ACTIONS

window.handleItemApproval = function(itemId) {
    showDialog(
        'Approve Item',
        `Are you sure you want to approve Item #${itemId}?<br>It will be visible to all users.`,
        true,
        (confirmed) => {
            if (confirmed) updateItemStatus(itemId, 'Approved');
        }
    );
};

window.handleItemRejection = function(itemId) {
    showDialog(
        'Reject Item',
        `Are you sure you want to reject Item #${itemId}?<br>This action cannot be undone.`,
        true,
        (confirmed) => {
            if (confirmed) updateItemStatus(itemId, 'Rejected');
        }
    );
};

window.handleClaimApproval = function(claimId, itemId) {
    showDialog(
        'Approve Claim',
        `Are you sure you want to approve Claim #${claimId}?<br>The item will be marked as claimed and removed from public listings.`,
        true,
        (confirmed) => {
            if (confirmed) updateClaimStatus(claimId, itemId, 'Approved');
        }
    );
};

window.handleClaimRejection = function(claimId) {
    showDialog(
        'Reject Claim',
        `Are you sure you want to reject Claim #${claimId}?<br>The item will remain available for other claims.`,
        true,
        (confirmed) => {
            if (confirmed) updateClaimStatus(claimId, null, 'Rejected');
        }
    );
};

async function updateItemStatus(itemId, status) {
    const key = sessionStorage.getItem(STORAGE_KEY);
    
    try {
        const response = await fetch(`/api/admin/item/${itemId}?admin_key=${key}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        });
        
        if (response.ok) {
            showDialog(
                'Success',
                `Item #${itemId} has been ${status.toLowerCase()}.`,
                false,
                loadAdminData
            );
        } else {
            const result = await response.json();
            showDialog('Error', `Failed to update item: ${result.error || 'Unknown error'}`, false);
        }
    } catch (error) {
        showDialog('Network Error', 'Unable to connect to the server.', false);
        console.error('Update item error:', error);
    }
}

async function updateClaimStatus(claimId, itemId, status) {
    const key = sessionStorage.getItem(STORAGE_KEY);
    
    try {
        const response = await fetch(`/api/admin/claim/${claimId}?admin_key=${key}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, itemId }),
        });
        
        if (response.ok) {
            showDialog(
                'Success',
                `Claim #${claimId} has been ${status.toLowerCase()}.`,
                false,
                loadAdminData
            );
        } else {
            const result = await response.json();
            showDialog('Error', `Failed to update claim: ${result.error || 'Unknown error'}`, false);
        }
    } catch (error) {
        showDialog('Network Error', 'Unable to connect to the server.', false);
        console.error('Update claim error:', error);
    }
}

// UTILITY FUNCTIONS

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}