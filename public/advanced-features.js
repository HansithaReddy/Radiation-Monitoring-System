/**
 * Advanced Features for Radiation Monitoring System
 * Real-time updates, analytics, alerts, and system monitoring
 */

// Global variables for advanced features
let socket = null;
let trendChart = null;
let pieChart = null;
let lineChart = null;
let interactiveChart = null;
let alertHistory = [];
let systemHealthData = null;
let isOffline = false;
let offlineData = [];
let allRadiationData = [];

// Initialize advanced features when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeAdvancedFeatures();
});

/**
 * Initialize all advanced features
 */
function initializeAdvancedFeatures() {
    // Initialize WebSocket connection
    initializeWebSocket();
    
    // Initialize offline support
    initializeOfflineSupport();
    
    // Initialize real-time updates
    initializeRealTimeUpdates();
    
    // Initialize interactive visualization
    initializeInteractiveVisualization();
    
    // Load initial system health
    loadSystemHealth();
    
    console.log('Advanced features initialized');
}

/**
 * Initialize WebSocket connection for real-time updates
 */
function initializeWebSocket() {
    try {
        socket = io();
        
        socket.on('connect', () => {
            console.log('WebSocket connected');
            isOffline = false;
            syncOfflineData();
        });
        
        socket.on('disconnect', () => {
            console.log('WebSocket disconnected');
            isOffline = true;
        });
        
        socket.on('dataUpdate', (data) => {
            handleRealTimeDataUpdate(data);
        });
        
        socket.on('alert', (alert) => {
            handleRealTimeAlert(alert);
        });
        
        // Join admin room for real-time updates
        socket.emit('join-room', 'admin');
        
    } catch (error) {
        console.error('WebSocket initialization failed:', error);
        isOffline = true;
    }
}

/**
 * Handle real-time data updates
 */
function handleRealTimeDataUpdate(data) {
    console.log('Real-time data update received:', data);
    
    // Update statistics if on admin page
    if (typeof updateStatistics === 'function') {
        // Refresh data to show new reading
        retrieveAllData();
    }
    
    // Show notification
    showNotification('New radiation reading added', 'info');
}

/**
 * Handle real-time alerts
 */
function handleRealTimeAlert(alert) {
    console.log('Real-time alert received:', alert);
    
    // Add to alert history
    alertHistory.unshift({
        ...alert,
        id: Date.now(),
        acknowledged: false
    });
    
    // Update alert display
    updateAlertDisplay();
    
    // Show browser notification
    showBrowserNotification(alert.message);
    
    // Show on-screen alert
    showAlert(alert.message, 'danger');
}

/**
 * Initialize offline support with local storage
 */
function initializeOfflineSupport() {
    // Check if browser supports localStorage
    if (typeof(Storage) !== "undefined") {
        // Load offline data from localStorage
        const savedData = localStorage.getItem('radiationOfflineData');
        if (savedData) {
            offlineData = JSON.parse(savedData);
        }
        
        // Listen for online/offline events
        window.addEventListener('online', handleOnlineStatus);
        window.addEventListener('offline', handleOfflineStatus);
        
        console.log('Offline support initialized');
    }
}

/**
 * Handle online status
 */
function handleOnlineStatus() {
    console.log('Connection restored');
    isOffline = false;
    showNotification('Connection restored - syncing data', 'success');
    syncOfflineData();
}

/**
 * Handle offline status
 */
function handleOfflineStatus() {
    console.log('Connection lost - entering offline mode');
    isOffline = true;
    showNotification('Connection lost - operating in offline mode', 'warning');
}

/**
 * Sync offline data when connection is restored
 */
async function syncOfflineData() {
    if (offlineData.length > 0) {
        console.log(`Syncing ${offlineData.length} offline records`);
        
        for (const data of offlineData) {
            try {
                await fetch('/insert', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data)
                });
            } catch (error) {
                console.error('Failed to sync offline data:', error);
            }
        }
        
        // Clear offline data after successful sync
        offlineData = [];
        localStorage.removeItem('radiationOfflineData');
        showNotification('Offline data synced successfully', 'success');
    }
}

/**
 * Clear all existing charts
 */
function clearAllCharts() {
    // Clear advanced analytics charts
    if (trendChart) {
        trendChart.destroy();
        trendChart = null;
    }
    if (pieChart) {
        pieChart.destroy();
        pieChart = null;
    }
    if (lineChart) {
        lineChart.destroy();
        lineChart = null;
    }
    // Only destroy if this is a Chart.js instance (defensive - DOM elements may exist with the same name)
    if (interactiveChart && typeof interactiveChart.destroy === 'function') {
        try {
            interactiveChart.destroy();
        } catch (err) {
            console.warn('Failed to destroy interactiveChart instance:', err);
        }
        interactiveChart = null;
        // Keep the global reference in sync
        if (window.interactiveChart && typeof window.interactiveChart.destroy === 'function') {
            try { window.interactiveChart.destroy(); } catch (e) { /* ignore */ }
            window.interactiveChart = null;
        }
    }
    
    // Clear main radiation chart from client.js
    if (typeof radiationChart !== 'undefined' && radiationChart) {
        radiationChart.destroy();
        radiationChart = null;
    }
    
    // Clear any other Chart.js instances
    Chart.helpers.each(Chart.instances, function(instance) {
        if (instance && instance.canvas) {
            instance.destroy();
        }
    });
}

/**
 * Set fixed chart dimensions to prevent extension
 */
function setChartDimensions(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (canvas) {
        canvas.style.maxWidth = '100%';
        canvas.style.maxHeight = '400px';
        canvas.style.width = '100%';
        canvas.style.height = '400px';
    }
}

/**
 * Clear advanced analytics content
 */
function clearAdvancedAnalyticsContent() {
    const content = document.getElementById('advancedAnalyticsContent');
    if (content) {
        content.innerHTML = '';
    }
}

/**
 * Load trend analysis data
 */
async function loadTrendAnalysis() {
    try {
        showLoading('Loading trend analysis...');
        
        // Clear existing charts and content first
        clearAllCharts();
        clearAdvancedAnalyticsContent();
        
        const response = await fetch('/api/analytics/trends?days=30');
        const result = await response.json();
        
        if (result.success) {
            displayTrendAnalysis(result.data);
        } else {
            showAlert('Failed to load trend analysis', 'danger');
        }
    } catch (error) {
        console.error('Trend analysis error:', error);
        showAlert('Network error loading trend analysis', 'danger');
    } finally {
        hideLoading();
    }
}

/**
 * Display trend analysis results
 */
function displayTrendAnalysis(data) {
    const content = document.getElementById('advancedAnalyticsContent');
    
    if (data.dailyData.length === 0) {
        content.innerHTML = '<p class="text-muted">No trend data available</p>';
        return;
    }
    
    // Create trend chart
    const chartHtml = `
        <div class="row">
            <div class="col-12">
                <h6>30-Day Trend Analysis</h6>
                <canvas id="trendChart" height="300"></canvas>
            </div>
        </div>
        <div class="row mt-3">
            <div class="col-md-3">
                <div class="card bg-info text-white">
                    <div class="card-body text-center">
                        <h5>${data.summary.totalDays}</h5>
                        <p class="mb-0">Days Analyzed</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card bg-success text-white">
                    <div class="card-body text-center">
                        <h5>${data.summary.avgDailyReadings}</h5>
                        <p class="mb-0">Avg Daily Readings</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card bg-warning text-white">
                    <div class="card-body text-center">
                        <h5>${data.summary.maxDailyNear.toFixed(2)}</h5>
                        <p class="mb-0">Max Near (μSv/h)</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card bg-danger text-white">
                    <div class="card-body text-center">
                        <h5>${data.summary.maxDailyOnem.toFixed(2)}</h5>
                        <p class="mb-0">Max One Meter (μSv/h)</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    content.innerHTML = chartHtml;
    
    // Create trend chart
    createTrendChart(data.dailyData);
}

/**
 * Create trend chart
 */
function createTrendChart(data) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;
    
    // Ensure we have valid data
    if (!data || data.length === 0) {
        ctx.innerHTML = '<p class="text-center text-muted">No trend data available</p>';
        return;
    }
    
    const labels = data.map(row => new Date(row.date).toLocaleDateString()).reverse();
    const nearData = data.map(row => parseFloat(row.avg_near) || 0).reverse();
    const onemData = data.map(row => parseFloat(row.avg_onem) || 0).reverse();
    
    // Limit data points to prevent infinite extension
    const maxDataPoints = 20;
    const limitedLabels = labels.slice(0, maxDataPoints);
    const limitedNearData = nearData.slice(0, maxDataPoints);
    const limitedOnemData = onemData.slice(0, maxDataPoints);
    
    // Set fixed dimensions for the chart canvas
    setChartDimensions('trendChart');
    
    // Create new chart with limited data and fixed dimensions
    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: limitedLabels,
            datasets: [{
                label: 'Average Near Reading (μSv/h)',
                data: limitedNearData,
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.1)',
                tension: 0.1,
                fill: false,
                pointRadius: 4,
                pointHoverRadius: 6
            }, {
                label: 'Average One Meter Reading (μSv/h)',
                data: limitedOnemData,
                borderColor: 'rgb(255, 99, 132)',
                backgroundColor: 'rgba(255, 99, 132, 0.1)',
                tension: 0.1,
                fill: false,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
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
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Radiation Level (μSv/h)'
                    },
                    grid: {
                        color: 'rgba(0,0,0,0.1)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Date'
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
        }
    });
}

/**
 * Load predictive analysis
 */
async function loadPredictiveAnalysis() {
    try {
        showLoading('Loading predictive analysis...');
        
        // Clear existing charts and content first
        clearAllCharts();
        clearAdvancedAnalyticsContent();
        
        const response = await fetch('/api/analytics/predictive');
        const result = await response.json();
        
        if (result.success) {
            displayPredictiveAnalysis(result.data);
        } else {
            showAlert('Failed to load predictive analysis', 'danger');
        }
    } catch (error) {
        console.error('Predictive analysis error:', error);
        showAlert('Network error loading predictive analysis', 'danger');
    } finally {
        hideLoading();
    }
}

/**
 * Display predictive analysis results
 */
function displayPredictiveAnalysis(data) {
    const content = document.getElementById('advancedAnalyticsContent');
    
    if (data.length === 0) {
        content.innerHTML = '<p class="text-muted">No predictive data available</p>';
        return;
    }
    
    const tableRows = data.map(row => `
        <tr>
            <td>${row.area}</td>
            <td>${row.areaspec}</td>
            <td>${row.avg_near.toFixed(2)}</td>
            <td>${row.predicted_near_next_week.toFixed(2)}</td>
            <td>${row.avg_onem.toFixed(2)}</td>
            <td>${row.predicted_onem_next_week.toFixed(2)}</td>
            <td>
                <span class="badge ${row.risk_level === 'high' ? 'bg-danger' : row.risk_level === 'medium' ? 'bg-warning' : 'bg-success'}">
                    ${row.risk_level.toUpperCase()}
                </span>
            </td>
        </tr>
    `).join('');
    
    content.innerHTML = `
        <div class="row">
            <div class="col-12">
                <h6>Predictive Analysis - Next Week Forecast</h6>
                <div class="table-responsive">
                    <table class="table table-striped">
                        <thead>
                            <tr>
                                <th>Area</th>
                                <th>Specification</th>
                                <th>Current Avg Near</th>
                                <th>Predicted Near</th>
                                <th>Current Avg OneM</th>
                                <th>Predicted OneM</th>
                                <th>Risk Level</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

/**
 * Show advanced charts
 */
async function showAdvancedCharts() {
    try {
        showLoading('Loading advanced charts...');
        
        // Clear existing charts and content first
        clearAllCharts();
        clearAdvancedAnalyticsContent();
        
        const response = await fetch('/retrieve');
        const result = await response.json();
        
        if (result.success) {
            displayAdvancedCharts(result.data);
        } else {
            showAlert('Failed to load chart data', 'danger');
        }
    } catch (error) {
        console.error('Advanced charts error:', error);
        showAlert('Network error loading charts', 'danger');
    } finally {
        hideLoading();
    }
}

/**
 * Display advanced charts
 */
function displayAdvancedCharts(data) {
    const content = document.getElementById('advancedAnalyticsContent');
    
    content.innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <h6>Radiation Distribution by Area</h6>
                <canvas id="pieChart" height="300"></canvas>
            </div>
            <div class="col-md-6">
                <h6>Time Series Analysis</h6>
                <canvas id="lineChart" height="300"></canvas>
            </div>
        </div>
    `;
    
    // Wait for DOM to update, then create charts
    setTimeout(() => {
        console.log('Creating pie chart with data:', data);
        createPieChart(data);
        
        console.log('Creating line chart with data:', data);
        createLineChart(data);
    }, 100);
}

/**
 * Create pie chart
 */
function createPieChart(data) {
    console.log('createPieChart called with data:', data);
    const ctx = document.getElementById('pieChart');
    console.log('Canvas element found:', ctx);
    if (!ctx) {
        console.error('Pie chart canvas element not found');
        return;
    }
    
    // Ensure we have valid data
    if (!data || data.length === 0) {
        console.log('No data available for pie chart');
        ctx.innerHTML = '<p class="text-center text-muted">No data available for pie chart</p>';
        return;
    }
    
    // Group data by area with limited entries
    const areaData = {};
    data.slice(0, 50).forEach(row => { // Limit to first 50 records
        if (!areaData[row.area]) {
            areaData[row.area] = { count: 0, totalNear: 0 };
        }
        areaData[row.area].count++;
        areaData[row.area].totalNear += parseFloat(row.near) || 0;
    });
    
    console.log('Area data grouped:', areaData);
    
    const labels = Object.keys(areaData).slice(0, 8); // Limit to 8 areas max
    const values = labels.map(area => areaData[area].count);
    
    console.log('Pie chart labels:', labels);
    console.log('Pie chart values:', values);
    const colors = [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', 
        '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF'
    ];
    
    // Set fixed dimensions for the chart canvas
    setChartDimensions('pieChart');
    
    console.log('Creating pie chart with labels:', labels, 'and values:', values);
    
    // Check if Chart.js is available
    if (typeof Chart === 'undefined') {
        console.error('Chart.js library not loaded');
        ctx.innerHTML = '<p class="text-danger">Chart.js library not available</p>';
        return;
    }
    
    pieChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 800,
                easing: 'easeInOutQuart'
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
    
    console.log('Pie chart created successfully:', pieChart);
}

/**
 * Create line chart for time series
 */
function createLineChart(data) {
    const ctx = document.getElementById('lineChart');
    if (!ctx) return;
    
    // Ensure we have valid data
    if (!data || data.length === 0) {
        ctx.innerHTML = '<p class="text-center text-muted">No data available for line chart</p>';
        return;
    }
    
    // Group data by date with limited entries
    const dateData = {};
    data.slice(0, 100).forEach(row => { // Limit to first 100 records
        const date = row.currentDate;
        if (!dateData[date]) {
            dateData[date] = { near: [], onem: [] };
        }
        dateData[date].near.push(parseFloat(row.near) || 0);
        dateData[date].onem.push(parseFloat(row.onem) || 0);
    });
    
    const labels = Object.keys(dateData).sort().slice(0, 15); // Limit to 15 dates max
    const avgNear = labels.map(date => {
        const readings = dateData[date].near;
        return readings.reduce((sum, val) => sum + val, 0) / readings.length;
    });
    const avgOnem = labels.map(date => {
        const readings = dateData[date].onem;
        return readings.reduce((sum, val) => sum + val, 0) / readings.length;
    });
    
    // Set fixed dimensions for the chart canvas
    setChartDimensions('lineChart');
    
    lineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Average Near Reading (μSv/h)',
                data: avgNear,
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.1)',
                tension: 0.1,
                fill: false,
                pointRadius: 4,
                pointHoverRadius: 6
            }, {
                label: 'Average One Meter Reading (μSv/h)',
                data: avgOnem,
                borderColor: 'rgb(255, 99, 132)',
                backgroundColor: 'rgba(255, 99, 132, 0.1)',
                tension: 0.1,
                fill: false,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
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
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Radiation Level (μSv/h)'
                    },
                    grid: {
                        color: 'rgba(0,0,0,0.1)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Date'
                    },
                    grid: {
                        color: 'rgba(0,0,0,0.1)'
                    },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 0,
                        maxTicksLimit: 8
                    }
                }
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
        }
    });
}

/**
 * Load system health information
 */
async function loadSystemHealth() {
    try {
        const response = await fetch('/api/health');
        const result = await response.json();
        
        if (result.status === 'healthy') {
            systemHealthData = result;
            updateSystemHealthDisplay();
        } else {
            console.error('System health check failed:', result);
        }
    } catch (error) {
        console.error('System health error:', error);
    }
}

/**
 * Show system health information
 */
async function showSystemHealth() {
    try {
        showLoading('Loading system health...');
        
        // Clear existing charts and content first
        clearAllCharts();
        clearAdvancedAnalyticsContent();
        
        await loadSystemHealth();
        
        if (systemHealthData) {
            displaySystemHealth(systemHealthData);
        } else {
            showAlert('Failed to load system health', 'danger');
        }
    } catch (error) {
        console.error('System health error:', error);
        showAlert('Network error loading system health', 'danger');
    } finally {
        hideLoading();
    }
}

/**
 * Display system health information
 */
function displaySystemHealth(data) {
    const content = document.getElementById('advancedAnalyticsContent');
    
    const memoryUsage = (data.memory.heapUsed / 1024 / 1024).toFixed(2);
    const uptimeHours = (data.uptime / 3600).toFixed(1);
    
    content.innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <h6>System Status</h6>
                <div class="card ${data.status === 'healthy' ? 'border-success' : 'border-danger'}">
                    <div class="card-body">
                        <h5 class="card-title">
                            <i class="fas fa-heartbeat text-${data.status === 'healthy' ? 'success' : 'danger'}"></i>
                            System ${data.status.toUpperCase()}
                        </h5>
                        <p class="card-text">
                            <strong>Uptime:</strong> ${uptimeHours} hours<br>
                            <strong>Database:</strong> ${data.database}<br>
                            <strong>Active Users:</strong> ${data.activeUsers}<br>
                            <strong>Total Requests:</strong> ${data.totalRequests}
                        </p>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <h6>Performance Metrics</h6>
                <div class="card">
                    <div class="card-body">
                        <p class="card-text">
                            <strong>Memory Usage:</strong> ${memoryUsage} MB<br>
                            <strong>Last Data Update:</strong> ${data.lastDataUpdate ? new Date(data.lastDataUpdate).toLocaleString() : 'Never'}<br>
                            <strong>Last Health Check:</strong> ${new Date(data.timestamp).toLocaleString()}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Update threshold settings
 */
async function updateThresholdSettings() {
    try {
        const nearThreshold = parseFloat(document.getElementById('nearThreshold').value);
        const onemThreshold = parseFloat(document.getElementById('onemThreshold').value);
        const emailAlerts = document.getElementById('emailAlerts').checked;
        const smsAlerts = document.getElementById('smsAlerts').checked;
        
        const response = await fetch('/api/alerts/thresholds', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                nearThreshold,
                onemThreshold,
                emailAlerts,
                smsAlerts
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('Threshold settings updated successfully', 'success');
        } else {
            showAlert('Failed to update threshold settings', 'danger');
        }
    } catch (error) {
        console.error('Threshold update error:', error);
        showAlert('Network error updating thresholds', 'danger');
    }
}

/**
 * Update alert display
 */
function updateAlertDisplay() {
    const alertList = document.getElementById('alertList');
    if (!alertList) return;
    
    if (alertHistory.length === 0) {
        alertList.innerHTML = '<p class="text-muted">No recent alerts</p>';
        return;
    }
    
    const alertItems = alertHistory.slice(0, 10).map(alert => `
        <div class="alert alert-${alert.type === 'thresholdViolation' ? 'danger' : 'warning'} alert-dismissible fade show">
            <strong>${new Date(alert.timestamp).toLocaleString()}</strong><br>
            ${alert.message}
            ${!alert.acknowledged ? '<button type="button" class="btn-close" onclick="acknowledgeAlert(' + alert.id + ')"></button>' : ''}
        </div>
    `).join('');
    
    alertList.innerHTML = alertItems;
}

/**
 * Acknowledge an alert
 */
function acknowledgeAlert(alertId) {
    const alert = alertHistory.find(a => a.id === alertId);
    if (alert) {
        alert.acknowledged = true;
        updateAlertDisplay();
    }
}

/**
 * Show browser notification
 */
function showBrowserNotification(message) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Radiation Alert', {
            body: message,
            icon: '/favicon.ico'
        });
    }
}

/**
 * Request notification permission
 */
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

/**
 * Initialize real-time updates
 */
function initializeRealTimeUpdates() {
    // Auto-refresh data every 30 seconds
    setInterval(() => {
        if (!isOffline && typeof retrieveAllData === 'function') {
            retrieveAllData();
        }
    }, 30000);
    
    // Update system health every 5 minutes
    setInterval(() => {
        if (!isOffline) {
            loadSystemHealth();
        }
    }, 300000);
}

/**
 * Update system health display
 */
function updateSystemHealthDisplay() {
    if (systemHealthData) {
        // Update any system health indicators in the UI
        const healthIndicator = document.getElementById('systemHealthIndicator');
        if (healthIndicator) {
            healthIndicator.className = `badge ${systemHealthData.status === 'healthy' ? 'bg-success' : 'bg-danger'}`;
            healthIndicator.textContent = systemHealthData.status.toUpperCase();
        }
    }
}

/**
 * Show loading state
 */
function showLoading(message = 'Loading...') {
    const content = document.getElementById('advancedAnalyticsContent');
    if (content) {
        content.innerHTML = `
            <div class="text-center">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="mt-2">${message}</p>
            </div>
        `;
    }
}

/**
 * Hide loading state
 */
function hideLoading() {
    // Loading state will be replaced by actual content
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

// Initialize notification permission on page load
document.addEventListener('DOMContentLoaded', function() {
    requestNotificationPermission();
});

/**
 * Initialize interactive visualization
 */
function initializeInteractiveVisualization() {
    console.log('Initializing interactive visualization...');
    
    // Add event listener for generate visualization button
    const generateBtn = document.getElementById('generateVisualizationBtn');
    console.log('Generate button found:', generateBtn);
    
    if (generateBtn) {
        // Remove any existing event listeners
        generateBtn.removeEventListener('click', generateInteractiveVisualization);
        // Add new event listener
        generateBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Generate button clicked!');
            generateInteractiveVisualization();
        });
        console.log('Event listener added to generate button');
    } else {
        // Not an error — the generate button may not exist on every page
        console.warn('Generate button not found on this page');
    }
    
    // Load initial data
    loadRadiationData();
    
    console.log('Interactive visualization initialized');
}

/**
 * Load radiation data for visualization
 */
async function loadRadiationData() {
    try {
        // Try admin endpoint first, fall back to public endpoint for non-admins
        let response = await fetch('/retrieve');
        if (response.status === 403) {
            console.warn('/retrieve returned 403, retrying /public/retrieve');
            response = await fetch('/public/retrieve');
        }
        if (!response.ok) {
            console.error('Failed to load radiation data, status:', response.status);
            return;
        }
        const result = await response.json();
        if (result.success) {
            allRadiationData = result.data;
            console.log('Radiation data loaded:', allRadiationData.length, 'records');
        } else {
            console.error('Failed to load radiation data:', result.message || 'unknown');
        }
    } catch (error) {
        console.error('Error loading radiation data:', error);
    }
}

/**
 * Generate interactive visualization based on user selections
 */
async function generateInteractiveVisualization() {
    try {
        console.log('Starting visualization generation...');
        
        // Get user selections
        const chartType = document.getElementById('chartTypeSelect').value;
        const xAxis = document.getElementById('xAxisSelect').value;
        const yAxis = document.getElementById('yAxisSelect').value;
        const groupBy = document.getElementById('groupBySelect').value;
        const timeRange = document.getElementById('timeRangeSelect').value;
        const maxDataPoints = parseInt(document.getElementById('maxDataPoints').value) || 50;
        
        console.log('User selections:', { chartType, xAxis, yAxis, groupBy, timeRange, maxDataPoints });
        console.log('Available data:', allRadiationData.length, 'records');
        
        if (allRadiationData.length === 0) {
            console.warn('No data available for visualization');
            showAlert('No data available. Please load data first.', 'warning');
            return;
        }
        
        // Filter data based on time range
        let filteredData = filterDataByTimeRange(allRadiationData, timeRange);
        console.log('Filtered data:', filteredData.length, 'records');
        
        // Process data based on selections
        const processedData = processDataForVisualization(filteredData, xAxis, yAxis, groupBy, maxDataPoints);
        console.log('Processed data:', processedData);
        
        // Create the chart
        createInteractiveChart(processedData, chartType, xAxis, yAxis);
        
        // Update chart information
        updateChartInfo(processedData, chartType, xAxis, yAxis);
        
        console.log('Visualization generated successfully!');
        
    } catch (error) {
        console.error('Error generating visualization:', error);
        showAlert('Error generating visualization: ' + error.message, 'danger');
    }
}

/**
 * Filter data by time range
 */
function filterDataByTimeRange(data, timeRange) {
    if (timeRange === 'all') return data;
    
    const days = parseInt(timeRange);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return data.filter(row => {
        const rowDate = new Date(row.currentDate);
        return rowDate >= cutoffDate;
    });
}

/**
 * Process data for visualization
 */
function processDataForVisualization(data, xAxis, yAxis, groupBy, maxDataPoints) {
    if (data.length === 0) return { labels: [], datasets: [] };
    
    let processedData;
    
    if (groupBy === 'none') {
        // No grouping - use individual data points
        processedData = processIndividualData(data, xAxis, yAxis, maxDataPoints);
    } else {
        // Group data
        processedData = processGroupedData(data, xAxis, yAxis, groupBy, maxDataPoints);
    }
    
    return processedData;
}

/**
 * Process individual data points
 */
function processIndividualData(data, xAxis, yAxis, maxDataPoints) {
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
 * Process grouped data
 */
function processGroupedData(data, xAxis, yAxis, groupBy, maxDataPoints) {
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
    
    const labels = Array.from(allXValues).slice(0, maxDataPoints);
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
    const ctx = document.getElementById('interactiveChart');
    if (!ctx) return;
    
    // Clear any existing Chart.js instance attached to this canvas.
    try {
        const canvasEl = (ctx && ctx.getContext) ? ctx : (ctx && ctx.canvas) ? ctx.canvas : document.getElementById('interactiveChart');

        let existingChart = null;
        if (typeof Chart !== 'undefined') {
            if (typeof Chart.getChart === 'function') {
                existingChart = Chart.getChart(canvasEl);
            }
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

        // Clear local and global references if they point to a Chart instance
        if (interactiveChart && typeof interactiveChart.destroy === 'function') {
            try { interactiveChart.destroy(); } catch (e) { /* ignore */ }
            interactiveChart = null;
        }
        if (window.interactiveChart && typeof window.interactiveChart.destroy === 'function') {
            try { window.interactiveChart.destroy(); } catch (e) { /* ignore */ }
            window.interactiveChart = null;
        }
    } catch (err) {
        console.warn('Error while attempting to clear existing chart in advanced-features:', err);
    }
    
    // Set fixed dimensions
    setChartDimensions('interactiveChart');
    
    // Check if Chart.js is available
    if (typeof Chart === 'undefined') {
        console.error('Chart.js library not loaded');
        ctx.innerHTML = '<p class="text-danger">Chart.js library not available</p>';
        return;
    }
    
    // Configure chart options based on type
    const options = getChartOptions(chartType, xAxis, yAxis);
    
    interactiveChart = new Chart(ctx, {
        type: chartType,
        data: data,
        options: options
    });
    // Mirror the instance on window so client.js and other modules can safely
    // check/destroy the same Chart instance (avoid DOM element collision).
    try {
        window.interactiveChart = interactiveChart;
    } catch (err) {
        console.warn('Unable to assign interactiveChart to window:', err);
    }
    
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
    
    if (chartType === 'scatter') {
        return {
            ...baseOptions,
            scales: {
                x: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: getAxisLabel(xAxis)
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: getAxisLabel(yAxis)
                    }
                }
            }
        };
    }
    
    if (chartType === 'radar') {
        return {
            ...baseOptions,
            scales: {
                r: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: getAxisLabel(yAxis)
                    }
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
