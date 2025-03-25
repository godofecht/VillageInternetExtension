# Network Conditions Simulator for Opera

A browser extension that simulates various network conditions including low internet speed, ISP throttling, and digital redlining.

## Features

- **Bandwidth Limitation**: Simulate slow download and upload speeds
- **Network Conditions**: Add latency and packet loss to simulate poor connections
- **Remote Village Experience**: Simulate complete connection outages and random request failures like you would experience developing in a remote location
- **Digital Redlining Simulation**: Target specific websites for throttling to simulate ISP practices

## Installation

1. Open Opera browser
2. Navigate to `opera://extensions`
3. Enable "Developer Mode" using the toggle in the top-right corner
4. Click "Load unpacked" and select the extension folder
5. The Network Conditions Simulator should now appear in your extensions list

## Usage

1. Click on the extension icon in the browser toolbar to open the popup
2. Configure your desired network settings:
   - Set download/upload speeds
   - Set latency and packet loss values
   - Configure random outages and failures frequency
   - Specify any sites you want to throttle
3. Click "Start Simulation" to begin throttling network requests
4. Click "Stop Simulation" to return to normal browsing

## Configuration Options

- **Download/Upload Speed**: Set bandwidth limits in KB/s
- **Latency**: Add delay to network requests in milliseconds
- **Packet Loss**: Randomly drop a percentage of network requests
- **Random Request Failures**: Percentage of requests that will randomly fail
- **Outage Duration**: How long network outages last (in seconds)
- **Frequency of Outages**: How often network outages occur
- **Sites to Throttle**: Specify domains to apply targeted throttling
- **Throttling Level**: Choose how severely to throttle specified sites

## Notes for Developers

The extension uses the Chrome/Opera WebRequest API to intercept and throttle network requests. It works by:

1. Intercepting outgoing requests with the `webRequest.onBeforeRequest` listener
2. Applying artificial delays based on configured settings
3. Simulating packet loss by randomly canceling some requests
4. Periodically triggering complete network outages based on frequency settings
5. Adding visual indicators during outages to simulate poor connectivity

## Limitations

- The extension may not work on certain pages with advanced security features
- Some types of WebRTC and WebSocket communications might bypass the throttling
- Opera's built-in VPN may interfere with the extension's functionality
