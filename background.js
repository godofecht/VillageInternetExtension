// State vars. don't touch.
let simulationActive = false;
let currentSettings = null;
let throttledSites = [];

// Outage stuff
let isInOutage = false;
let outageTimeout = null;
let nextOutageTimeout = null;

// Rule IDs for declarativeNetRequest - don't change these or everything breaks
const THROTTLING_RULE_ID = 1;
const OUTAGE_RULE_ID = 2;
const PACKET_LOSS_RULE_ID = 3;

// Init when this thing wakes up
function initializeExtension() {
  chrome.storage.local.get(['simulationActive', 'currentSettings'], function(data) {
    if (data && data.simulationActive) {
      simulationActive = true;
      currentSettings = data.currentSettings || {};
      
      if (currentSettings && currentSettings.sitesThrottled) {
        throttledSites = currentSettings.sitesThrottled.split(',').map(site => site.trim());
      }
      
      // Setup network request rules
      setupNetworkRules();
      
      // Start outage simulation if applicable
      if (currentSettings && currentSettings.randomFailures > 0) {
        scheduleNextOutage();
      }
    }
  });
}

// Init when extension installed (if anyone ever actually installs this)
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed or updated:', details.reason);
  initializeExtension();
});

// Re-init when service worker starts (which is all the time because browsers are dumb)
initializeExtension();

// Listen for popup messages
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'startSimulation') {
    simulationActive = true;
    currentSettings = request.settings || {};
    
    // Parse throttled sites
    if (currentSettings.sitesThrottled) {
      throttledSites = currentSettings.sitesThrottled.split(',').map(site => site.trim());
    } else {
      throttledSites = [];
    }
    
    chrome.storage.local.set({
      simulationActive: true,
      currentSettings: currentSettings
    });
    
    // Setup network rules
    setupNetworkRules();
    
    // Start outage simulation if applicable
    if (currentSettings.randomFailures > 0) {
      scheduleNextOutage();
    }
    
    sendResponse({success: true});
    return true;
  } 
  else if (request.action === 'stopSimulation') {
    simulationActive = false;
    clearNetworkRules();
    
    // Stop any active outages
    clearOutageTimeouts();
    isInOutage = false;
    
    chrome.storage.local.set({
      simulationActive: false
    });
    
    // Notify any content scripts that outage (if any) is over
    notifyTabsAboutOutage(false);
    
    sendResponse({success: true});
    return true;
  }
  else if (request.action === 'checkSimulationStatus') {
    sendResponse({
      active: simulationActive,
      inOutage: isInOutage,
      settings: currentSettings
    });
    return true;
  }
  
  return true; // Indicates async response
});

// Keep service worker alive - Chrome keeps killing it because why not
function keepAlive() {
  if (simulationActive) {
    // Send a message to self to prevent service worker from being terminated
    setTimeout(() => {
      if (self.registration && self.registration.active) {
        self.registration.active.postMessage({ type: 'keepAlive' });
      }
      keepAlive();
    }, 25000); // Every 25 seconds
  }
}

// Setup declarativeNetRequest rules - worse than webRequest but hey, Google knows best right?
function setupNetworkRules() {
  if (!simulationActive || !currentSettings) {
    return;
  }
  
  // Clear any existing rules first
  clearNetworkRules()
    .then(() => {
      const rules = [];
      
      // Create dynamic rules based on simulation parameters
      const failureRate = currentSettings.randomFailures || 0;
      
      // Only add rules if failure rate is greater than 0
      if (failureRate > 0) {
        // Apply random failures based on percentage
        // We can't truly simulate percentage-based failures with declarativeNetRequest
        // Thanks Google for removing the useful APIs and giving us this garbage
        rules.push({
          id: PACKET_LOSS_RULE_ID,
          priority: 1,
          action: {
            type: "redirect",
            redirect: { transform: { scheme: 'https', host: 'non-existent-domain-for-simulation.example' } }
          },
          condition: {
            urlFilter: '*',
            resourceTypes: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'media', 'websocket'],
            // Can't do percentage-based filtering in MV3, so we'll use a specific pattern
            // that will only match extremely rarely (basically never)
            regexFilter: "^https://.*(?:SIMULATE_RARE_MATCH_FOR_EXTENSION_RANDOM_FAILURE).*$"
          }
        });
      }
      
      // Apply the rules
      if (rules.length > 0) {
        chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: [THROTTLING_RULE_ID, OUTAGE_RULE_ID, PACKET_LOSS_RULE_ID],
          addRules: rules
        })
        .then(() => {
          console.log('Network rules set up successfully');
          // Start the keep-alive loop
          keepAlive();
        })
        .catch(error => {
          console.error('Error setting up network rules:', error);
        });
      }
    });
}

// Clear all declarativeNetRequest rules
function clearNetworkRules() {
  return chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [THROTTLING_RULE_ID, OUTAGE_RULE_ID, PACKET_LOSS_RULE_ID],
    addRules: []
  })
  .then(() => {
    console.log('Network rules cleared successfully');
  })
  .catch(error => {
    console.error('Error clearing network rules:', error);
  });
}

// Schedule the next network outage - exciting!
function scheduleNextOutage() {
  if (!simulationActive || !currentSettings || !currentSettings.randomFailures || currentSettings.randomFailures <= 0) {
    clearOutageTimeouts();
    return;
  }
  
  // Clear any existing timeouts
  clearOutageTimeouts();
  
  // Calculate time until next outage based on frequency setting
  const timeUntilNextOutage = calculateTimeUntilNextOutage(currentSettings.failureFrequency);
  
  // Schedule the next outage
  nextOutageTimeout = setTimeout(() => {
    startOutage();
  }, timeUntilNextOutage);
  
  // Create an alarm as a backup mechanism
  try {
    if (chrome.alarms) {
      chrome.alarms.create('nextOutage', {
        when: Date.now() + timeUntilNextOutage
      });
    }
  } catch (e) {
    console.error('Error creating alarm:', e);
  }
}

// Add alarm listener only if the API is available
try {
  if (chrome.alarms) {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'nextOutage') {
        // Service worker was restarted, check if we should be in an outage
        chrome.storage.local.get(['outageStartTime', 'outageEndTime'], (data) => {
          const now = Date.now();
          if (data.outageStartTime && data.outageEndTime) {
            if (now >= data.outageStartTime && now < data.outageEndTime) {
              // We should be in an outage
              isInOutage = true;
              notifyTabsAboutOutage(true);
              
              // Schedule the end of this outage
              const remainingTime = data.outageEndTime - now;
              if (remainingTime > 0) {
                outageTimeout = setTimeout(() => {
                  endOutage();
                }, remainingTime);
              } else {
                // Outage should have ended already
                endOutage();
              }
            } else if (now >= data.outageEndTime) {
              // Outage should have ended already
              isInOutage = false;
              scheduleNextOutage();
            }
          }
        });
      }
    });
  }
} catch (e) {
  console.error('Error setting up alarms listener:', e);
}

// Start a network outage - everything stops working, just like real internet
function startOutage() {
  if (!simulationActive) return;
  
  isInOutage = true;
  console.log('Network outage started - duration:', currentSettings.failureDuration, 'seconds');
  
  // Store outage times for service worker restarts
  const outageStartTime = Date.now();
  const outageEndTime = outageStartTime + ((currentSettings.failureDuration || 30) * 1000);
  chrome.storage.local.set({
    outageStartTime,
    outageEndTime
  });
  
  // Notify any open tabs about the outage
  notifyTabsAboutOutage(true);
  
  // We can't actually block network traffic in MV3 with declarativeNetRequest in a random pattern
  // So we'll primarily rely on the content script to simulate the outage visually
  
  // Schedule the end of the outage
  outageTimeout = setTimeout(() => {
    endOutage();
  }, (currentSettings.failureDuration || 30) * 1000);
}

// End a network outage - back to just being slow instead of dead
function endOutage() {
  if (!simulationActive) return;
  
  isInOutage = false;
  console.log('Network outage ended');
  
  // Clear outage times
  chrome.storage.local.remove(['outageStartTime', 'outageEndTime']);
  
  // Notify any open tabs that the outage is over
  notifyTabsAboutOutage(false);
  
  // Schedule the next outage
  scheduleNextOutage();
}

// Calculate time until next outage - completely arbitrary but whatever
function calculateTimeUntilNextOutage(frequency) {
  let minTime, maxTime;
  
  switch(frequency) {
    case 'low':
      minTime = 5 * 60 * 1000; // 5 minutes
      maxTime = 15 * 60 * 1000; // 15 minutes
      break;
    case 'medium':
      minTime = 2 * 60 * 1000; // 2 minutes
      maxTime = 5 * 60 * 1000; // 5 minutes
      break;
    case 'high':
      minTime = 30 * 1000; // 30 seconds
      maxTime = 2 * 60 * 1000; // 2 minutes
      break;
    case 'extreme':
      minTime = 10 * 1000; // 10 seconds
      maxTime = 30 * 1000; // 30 seconds
      break;
    default:
      minTime = 2 * 60 * 1000; // 2 minutes
      maxTime = 5 * 60 * 1000; // 5 minutes
  }
  
  // Return a random time within the range
  return Math.floor(Math.random() * (maxTime - minTime)) + minTime;
}

// Clear all outage-related timeouts - cleanup is important I guess
function clearOutageTimeouts() {
  if (outageTimeout) {
    clearTimeout(outageTimeout);
    outageTimeout = null;
  }
  
  if (nextOutageTimeout) {
    clearTimeout(nextOutageTimeout);
    nextOutageTimeout = null;
  }
  
  // Clear any alarm as well
  try {
    if (chrome.alarms) {
      chrome.alarms.clear('nextOutage');
    }
  } catch (e) {
    console.error('Error clearing alarm:', e);
  }
}

// Notify tabs about outage status - if they're still listening
function notifyTabsAboutOutage(isStarting) {
  try {
    chrome.tabs.query({}, function(tabs) {
      tabs.forEach(tab => {
        try {
          chrome.tabs.sendMessage(tab.id, {
            action: 'outageStatus',
            isInOutage: isStarting,
            duration: isStarting ? (currentSettings.failureDuration || 30) : 0
          }, function(response) {
            // Handle response if needed
            if (chrome.runtime.lastError) {
              // Silent error - tab might not have content script
            }
          });
        } catch (e) {
          console.error("Error sending message to tab:", e);
        }
      });
    });
  } catch (e) {
    console.error("Error querying tabs:", e);
  }
}

// Service worker listeners for keep-alive
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'keepAlive') {
    // Service worker kept alive
    console.log('Service worker kept alive');
  }
});

// Service worker lifecycle - nobody cares but chrome needs it
self.addEventListener('install', (event) => {
  console.log('Service worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service worker activated');
  event.waitUntil(clients.claim());
});
