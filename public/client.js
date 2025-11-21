/**
 * Full Stack Radiation Monitoring System - Client Side JavaScript
 * Handles all frontend interactions, API calls, and UI updates
 */

// Global variables
let currentUser = null;
let radiationChart = null;
let allData = [];

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

/**
 * Initialize the application based on current page
 */
async function initializeApp() {
    const currentPage = window.location.pathname.split('/').pop();
    
    // Check authentication status
    await checkAuthStatus();
    
    switch (currentPage) {
        case 'index.html':
        case '':
            initializeLoginPage();
            break;
        case 'user.html':
            initializeUserPage();
            break;
        case 'retrieve.html':
            initializeAdminPage();
            break;
        case 'data.html':
            // Standalone data page: load filter options and all data into the table
            try {
                console.log('Initializing data page...');
                
                // Populate filter dropdowns (months, blocks, plants, areas)
                if (typeof loadFilterOptions === 'function') {
                    console.log('Loading filter options...');
                    await loadFilterOptions();
                }

                console.log('Loading all data...');
                await retrieveAllData();
                
                // ensure quick action buttons and filter form listeners work on the data page
                console.log('Setting up event listeners...');
                setupAdminEventListeners();
                
                console.log('Data page initialization complete');
            } catch (err) {
                console.error('Error initializing data page:', err);
                showAlert('Error loading data: ' + err.message, 'danger');
            }
            break;
        case 'analytics.html':
            // Standalone analytics page: fetch data and render chart
            try {
                const resp = await fetch('/retrieve');
                const res = await resp.json();
                if (res.success && Array.isArray(res.data)) {
                    allData = res.data; // store globally so generateVisualization can use it
                    // initialize visualization controls' listeners
                    setupAdminEventListeners();
                    // render initial chart
                    updateChart(res.data);
                }
            } catch (err) {
                console.error('Error loading analytics data:', err);
            }
            break;
        case 'dashboard.html':
            // Standalone dashboard: load stats and a small summary
            try {
                const response = await fetch('/retrieve');
                const result = await response.json();
                if (result.success && Array.isArray(result.data)) {
                    // update small stat elements if present
                    const total = result.data.length;
                    const avgNear = result.data.reduce((s,r)=>s+(parseFloat(r.near)||0),0)/Math.max(1,total);
                    const avgOne = result.data.reduce((s,r)=>s+(parseFloat(r.onem)||0),0)/Math.max(1,total);
                    const maxReading = result.data.reduce((m,r)=>Math.max(m, parseFloat(r.near)||0, parseFloat(r.onem)||0),0);
                    const tr = document.getElementById('totalRecordsMini');
                    const an = document.getElementById('avgNearMini');
                    const ao = document.getElementById('avgOneMini');
                    const mr = document.getElementById('maxMini');
                    if (tr) tr.textContent = total;
                    if (an) an.textContent = avgNear.toFixed(2);
                    if (ao) ao.textContent = avgOne.toFixed(2);
                    if (mr) mr.textContent = maxReading.toFixed(2);
                }
            } catch (err) {
                console.error('Error loading dashboard data:', err);
            }
            break;
        case 'thresholds.html':
            // Standalone thresholds/alerts page: initialize alert management
            try {
                // load thresholds and alert history (notification settings removed from UI)
                await loadThresholds();
                await loadAlertHistory();
                // set up listeners for buttons/forms if present
                setupAdminEventListeners();
            } catch (err) {
                console.error('Error initializing thresholds page:', err);
            }
            break;
    }
}

/**
 * Check authentication status
 */
async function checkAuthStatus() {
    try {
        const response = await fetch('/auth-status');
        const result = await response.json();
        
        if (result.success && result.authenticated) {
            currentUser = result.user;
            
            // Redirect to appropriate page if already authenticated
            const currentPage = window.location.pathname.split('/').pop();
            if (currentPage === 'index.html' || currentPage === '') {
                if (currentUser.empid === 'admin') {
                    window.location.href = '/retrieve.html';
                } else {
                    window.location.href = '/user.html';
                }
            }
        } else {
            // Redirect to login if not authenticated and not on login page
            const currentPage = window.location.pathname.split('/').pop();
            if (currentPage !== 'index.html' && currentPage !== '') {
                window.location.href = '/';
            }
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        showAlert('Authentication check failed', 'danger');
    }
}

/**
 * Initialize login page functionality
 */
function initializeLoginPage() {
    // Set up form event listeners
    const loginForm = document.getElementById('loginFormElement');
    const registerForm = document.getElementById('registerFormElement');
    
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
    
    // Set up button event listeners
    const switchToRegisterBtn = document.getElementById('switchToRegisterBtn');
    if (switchToRegisterBtn) {
        switchToRegisterBtn.addEventListener('click', switchToRegister);
    }
    
    const switchToLoginBtn = document.getElementById('switchToLoginBtn');
    if (switchToLoginBtn) {
        switchToLoginBtn.addEventListener('click', switchToLogin);
    }
    
    // Auto-fill admin credentials for testing
    const loginEmpId = document.getElementById('loginEmpId');
    const loginPassword = document.getElementById('loginPassword');
    
    if (loginEmpId && loginPassword) {
        // Add placeholder for admin credentials
        loginEmpId.placeholder = 'Enter Employee ID (admin for admin access)';
        loginPassword.placeholder = 'Enter Password (admin@nfc for admin)';
    }
}

/**
 * Initialize user page functionality
 */
function initializeUserPage() {
    if (!currentUser) return;
    
    // Update user information display
    updateUserInfo();
    
    // Set current date
    setCurrentDate();
    
    // Set up form event listeners
    const radiationForm = document.getElementById('radiationForm');
    if (radiationForm) {
        radiationForm.addEventListener('submit', handleRadiationDataSubmit);
    }
    
    // Set up cascading dropdowns
    setupCascadingDropdowns();
    
    // Pre-fill employee ID with current user
    const empIdField = document.getElementById('empId');
    if (empIdField) {
        empIdField.value = currentUser.empid;
    }

    // Set up logout handler
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', async function(e) {
            e.preventDefault();
            await logout();
        });
    }
}

/**
 * Initialize admin page functionality
 */
async function initializeAdminPage() {
    console.log('initializeAdminPage called');
    console.log('currentUser:', currentUser);
    
    if (!currentUser || currentUser.empid !== 'admin') {
        console.log('Not admin user, returning');
        return;
    }
    
    console.log('Admin user confirmed, initializing...');
    
    // Update admin information display
    updateAdminInfo();
    
    // Load filter options
    console.log('Loading filter options...');
    await loadFilterOptions();
    
    // Set up event listeners
    console.log('Setting up event listeners...');
    setupAdminEventListeners();
    
    // Initialize chart with empty data first
    console.log('Initializing chart...');
    initializeChart();
    
    // Load initial data
    console.log('Loading initial data...');
    await retrieveAllData();
    
    console.log('Admin page initialization complete');
}

/**
 * Handle user login
 */
async function handleLogin(event) {
    event.preventDefault();
    
    const empId = document.getElementById('loginEmpId').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!empId || !password) {
        showAlert('Please enter both Employee ID and Password', 'danger', 'loginAlert');
        return;
    }
    
    showLoading('loginFormElement');
    
    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ empid: empId, password: password })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('Login successful! Redirecting...', 'success', 'loginAlert');
            setTimeout(() => {
                window.location.href = result.redirectUrl;
            }, 1000);
        } else {
            showAlert(result.message || 'Login failed', 'danger', 'loginAlert');
        }
    } catch (error) {
        console.error('Login error:', error);
        showAlert('Network error. Please try again.', 'danger', 'loginAlert');
    } finally {
        hideLoading('loginFormElement');
    }
}

/**
 * Handle user registration
 */
async function handleRegister(event) {
    event.preventDefault();
    
    const empId = document.getElementById('registerEmpId').value;
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    // Debug log
    console.log('Register form values:', {
        empId,
        name,
        email,
        password: password ? 'PRESENT' : 'MISSING',
        confirmPassword: confirmPassword ? 'PRESENT' : 'MISSING'
    });
    
    // Validation
    if (!empId || !name || !email || !password || !confirmPassword) {
        console.log('Missing fields:', {
            empId: !empId,
            name: !name,
            email: !email,
            password: !password,
            confirmPassword: !confirmPassword
        });
        showAlert('All fields are required', 'danger', 'registerAlert');
        return;
    }
    
    if (password !== confirmPassword) {
        showAlert('Passwords do not match', 'danger', 'registerAlert');
        return;
    }
    
    if (password.length < 6) {
        showAlert('Password must be at least 6 characters long', 'danger', 'registerAlert');
        return;
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showAlert('Please enter a valid email address', 'danger', 'registerAlert');
        return;
    }
    
    showLoading('registerFormElement');
    
    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                empid: empId, 
                name: name,
                email: email,
                block: document.getElementById('registerBlock').value,
                phone: document.getElementById('registerPhone').value,
                password: password
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('Registration successful! Please login.', 'success', 'registerAlert');
            setTimeout(() => {
                switchToLogin();
            }, 2000);
        } else {
            showAlert(result.message || 'Registration failed', 'danger', 'registerAlert');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showAlert('Network error. Please try again.', 'danger', 'registerAlert');
    } finally {
        hideLoading('registerFormElement');
    }
}

/**
 * Handle radiation data submission
 */
async function handleRadiationDataSubmit(event) {
    event.preventDefault();
    
    const formData = {
        emp: document.getElementById('empId').value,
        name: document.getElementById('empName').value,
        block: document.getElementById('blockSelect').value,
        plant: document.getElementById('plantSelect').value,
        area: document.getElementById('areaSelect').value,
        // area specification removed from UI; use area as fallback
        areaspec: document.getElementById('areaSelect').value,
        near: parseFloat(document.getElementById('nearReading').value),
        onem: parseFloat(document.getElementById('oneMeterReading').value),
        currentDate: document.getElementById('currentDate').value
    };
    
    // Validation
    if (!formData.emp || !formData.name || !formData.block || !formData.plant || 
        !formData.area || isNaN(formData.near) || 
        isNaN(formData.onem) || !formData.currentDate) {
        showAlert('All fields are required and must be valid', 'danger');
        return;
    }
    
    if (formData.near < 0 || formData.onem < 0) {
        showAlert('Radiation readings must be positive numbers', 'danger');
        return;
    }
    
    showLoading('radiationForm');
    
    try {
        const response = await fetch('/insert', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            let message = 'Data inserted successfully!';
            if (result.thresholdViolated) {
                message += ' ⚠️ Threshold exceeded - Alert sent!';
            }
            showAlert(message, result.thresholdViolated ? 'warning' : 'success');
            document.getElementById('radiationForm').reset();
            setCurrentDate();
            document.getElementById('empId').value = currentUser.empid;
        } else {
            showAlert(result.message || 'Data insertion failed', 'danger');
        }
    } catch (error) {
        console.error('Data insertion error:', error);
        
        // Check if it's a network error and we're offline
        if (!navigator.onLine) {
            // Store data for offline sync
            storeOfflineData(formData);
            showAlert('Data saved offline and will be synced when connection is restored.', 'info');
        } else {
            showAlert('Network error. Please try again.', 'danger');
        }
    } finally {
        hideLoading('radiationForm');
    }
}

/**
 * Store data for offline sync
 */
function storeOfflineData(formData) {
    try {
        let offlineData = JSON.parse(localStorage.getItem('radiationOfflineData') || '[]');
        offlineData.push({
            ...formData,
            offlineTimestamp: new Date().toISOString()
        });
        localStorage.setItem('radiationOfflineData', JSON.stringify(offlineData));
        
        // Reset form even in offline mode
        document.getElementById('radiationForm').reset();
        setCurrentDate();
        document.getElementById('empId').value = currentUser.empid;
        
        console.log('Data stored offline:', formData);
    } catch (error) {
        console.error('Failed to store offline data:', error);
    }
}

/**
 * Set up cascading dropdowns for user form
 */
function setupCascadingDropdowns() {
    const blockSelect = document.getElementById('blockSelect');
    const plantSelect = document.getElementById('plantSelect');
    const areaSelect = document.getElementById('areaSelect');
    
    if (blockSelect) {
        blockSelect.addEventListener('change', async function() {
            const selectedBlock = this.value;
            await updatePlantDropdown(selectedBlock);
            await updateAreaDropdown(selectedBlock, ""); // Update area options without disabling
        });
    }
    
    if (plantSelect) {
        plantSelect.addEventListener('change', async function() {
            const selectedBlock = blockSelect.value;
            const selectedPlant = this.value;
            console.log('Plant changed:', { selectedBlock, selectedPlant }); // Debug log
            await updateAreaDropdown(selectedBlock, selectedPlant);
        });
    }
    
    if (areaSelect) {
        areaSelect.addEventListener('change', async function() {
            const selectedBlock = blockSelect.value;
            const selectedPlant = plantSelect.value;
            const selectedArea = this.value;
            console.log('Area changed:', { selectedBlock, selectedPlant, selectedArea }); // Debug log
        });
    }
}

/**
 * Update plant dropdown based on selected block
 */
async function updatePlantDropdown(block) {
    const plantSelect = document.getElementById('plantSelect');
    if (!plantSelect) return;
    
    try {
        // If no block selected, reset and disable plant
        if (!block) {
            plantSelect.innerHTML = '<option value="">Select Plant</option>';
            plantSelect.disabled = true;
            return;
        }

        const response = await fetch(`/dropdown-data?type=plants&block=${encodeURIComponent(block)}`);
        const result = await response.json();

        // Always ensure plantSelect is enabled when a block is chosen so users can pick a plant
        plantSelect.innerHTML = '<option value="">Select Plant</option>';
        plantSelect.disabled = false;

        if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
            // Populate with server-provided plants
            plantSelect.innerHTML = '<option value="">Select Plant</option>';
            result.data.forEach(plant => {
                plantSelect.innerHTML += `<option value="${plant}">${plant}</option>`;
            });
        } else {
            // Fallback default plants to keep UI usable
            const defaultPlants = ['Reactor Core', 'Turbine Hall', 'Plant 1', 'Plant 2'];
            defaultPlants.forEach(p => {
                plantSelect.innerHTML += `<option value="${p}">${p}</option>`;
            });
        }
    } catch (error) {
        console.error('Error updating plant dropdown:', error);
        // On error, provide sensible defaults and enable the control so user can continue
        plantSelect.innerHTML = '<option value="">Select Plant</option>';
        const defaultPlants = ['Reactor Core', 'Turbine Hall', 'Plant 1', 'Plant 2'];
        defaultPlants.forEach(p => plantSelect.innerHTML += `<option value="${p}">${p}</option>`);
        plantSelect.disabled = false;
    }
}

/**
 * Update area dropdown based on selected block and plant
 */
async function updateAreaDropdown(block, plant) {
    const areaSelect = document.getElementById('areaSelect');
    if (!areaSelect) return;
    
    try {
        console.log('Updating area dropdown:', { block, plant }); // Debug log
        
        // Keep area dropdown enabled but clear its options
        areaSelect.innerHTML = '<option value="">Select Area</option>';
        areaSelect.disabled = false;

        // Add the default area options
        const defaultAreas = ['Storage Area', 'Basement', 'Main Floor', 'Control Room'];
        defaultAreas.forEach(area => {
            areaSelect.innerHTML += `<option value="${area}">${area}</option>`;
        });

        // Only fetch additional options if both block and plant are selected
        if (block && plant) {
            const response = await fetch(`/dropdown-data?type=areas&block=${encodeURIComponent(block)}&plant=${encodeURIComponent(plant)}`);
            const result = await response.json();
            
            console.log('Area dropdown API response:', result); // Debug log
            
            if (result.success && result.data && result.data.length > 0) {
                // Clear existing options first
                areaSelect.innerHTML = '<option value="">Select Area</option>';
                // Add new options from API
                result.data.forEach(area => {
                    areaSelect.innerHTML += `<option value="${area}">${area}</option>`;
                });
            }
        }
        
        console.log('Area dropdown updated with options:', areaSelect.options.length); // Debug log
    } catch (error) {
        console.error('Error updating area dropdown:', error);
        // On error, ensure we at least have the default options
        areaSelect.innerHTML = '<option value="">Select Area</option>';
        const defaultAreas = ['Storage Area', 'Basement', 'Main Floor', 'Control Room'];
        defaultAreas.forEach(area => {
            areaSelect.innerHTML += `<option value="${area}">${area}</option>`;
        });
    }
}



/**
 * Reset dropdown to initial state
 */
function resetDropdown(selectElement) {
    if (selectElement) {
        selectElement.innerHTML = '<option value="">Select...</option>';
        selectElement.disabled = true;
    }
}

/**
 * Load filter options for admin dashboard
 */
async function loadFilterOptions() {
    console.log('loadFilterOptions called');
    try {
        console.log('Fetching filter options from /filter-options');
        const response = await fetch('/filter-options');
        console.log('Filter options response status:', response.status);
        
        const result = await response.json();
        console.log('Filter options result:', result);
        
        if (result.success) {
            const data = result.data;
            console.log('Filter data:', data);
            
            // Update month dropdown
            const monthFilter = document.getElementById('monthFilter');
            console.log('Month filter element:', monthFilter);
            if (monthFilter) {
                data.months.forEach(month => {
                    monthFilter.innerHTML += `<option value="${month.value}">${month.label}</option>`;
                });
                console.log('Month options loaded');
            }
            
            // Update block dropdown
            const blockFilter = document.getElementById('blockFilter');
            console.log('Block filter element:', blockFilter);
            if (blockFilter) {
                data.blocks.forEach(block => {
                    blockFilter.innerHTML += `<option value="${block}">${block}</option>`;
                });
                console.log('Block options loaded');
            }
            
            // Update plant dropdown
            const plantFilter = document.getElementById('plantFilter');
            console.log('Plant filter element:', plantFilter);
            if (plantFilter) {
                data.plants.forEach(plant => {
                    plantFilter.innerHTML += `<option value="${plant}">${plant}</option>`;
                });
                console.log('Plant options loaded');
            }
            
            // Update area dropdown
            const areaFilter = document.getElementById('areaFilter');
            console.log('Area filter element:', areaFilter);
            if (areaFilter) {
                data.areas.forEach(area => {
                    areaFilter.innerHTML += `<option value="${area}">${area}</option>`;
                });
                console.log('Area options loaded');
            }
            
            console.log('All filter options loaded successfully');
        } else {
            console.error('Failed to load filter options:', result.message);
            showAlert('Failed to load filter options: ' + result.message, 'danger');
        }
    } catch (error) {
        console.error('Error loading filter options:', error);
        showAlert('Failed to load filter options', 'danger');
    }
}

/**
 * Set up admin page event listeners
 */
function setupAdminEventListeners() {
    console.log('Setting up admin event listeners...');
    
    // Filter form submission
    const filterForm = document.getElementById('filterForm');
    if (filterForm) {
        filterForm.addEventListener('submit', function(event) {
            event.preventDefault();
            applyFilters();
        });
    }
    
    // Apply Filters button
    const applyFiltersBtn = document.getElementById('applyFiltersBtn');
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', applyFilters);
        console.log('Apply filters button listener added');
    }
    
    // Retrieve All Data button
    const retrieveAllDataBtn = document.getElementById('retrieveAllDataBtn');
    if (retrieveAllDataBtn) {
        retrieveAllDataBtn.addEventListener('click', retrieveAllData);
        console.log('Retrieve all data button listener added');
    }
    
    // Clear Filters button
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', clearFilters);
        console.log('Clear filters button listener added');
    }
    
    // Export CSV button
    const exportCSVBtn = document.getElementById('exportCSVBtn');
    if (exportCSVBtn) {
        exportCSVBtn.addEventListener('click', exportToCSV);
        console.log('Export CSV button listener added');
    }
    
    // Export JSON button
    const exportJSONBtn = document.getElementById('exportJSONBtn');
    if (exportJSONBtn) {
        exportJSONBtn.addEventListener('click', exportToJSON);
        console.log('Export JSON button listener added');
    }
    
    // Print Report button
    const printReportBtn = document.getElementById('printReportBtn');
    if (printReportBtn) {
        printReportBtn.addEventListener('click', printReport);
        console.log('Print report button listener added');
    }
    
    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(event) {
            event.preventDefault();
            logout();
        });
        console.log('Logout button listener added');
    }
    
    // Advanced Analytics buttons
    const loadTrendAnalysisBtn = document.getElementById('loadTrendAnalysisBtn');
    if (loadTrendAnalysisBtn) {
        loadTrendAnalysisBtn.addEventListener('click', loadTrendAnalysis);
        console.log('Trend analysis button listener added');
    }
    
    const loadPredictiveAnalysisBtn = document.getElementById('loadPredictiveAnalysisBtn');
    if (loadPredictiveAnalysisBtn) {
        loadPredictiveAnalysisBtn.addEventListener('click', loadPredictiveAnalysis);
        console.log('Predictive analysis button listener added');
    }
    
    const showAdvancedChartsBtn = document.getElementById('showAdvancedChartsBtn');
    if (showAdvancedChartsBtn) {
        showAdvancedChartsBtn.addEventListener('click', showAdvancedCharts);
        console.log('Advanced charts button listener added');
    }
    
    const showSystemHealthBtn = document.getElementById('showSystemHealthBtn');
    if (showSystemHealthBtn) {
        showSystemHealthBtn.addEventListener('click', showSystemHealth);
        console.log('System health button listener added');
    }
    
    // Alert Management buttons
    const updateThresholdsBtn = document.getElementById('updateThresholdsBtn');
    if (updateThresholdsBtn) {
        updateThresholdsBtn.addEventListener('click', updateAlertThresholds);
        console.log('Update thresholds button listener added');
    }
    
    const sendAlertBtn = document.getElementById('sendAlertBtn');
    if (sendAlertBtn) {
        sendAlertBtn.addEventListener('click', sendAlert);
        console.log('Send alert button listener added');
    }
    
    // Generate Visualization button
    const generateVisualizationBtn = document.getElementById('generateVisualizationBtn');
    if (generateVisualizationBtn) {
        generateVisualizationBtn.addEventListener('click', generateVisualization);
        console.log('Generate visualization button listener added');
    }
    
    // Refresh Data button
    const refreshDataBtn = document.getElementById('refreshDataBtn');
    if (refreshDataBtn) {
        refreshDataBtn.addEventListener('click', retrieveAllData);
        console.log('Refresh data button listener added');
    }
    
    // Manual Alert Form
    const manualAlertForm = document.getElementById('manualAlertForm');
    if (manualAlertForm) {
        manualAlertForm.addEventListener('submit', handleManualAlert);
        console.log('Manual alert form listener added');
    }
    
    // Refresh Alerts button
    const refreshAlertsBtn = document.getElementById('refreshAlertsBtn');
    if (refreshAlertsBtn) {
        refreshAlertsBtn.addEventListener('click', loadAlertHistory);
        console.log('Refresh alerts button listener added');
    }
    
    console.log('All admin event listeners set up successfully');
}

/**
 * Apply filters and retrieve filtered data
 */
async function applyFilters() {
    console.log('applyFilters function called');
    
    const month = document.getElementById('monthFilter').value;
    const block = document.getElementById('blockFilter').value;
    const plant = document.getElementById('plantFilter').value;
    const area = document.getElementById('areaFilter').value;
    
    console.log('Filter values:', { month, block, plant, area });
    
    showLoading('filterForm');
    
    try {
        const params = new URLSearchParams();
        if (month !== 'all') params.append('month', month);
        if (block !== 'all') params.append('block', block);
        if (plant !== 'all') params.append('plant', plant);
        if (area !== 'all') params.append('area', area);
        
        console.log('Requesting:', `/retrievedate?${params.toString()}`);
        
        const response = await fetch(`/retrievedate?${params.toString()}`);
        console.log('Response status:', response.status);
        
        const result = await response.json();
        console.log('Response data:', result);
        
        if (result.success) {
            displayFilteredData(result.data);
            // Get statistics separately
            await updateStatisticsFromAPI(params.toString());
            updateChart(result.data);
            console.log('Filters applied successfully');
        } else {
            console.error('Filter failed:', result.message);
            showAlert(result.message || 'Failed to retrieve filtered data', 'danger');
        }
    } catch (error) {
        console.error('Error applying filters:', error);
        showAlert('Network error. Please try again.', 'danger');
    } finally {
        hideLoading('filterForm');
    }
}

/**
 * Clear all filters and show all data
 */
function clearFilters() {
    console.log('Clearing filters...');
    
    // Reset all filter dropdowns to "all"
    const monthFilter = document.getElementById('monthFilter');
    const blockFilter = document.getElementById('blockFilter');
    const plantFilter = document.getElementById('plantFilter');
    const areaFilter = document.getElementById('areaFilter');
    
    if (monthFilter) monthFilter.value = 'all';
    if (blockFilter) blockFilter.value = 'all';
    if (plantFilter) plantFilter.value = 'all';
    if (areaFilter) areaFilter.value = 'all';
    
    // Retrieve all data
    retrieveAllData();
    
    console.log('Filters cleared');
}

/**
 * Retrieve all data
 */
async function retrieveAllData() {
    showLoading('filterForm');

    try {
        // If called from the standalone data page, request all records.
        // Try admin endpoint first; if forbidden (403) fall back to public endpoint.
        const currentPage = window.location.pathname.split('/').pop();
        let url = currentPage === 'data.html' ? '/retrieve?all=true' : '/retrieve';

        console.log('Fetching data from:', url);
        let response = await fetch(url);
        console.log('Response status:', response.status);

        // Try public endpoint if admin endpoint fails
        if ((!response.ok) && currentPage === 'data.html') {
            console.log('Falling back to public endpoint...');
            response = await fetch('/public/retrieve?all=true');
            console.log('Public endpoint response status:', response.status);
        }

        // Parse the response
        const result = await response.json();
        console.log('Retrieved data:', result);

        if (result.success) {
            allData = result.data;
            console.log('Data loaded:', allData.length, 'records');

            // Display the data
            console.log('Displaying data...');
            displayAllData(result.data);

            // Update stats and chart
            console.log('Updating statistics and chart...');
            updateStatistics(result.data);
            updateChart(result.data);

            // Show success message
            showAlert(`Successfully loaded ${result.data.length} records`, 'success');
        } else {
            console.error('Failed to retrieve data:', result.message);
            showAlert(result.message || 'Failed to retrieve data', 'danger');
        }
    } catch (error) {
        console.error('Error retrieving all data:', error);
        showAlert('Network error. Please try again. Error: ' + error.message, 'danger');
    } finally {
        hideLoading('filterForm');
    }
}

/**
 * Display filtered data in table
 */
function displayFilteredData(data) {
    const tableBody = document.getElementById('dataTableBody');
    if (!tableBody) return;
    
    if (data.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center">
                    <div class="no-data">
                        <i class="fas fa-search"></i>
                        <p>No data found for the selected filters.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tableBody.innerHTML = data.map(row => `
        <tr>
            <td><span class="badge bg-primary">${row.emp}</span></td>
            <td>${row.name}</td>
            <td><span class="badge bg-info">${row.block}</span></td>
            <td><span class="badge bg-warning">${row.plant}</span></td>
            <td><span class="badge bg-secondary">${row.area}</span></td>
            <td>${row.areaspec}</td>
            <td><span class="badge bg-success">${parseFloat(row.near).toFixed(2)}</span></td>
            <td><span class="badge bg-danger">${parseFloat(row.onem).toFixed(2)}</span></td>
            <td>${new Date(row.currentDate).toLocaleDateString()}</td>
        </tr>
    `).join('');
}

/**
 * Display all data in table
 */
function displayAllData(data) {
    console.log('Displaying data in table...');
    const tableBody = document.getElementById('dataTableBody');
    if (!tableBody) {
        console.error('Table body element not found');
        return;
    }
    
    if (!Array.isArray(data)) {
        console.error('Invalid data format:', data);
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center">
                    <div class="no-data">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Error: Invalid data format received.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    if (data.length === 0) {
        console.log('No data to display');
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center">
                    <div class="no-data">
                        <i class="fas fa-database"></i>
                        <p>No radiation data available.</p>
                        <small class="text-muted">Try clicking the "Load All Data" button above.</small>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    console.log('Processing', data.length, 'records for display');
    
    try {
        tableBody.innerHTML = data.map(row => {
            // Safely parse numeric values
            const nearValue = !isNaN(row.near) ? parseFloat(row.near).toFixed(2) : 'N/A';
            const onemValue = !isNaN(row.onem) ? parseFloat(row.onem).toFixed(2) : 'N/A';
            
            // Safely format date
            let dateStr = 'Invalid Date';
            try {
                dateStr = new Date(row.currentDate).toLocaleDateString();
            } catch (e) {
                console.warn('Invalid date for row:', row);
            }
            
            return `
                <tr>
                    <td><span class="badge bg-primary">${row.emp || 'N/A'}</span></td>
                    <td>${row.name || 'N/A'}</td>
                    <td><span class="badge bg-info">${row.block || 'N/A'}</span></td>
                    <td><span class="badge bg-warning">${row.plant || 'N/A'}</span></td>
                    <td><span class="badge bg-secondary">${row.area || 'N/A'}</span></td>
                    <td>${row.areaspec || 'N/A'}</td>
                    <td><span class="badge bg-success">${nearValue}</span></td>
                    <td><span class="badge bg-danger">${onemValue}</span></td>
                    <td>${dateStr}</td>
                </tr>
            `;
        }).join('');
        
        console.log('Table data displayed successfully');
        
    } catch (error) {
        console.error('Error displaying data:', error);
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center">
                    <div class="no-data">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Error displaying data: ${error.message}</p>
                    </div>
                </td>
            </tr>
        `;
    }
}

/**
 * Update statistics from API
 */
async function updateStatisticsFromAPI(params) {
    try {
        const response = await fetch(`/api/statistics?${params}`);
        const result = await response.json();
        
        if (result.success) {
            const stats = result.data;
            
            // Update statistics cards (safe: only update elements that exist)
            safeSetText('totalRecords', stats.totalRecords != null ? String(stats.totalRecords) : '0');
            safeSetText('avgNearReading', (stats.avgNear != null) ? stats.avgNear.toFixed(2) : '0.00');
            safeSetText('avgOneMeterReading', (stats.avgOnem != null) ? stats.avgOnem.toFixed(2) : '0.00');
            safeSetText('maxReading', String(Math.max(stats.maxNear || 0, stats.maxOnem || 0).toFixed(2)));
        }
    } catch (error) {
        console.error('Error updating statistics:', error);
        // Fallback to client-side calculation
        updateStatistics(allData);
    }
}

/**
 * Safely set textContent on an element if it exists
 */
function safeSetText(id, text) {
    try {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    } catch (e) {
        console.warn(`safeSetText failed for #${id}:`, e && e.message);
    }
}

/**
 * Update statistics cards (fallback method)
 */
function updateStatistics(data) {
    if (!Array.isArray(data) || data.length === 0) {
        safeSetText('totalRecords', '0');
        safeSetText('avgNearReading', '0.00');
        safeSetText('avgOneMeterReading', '0.00');
        safeSetText('maxReading', '0.00');
        return;
    }
    
    let totalRecords = data.length;
    let totalNear = 0;
    let totalOneMeter = 0;
    let maxReading = 0;
    
    data.forEach(row => {
        const near = parseFloat(row.near) || 0;
        const onem = parseFloat(row.onem) || 0;
        
        totalNear += near;
        totalOneMeter += onem;
        maxReading = Math.max(maxReading, near, onem);
    });
    
    const avgNear = totalRecords > 0 ? totalNear / totalRecords : 0;
    const avgOneMeter = totalRecords > 0 ? totalOneMeter / totalRecords : 0;
    
    safeSetText('totalRecords', String(totalRecords));
    safeSetText('avgNearReading', avgNear.toFixed(2));
    safeSetText('avgOneMeterReading', avgOneMeter.toFixed(2));
    safeSetText('maxReading', maxReading.toFixed(2));
}

/**
 * Initialize chart with empty state
 */
function initializeChart() {
    const ctx = document.getElementById('radiationChart');
    if (!ctx) {
        console.error('Chart canvas element not found');
        return;
    }
    
    // Check if Chart.js is available
    if (typeof Chart === 'undefined') {
        console.error('Chart.js library not loaded');
        ctx.innerHTML = '<p class="text-danger">Chart.js library not available</p>';
        return;
    }
    
    // Clear any existing chart
    if (radiationChart) {
        radiationChart.destroy();
        radiationChart = null;
    }
    
    // Show initial empty state
    ctx.innerHTML = '<p class="text-center text-muted">Loading chart data...</p>';
}

/**
 * Update chart with data
 */
function updateChart(data) {
    // Prefer interactiveChart (used by visualization controls), fallback to radiationChart
    const ctx = document.getElementById('interactiveChart') || document.getElementById('radiationChart');
    if (!ctx) {
        console.error('Chart canvas element not found');
        return;
    }
    
    // Check if Chart.js is available
    if (typeof Chart === 'undefined') {
        console.error('Chart.js library not loaded');
        ctx.innerHTML = '<p class="text-danger">Chart.js library not available</p>';
        return;
    }
    
    if (radiationChart) {
        radiationChart.destroy();
        radiationChart = null;
    }
    
    if (data.length === 0) {
        const canvas = ctx.getContext('2d');
        canvas.clearRect(0, 0, ctx.width, ctx.height);
        ctx.innerHTML = '<p class="text-center text-muted">No data available for visualization</p>';
        return;
    }
    
    console.log('Chart data received:', data);
    
    const labels = data.map(row => `${row.area} - ${row.areaspec}`);
    const nearData = data.map(row => row.max_near || row.near || 0);
    const oneMeterData = data.map(row => row.max_onem || row.onem || 0);
    
    console.log('Chart labels:', labels);
    console.log('Near data:', nearData);
    console.log('One meter data:', oneMeterData);
    
    try {
        radiationChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Max Near Reading (μSv/h)',
                    data: nearData,
                    backgroundColor: 'rgba(102, 126, 234, 0.8)',
                    borderColor: 'rgba(102, 126, 234, 1)',
                    borderWidth: 1
                }, {
                    label: 'Max One Meter Reading (μSv/h)',
                    data: oneMeterData,
                    backgroundColor: 'rgba(255, 107, 107, 0.8)',
                    borderColor: 'rgba(255, 107, 107, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Radiation Level (μSv/h)'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Areas'
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    title: {
                        display: true,
                        text: 'Radiation Levels by Area'
                    }
                }
            }
        });
        
        console.log('Chart created successfully');
    } catch (error) {
        console.error('Error creating chart:', error);
        ctx.innerHTML = '<p class="text-danger">Error creating chart: ' + error.message + '</p>';
    }
}

/**
 * Clear all filters
 */
function clearFilters() {
    document.getElementById('monthFilter').value = 'all';
    document.getElementById('blockFilter').value = 'all';
    document.getElementById('plantFilter').value = 'all';
    document.getElementById('areaFilter').value = 'all';
    
    // Retrieve all data after clearing filters
    retrieveAllData();
}

/**
 * Export data to CSV
 */
function exportToCSV() {
    if (allData.length === 0) {
        showAlert('No data to export', 'warning');
        return;
    }
    
    const headers = ['Employee ID', 'Name', 'Block', 'Plant', 'Area', 'Area Specification', 'Near Reading', 'One Meter Reading', 'Date'];
    const csvContent = [
        headers.join(','),
        ...allData.map(row => [
            row.emp,
            row.name,
            row.block,
            row.plant,
            row.area,
            row.areaspec,
            row.near,
            row.onem,
            row.currentDate
        ].join(','))
    ].join('\n');
    
    downloadFile(csvContent, 'radiation-data.csv', 'text/csv');
}

/**
 * Export data to JSON
 */
function exportToJSON() {
    if (allData.length === 0) {
        showAlert('No data to export', 'warning');
        return;
    }
    
    const jsonContent = JSON.stringify(allData, null, 2);
    downloadFile(jsonContent, 'radiation-data.json', 'application/json');
}

/**
 * Print report
 */
function printReport() {
    window.print();
}

/**
 * Generate interactive visualization
 */
async function generateVisualization() {
    try {
        console.log('Generating visualization...');
        
        // Get form values
        const chartType = document.getElementById('chartTypeSelect').value;
        const xAxis = document.getElementById('xAxisSelect').value;
        const yAxis = document.getElementById('yAxisSelect').value;
        const groupBy = document.getElementById('groupBySelect').value;
        const timeRange = document.getElementById('timeRangeSelect').value;
        
        console.log('Chart parameters:', { chartType, xAxis, yAxis, groupBy, timeRange });
        
        // Check if we have data
        if (!allData || allData.length === 0) {
            showAlert('No data available for visualization. Please load data first.', 'warning');
            return;
        }
        
        // Filter data based on time range
        let filteredData = allData;
        if (timeRange !== 'all') {
            const days = parseInt(timeRange);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            
            filteredData = allData.filter(row => {
                const rowDate = new Date(row.currentDate);
                return rowDate >= cutoffDate;
            });
        }
        
        if (filteredData.length === 0) {
            showAlert('No data available for the selected time range.', 'warning');
            return;
        }
        
        // Process data for visualization
        let chartData;
        if (groupBy === 'none') {
            chartData = processSimpleData(filteredData, xAxis, yAxis);
        } else {
            chartData = processGroupedData(filteredData, xAxis, yAxis, groupBy);
        }
        
        // Create the chart
        createInteractiveChart(chartData, chartType, xAxis, yAxis);
        
        // Update chart information
        updateChartInfo(chartData, chartType, xAxis, yAxis);
        
        showAlert(`Visualization generated successfully with ${filteredData.length} data points`, 'success');
        
    } catch (error) {
        console.error('Error generating visualization:', error);
        showAlert('Error generating visualization: ' + error.message, 'danger');
    }
}

/**
 * Process simple data for visualization
 */
function processSimpleData(data, xAxis, yAxis) {
    const maxDataPoints = 50; // Limit for performance
    const limitedData = data.slice(0, maxDataPoints);
    
    const labels = limitedData.map(row => {
        if (xAxis === 'currentDate') {
            return new Date(row[xAxis]).toLocaleDateString();
        }
        return row[xAxis] || 'Unknown';
    });
    
    const values = limitedData.map(row => {
        if (yAxis === 'count') return 1;
        return parseFloat(row[yAxis]) || 0;
    });
    
    return {
        labels: labels,
        datasets: [{
            label: getAxisLabel(yAxis),
            data: values,
            backgroundColor: getChartColors(1)[0],
            borderColor: getChartColors(1)[0],
            borderWidth: 2
        }]
    };
}

/**
 * Process grouped data for visualization
 */
function processGroupedData(data, xAxis, yAxis, groupBy) {
    const groupedData = {};
    
    data.forEach(row => {
        const groupKey = row[groupBy] || 'Unknown';
        const xValue = xAxis === 'currentDate' ? new Date(row[xAxis]).toLocaleDateString() : (row[xAxis] || 'Unknown');
        
        if (!groupedData[groupKey]) {
            groupedData[groupKey] = {};
        }
        
        if (!groupedData[groupKey][xValue]) {
            groupedData[groupKey][xValue] = [];
        }
        
        if (yAxis === 'count') {
            groupedData[groupKey][xValue].push(1);
        } else {
            groupedData[groupKey][xValue].push(parseFloat(row[yAxis]) || 0);
        }
    });
    
    // Get all unique x-axis values
    const allXValues = new Set();
    Object.values(groupedData).forEach(group => {
        Object.keys(group).forEach(xValue => allXValues.add(xValue));
    });
    
    const labels = Array.from(allXValues).slice(0, 20); // Limit for performance
    const colors = getChartColors(Object.keys(groupedData).length);
    
    const datasets = Object.keys(groupedData).map((groupKey, index) => {
        const values = labels.map(xValue => {
            const groupValues = groupedData[groupKey][xValue] || [];
            if (groupValues.length === 0) return 0;
            
            if (yAxis === 'count') {
                return groupValues.length;
            } else {
                return groupValues.reduce((sum, val) => sum + val, 0) / groupValues.length;
            }
        });
        
        return {
            label: groupKey,
            data: values,
            backgroundColor: colors[index],
            borderColor: colors[index],
            borderWidth: 2
        };
    });
    
    return { labels, datasets };
}

/**
 * Create interactive chart
 */
function createInteractiveChart(data, chartType, xAxis, yAxis) {
    // Use interactiveChart canvas if present, otherwise fallback to radiationChart
    const ctx = document.getElementById('interactiveChart') || document.getElementById('radiationChart');
    if (!ctx) return;
    
    // Clear any existing Chart.js instance attached to this canvas.
    // Use Chart.getChart if available, otherwise fall back to scanning Chart.instances.
    try {
        // Determine the canvas element
        const canvasEl = (ctx && ctx.getContext) ? ctx : (ctx && ctx.canvas) ? ctx.canvas : document.getElementById('interactiveChart');

        let existingChart = null;
        if (typeof Chart !== 'undefined') {
            if (typeof Chart.getChart === 'function') {
                existingChart = Chart.getChart(canvasEl);
            }
            // Fallback: scan instances
            if (!existingChart && Chart.instances) {
                Object.values(Chart.instances).some(inst => {
                    if (inst && inst.canvas === canvasEl) {
                        existingChart = inst;
                        return true;
                    }
                    return false;
                });
            }
        }

        if (existingChart && typeof existingChart.destroy === 'function') {
            try {
                existingChart.destroy();
            } catch (err) {
                console.warn('Failed to destroy existing Chart instance on canvas:', err);
            }
        }

        // Keep global reference in sync
        if (window.interactiveChart && typeof window.interactiveChart.destroy === 'function') {
            try { window.interactiveChart.destroy(); } catch (e) { /* ignore */ }
            window.interactiveChart = null;
        }
    } catch (err) {
        console.warn('Error while attempting to clear existing chart:', err);
    }
    
    // Check if Chart.js is available
    if (typeof Chart === 'undefined') {
        console.error('Chart.js library not loaded');
        ctx.innerHTML = '<p class="text-danger">Chart.js library not available</p>';
        return;
    }
    
    // Configure chart options based on type
    const options = getChartOptions(chartType, xAxis, yAxis);
    
    // Create chart and store the Chart instance on window to make it accessible
    // across modules. Also guard against the case where `ctx` is a canvas element
    // (browsers expose elements by id on window) by ensuring we store the Chart
    // instance, not the DOM node.
    window.interactiveChart = new Chart(ctx, {
        type: chartType,
        data: data,
        options: options
    });
    
    console.log('Interactive chart created successfully:', chartType);
}

/**
 * Get chart options based on type
 */
function getChartOptions(chartType, xAxis, yAxis) {
    const baseOptions = {
        responsive: true,
        maintainAspectRatio: false,
        aspectRatio: 2.5,
        layout: {
            padding: {
                top: 10,
                bottom: 10,
                left: 10,
                right: 10
            }
        },
        animation: {
            duration: 800,
            easing: 'easeInOutQuart'
        },
        plugins: {
            legend: {
                display: true,
                position: 'top'
            },
            tooltip: {
                mode: 'index',
                intersect: false
            }
        }
    };
    
    if (chartType === 'pie' || chartType === 'doughnut') {
        return {
            ...baseOptions,
            plugins: {
                ...baseOptions.plugins,
                legend: {
                    display: true,
                    position: 'bottom'
                }
            }
        };
    }
    
    // Default options for line and bar charts
    return {
        ...baseOptions,
        scales: {
            y: {
                beginAtZero: true,
                title: {
                    display: true,
                    text: getAxisLabel(yAxis)
                },
                grid: {
                    color: 'rgba(0,0,0,0.1)'
                }
            },
            x: {
                title: {
                    display: true,
                    text: getAxisLabel(xAxis)
                },
                grid: {
                    color: 'rgba(0,0,0,0.1)'
                },
                ticks: {
                    maxRotation: 45,
                    minRotation: 0,
                    maxTicksLimit: 10
                }
            }
        }
    };
}

/**
 * Get axis label
 */
function getAxisLabel(axis) {
    const labels = {
        'area': 'Area',
        'block': 'Block',
        'plant': 'Plant',
        'areaspec': 'Area Specification',
        'currentDate': 'Date',
        'emp': 'Employee ID',
        'near': 'Near Reading (μSv/h)',
        'onem': 'One Meter Reading (μSv/h)',
        'count': 'Count',
        'avg_near': 'Average Near (μSv/h)',
        'avg_onem': 'Average One Meter (μSv/h)'
    };
    return labels[axis] || axis;
}

/**
 * Get chart colors
 */
function getChartColors(count) {
    const colors = [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', 
        '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF',
        '#4BC0C0', '#FF6384', '#36A2EB', '#FFCE56'
    ];
    return colors.slice(0, count);
}

/**
 * Update chart information
 */
function updateChartInfo(data, chartType, xAxis, yAxis) {
    const infoDiv = document.getElementById('chartInfo');
    if (!infoDiv) return;
    
    const totalDataPoints = data.labels ? data.labels.length : 0;
    const datasetCount = data.datasets ? data.datasets.length : 0;
    
    infoDiv.innerHTML = `
        <div class="alert alert-info">
            <h6><i class="fas fa-info-circle me-2"></i>Chart Information</h6>
            <div class="row">
                <div class="col-md-3">
                    <strong>Chart Type:</strong> ${chartType.charAt(0).toUpperCase() + chartType.slice(1)}
                </div>
                <div class="col-md-3">
                    <strong>X-Axis:</strong> ${getAxisLabel(xAxis)}
                </div>
                <div class="col-md-3">
                    <strong>Y-Axis:</strong> ${getAxisLabel(yAxis)}
                </div>
                <div class="col-md-3">
                    <strong>Data Points:</strong> ${totalDataPoints}
                </div>
            </div>
            ${datasetCount > 1 ? `<div class="mt-2"><strong>Datasets:</strong> ${datasetCount}</div>` : ''}
        </div>
    `;
}

/**
 * Download file helper function
 */
function downloadFile(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

/**
 * Update user information display
 */
function updateUserInfo() {
    if (currentUser) {
        const userNameElement = document.getElementById('userName');
        const currentEmpIdElement = document.getElementById('currentEmpId');
        const currentBlockElement = document.getElementById('currentBlock');
        
        if (userNameElement) userNameElement.textContent = currentUser.empid;
        if (currentEmpIdElement) currentEmpIdElement.textContent = currentUser.empid;
        if (currentBlockElement) currentBlockElement.textContent = currentUser.block;
    }
}

/**
 * Update admin information display
 */
function updateAdminInfo() {
    if (currentUser) {
        const adminNameElement = document.getElementById('adminName');
        const currentAdminIdElement = document.getElementById('currentAdminId');
        
        if (adminNameElement) adminNameElement.textContent = currentUser.empid;
        if (currentAdminIdElement) currentAdminIdElement.textContent = currentUser.empid;
    }
}

/**
 * Set current date in date input
 */
function setCurrentDate() {
    const dateInput = document.getElementById('currentDate');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
    }
}

/**
 * Switch to register form
 */
function switchToRegister() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
    clearAlerts();
}

/**
 * Switch to login form
 */
function switchToLogin() {
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
    clearAlerts();
}

/**
 * Logout user
 */
async function logout() {
    try {
        showAlert('Logging out...', 'info');
        
        const response = await fetch('/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include' // Important: include credentials
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('Logout successful! Redirecting...', 'success');
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        } else {
            showAlert('Logout failed: ' + (result.message || 'Unknown error'), 'danger');
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
        }
    } catch (error) {
        console.error('Logout error:', error);
        showAlert('Logout failed. Redirecting to login...', 'danger');
        setTimeout(() => {
            window.location.href = '/';
        }, 2000);
    }
}

/**
 * Show alert message
 */
function showAlert(message, type, containerId = 'alertContainer') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    container.innerHTML = '';
    container.appendChild(alertDiv);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
}

/**
 * Clear all alerts
 */
function clearAlerts() {
    const containers = ['alertContainer', 'loginAlert', 'registerAlert'];
    containers.forEach(containerId => {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = '';
        }
    });
}

/**
 * Show loading state
 */
function showLoading(formId) {
    const form = document.getElementById(formId);
    if (form) {
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) {
            const loading = submitButton.querySelector('.loading');
            if (loading) {
                loading.classList.add('show');
            }
            submitButton.disabled = true;
        }
    }
}

/**
 * Hide loading state
 */
function hideLoading(formId) {
    const form = document.getElementById(formId);
    if (form) {
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) {
            const loading = submitButton.querySelector('.loading');
            if (loading) {
                loading.classList.remove('show');
            }
            submitButton.disabled = false;
        }
    }
}

// Global error handler
window.addEventListener('error', function(event) {
    console.error('Global error:', event.error);
    showAlert('An unexpected error occurred. Please refresh the page.', 'danger');
});

// Handle network errors
window.addEventListener('online', function() {
    showAlert('Connection restored', 'success');
});

window.addEventListener('offline', function() {
    showAlert('Connection lost. Please check your internet connection.', 'warning');
});

// ==================== ALERT MANAGEMENT FUNCTIONS ====================

/**
 * Load threshold settings
 */
async function loadThresholds() {
    try {
        const response = await fetch('/api/thresholds');
        const result = await response.json();
        
        if (result.success) {
            displayThresholds(result.data);
        } else {
            console.error('Error loading thresholds:', result.message);
        }
    } catch (error) {
        console.error('Error loading thresholds:', error);
    }
}

/**
 * Display thresholds in table
 */
function displayThresholds(thresholds) {
    const tbody = document.getElementById('thresholdsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = thresholds.map(threshold => `
        <tr>
            <td>${threshold.block}</td>
            <td>${threshold.plant}</td>
            <td>${threshold.area}</td>
            <td>
                <input type="number" class="form-control form-control-sm" 
                       value="${threshold.near_threshold}" 
                       step="0.1" 
                       data-field="near_threshold" 
                       data-id="${threshold.id}">
            </td>
            <td>
                <input type="number" class="form-control form-control-sm" 
                       value="${threshold.onem_threshold}" 
                       step="0.1" 
                       data-field="onem_threshold" 
                       data-id="${threshold.id}">
            </td>
            <td>
                <select class="form-select form-select-sm" 
                        data-field="alert_level" 
                        data-id="${threshold.id}">
                    <option value="LOW" ${threshold.alert_level === 'LOW' ? 'selected' : ''}>🟢 Low</option>
                    <option value="MEDIUM" ${threshold.alert_level === 'MEDIUM' ? 'selected' : ''}>🟡 Medium</option>
                    <option value="HIGH" ${threshold.alert_level === 'HIGH' ? 'selected' : ''}>🟠 High</option>
                    <option value="CRITICAL" ${threshold.alert_level === 'CRITICAL' ? 'selected' : ''}>🔴 Critical</option>
                </select>
            </td>
            <td>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" 
                           ${threshold.is_active ? 'checked' : ''} 
                           data-field="is_active" 
                           data-id="${threshold.id}">
                </div>
            </td>
            <td>
                <button type="button" class="btn btn-primary btn-sm" 
                        onclick="updateThreshold(${threshold.id})">
                    <i class="fas fa-save"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

/**
 * Update threshold
 */
async function updateThreshold(id) {
    try {
        const row = document.querySelector(`[data-id="${id}"]`).closest('tr');
        const nearThreshold = row.querySelector('[data-field="near_threshold"]').value;
        const onemThreshold = row.querySelector('[data-field="onem_threshold"]').value;
        const alertLevel = row.querySelector('[data-field="alert_level"]').value;
        const isActive = row.querySelector('[data-field="is_active"]').checked;
        
        const response = await fetch(`/api/thresholds/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                near_threshold: parseFloat(nearThreshold),
                onem_threshold: parseFloat(onemThreshold),
                alert_level: alertLevel,
                is_active: isActive
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('Threshold updated successfully', 'success');
        } else {
            showAlert('Error updating threshold: ' + result.message, 'danger');
        }
    } catch (error) {
        console.error('Error updating threshold:', error);
        showAlert('Error updating threshold', 'danger');
    }
}

/**
 * Load notification settings
 */
async function loadNotificationSettings() {
    try {
        const response = await fetch('/api/notifications/settings');
        const result = await response.json();
        
        if (result.success) {
            displayNotificationSettings(result.data);
        } else {
            console.error('Error loading notification settings:', result.message);
        }
    } catch (error) {
        console.error('Error loading notification settings:', error);
    }
}

/**
 * Display notification settings
 */
function displayNotificationSettings(settings) {
    const tbody = document.getElementById('notificationsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = settings.map(user => {
        const alertLevels = user.alert_levels ? JSON.parse(user.alert_levels) : ['MEDIUM', 'HIGH', 'CRITICAL'];
        
        return `
            <tr>
                <td>${user.empid}</td>
                <td>${user.name}</td>
                <td>${user.email}</td>
                <td>${user.phone}</td>
                <td>${user.block}</td>
                <td>
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" 
                               ${user.email_notifications ? 'checked' : ''} 
                               data-field="email_notifications" 
                               data-empid="${user.empid}">
                    </div>
                </td>
                <td>
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" 
                               ${user.sms_notifications ? 'checked' : ''} 
                               data-field="sms_notifications" 
                               data-empid="${user.empid}">
                    </div>
                </td>
                <td>
                    <select class="form-select form-select-sm" 
                            data-field="alert_levels" 
                            data-empid="${user.empid}" 
                            multiple>
                        <option value="LOW" ${alertLevels.includes('LOW') ? 'selected' : ''}>🟢 Low</option>
                        <option value="MEDIUM" ${alertLevels.includes('MEDIUM') ? 'selected' : ''}>🟡 Medium</option>
                        <option value="HIGH" ${alertLevels.includes('HIGH') ? 'selected' : ''}>🟠 High</option>
                        <option value="CRITICAL" ${alertLevels.includes('CRITICAL') ? 'selected' : ''}>🔴 Critical</option>
                    </select>
                </td>
                <td>
                    <button type="button" class="btn btn-primary btn-sm" 
                            onclick="updateNotificationSettings('${user.empid}')">
                        <i class="fas fa-save"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Update notification settings
 */
async function updateNotificationSettings(empid) {
    try {
        const row = document.querySelector(`[data-empid="${empid}"]`).closest('tr');
        const emailNotifications = row.querySelector('[data-field="email_notifications"]').checked;
        const smsNotifications = row.querySelector('[data-field="sms_notifications"]').checked;
        const alertLevelsSelect = row.querySelector('[data-field="alert_levels"]');
        const alertLevels = Array.from(alertLevelsSelect.selectedOptions).map(option => option.value);
        
        const response = await fetch(`/api/notifications/settings/${empid}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email_notifications: emailNotifications,
                sms_notifications: smsNotifications,
                alert_levels: alertLevels
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('Notification settings updated successfully', 'success');
        } else {
            showAlert('Error updating notification settings: ' + result.message, 'danger');
        }
    } catch (error) {
        console.error('Error updating notification settings:', error);
        showAlert('Error updating notification settings', 'danger');
    }
}

/**
 * Handle manual alert submission
 */
async function handleManualAlert(event) {
    event.preventDefault();
    
    const alertLevel = document.getElementById('manualAlertLevel').value;
    const block = document.getElementById('manualBlock').value;
    const plant = document.getElementById('manualPlant').value;
    const area = document.getElementById('manualArea').value;
    const message = document.getElementById('manualAlertMessage').value;
    
    if (!alertLevel || !block || !plant || !area || !message) {
        showAlert('Please fill in all fields', 'danger');
        return;
    }
    
    try {
        const response = await fetch('/api/alerts/send-manual', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                alert_level: alertLevel,
                block: block,
                plant: plant,
                area: area,
                message: message,
                emp: 'admin'
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('Manual alert sent successfully', 'success');
            document.getElementById('manualAlertForm').reset();
            loadAlertHistory(); // Refresh alert history
        } else {
            showAlert('Error sending manual alert: ' + result.message, 'danger');
        }
    } catch (error) {
        console.error('Error sending manual alert:', error);
        showAlert('Error sending manual alert', 'danger');
    }
}

/**
 * Load alert history
 */
async function loadAlertHistory() {
    try {
        const response = await fetch('/api/alerts/history?limit=100');
        const result = await response.json();
        
        if (result.success) {
            displayAlertHistory(result.data);
        } else {
            console.error('Error loading alert history:', result.message);
        }
    } catch (error) {
        console.error('Error loading alert history:', error);
    }
}

/**
 * Display alert history
 */
function displayAlertHistory(alerts) {
    const tbody = document.getElementById('alertHistoryTableBody');
    if (!tbody) return;
    
    // Preprocess alerts to safely format timestamps and ensure IDs are quoted in handlers
    tbody.innerHTML = alerts.map(alert => {
        const alertLevelColors = {
            'LOW': 'success',
            'MEDIUM': 'warning',
            'HIGH': 'danger',
            'CRITICAL': 'dark'
        };
        
        const alertLevelIcons = {
            'LOW': '🟢',
            'MEDIUM': '🟡',
            'HIGH': '🟠',
            'CRITICAL': '🔴'
        };

        // Normalize created_at: Firestore Timestamp has toDate(), otherwise try to parse or fallback to now
        let createdAt = new Date();
        try {
            if (alert.created_at && typeof alert.created_at.toDate === 'function') {
                createdAt = alert.created_at.toDate();
            } else if (alert.created_at) {
                createdAt = new Date(alert.created_at);
                if (isNaN(createdAt.getTime())) createdAt = new Date();
            }
        } catch (e) {
            createdAt = new Date();
        }

        const idSafe = String(alert.id || '');

        return `
            <tr>
                <td>${createdAt.toLocaleString()}</td>
                <td>
                    <span class="badge bg-${alert.alert_type === 'THRESHOLD_EXCEEDED' ? 'danger' : 'info'}">
                        ${String(alert.alert_type || '').replace('_', ' ')}
                    </span>
                </td>
                <td>
                    <span class="badge bg-${alertLevelColors[alert.alert_level] || 'secondary'}">
                        ${alertLevelIcons[alert.alert_level] || ''} ${alert.alert_level || ''}
                    </span>
                </td>
                <td>${alert.block || ''} - ${alert.plant || ''} - ${alert.area || ''}</td>
                <td>${alert.emp || ''}</td>
                <td>
                    ${alert.near_reading > 0 ? `Near: ${alert.near_reading} μSv/h` : ''}
                    ${alert.onem_reading > 0 ? `<br>One Meter: ${alert.onem_reading} μSv/h` : ''}
                </td>
                <td>${escapeHtml(String(alert.message || ''))}</td>
                <td>
                    ${alert.acknowledged ? 
                        `<span class="badge bg-success">Acknowledged</span>` : 
                        `<span class="badge bg-warning">Pending</span>`
                    }
                </td>
                <td>
                    ${!alert.acknowledged ? 
                        `<button type="button" class="btn btn-success btn-sm" onclick="acknowledgeAlert('${idSafe}')">
                            <i class="fas fa-check"></i>
                        </button>` : 
                        `<span class="text-muted">Acknowledged by ${alert.acknowledged_by || ''}</span>`
                    }
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Simple HTML escape to prevent injection when inserting messages into the DOM
 */
function escapeHtml(str) {
    return str.replace(/[&<>"'`]/g, function (s) {
        return ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
            '`': '&#96;'
        })[s];
    });
}

/**
 * Acknowledge alert
 */
async function acknowledgeAlert(alertId) {
    try {
        const response = await fetch(`/api/alerts/${alertId}/acknowledge`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                acknowledged_by: 'admin'
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('Alert acknowledged successfully', 'success');
            loadAlertHistory(); // Refresh alert history
        } else {
            showAlert('Error acknowledging alert: ' + result.message, 'danger');
        }
    } catch (error) {
        console.error('Error acknowledging alert:', error);
        showAlert('Error acknowledging alert', 'danger');
    }
}

// Initialize alert management when admin page loads
document.addEventListener('DOMContentLoaded', function() {
    // Load alert management data if on admin page
    if (window.location.pathname.includes('retrieve.html')) {
        setTimeout(() => {
            loadThresholds();
            loadNotificationSettings();
            loadAlertHistory();
        }, 1000);
    }
});
