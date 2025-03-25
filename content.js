// content script. makes websites look broken.

// state tracking
let isCurrentlyInOutage = false;
let outageOverlay = null;
let simulationActive = false;
let currentSettings = null;

// css class names - don't change or everything breaks
const LOADING_ANIMATION_CLASS = 'network-simulator-loading';
const STYLE_ELEMENT_ID = 'network-simulator-styles';

// init when page loads - if it ever does
initializeWhenReady();

// Listen for background messages - if they even arrive
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'simulationStatus') {
    // Update simulation status
    simulationActive = request.active;
    currentSettings = request.settings;
    
    if (simulationActive) {
      applyThrottlingEffects();
    } else {
      removeThrottlingEffects();
    }
    
    sendResponse({received: true});
    return true;
  }
  else if (request.action === 'outageStatus') {
    // Handle outage status changes
    if (request.isInOutage && !isCurrentlyInOutage) {
      showOutageOverlay(request.duration);
    } else if (!request.isInOutage && isCurrentlyInOutage) {
      hideOutageOverlay();
    }
    sendResponse({received: true});
    return true;
  }
  return true; // Keep the message channel open for async response
});

// Apply throttling visual effects
function applyThrottlingEffects() {
  try {
    if (!simulationActive || !currentSettings) return;
    
    insertStyleSheet();
    
    // Add random latency to image loading
    if (currentSettings.latency > 0) {
      slowDownImageLoading();
    }
    
    // Simulate packet loss by randomly failing to load some elements
    if (currentSettings.packetLoss > 0) {
      simulatePacketLoss();
    }
    
    // Random request failures - cause some elements to fail loading
    if (currentSettings.randomFailures > 0) {
      simulateRandomFailures();
    }
  } catch (e) {
    console.error('Error applying throttling effects:', e);
  }
}

// Insert CSS for throttling effects
function insertStyleSheet() {
  try {
    if (document.getElementById(STYLE_ELEMENT_ID)) {
      return; // Style sheet already exists
    }
    
    const styleElement = document.createElement('style');
    styleElement.id = STYLE_ELEMENT_ID;
    
    // Calculate animation speed based on throttling level
    let animationSpeed = 1;
    if (currentSettings) {
      // Slow down animations based on latency
      if (currentSettings.latency > 0) {
        animationSpeed = Math.min(10, 1 + (currentSettings.latency / 500));
      }
    }
    
    styleElement.textContent = `
      /* Slow down all animations and transitions */
      * {
        animation-duration: ${animationSpeed}s !important;
        transition-duration: ${animationSpeed}s !important;
      }
      
      /* Slow loading effect */
      @keyframes slowLoading {
        0% { opacity: 0.3; }
        50% { opacity: 0.7; }
        100% { opacity: 0.3; }
      }
      
      .${LOADING_ANIMATION_CLASS} {
        animation: slowLoading 2s infinite ease-in-out !important;
      }
      
      /* Broken image effect */
      .network-simulator-broken-img {
        position: relative;
        background-color: #f0f0f0;
        display: inline-block;
        min-width: 40px;
        min-height: 40px;
      }
      
      .network-simulator-broken-img::before {
        content: "⚠️";
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 16px;
      }
      
      /* Poor connection indicator */
      .network-simulator-indicator {
        position: fixed;
        bottom: 10px;
        right: 10px;
        background-color: rgba(255, 200, 0, 0.8);
        color: black;
        padding: 5px 10px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 9999;
        font-family: sans-serif;
      }
    `;
    
    document.head.appendChild(styleElement);
    
    // Add indicator to show throttling is active
    const indicator = document.createElement('div');
    indicator.id = 'network-simulator-indicator';
    indicator.className = 'network-simulator-indicator';
    indicator.textContent = '🛜 Poor Connection Simulated';
    document.body.appendChild(indicator);
  } catch (e) {
    console.error('Error inserting stylesheet:', e);
  }
}

// Remove throttling visual effects
function removeThrottlingEffects() {
  try {
    // Remove style sheet
    const styleElement = document.getElementById(STYLE_ELEMENT_ID);
    if (styleElement) {
      styleElement.remove();
    }
    
    // Remove connection indicator
    const indicator = document.getElementById('network-simulator-indicator');
    if (indicator) {
      indicator.remove();
    }
    
    // Restore all affected elements
    document.querySelectorAll(`.${LOADING_ANIMATION_CLASS}`).forEach(el => {
      el.classList.remove(LOADING_ANIMATION_CLASS);
    });
    
    // Restore images
    document.querySelectorAll('.network-simulator-broken-img').forEach(el => {
      if (el._originalSrc) {
        el.src = el._originalSrc;
        el.classList.remove('network-simulator-broken-img');
      }
    });
  } catch (e) {
    console.error('Error removing throttling effects:', e);
  }
}

// Simulate slow image loading
function slowDownImageLoading() {
  try {
    // Delay image loading using JS
    const images = Array.from(document.querySelectorAll('img:not([data-network-simulator-processed])'));
    
    // Process a few images at a time to avoid freezing the page
    const processImages = (startIndex, batchSize) => {
      const endIndex = Math.min(startIndex + batchSize, images.length);
      const batch = images.slice(startIndex, endIndex);
      
      batch.forEach(img => {
        img.setAttribute('data-network-simulator-processed', 'true');
        
        // Only process images that have a src attribute and are visible
        if (img.src && img.offsetParent !== null) {
          const originalSrc = img.src;
          
          // Store original for later restoration
          img._originalSrc = originalSrc;
          
          // Apply blurry filter to indicate slow loading
          img.style.filter = 'blur(2px)';
          img.classList.add(LOADING_ANIMATION_CLASS);
          
          // Simulate image loading delay
          setTimeout(() => {
            img.style.filter = '';
            img.classList.remove(LOADING_ANIMATION_CLASS);
          }, currentSettings.latency * 2);
        }
      });
      
      // Process next batch if there are more images
      if (endIndex < images.length) {
        setTimeout(() => {
          processImages(endIndex, batchSize);
        }, 100);
      }
    };
    
    // Start processing images in batches of 5
    processImages(0, 5);
  } catch (e) {
    console.error('Error slowing down image loading:', e);
  }
}

// Simulate packet loss by randomly failing to load some elements
function simulatePacketLoss() {
  try {
    if (!currentSettings || !currentSettings.packetLoss) return;
    
    // Randomly fail to load some images based on packet loss percentage
    const images = document.querySelectorAll('img:not([data-network-simulator-packet-loss])');
    images.forEach(img => {
      img.setAttribute('data-network-simulator-packet-loss', 'true');
      
      if (Math.random() * 100 < currentSettings.packetLoss) {
        // Save original src
        if (img.src) {
          img._originalSrc = img.src;
        }
        
        // Replace with broken image
        img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
        img.classList.add('network-simulator-broken-img');
      }
    });
    
    // Randomly make some text elements appear "lost"
    const textElements = document.querySelectorAll('p, h1, h2, h3, span, div:not([data-network-simulator-packet-loss])');
    textElements.forEach(el => {
      if (el.childElementCount === 0 && el.textContent.length > 10) {
        el.setAttribute('data-network-simulator-packet-loss', 'true');
        
        if (Math.random() * 100 < currentSettings.packetLoss / 2) {
          el._originalContent = el.textContent;
          // Replace some characters with gibberish to simulate corruption
          el.textContent = corruptText(el.textContent);
        }
      }
    });
  } catch (e) {
    console.error('Error simulating packet loss:', e);
  }
}

// Simulate random failures
function simulateRandomFailures() {
  try {
    if (!currentSettings || !currentSettings.randomFailures) return;
    
    // Randomly decide if we should fail some resources on this page
    if (Math.random() * 100 < currentSettings.randomFailures) {
      // Choose what to fail
      const failType = Math.floor(Math.random() * 4);
      
      switch (failType) {
        case 0: // Fail CSS
          addTemporaryStyle(`
            * { 
              font-family: monospace !important;
              color: #333 !important;
            }
            body {
              background-color: #f8f8f8 !important;
            }
          `);
          break;
          
        case 1: // Fail images
          // Make a few more images fail
          const images = document.querySelectorAll('img:not(.network-simulator-broken-img)');
          images.forEach(img => {
            if (Math.random() < 0.3) { // 30% chance for each image
              if (img.src) {
                img._originalSrc = img.src;
                img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
                img.classList.add('network-simulator-broken-img');
              }
            }
          });
          break;
          
        case 2: // Fail scripts - simulate by making buttons not work
          const buttons = document.querySelectorAll('button, a, input[type="submit"]');
          buttons.forEach(btn => {
            if (Math.random() < 0.5) { // 50% chance per button
              // Make a copy of the button that doesn't work
              const clone = btn.cloneNode(true);
              btn.parentNode.replaceChild(clone, btn);
              
              // Add a click handler to show failure
              clone.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                showTemporaryMessage("Request failed - poor connection");
                return false;
              });
            }
          });
          break;
          
        case 3: // General slowness
          // Add slow loading animation to random elements
          const elements = document.querySelectorAll('div, section, article');
          elements.forEach(el => {
            if (Math.random() < 0.1) { // 10% chance per element
              el.classList.add(LOADING_ANIMATION_CLASS);
            }
          });
          break;
      }
    }
  } catch (e) {
    console.error('Error simulating random failures:', e);
  }
}

// Function to show a visual indicator of network outage
function showOutageOverlay(duration) {
  try {
    isCurrentlyInOutage = true;
    
    // Create overlay if it doesn't exist and if we have a body element
    if (!outageOverlay && document.body) {
      outageOverlay = document.createElement('div');
      outageOverlay.style.position = 'fixed';
      outageOverlay.style.top = '0';
      outageOverlay.style.left = '0';
      outageOverlay.style.width = '100%';
      outageOverlay.style.padding = '15px';
      outageOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0.9)';
      outageOverlay.style.color = 'white';
      outageOverlay.style.fontWeight = 'bold';
      outageOverlay.style.textAlign = 'center';
      outageOverlay.style.zIndex = '2147483647'; // Highest possible z-index
      outageOverlay.style.boxShadow = '0 0 10px rgba(0,0,0,0.8)';
      outageOverlay.style.fontSize = '16px';
      outageOverlay.style.fontFamily = 'Arial, sans-serif';
      
      document.body.appendChild(outageOverlay);
    }
    
    if (outageOverlay) {
      outageOverlay.innerHTML = `⚠️ NETWORK OUTAGE SIMULATION ⚠️<br>Poor connectivity in your village<br>Duration: ~${duration} seconds`;
      outageOverlay.style.display = 'block';
      
      // Make the whole page look broken during outage
      const outageStyleElement = document.createElement('style');
      outageStyleElement.id = 'network-simulator-outage-styles';
      outageStyleElement.textContent = `
        img {
          filter: grayscale(100%) !important;
          opacity: 0.5 !important;
        }
        video, iframe {
          display: none !important;
        }
        body {
          filter: contrast(0.8) !important;
        }
        @keyframes glitchEffect {
          0% { opacity: 1; }
          10% { opacity: 0.8; }
          20% { opacity: 1; }
          50% { opacity: 0.7; }
          70% { opacity: 1; }
          90% { opacity: 0.9; }
          100% { opacity: 1; }
        }
        html {
          animation: glitchEffect 0.3s infinite !important;
        }
      `;
      document.head.appendChild(outageStyleElement);
      
      // Break all links during outage
      const links = document.querySelectorAll('a');
      links.forEach(link => {
        link.setAttribute('data-original-href', link.href);
        link.addEventListener('click', function(e) {
          if (isCurrentlyInOutage) {
            e.preventDefault();
            showTemporaryMessage("Connection lost - unable to navigate");
            return false;
          }
        });
      });
      
      // Break all form submissions
      const forms = document.querySelectorAll('form');
      forms.forEach(form => {
        form.addEventListener('submit', function(e) {
          if (isCurrentlyInOutage) {
            e.preventDefault();
            showTemporaryMessage("Connection lost - unable to submit form");
            return false;
          }
        });
      });
    }
  } catch (e) {
    console.error('Error showing outage overlay:', e);
  }
}

// Function to hide the outage overlay
function hideOutageOverlay() {
  try {
    isCurrentlyInOutage = false;
    
    if (outageOverlay) {
      outageOverlay.style.display = 'none';
    }
    
    // Remove outage style sheet
    const outageStyleElement = document.getElementById('network-simulator-outage-styles');
    if (outageStyleElement) {
      outageStyleElement.remove();
    }
    
    // Restore links
    const links = document.querySelectorAll('a[data-original-href]');
    links.forEach(link => {
      link.href = link.getAttribute('data-original-href');
      link.removeAttribute('data-original-href');
    });
  } catch (e) {
    console.error('Error hiding outage overlay:', e);
  }
}

// Helper function to add temporary style
function addTemporaryStyle(cssText) {
  try {
    const tempStyle = document.createElement('style');
    tempStyle.id = 'network-simulator-temp-style-' + Math.random().toString(36).substring(7);
    tempStyle.textContent = cssText;
    document.head.appendChild(tempStyle);
    
    // Remove after some time
    setTimeout(() => {
      if (tempStyle && tempStyle.parentNode) {
        tempStyle.parentNode.removeChild(tempStyle);
      }
    }, 10000); // Remove after 10 seconds
  } catch (e) {
    console.error('Error adding temporary style:', e);
  }
}

// Helper function to show temporary message
function showTemporaryMessage(message) {
  try {
    const messageDiv = document.createElement('div');
    messageDiv.style.position = 'fixed';
    messageDiv.style.bottom = '20px';
    messageDiv.style.left = '50%';
    messageDiv.style.transform = 'translateX(-50%)';
    messageDiv.style.backgroundColor = 'rgba(255, 0, 0, 0.9)';
    messageDiv.style.color = 'white';
    messageDiv.style.padding = '8px 15px';
    messageDiv.style.borderRadius = '4px';
    messageDiv.style.fontFamily = 'Arial, sans-serif';
    messageDiv.style.fontSize = '14px';
    messageDiv.style.zIndex = '2147483646';
    messageDiv.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.3)';
    messageDiv.textContent = message;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.style.opacity = '0';
        messageDiv.style.transition = 'opacity 0.5s';
        setTimeout(() => {
          if (messageDiv.parentNode) {
            messageDiv.parentNode.removeChild(messageDiv);
          }
        }, 500);
      }
    }, 3000);
  } catch (e) {
    console.error('Error showing temporary message:', e);
  }
}

// Helper function to corrupt text (simulate packet loss in text)
function corruptText(text) {
  try {
    // Don't corrupt very short text
    if (!text || text.length < 10) return text;
    
    // Corruption characters
    const corruptChars = ['□', '▯', '�', '▒', '▓', '■'];
    
    // Create a corrupted version of the text
    let result = '';
    for (let i = 0; i < text.length; i++) {
      // 10% chance to corrupt each character
      if (Math.random() < 0.1) {
        const randomCorruptChar = corruptChars[Math.floor(Math.random() * corruptChars.length)];
        result += randomCorruptChar;
      } else {
        result += text[i];
      }
    }
    
    return result;
  } catch (e) {
    console.error('Error corrupting text:', e);
    return text;
  }
}

// Function to check current simulation status
function checkSimulationStatus() {
  try {
    chrome.runtime.sendMessage({action: 'checkSimulationStatus'}, function(response) {
      if (chrome.runtime.lastError) {
        console.log('Error checking simulation status:', chrome.runtime.lastError);
        return;
      }
      
      if (response && response.active) {
        simulationActive = true;
        currentSettings = response.settings;
        
        if (response.inOutage) {
          showOutageOverlay(response.settings.failureDuration || 30);
        } else {
          applyThrottlingEffects();
        }
      }
    });
  } catch (e) {
    console.error('Error checking simulation status:', e);
  }
}

// Function to ensure we have access to DOM
function initializeWhenReady() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      // Check simulation status on page load
      setTimeout(checkSimulationStatus, 500); // Small delay to ensure background script is ready
    });
  } else {
    // DOM is already ready
    setTimeout(checkSimulationStatus, 500);
  }
  
  // Add listener for dynamic content
  if (window.MutationObserver) {
    const observer = new MutationObserver(mutations => {
      if (simulationActive) {
        // When new content is added, apply effects to it
        mutations.forEach(mutation => {
          if (mutation.addedNodes && mutation.addedNodes.length > 0) {
            // Apply effects after a short delay to let the content render
            setTimeout(() => {
              if (isCurrentlyInOutage) {
                // Don't apply effects during outage, outage styles handle it
                return;
              }
              
              if (currentSettings && currentSettings.packetLoss > 0) {
                simulatePacketLoss();
              }
              
              if (currentSettings && currentSettings.latency > 0) {
                slowDownImageLoading();
              }
            }, 100);
          }
        });
      }
    });
    
    // Start observing the document
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }
}
