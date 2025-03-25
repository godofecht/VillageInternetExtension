// popup script. pretty simple stuff.

// element refs
let startButton;
let stopButton;
let notification;
let failureRelatedFields;

// init when popup loads (if it ever does)
document.addEventListener('DOMContentLoaded', function() {
  // cache dom elements because querying is slow
  startButton = document.getElementById('startSimulation');
  stopButton = document.getElementById('stopSimulation');
  notification = document.getElementById('notification');
  failureRelatedFields = document.querySelectorAll('.failure-related');
  
  // event listeners - because clicking buttons should do something
  startButton.addEventListener('click', startSimulation);
  stopButton.addEventListener('click', stopSimulation);
  
  // show/hide failure stuff based on the percentage
  const randomFailuresInput = document.getElementById('randomFailures');
  randomFailuresInput.addEventListener('input', function() {
    toggleFailureRelatedFields(parseInt(this.value) > 0);
  });
  
  // load whatever was happening before
  loadCurrentState();
});

// check what's already going on
function loadCurrentState() {
  try {
    chrome.runtime.sendMessage({action: 'checkSimulationStatus'}, function(response) {
      if (chrome.runtime.lastError) {
        showNotification('Service worker dead or missing. Typical.', 'error');
        console.error('Error checking simulation status:', chrome.runtime.lastError);
        return;
      }
      
      if (response && response.active) {
        // already running
        updateUIForActiveSimulation(response.settings);
        
        if (response.inOutage) {
          showNotification('Network outage happening. Enjoy.', 'warning');
        } else {
          showNotification('Simulation active', 'info');
        }
      } else {
        // not running
        updateUIForInactiveSimulation();
      }
    });
  } catch (e) {
    console.error('Error loading current state:', e);
    showNotification('Something broke. No idea what.', 'error');
  }
}

// start breaking the internet
function startSimulation() {
  try {
    const settings = getFormSettings();
    
    // basic validation
    if (settings.downloadSpeed < 1) {
      showNotification('Download speed needs to be at least 1 KB/s. Otherwise just unplug your router.', 'error');
      return;
    }
    
    if (settings.uploadSpeed < 1) {
      showNotification('Upload speed needs to be at least 1 KB/s. Otherwise just unplug your router.', 'error');
      return;
    }
    
    // lock the form
    toggleFormEnabled(false);
    showNotification('Starting simulation...', 'info');
    
    // tell the background script
    chrome.runtime.sendMessage({
      action: 'startSimulation',
      settings: settings
    }, function(response) {
      if (chrome.runtime.lastError) {
        console.error('Error starting simulation:', chrome.runtime.lastError);
        showNotification('Failed to start. Service worker probably died.', 'error');
        toggleFormEnabled(true);
        return;
      }
      
      if (response && response.success) {
        updateUIForActiveSimulation(settings);
        showNotification('Breaking the internet now.', 'success');
      } else {
        showNotification('Failed to start. Who knows why.', 'error');
        toggleFormEnabled(true);
      }
    });
  } catch (e) {
    console.error('Error starting simulation:', e);
    showNotification('Something crashed. Check console for errors.', 'error');
    toggleFormEnabled(true);
  }
}

// stop breaking the internet
function stopSimulation() {
  try {
    // lock buttons
    startButton.disabled = true;
    stopButton.disabled = true;
    showNotification('Stopping simulation...', 'info');
    
    // tell background script
    chrome.runtime.sendMessage({
      action: 'stopSimulation'
    }, function(response) {
      if (chrome.runtime.lastError) {
        console.error('Error stopping simulation:', chrome.runtime.lastError);
        showNotification('Failed to stop. Try reloading the extension.', 'error');
        stopButton.disabled = false;
        return;
      }
      
      if (response && response.success) {
        updateUIForInactiveSimulation();
        showNotification('Internet should be normal again. Or not.', 'success');
      } else {
        showNotification('Failed to stop. No idea why.', 'error');
        stopButton.disabled = false;
      }
    });
  } catch (e) {
    console.error('Error stopping simulation:', e);
    showNotification('Error stopping. Check console.', 'error');
    stopButton.disabled = false;
  }
}

// get values from inputs
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

// fill form with settings - rocket science
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

// display a message to the user - amazing UX
function showNotification(message, type = 'info') {
  notification.textContent = message;
  notification.style.display = 'block';
  
  // colors for different message types
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
  
  // hide notification after delay unless it's an error
  if (type !== 'error') {
    setTimeout(() => {
      notification.style.display = 'none';
    }, 5000);
  }
}

// update UI for active simulation
function updateUIForActiveSimulation(settings) {
  startButton.style.display = 'none';
  stopButton.style.display = 'block';
  toggleFormEnabled(false);
  
  if (settings) {
    fillFormWithSettings(settings);
  }
}

// update UI for inactive simulation
function updateUIForInactiveSimulation() {
  startButton.style.display = 'block';
  stopButton.style.display = 'none';
  toggleFormEnabled(true);
}

// enable/disable form elements
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

// toggle failure fields visibility
function toggleFailureRelatedFields(show) {
  failureRelatedFields.forEach(field => {
    field.style.display = show ? 'block' : 'none';
  });
}
