// State management
let currentUser = null;
let currentTab = 'tasks';
let statusFilter = 'all';
let selectedCategoryFilter = null;
let sortOrder = 'asc';
let activeCharts = {};
let notifiedTasks = new Set(); // Keep track of notified task IDs during session to avoid duplicate spam
let todos = [];
let categories = [];

// Page load initialization
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    checkAuthState();
    initClock();
    initInteractiveEffects();
    
    // Request notification permission if supported
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    
    // Set up polling for due dates / alarms (every 10 seconds)
    setInterval(checkTaskAlarms, 10000);
});

// --- Theme Management ---

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcons(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcons(newTheme);
    
    // Re-render charts to adjust text colors for light/dark mode
    if (currentTab === 'analytics') {
        loadAnalytics();
    }
}

function updateThemeIcons(theme) {
    const sunIcon = document.getElementById('theme-icon-light');
    const moonIcon = document.getElementById('theme-icon-dark');
    if (theme === 'dark') {
        sunIcon.classList.remove('hidden');
        moonIcon.classList.add('hidden');
    } else {
        sunIcon.classList.add('hidden');
        moonIcon.classList.remove('hidden');
    }
}

function initClock() {
    updateDateTime();
    setInterval(updateDateTime, 1000);
}

function updateDateTime() {
    const dateOptions = { weekday: 'long', month: 'short', day: 'numeric' };
    const now = new Date();
    
    const dateDisplay = document.getElementById('current-date-display');
    if (dateDisplay) {
        dateDisplay.textContent = now.toLocaleDateString('en-US', dateOptions);
    }
    
    const clockDisplay = document.getElementById('current-clock-display');
    if (clockDisplay) {
        clockDisplay.textContent = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    }
}

// --- Toast System ---

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconClass = 'ti-info-circle';
    if (type === 'success') iconClass = 'ti-circle-check';
    if (type === 'error') iconClass = 'ti-alert-circle';
    
    toast.innerHTML = `
        <i class="toast-icon ti ${iconClass}"></i>
        <div class="toast-message">${message}</div>
    `;
    
    container.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.add('show'), 50);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- Auth System ---

function checkAuthState() {
    fetch('/api/auth/me')
        .then(res => res.json())
        .then(data => {
            if (data.logged_in) {
                currentUser = data.user;
                bootApp();
            } else {
                showAuthScreen();
            }
        })
        .catch(err => {
            console.error('Auth check failed:', err);
            showAuthScreen();
        });
}

function showAuthScreen() {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('app-screen').classList.add('hidden');
}

function bootApp() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    
    // Set user visual elements
    document.getElementById('user-display-name').textContent = currentUser.username;
    document.getElementById('user-avatar').textContent = currentUser.username.charAt(0).toUpperCase();
    
    // Load data
    loadCategories();
    loadTodos();
}

function switchAuthTab(tab) {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const resetForm = document.getElementById('reset-form');
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');
    
    resetForm.classList.add('hidden');
    
    if (tab === 'login') {
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
        tabLogin.classList.add('active');
        tabSignup.classList.remove('active');
        document.getElementById('auth-subtitle').textContent = "Elevate your daily focus";
    } else {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        tabLogin.classList.remove('active');
        tabSignup.classList.add('active');
        document.getElementById('auth-subtitle').textContent = "Join us and stay organized";
    }
}

function showResetPasswordForm(e) {
    if (e) e.preventDefault();
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('signup-form').classList.add('hidden');
    document.getElementById('reset-form').classList.remove('hidden');
    document.getElementById('tab-login').classList.remove('active');
    document.getElementById('tab-signup').classList.remove('active');
    document.getElementById('auth-subtitle').textContent = "Recover your password";
}

function showLoginForm(e) {
    if (e) e.preventDefault();
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('signup-form').classList.add('hidden');
    document.getElementById('reset-form').classList.add('hidden');
    document.getElementById('tab-login').classList.add('active');
    document.getElementById('tab-signup').classList.remove('active');
    document.getElementById('auth-subtitle').textContent = "Elevate your daily focus";
}

function handleResetPassword(e) {
    e.preventDefault();
    const usernameVal = document.getElementById('reset-username').value.trim();
    const emailVal = document.getElementById('reset-email').value.trim();
    const newPasswordVal = document.getElementById('reset-new-password').value;
    const confirmPasswordVal = document.getElementById('reset-confirm-password').value;
    const submitBtn = document.getElementById('reset-submit-btn');

    if (newPasswordVal !== confirmPasswordVal) {
        showToast("New passwords do not match", "error");
        return;
    }

    submitBtn.disabled = true;

    fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: usernameVal,
            email: emailVal,
            new_password: newPasswordVal
        })
    })
    .then(async res => {
        const data = await res.json();
        if (res.ok) {
            showToast(data.message || 'Password reset successfully', 'success');
            showLoginForm(null);
            document.getElementById('reset-form').reset();
        } else {
            showToast(data.error || 'Password reset failed', 'error');
        }
    })
    .catch(err => {
        showToast('Server connection error', 'error');
        console.error(err);
    })
    .finally(() => {
        submitBtn.disabled = false;
    });
}

function handleLogin(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('login-username').value;
    const passwordInput = document.getElementById('login-password').value;
    const submitBtn = document.getElementById('login-submit-btn');
    
    submitBtn.disabled = true;
    
    fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
    })
    .then(async res => {
        const data = await res.json();
        if (res.ok) {
            currentUser = data.user;
            showToast(`Welcome back, ${currentUser.username}!`, 'success');
            bootApp();
        } else {
            showToast(data.error || 'Login failed', 'error');
        }
    })
    .catch(err => {
        showToast('Server connection error', 'error');
        console.error(err);
    })
    .finally(() => {
        submitBtn.disabled = false;
    });
}

function handleSignup(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('signup-username').value;
    const emailInput = document.getElementById('signup-email').value;
    const passwordInput = document.getElementById('signup-password').value;
    const submitBtn = document.getElementById('signup-submit-btn');
    
    submitBtn.disabled = true;
    
    fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, email: emailInput, password: passwordInput })
    })
    .then(async res => {
        const data = await res.json();
        if (res.ok) {
            currentUser = data.user;
            showToast('Registration successful! Welcome.', 'success');
            bootApp();
        } else {
            showToast(data.error || 'Registration failed', 'error');
        }
    })
    .catch(err => {
        showToast('Server connection error', 'error');
        console.error(err);
    })
    .finally(() => {
        submitBtn.disabled = false;
    });
}

function handleLogout() {
    fetch('/api/auth/logout', { method: 'POST' })
        .then(() => {
            currentUser = null;
            showToast('Logged out successfully', 'info');
            showAuthScreen();
            
            // Reset state
            notifiedTasks.clear();
            // Clear inputs
            document.getElementById('login-form').reset();
            document.getElementById('signup-form').reset();
        })
        .catch(err => console.error(err));
}

// --- Navigation Tabs ---

function switchTab(tabName) {
    currentTab = tabName;
    
    // Update headers and titles
    const pageTitle = document.getElementById('page-title');
    pageTitle.textContent = tabName.charAt(0).toUpperCase() + tabName.slice(1);
    
    // Toggle active classes on side nav
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`nav-${tabName}`).classList.add('active');
    
    // Toggle content containers
    document.querySelectorAll('.tab-content').forEach(cont => cont.classList.add('hidden'));
    document.getElementById(`tab-content-${tabName}`).classList.remove('hidden');
    
    if (tabName === 'tasks') {
        loadTodos();
    } else if (tabName === 'analytics') {
        loadAnalytics();
    } else if (tabName === 'history') {
        loadHistory();
    } else if (tabName === 'settings') {
        // Nothing special to load
    }
}

// --- Categories Section ---

function loadCategories() {
    fetch('/api/categories')
        .then(res => res.json())
        .then(data => {
            categories = data;
            renderCategories();
            populateCategoryDropdowns();
        })
        .catch(err => console.error('Failed to load categories:', err));
}

function renderCategories() {
    const list = document.getElementById('categories-list');
    list.innerHTML = '';
    
    // Add "All" pseudo-category at the top
    const allItem = document.createElement('li');
    allItem.className = `sidebar-list-item ${selectedCategoryFilter === null ? 'active' : ''}`;
    allItem.onclick = () => selectCategoryFilter(null);
    allItem.innerHTML = `
        <div class="category-indicator">
            <span class="color-dot" style="background-color: var(--text-muted)"></span>
            <span>All Tasks</span>
        </div>
    `;
    list.appendChild(allItem);

    categories.forEach(cat => {
        const item = document.createElement('li');
        item.className = `sidebar-list-item ${selectedCategoryFilter === cat.id ? 'active' : ''}`;
        item.onclick = () => selectCategoryFilter(cat.id);
        item.innerHTML = `
            <div class="category-indicator">
                <span class="color-dot" style="background-color: ${cat.color_hex}"></span>
                <span>${escapeHTML(cat.name)}</span>
            </div>
            <button class="icon-btn" onclick="event.stopPropagation(); deleteCategory(${cat.id})" title="Delete Category">
                <i class="ti ti-trash"></i>
            </button>
        `;
        list.appendChild(item);
    });
}

function populateCategoryDropdowns() {
    const select = document.getElementById('task-category');
    // Save current selected category value
    const currentVal = select.value;
    
    // Reset dropdown
    select.innerHTML = '<option value="">No Category</option>';
    
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        select.appendChild(opt);
    });
    
    // Restore value
    select.value = currentVal;
}

function selectCategoryFilter(catId) {
    selectedCategoryFilter = catId;
    renderCategories();
    loadTodos();
}

function openCategoryModal() {
    document.getElementById('category-modal').classList.remove('hidden');
}

function closeCategoryModal() {
    document.getElementById('category-modal').classList.add('hidden');
    document.getElementById('category-form').reset();
}

function handleCategorySubmit(e) {
    e.preventDefault();
    const nameInput = document.getElementById('category-name').value.trim();
    const colorInput = document.querySelector('input[name="cat-color"]:checked').value;
    
    fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameInput, color_hex: colorInput })
    })
    .then(async res => {
        const data = await res.json();
        if (res.ok) {
            showToast('Category created', 'success');
            loadCategories();
            closeCategoryModal();
        } else {
            showToast(data.error || 'Failed to create category', 'error');
        }
    })
    .catch(err => {
        showToast('Server error', 'error');
        console.error(err);
    });
}

function deleteCategory(catId) {
    if (!confirm('Are you sure you want to delete this category? Tasks associated with it will remain, but will have no category.')) {
        return;
    }
    
    fetch(`/api/categories/${catId}`, { method: 'DELETE' })
        .then(async res => {
            const data = await res.json();
            if (res.ok) {
                showToast('Category deleted', 'success');
                if (selectedCategoryFilter === catId) {
                    selectedCategoryFilter = null;
                }
                loadCategories();
                loadTodos(); // reload list in case some tasks were cleared
            } else {
                showToast(data.error || 'Failed to delete category', 'error');
            }
        })
        .catch(err => console.error(err));
}

// --- Todo CRUD Actions ---

function loadTodos() {
    if (!currentUser) return;
    
    const searchVal = document.getElementById('search-input').value;
    const priorityVal = document.getElementById('filter-priority').value;
    const sortByVal = document.getElementById('sort-by').value;
    
    // Construct Query String
    let url = `/api/todos?status=${statusFilter}&sort_by=${sortByVal}&sort_order=${sortOrder}`;
    
    if (selectedCategoryFilter !== null) {
        url += `&category_id=${selectedCategoryFilter}`;
    }
    if (priorityVal) {
        url += `&priority=${priorityVal}`;
    }
    if (searchVal) {
        url += `&search=${encodeURIComponent(searchVal)}`;
    }
    
    fetch(url)
        .then(res => res.json())
        .then(data => {
            todos = data;
            renderTodos();
            updateStatsDashboard();
        })
        .catch(err => console.error('Failed to load todos:', err));
}

function updateStatsDashboard() {
    fetch('/api/analytics')
        .then(res => res.json())
        .then(data => {
            const stats = data.stats;
            document.getElementById('stat-total-tasks').textContent = stats.total;
            document.getElementById('stat-pending-tasks').textContent = stats.pending;
            document.getElementById('stat-completed-tasks').textContent = stats.completed;
            document.getElementById('stat-completion-rate').textContent = `${stats.rate}%`;
        })
        .catch(err => console.error('Failed to update stats:', err));
}

function renderTodos() {
    const grid = document.getElementById('tasks-grid');
    const emptyState = document.getElementById('empty-state');
    
    grid.innerHTML = '';
    
    if (todos.length === 0) {
        emptyState.classList.remove('hidden');
        grid.classList.add('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    grid.classList.remove('hidden');
    
    todos.forEach(todo => {
        const card = document.createElement('article');
        
        // Priority Class
        card.className = `task-card priority-${todo.priority} ${todo.completed ? 'completed' : ''}`;
        card.id = `task-card-${todo.id}`;
        
        // Due Date Tag Logic
        let dueTag = '';
        if (todo.due_date) {
            const dueDate = new Date(todo.due_date);
            const now = new Date();
            let dueClass = 'tag-due';
            let dueText = formatDate(dueDate);
            
            if (!todo.completed) {
                if (dueDate < now) {
                    dueClass += ' overdue';
                    dueText = `Overdue: ${dueText}`;
                } else {
                    const diffTime = Math.abs(dueDate - now);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays <= 1 && dueDate.getDate() === now.getDate()) {
                        dueClass += ' due-today';
                        dueText = `Due Today: ${dueDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
                    }
                }
            }
            
            dueTag = `<span class="meta-tag ${dueClass}"><i class="ti ti-calendar-time"></i> ${dueText}</span>`;
        }
        
        // Category Tag
        let catTag = '';
        if (todo.category) {
            catTag = `
                <span class="meta-tag tag-category" style="border-left: 3px solid ${todo.category.color_hex};">
                    ${escapeHTML(todo.category.name)}
                </span>`;
        }
        
        // Priority Tag
        const priorityTag = `<span class="meta-tag tag-priority-${todo.priority}">${todo.priority.toUpperCase()}</span>`;
        
        // Recurrence Tag
        let recurTag = '';
        if (todo.recurrence && todo.recurrence !== 'none') {
            recurTag = `<span class="meta-tag tag-recurrence"><i class="ti ti-refresh"></i> ${todo.recurrence.toUpperCase()}</span>`;
        }
        
        // Subtasks HTML Builder
        let subtasksHTML = '';
        if (todo.subtasks && todo.subtasks.length > 0) {
            const compCount = todo.subtasks.filter(s => s.completed).length;
            subtasksHTML = `
                <div class="task-subtasks">
                    <div class="task-subtasks-header">
                        <span>SUBTASKS (${compCount}/${todo.subtasks.length})</span>
                    </div>
                    <ul class="subtask-list">
                        ${todo.subtasks.map(sub => `
                            <li class="subtask-item ${sub.completed ? 'completed' : ''}" id="subtask-item-${sub.id}">
                                <div class="subtask-item-left" onclick="toggleSubtask(${sub.id})">
                                    <span class="subtask-checkbox">
                                        <i class="ti ti-check"></i>
                                    </span>
                                    <span class="subtask-title">${escapeHTML(sub.title)}</span>
                                </div>
                                <button class="icon-btn subtask-delete" onclick="deleteSubtask(event, ${sub.id})" title="Delete Subtask">
                                    <i class="ti ti-x"></i>
                                </button>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
        }
        
        card.innerHTML = `
            <div class="task-card-header">
                <div class="custom-checkbox" onclick="toggleTodo(${todo.id})" title="Mark complete">
                    <i class="ti ti-check"></i>
                </div>
                <div class="task-title-group">
                    <div class="task-title" onclick="openTaskModal(${todo.id})">${escapeHTML(todo.title)}</div>
                    ${todo.description ? `<p class="task-desc">${escapeHTML(todo.description)}</p>` : ''}
                </div>
            </div>
            
            ${subtasksHTML}
            
            <!-- Quick Add Subtask Input Form -->
            <form class="subtask-input-form" onsubmit="handleSubtaskCreate(event, ${todo.id})">
                <input type="text" placeholder="Add subtask..." required>
                <button type="submit" class="btn btn-secondary"><i class="ti ti-plus"></i></button>
            </form>
            
            <div class="task-meta">
                ${dueTag}
                ${catTag}
                ${priorityTag}
                ${recurTag}
            </div>
            
            <div class="task-actions">
                ${!todo.completed && todo.due_date ? `
                    <button class="icon-btn" onclick="snoozeTodo(${todo.id})" title="Snooze Alarm 15 mins">
                        <i class="ti ti-alarm-snooze"></i>
                    </button>
                ` : ''}
                <button class="icon-btn" onclick="openTaskModal(${todo.id})" title="Edit Task">
                    <i class="ti ti-edit"></i>
                </button>
                <button class="icon-btn" onclick="deleteTodo(${todo.id})" title="Delete Task">
                    <i class="ti ti-trash"></i>
                </button>
            </div>
        `;
        
        grid.appendChild(card);
    });
}

// Formatter Helpers
function formatDate(dateObj) {
    const options = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return dateObj.toLocaleDateString('en-US', options);
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// Search and Filter updates
let searchTimeout = null;
function handleSearchFilterChange() {
    // Debounce search
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        loadTodos();
    }, 250);
}

function setStatusFilter(status, btn) {
    statusFilter = status;
    document.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadTodos();
}

function toggleSortOrder() {
    sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    
    const ascIcon = document.getElementById('sort-icon-asc');
    const descIcon = document.getElementById('sort-icon-desc');
    
    if (sortOrder === 'asc') {
        ascIcon.classList.remove('hidden');
        descIcon.classList.add('hidden');
    } else {
        ascIcon.classList.add('hidden');
        descIcon.classList.remove('hidden');
    }
    loadTodos();
}

// Task Form Modals
function openTaskModal(todoId = null) {
    const modal = document.getElementById('task-modal');
    const form = document.getElementById('task-form');
    const titleHeader = document.getElementById('task-modal-title');
    
    form.reset();
    document.getElementById('task-id').value = '';
    
    // Ensure dropdown is up to date
    populateCategoryDropdowns();
    
    if (todoId) {
        // Edit Mode
        titleHeader.textContent = "Edit Task";
        const todo = todos.find(t => t.id === todoId);
        if (todo) {
            document.getElementById('task-id').value = todo.id;
            document.getElementById('task-title').value = todo.title;
            document.getElementById('task-desc').value = todo.description || '';
            document.getElementById('task-category').value = todo.category_id || '';
            document.getElementById('task-priority').value = todo.priority;
            document.getElementById('task-recurrence').value = todo.recurrence || 'none';
            
            if (todo.due_date) {
                // Convert UTC / ISO date to datetime-local friendly format (YYYY-MM-DDTHH:MM)
                const date = new Date(todo.due_date);
                const localDateStr = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
                    .toISOString().slice(0, 16);
                document.getElementById('task-due').value = localDateStr;
            }
        }
    } else {
        // Create Mode
        titleHeader.textContent = "Create Task";
        // Pre-fill with current selected category filter if any
        if (selectedCategoryFilter) {
            document.getElementById('task-category').value = selectedCategoryFilter;
        }
    }
    
    modal.classList.remove('hidden');
}

function closeTaskModal() {
    document.getElementById('task-modal').classList.add('hidden');
    document.getElementById('task-form').reset();
}

function handleTaskSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('task-id').value;
    const titleVal = document.getElementById('task-title').value.trim();
    const descVal = document.getElementById('task-desc').value.trim();
    const catVal = document.getElementById('task-category').value;
    const priorityVal = document.getElementById('task-priority').value;
    const recurVal = document.getElementById('task-recurrence').value;
    const dueVal = document.getElementById('task-due').value;
    
    // Construct payload
    const payload = {
        title: titleVal,
        description: descVal,
        category_id: catVal ? parseInt(catVal) : null,
        priority: priorityVal,
        recurrence: recurVal,
        due_date: dueVal || null
    };
    
    const isEdit = !!id;
    const url = isEdit ? `/api/todos/${id}` : '/api/todos';
    const method = isEdit ? 'PUT' : 'POST';
    
    fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(async res => {
        const data = await res.json();
        if (res.ok) {
            showToast(isEdit ? 'Task updated' : 'Task created', 'success');
            closeTaskModal();
            loadTodos();
        } else {
            showToast(data.error || 'Error saving task', 'error');
        }
    })
    .catch(err => {
        showToast('Server error saving task', 'error');
        console.error(err);
    });
}

function deleteTodo(todoId) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    
    fetch(`/api/todos/${todoId}`, { method: 'DELETE' })
        .then(async res => {
            const data = await res.json();
            if (res.ok) {
                showToast('Task deleted', 'success');
                loadTodos();
            } else {
                showToast(data.error || 'Failed to delete task', 'error');
            }
        })
        .catch(err => console.error(err));
}

function toggleTodo(todoId) {
    fetch(`/api/todos/${todoId}/toggle`, { method: 'PUT' })
        .then(async res => {
            const data = await res.json();
            if (res.ok) {
                if (data.recurrence !== 'none' && !data.completed) {
                    showToast('Recurring task completion registered. Next occurrence scheduled!', 'success');
                } else {
                    showToast(data.completed ? 'Task completed' : 'Task marked active', 'success');
                }
                loadTodos();
            } else {
                showToast(data.error || 'Failed to toggle task', 'error');
            }
        })
        .catch(err => console.error(err));
}

function snoozeTodo(todoId) {
    fetch(`/api/todos/${todoId}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes: 15 }) // Snooze for 15 minutes
    })
    .then(async res => {
        const data = await res.json();
        if (res.ok) {
            showToast('Reminder snoozed for 15 minutes', 'success');
            loadTodos();
        } else {
            showToast(data.error || 'Failed to snooze', 'error');
        }
    })
    .catch(err => console.error(err));
}

// --- Subtask Management ---

function handleSubtaskCreate(e, todoId) {
    e.preventDefault();
    const form = e.target;
    const input = form.querySelector('input');
    const titleVal = input.value.trim();
    
    if (!titleVal) return;
    
    fetch(`/api/todos/${todoId}/subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: titleVal })
    })
    .then(async res => {
        const data = await res.json();
        if (res.ok) {
            input.value = '';
            showToast('Subtask added', 'success');
            loadTodos();
        } else {
            showToast(data.error || 'Failed to add subtask', 'error');
        }
    })
    .catch(err => console.error(err));
}

function toggleSubtask(subId) {
    fetch(`/api/subtasks/${subId}/toggle`, { method: 'PUT' })
        .then(async res => {
            const data = await res.json();
            if (res.ok) {
                loadTodos();
            } else {
                showToast(data.error || 'Failed to toggle subtask', 'error');
            }
        })
        .catch(err => console.error(err));
}

function deleteSubtask(event, subId) {
    if (event) event.stopPropagation();
    
    fetch(`/api/subtasks/${subId}`, { method: 'DELETE' })
        .then(async res => {
            const data = await res.json();
            if (res.ok) {
                showToast('Subtask deleted', 'success');
                loadTodos();
            } else {
                showToast(data.error || 'Failed to delete subtask', 'error');
            }
        })
        .catch(err => console.error(err));
}

// --- Alarms & HTML5 Desktop Notifications ---

function checkTaskAlarms() {
    if (!currentUser) return;
    
    // We poll the list of tasks directly from local memory (todos) to avoid spamming the database
    // Wait, what if list changed? The client periodically loads todos on page updates.
    // Let's iterate through the active list
    const now = new Date();
    
    todos.forEach(todo => {
        if (todo.completed) return;
        
        let targetTime = null;
        if (todo.snooze_until) {
            targetTime = new Date(todo.snooze_until);
        } else if (todo.due_date) {
            targetTime = new Date(todo.due_date);
        }
        
        if (targetTime && targetTime <= now) {
            // Task has reached its due/snooze trigger
            if (!notifiedTasks.has(todo.id)) {
                triggerDesktopNotification(todo);
                notifiedTasks.add(todo.id);
            }
        }
    });
}

function triggerDesktopNotification(todo) {
    if (!('Notification' in window)) return;
    
    if (Notification.permission === 'granted') {
        const bodyText = todo.description ? todo.description : `Priority: ${todo.priority.toUpperCase()}`;
        const notification = new Notification(`Task Due: ${todo.title}`, {
            body: bodyText,
            icon: 'https://cdn.jsdelivr.net/npm/@tabler/icons-png@latest/png/bell.png', // Fallback web notification icon
            tag: `todo-${todo.id}`,
            requireInteraction: true // Stays on screen till dismissed or actioned
        });
        
        notification.onclick = () => {
            window.focus();
            openTaskModal(todo.id);
            notification.close();
        };
    } else {
        // Fallback toast alert inside page
        showToast(`DUE NOW: "${todo.title}"`, 'error');
    }
}

// --- Analytics Chart rendering (Chart.js) ---

function loadAnalytics() {
    fetch('/api/analytics')
        .then(res => res.json())
        .then(data => {
            renderTrendChart(data.completed_trend);
            renderPriorityChart(data.priority_distribution);
            renderCategoryChart(data.category_distribution);
        })
        .catch(err => console.error('Failed to load analytics charts:', err));
}

// Fetch global text color based on active theme for Chart labels
function getChartTextColor() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return isDark ? '#e5e7eb' : '#374151';
}
function getChartGridColor() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
}

function renderTrendChart(trendData) {
    const ctx = document.getElementById('trendChart').getContext('2d');
    
    if (activeCharts['trend']) {
        activeCharts['trend'].destroy();
    }
    
    activeCharts['trend'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trendData.labels,
            datasets: [{
                label: 'Completed Tasks',
                data: trendData.data,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 3,
                tension: 0.35,
                fill: true,
                pointBackgroundColor: '#3b82f6',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    grid: { color: getChartGridColor() },
                    ticks: { color: getChartTextColor(), stepSize: 1 }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: getChartTextColor() }
                }
            }
        }
    });
}

function renderPriorityChart(priData) {
    const ctx = document.getElementById('priorityChart').getContext('2d');
    
    if (activeCharts['priority']) {
        activeCharts['priority'].destroy();
    }
    
    const labels = Object.keys(priData).map(k => k.charAt(0).toUpperCase() + k.slice(1));
    const values = Object.values(priData);
    
    activeCharts['priority'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: [
                    '#ef4444', // High -> Red
                    '#f59e0b', // Medium -> Yellow/Amber
                    '#10b981'  // Low -> Green
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: getChartTextColor() }
                }
            }
        }
    });
}

function renderCategoryChart(catData) {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    
    if (activeCharts['category']) {
        activeCharts['category'].destroy();
    }
    
    // Sort categories by highest count
    const sortedCats = catData.sort((a,b) => b.count - a.count);
    const labels = sortedCats.map(c => c.name);
    const values = sortedCats.map(c => c.count);
    const colors = sortedCats.map(c => c.color || '#3b82f6');
    
    activeCharts['category'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    grid: { color: getChartGridColor() },
                    ticks: { color: getChartTextColor(), stepSize: 1 }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: getChartTextColor() }
                }
            }
        }
    });
}

// --- Activity logs History tab ---

function loadHistory() {
    fetch('/api/audit-logs')
        .then(res => res.json())
        .then(data => {
            renderHistoryTimeline(data);
        })
        .catch(err => console.error('Failed to load audit history:', err));
}

function renderHistoryTimeline(logs) {
    const container = document.getElementById('history-timeline');
    container.innerHTML = '';
    
    if (logs.length === 0) {
        container.innerHTML = '<div class="subtitle text-center">No actions logged yet.</div>';
        return;
    }
    
    logs.forEach(log => {
        const item = document.createElement('div');
        item.className = `timeline-item log-${log.action}`;
        
        const date = new Date(log.created_at);
        const timeStr = date.toLocaleString();
        
        let displayActionText = log.action.charAt(0).toUpperCase() + log.action.slice(1);
        if (log.action === 'subtask_completed') displayActionText = 'Subtask Completed';
        if (log.action === 'subtask_uncompleted') displayActionText = 'Subtask Incomplete';
        
        item.innerHTML = `
            <div class="timeline-content">${escapeHTML(displayActionText)}</div>
            ${log.details ? `<div class="timeline-details">${escapeHTML(log.details)}</div>` : ''}
            <div class="timeline-time">${timeStr}</div>
        `;
        
        container.appendChild(item);
    });
}

function handleChangePassword(e) {
    e.preventDefault();
    const currentPasswordVal = document.getElementById('change-current-password').value;
    const newPasswordVal = document.getElementById('change-new-password').value;
    const confirmPasswordVal = document.getElementById('change-confirm-password').value;
    const submitBtn = document.getElementById('change-pw-btn');

    if (newPasswordVal !== confirmPasswordVal) {
        showToast("New passwords do not match", "error");
        return;
    }

    submitBtn.disabled = true;

    fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            current_password: currentPasswordVal,
            new_password: newPasswordVal
        })
    })
    .then(async res => {
        const data = await res.json();
        if (res.ok) {
            showToast(data.message || 'Password updated successfully', 'success');
            document.getElementById('change-password-form').reset();
        } else {
            showToast(data.error || 'Password update failed', 'error');
        }
    })
    .catch(err => {
        showToast('Server connection error', 'error');
        console.error(err);
    })
    .finally(() => {
        submitBtn.disabled = false;
    });
}

function initInteractiveEffects() {
    // 1. Interactive Background Nebula Glow
    const bgGlow = document.getElementById('bg-mouse-glow');
    let targetGlowX = window.innerWidth / 2;
    let targetGlowY = window.innerHeight / 2;
    let glowX = targetGlowX;
    let glowY = targetGlowY;
    let hasMoved = false;

    // Device check: disable on touchscreens
    if (window.matchMedia('(hover: none)').matches) {
        if (bgGlow) bgGlow.style.display = 'none';
        return;
    }

    // Capture mouse moves
    window.addEventListener('mousemove', (e) => {
        targetGlowX = e.clientX;
        targetGlowY = e.clientY;

        if (!hasMoved) {
            hasMoved = true;
            if (bgGlow) bgGlow.style.opacity = '1';
        }
    });

    // Animation physics loop
    function animateInteractiveElements() {
        // Background Glow interpolation (slow, organic lag)
        if (bgGlow) {
            glowX += (targetGlowX - glowX) * 0.04;
            glowY += (targetGlowY - glowY) * 0.04;
            bgGlow.style.left = glowX + 'px';
            bgGlow.style.top = glowY + 'px';
        }

        requestAnimationFrame(animateInteractiveElements);
    }
    animateInteractiveElements();
}
