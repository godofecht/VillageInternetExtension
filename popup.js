// Popup script for Network Conditions Simulator

// Elements cache
let startButton;
let stopButton;
let notification;
let failureRelatedFields;

// Initialize when popup loads
document.addEventListener('DOMContentLoaded', function() {
  // Cache DOM elements
  startButton = document.getElementById('startSimulation');
  stopButton = document.getElementById('stopSimulation');
  notification = document.getElementById('notification');
  failureRelatedFields = document.querySelectorAll('.failure-related');
  
  // Add event listeners
  startButton.addEventListener('click', startSimulation);
  stopButton.addEventListener('click', stopSimulation);
  
  // Showing/hiding related fields based on random failures value
  const randomFailuresInput = document.getElementById('randomFailures');
  randomFailuresInput.addEventListener('input', function() {
    toggleFailureRelatedFields(parseInt(this.value) > 0);
  });
  
  // Load current settings and simulation state
  loadCurrentState();
});

// Load current simulation state
function loadCurrentState() {
  try {
    chrome.runtime.sendMessage({action: 'checkSimulationStatus'}, function(response) {
      if (chrome.runtime.lastError) {
        showNotification('Error connecting to extension background service.', 'error');
        console.error('Error checking simulation status:', chrome.runtime.lastError);
        return;
      }
      
      if (response && response.active) {
        // Simulation is active
        updateUIForActiveSimulation(response.settings);
        
        if (response.inOutage) {
          showNotification('Network outage in progress...', 'warning');
        } else {
          showNotification('Simulation active', 'info');
        }
      } else {
        // Simulation is not active
        updateUIForInactiveSimulation();
      }
    });
  } catch (e) {
    console.error('Error loading current state:', e);
    showNotification('An error occurred while loading the current state.', 'error');
  }
}

// Start the network simulation
function startSimulation() {
  try {
    const settings = getFormSettings();
    
    // Validate settings
    if (settings.downloadSpeed < 1) {
      showNotification('Download speed must be at least 1 KB/s', 'error');
      return;
    }
    
    if (settings.uploadSpeed < 1) {
      showNotification('Upload speed must be at least 1 KB/s', 'error');
      return;
    }
    
    // Disable form during start
    toggleFormEnabled(false);
    showNotification('Starting simulation...', 'info');
    
    // Send message to background script
    chrome.runtime.sendMessage({
      action: 'startSimulation',
      settings: settings
    }, function(response) {
      if (chrome.runtime.lastError) {
        console.error('Error starting simulation:', chrome.runtime.lastError);
        showNotification('Failed to start simulation. Try again.', 'error');
        toggleFormEnabled(true);
        return;
      }
      
      if (response && response.success) {
        updateUIForActiveSimulation(settings);
        showNotification('Simulation started successfully!', 'success');
      } else {
        showNotification('Failed to start simulation. Try again.', 'error');
        toggleFormEnabled(true);
      }
    });
  } catch (e) {
    console.error('Error starting simulation:', e);
    showNotification('An error occurred while starting the simulation.', 'error');
    toggleFormEnabled(true);
  }
}

// Stop the network simulation
function stopSimulation() {
  try {
    // Disable buttons during stop
    startButton.disabled = true;
    stopButton.disabled = true;
    showNotification('Stopping simulation...', 'info');
    
    // Send message to background script
    chrome.runtime.sendMessage({
      action: 'stopSimulation'
    }, function(response) {
      if (chrome.runtime.lastError) {
        console.error('Error stopping simulation:', chrome.runtime.lastError);
        showNotification('Failed to stop simulation. Try again.', 'error');
        stopButton.disabled = false;
        return;
      }
      
      if (response && response.success) {
        updateUIForInactiveSimulation();
        showNotification('Simulation stopped successfully!', 'success');
      } else {
        showNotification('Failed to stop simulation. Try again.', 'error');
        stopButton.disabled = false;
      }
    });
  } catch (e) {
    console.error('Error stopping simulation:', e);
    showNotification('An error occurred while stopping the simulation.', 'error');
    stopButton.disabled = false;
  }
}

// Get settings from form
function getFormSettings() {
  return {
    downloadSpeed: parseInt(document.getElementById('downloadSpeed').value) || 100,
    uploadSpeed: parseInt(document.getElementById('uploadSpeed').value) || 50,
    latency: parseInt(document.getElementById('latency').value) || 0,
    packetLoss: parseInt(document.getElementById('packetLoss').value) || 0,
    randomFailures: parseInt(document.getElementById('randomFailures').value) || 0,
    failureDuration: parseInt(document.getElementById('failureDuration').value) || 30,
    failureFrequency: document.getElementById('failureFrequency').value || 'medium',
    sitesThrottled: document.getElementById('sitesToThrottle').value.trim(),
    throttlingLevel: document.getElementById('throttlingLevel').value || 'moderate'
  };
}

// Fill form with settings
function fillFormWithSettings(settings) {
  if (!settings) return;
  
  document.getElementById('downloadSpeed').value = settings.downloadSpeed || 100;
  document.getElementById('uploadSpeed').value = settings.uploadSpeed || 50;
  document.getElementById('latency').value = settings.latency || 0;
  document.getElementById('packetLoss').value = settings.packetLoss || 0;
  document.getElementById('randomFailures').value = settings.randomFailures || 0;
  document.getElementById('failureDuration').value = settings.failureDuration || 30;
  
  if (settings.failureFrequency) {
    document.getElementById('failureFrequency').value = settings.failureFrequency;
  }
  
  document.getElementById('sitesToThrottle').value = settings.sitesThrottled || '';
  
  if (settings.throttlingLevel) {
    document.getElementById('throttlingLevel').value = settings.throttlingLevel;
  }
  
  toggleFailureRelatedFields(settings.randomFailures > 0);
}

// Show notification message
function showNotification(message, type = 'info') {
  notification.textContent = message;
  notification.style.display = 'block';
  
  // Set color based on type
  switch (type) {
    case 'error':
      notification.style.backgroundColor = '#ea4335';
      break;
    case 'success':
      notification.style.backgroundColor = '#34a853';
      break;
    case 'warning':
      notification.style.backgroundColor = '#fbbc05';
      notification.style.color = 'black';
      break;
    case 'info':
    default:
      notification.style.backgroundColor = '#4285f4';
      break;
  }
  
  // Hide notification after a delay for non-error messages
  if (type !== 'error') {
    setTimeout(() => {
      notification.style.display = 'none';
    }, 5000);
  }
}

// Update UI for active simulation
function updateUIForActiveSimulation(settings) {
  startButton.style.display = 'none';
  stopButton.style.display = 'block';
  toggleFormEnabled(false);
  
  if (settings) {
    fillFormWithSettings(settings);
  }
}

// Update UI for inactive simulation
function updateUIForInactiveSimulation() {
  startButton.style.display = 'block';
  stopButton.style.display = 'none';
  toggleFormEnabled(true);
}

// Toggle form fields enabled/disabled
function toggleFormEnabled(enabled) {
  const form = document.getElementById('simulationForm');
  const formElements = form.querySelectorAll('input, select');
  
  formElements.forEach(element => {
    element.disabled = !enabled;
  });
  
  if (enabled) {
    form.classList.remove('disabled');
  } else {
    form.classList.add('disabled');
  }
}

// Toggle visibility of failure-related fields
function toggleFailureRelatedFields(show) {
  failureRelatedFields.forEach(field => {
    field.style.display = show ? 'block' : 'none';
  });
}
