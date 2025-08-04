

// import * as dataService from './dataService.js';
// import { formatForNigeria, getRoundedPredictionTime } from './predictionService.js';

// const activeMonitors = new Map();

// export async function initializeMonitor(pairAddress) {
//     if (activeMonitors.has(pairAddress)) return;
    
//     activeMonitors.set(pairAddress, {
//         hitStatus: 'Not Reached',
//         hitTime: 'Not Reached',
//         targetPrice: null,
//         targetPriceDiff:null,
//         predictionStart: null,
//         predictionExpiry: null

//     });
// }

// export async function checkPriceHits() {
//     for (const [pairAddress, monitor] of activeMonitors) {
//         try {
//             if (monitor.hitStatus === 'Reached') continue;
            
//             const tokenData = await dataService.getTokenData(pairAddress);
//             if (!tokenData || !tokenData.currentPrice) continue;
            
//             const currentPrice = tokenData.currentPrice;
//             const targetPrice = monitor.targetPrice;
            
//             if (currentPrice >= targetPrice) {
//                 monitor.hitStatus = 'Reached';
//                 const {predictedDate} = getRoundedPredictionTime();
//                 // monitor.hitTime = formatForNigeria(new Date());
//                 monitor.hitTime = formatForNigeria(predictedDate);
//                 console.log(`🎯 Target hit for ${pairAddress} at ${currentPrice}`);
//             }

//             monitor.targetPriceDiff=((targetPrice / currentPrice - 1) * 100).toFixed(2);

            
//             // Check if prediction expired
//             if (new Date(monitor.predictionExpiry) < new Date()) {
//                 monitor.hitStatus = 'Expired';
//             }
//         } catch (error) {
//             console.error(`Error monitoring ${pairAddress}:`, error);
//         }
//     }
// }

// export function getMonitorStatus(pairAddress) {
//     return activeMonitors.get(pairAddress) || {
//         hitStatus: 'Not Reached',
//         hitTime: 'Not Reached'
//     };
// }
// export function updateMonitorTarget(pairAddress, targetPrice, predictionStart, predictionExpiry) {
//     if (!activeMonitors.has(pairAddress)) {
//         initializeMonitor(pairAddress);
//     }
    
//     const monitor = activeMonitors.get(pairAddress);
//     monitor.targetPrice = targetPrice;
//     monitor.predictionStart = predictionStart;
//     monitor.predictionExpiry = predictionExpiry;
//     monitor.hitStatus = 'Not Reached';
//     monitor.hitTime = 'Not Reached';
// }

// // Run checks every minute
// // setInterval(checkPriceHits, 60000)



// Updated monitorService.js
import * as dataService from './dataService.js';
import { formatForNigeria, getRoundedPredictionTime } from './predictionService.js';
import * as accuracyService from './accuracyService.js';

const activeMonitors = new Map();

export async function initializeMonitor(pairAddress) {
    if (activeMonitors.has(pairAddress)) return;
    
    activeMonitors.set(pairAddress, {
        hitStatus: 'Not Reached',
        hitTime: null,
        targetPrice: null,
        targetPriceDiff: null,
        predictionStart: null,
        predictionExpiry: null,
        recorded: false // New flag to track if result was recorded
    });
}

export async function checkPriceHits() {
    for (const [pairAddress, monitor] of activeMonitors) {
        try {
            // Skip if already recorded
            if (monitor.recorded) continue;
            
            const tokenData = await dataService.getTokenData(pairAddress);
            if (!tokenData || !tokenData.currentPrice) continue;
            
            const currentPrice = tokenData.currentPrice;
            const now = new Date();
            
            // Check if price reached target
            if (currentPrice >= monitor.targetPrice) {
                monitor.hitStatus = 'Reached';
                const {predictedDate} = getRoundedPredictionTime();
                monitor.hitTime = formatForNigeria(predictedDate);
                monitor.recorded = true;
                
                console.log(`🎯 Target hit for ${pairAddress} at ${currentPrice}`);
                await accuracyService.recordPredictionResult(pairAddress, true, monitor.predictionStart);
            } 
            // Check if prediction expired
            else if (now >= new Date(monitor.predictionExpiry)) {
                monitor.hitStatus = 'Expired';
                monitor.hitTime = formatForNigeria(now);
                monitor.recorded = true;
                
                console.log(`⏰ Prediction expired for ${pairAddress}`);
                await accuracyService.recordPredictionResult(pairAddress, false, monitor.predictionStart);
            }

            // Update price difference (regardless of hit/expiry)
            monitor.targetPriceDiff = ((monitor.targetPrice / currentPrice - 1) * 100).toFixed(3);
        } catch (error) {
            console.error(`Error monitoring ${pairAddress}:`, error);
        }
    }
}

export function getMonitorStatus(pairAddress) {
    return activeMonitors.get(pairAddress) || {
        hitStatus: 'Not Reached',
        hitTime: null,
        targetPriceDiff: null
    };
}


// Add to monitorService.js
export function cleanupExpiredMonitors() {
    const now = new Date();
    for (const [pairAddress, monitor] of activeMonitors) {
        if (monitor.recorded && now > new Date(monitor.predictionExpiry)) {
            activeMonitors.delete(pairAddress);
        }
    }
}

export function updateMonitorTarget(pairAddress, targetPrice, predictionStart, predictionExpiry) {
    if (!activeMonitors.has(pairAddress)) {
        initializeMonitor(pairAddress);
    }
    
    const monitor = activeMonitors.get(pairAddress);
    monitor.targetPrice = targetPrice;
    monitor.predictionStart = predictionStart;
    monitor.predictionExpiry = predictionExpiry;
    monitor.hitStatus = 'Not Reached';
    monitor.hitTime = null;
    monitor.recorded = false; // Reset recording flag for new prediction
    monitor.targetPriceDiff = null;
}

export function cleanupAllMonitors() {
    const now = new Date();
    let cleanedCount = 0;
    
    for (const [pairAddress, monitor] of activeMonitors) {
        // Cleanup conditions:
        // 1. Already recorded results
        // 2. Expired predictions (even if not recorded)
        // 3. Stale monitors (e.g., no activity for 24 hours)
        if (monitor.recorded || 
            now >= new Date(monitor.predictionExpiry) || 
            (monitor.lastChecked && now - monitor.lastChecked > 24 * 60 * 60 * 1000)) {
            
            // Record as missed if expired and not recorded
            if (!monitor.recorded && now >= new Date(monitor.predictionExpiry)) {
                accuracyService.recordPredictionResult(pairAddress, false);
            }
            
            activeMonitors.delete(pairAddress);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} monitors`);
    }
    return cleanedCount;
}