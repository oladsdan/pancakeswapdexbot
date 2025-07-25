import mongoose from 'mongoose';
import TokenData from '../models/TokenData.js';
// import config from '../config/default.json'; // Ensure this path is correct
import config from '../config/default.json' assert { type: 'json' };

const MONGODB_URI = process.env.MONGODB_URI;
const HISTORY_RETENTION_LIMIT = config.historyRetentionLimit;
const SignalHistoryLength = 5;

/**
 * Establishes a connection to MongoDB.
 */
export async function connectDb() {
    if (mongoose.connection.readyState === 1) {
        console.log('Already connected to MongoDB.');
        return;
    }
    try {
        await mongoose.connect(MONGODB_URI, {
            // useNewUrlParser: true, // Deprecated in Mongoose 6+
            // useUnifiedTopology: true, // Deprecated in Mongoose 6+
        });
        console.log('MongoDB connected successfully.');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1); // Exit process if cannot connect to DB
    }
}

// export async function cleanupInvalidTokens() {
//   const validTokens = config.monitoredTokens.map(t => t.address.toLowerCase());
//   const result = await TokenData.deleteMany({
//     targetTokenAddress: { $nin: validTokens }
//   });
//   console.log(`Cleaned up ${result.deletedCount} invalid tokens from DB.`);
// }

/**
 * Initializes (or updates) a token pair's metadata in the database.
 * This ensures an entry exists for each monitored pair.
 * @param {object} pairData - The initial metadata for the token pair from Dexscreener.
 */
export async function initializeTokenData(pairData) {

    const isValidToken = config.monitoredTokens.some(
    t => t.address.toLowerCase() === pairData.targetTokenAddress.toLowerCase()
    );

    if (!isValidToken) {
        throw new Error(`Token ${pairData.targetTokenSymbol} not in monitored list.`);
    }

    try {
        const { 
            pairAddress, 
            chainId, 
            baseToken,  // This is the baseToken of the *pair* (e.g., TUT for ALICE/TUT)
            quoteToken, // This is the quoteToken of the *pair* (e.g., ALICE for ALICE/TUT, or WBNB/BUSD)
            pairName,
            // These are the *specific* fields for the token YOU are monitoring
            targetTokenAddress, 
            targetTokenSymbol, 
            targetTokenName 
        } = pairData;

        
        const baseTokenAddressOfPair = baseToken.address;
        const baseTokenSymbolOfPair = baseToken.symbol;


        let tokenDoc = await TokenData.findOne({ pairAddress });

        if (!tokenDoc) {
            tokenDoc = new TokenData({
                pairAddress,
                chainId,
                baseTokenAddress: baseTokenAddressOfPair,
                baseTokenSymbol: baseTokenSymbolOfPair,
                targetTokenAddress,
                targetTokenSymbol,
                targetTokenName,
                pairName,
                priceHistory: [],
                volumeHistory: [],
                liquidityHistory: [],
                latestLstmPrediction: 'N/A',
                latestXgboostPrediction: 'N/A',
                latestCombinedPrediction: 'N/A',
                predictionPredictedTime: 'N/A',
                predictionExpiryTime: 'N/A',
                lastUpdated: new Date()
            });
            console.log(`Initialized new token pair: ${pairName} (${pairAddress})`);
        } else {
            // Update metadata if needed (e.g., symbol, name might change, though rare for addresses)
            tokenDoc.baseTokenAddress = baseTokenAddressOfPair;
            tokenDoc.baseTokenSymbol = baseTokenSymbolOfPair;
            tokenDoc.targetTokenAddress = targetTokenAddress;
            tokenDoc.targetTokenSymbol = targetTokenSymbol;
            tokenDoc.targetTokenName = targetTokenName;
            tokenDoc.pairName = pairName;
            tokenDoc.lastUpdated = new Date();
        }
        await tokenDoc.save();
        return tokenDoc;
    } catch (error) {
        console.error(`Error initializing/updating token data for pair ${pairData.pairAddress}:`, error);
        return null;
    }
}

/**
 * Updates the historical market data for a given token pair.
 * It also prunes history to keep it within the retention limit.
 * @param {string} pairAddress - The unique address of the token pair.
 * @param {number} currentPrice - The current price of the token.
 * @param {number} currentVolume - The current 24h volume.
 * @param {number} currentLiquidity - The current total liquidity.
//  */
// export async function updateMarketData(pairAddress, currentPrice, currentVolume, currentLiquidity,) {
//     try {
//         const tokenDoc = await TokenData.findOne({ pairAddress });

//         if (!tokenDoc) {
//             console.warn(`Attempted to update non-existent token pair: ${pairAddress}. Initialize first.`);
//             return;
//         }

//         const now = new Date();

//         // Add new data points
//         tokenDoc.priceHistory.push({ price: currentPrice, timestamp: now });
//         tokenDoc.volumeHistory.push({ volume: currentVolume, timestamp: now });
//         tokenDoc.liquidityHistory.push({ liquidity: currentLiquidity, timestamp: now });

//         // Prune historical arrays to maintain a fixed size (HISTORY_RETENTION_LIMIT)
//         if (tokenDoc.priceHistory.length > HISTORY_RETENTION_LIMIT) {
//             tokenDoc.priceHistory = tokenDoc.priceHistory.slice(-HISTORY_RETENTION_LIMIT);
//         }
//         if (tokenDoc.volumeHistory.length > HISTORY_RETENTION_LIMIT) {
//             tokenDoc.volumeHistory = tokenDoc.volumeHistory.slice(-HISTORY_RETENTION_LIMIT);
//         }
//         if (tokenDoc.liquidityHistory.length > HISTORY_RETENTION_LIMIT) {
//             tokenDoc.liquidityHistory = tokenDoc.liquidityHistory.slice(-HISTORY_RETENTION_LIMIT);
//         }

//         tokenDoc.lastUpdated = now;
//         await tokenDoc.save();
//     } catch (error) {
//         console.error(`Error updating market data for ${pairAddress}:`, error);
//     }
// }
export async function updateMarketData(pairAddress, currentPrice, currentVolume, currentLiquidity, historicalPricesFromAlchemy) {
    try {
        const tokenDoc = await TokenData.findOne({ pairAddress });
        // console.log("this is historical price", historicalPricesFromAlchemy);

        if (!tokenDoc) {
            console.warn(`Attempted to update non-existent token pair: ${pairAddress}. Initialize first.`);
            return;
        }

        const now = new Date();

        // --- Handle Price History ---
        let existingPriceHistory = tokenDoc.priceHistory || [];
        const newCurrentPriceEntry = { price: currentPrice, timestamp: now };

        // Combine existing history, newly fetched historical prices from Alchemy, and the very latest price
        let combinedPriceHistory = [
            ...existingPriceHistory,
            ...(historicalPricesFromAlchemy || []),
            newCurrentPriceEntry
        ];

        // Deduplicate and sort price history
        // Use a Map to keep the latest entry for each unique timestamp
        const priceHistoryMap = new Map();
        for (const entry of combinedPriceHistory) {
            const timestampKey = new Date(entry.timestamp).toISOString(); // Using ISO string for unique key
            priceHistoryMap.set(timestampKey, { price: entry.price, timestamp: new Date(entry.timestamp) }); // Ensure Date object
        }

        let updatedPriceHistory = Array.from(priceHistoryMap.values()).sort((a, b) => {
            return a.timestamp.getTime() - b.timestamp.getTime();
        });

        // Filter by date: Retain only data within the last `historicalDataDays` from config
        const relevantDaysAgo = new Date();
        relevantDaysAgo.setDate(relevantDaysAgo.getDate() - config.historicalDataDays);
        updatedPriceHistory = updatedPriceHistory.filter(entry =>
            entry.timestamp.getTime() >= relevantDaysAgo.getTime()
        );

        // Limit by count: Trim the array to `HISTORY_RETENTION_LIMIT` (e.g., 200 entries), keeping the most recent.
        if (updatedPriceHistory.length > HISTORY_RETENTION_LIMIT) {
            updatedPriceHistory = updatedPriceHistory.slice(updatedPriceHistory.length - HISTORY_RETENTION_LIMIT);
        }
        tokenDoc.priceHistory = updatedPriceHistory;
        console.log("price history updated");

        // --- Handle Volume History ---
        tokenDoc.volumeHistory.push({ volume: currentVolume, timestamp: now });
        if (tokenDoc.volumeHistory.length > HISTORY_RETENTION_LIMIT) {
            tokenDoc.volumeHistory = tokenDoc.volumeHistory.slice(-HISTORY_RETENTION_LIMIT);
        }

        // --- Handle Liquidity History ---
        tokenDoc.liquidityHistory.push({ liquidity: currentLiquidity, timestamp: now });
        if (tokenDoc.liquidityHistory.length > HISTORY_RETENTION_LIMIT) {
            tokenDoc.liquidityHistory = tokenDoc.liquidityHistory.slice(-HISTORY_RETENTION_LIMIT);
        }

        // Update current values
        tokenDoc.currentPrice = currentPrice;
        tokenDoc.currentVolume = currentVolume;
        tokenDoc.currentLiquidity = currentLiquidity;

        tokenDoc.lastUpdated = now;
        await tokenDoc.save();
        console.log(`Market data updated for ${pairAddress} with ${tokenDoc.priceHistory.length} price points.`);
    } catch (error) {
        console.error(`Error updating market data for ${pairAddress}:`, error);
    }
}

export async function updatePredictionData(pairAddress, predictionResults) {
    try {
        const tokenDoc = await TokenData.findOne({ pairAddress });

        if (!tokenDoc) {
            console.warn(`Token data not found for ${pairAddress}. Cannot update prediction data.`);
            return;
        }

        // console.log("the predictionRESult in dataService",predictionResults)

        // Update the prediction fields
        tokenDoc.latestLstmPrediction = predictionResults.lstmPrediction;
        tokenDoc.latestXgboostPrediction = predictionResults.xgboostPrediction;
        tokenDoc.latestCombinedPrediction = predictionResults.combinedPrediction;
        // tokenDoc.target_diff_percent = predictionResults.target_diff_percent;
        tokenDoc.target_price_usdt = predictionResults.target_price_usdt;
        tokenDoc.PriceOfTokenAtPrediction = predictionResults.current_price_usdt;
        
        if (
                        predictionResults.lstmPrediction !== 'N/A' &&
                        predictionResults.lstmPrediction !== 'NaN' ||
                        predictionResults.combinedPrediction !== 'N/A' &&
                        predictionResults.combinedPrediction !== 'NaN'
            ) {
                        tokenDoc.predictionPredictedTime = predictionResults.predictedTime;
                        tokenDoc.predictionExpiryTime = predictionResults.expiryTime;
                    } else {
                        tokenDoc.predictionPredictedTime = 'N/A';
                        tokenDoc.predictionExpiryTime = 'N/A';
        }

        // tokenDoc.predictionGeneratedTime = predictionResults.predictedTime; // Store the prediction's generated time
        // tokenDoc.predictionExpiryTime = predictionResults.expiryTime;     // Store the prediction's expiry time
        tokenDoc.lastUpdated = new Date(); // Also update general lastUpdated

        await tokenDoc.save();

        console.log(`Prediction data updated for ${pairAddress}.`);
        // console.log(tokenDoc, "for the address")
    } catch (error) {
        console.error(`Error updating prediction data for ${pairAddress}:`, error);
    }
}

/**
 * Retrieves the full historical price data for a given token pair.
 * @param {string} pairAddress - The unique address of the token pair.
 * @returns {Array<object>} An array of price history objects.
 */
export async function getPriceHistory(pairAddress) {
    try {
        const tokenDoc = await TokenData.findOne({ pairAddress }, { priceHistory: 1 });
        return tokenDoc ? tokenDoc.priceHistory : [];
    } catch (error) {
        console.error(`Error fetching price history for ${pairAddress}:`, error);
        return [];
    }
}

/**
 * Retrieves the full historical volume data for a given token pair.
 * @param {string} pairAddress - The unique address of the token pair.
 * @returns {Array<object>} An array of volume history objects.
 */
export async function getVolumeHistory(pairAddress) {
    try {
        const tokenDoc = await TokenData.findOne({ pairAddress }, { volumeHistory: 1 });
        return tokenDoc ? tokenDoc.volumeHistory : [];
    } catch (error) {
        console.error(`Error fetching volume history for ${pairAddress}:`, error);
        return [];
    }
}

/**
 * Retrieves the full historical liquidity data for a given token pair.
 * @param {string} pairAddress - The unique address of the token pair.
 * @returns {Array<object>} An array of liquidity history objects.
 */
export async function getLiquidityHistory(pairAddress) {
    try {
        const tokenDoc = await TokenData.findOne({ pairAddress }, { liquidityHistory: 1 });
        return tokenDoc ? tokenDoc.liquidityHistory : [];
    } catch (error) {
        console.error(`Error fetching liquidity history for ${pairAddress}:`, error);
        return [];
    }
}

/**
 * Retrieves the full TokenData document for a given pair address.
 * @param {string} pairAddress - The unique address of the token pair.
 * @returns {object|null} The token document or null if not found.
 */
export async function getTokenData(pairAddress) {
    try {
        return await TokenData.findOne({ pairAddress });
    } catch (error) {
        console.error(`Error fetching token data for ${pairAddress}:`, error);
        return null;
    }
}

export async function getAllPairAddresses() {
    try {
        const addresses = await TokenData.find({}).distinct('pairAddress');
        return addresses;
    } catch (error) {
        console.error('Error fetching all pair addresses:', error);
        return [];
    }
}

export async function updateSignalHistory(pairAddress, signal) {
    try {
        const tokenDoc = await TokenData.findOne({ pairAddress });
        
        if (!tokenDoc) return;

  // === NEW VALIDATION ===
        const isValidToken = config.monitoredTokens.some(
            t => t.address.toLowerCase() === tokenDoc.targetTokenAddress.toLowerCase()
        );
        if (!isValidToken) {
            console.warn(`Skipping invalid token: ${tokenDoc.targetTokenSymbol}`);
            return;
        }
        if (tokenDoc) {
            // Ensure the signal has a timestamp, add current if not present
            const signalToStore = { ...signal, timestamp: signal.timestamp || Date.now() };
            tokenDoc.signalHistory.push(signalToStore);

            if (tokenDoc.signalHistory.length > SignalHistoryLength) {
                tokenDoc.signalHistory.shift(); // Remove the oldest entry
            }
            tokenDoc.lastUpdated = Date.now();
            await tokenDoc.save();
            console.log(`Signal history updated for ${pairAddress}`);
        } else {
            console.warn(`Token data not found for ${pairAddress}. Signal history not updated.`);
        }
    } catch (error) {
        console.error(`Error updating signal history for ${pairAddress}:`, error);
    }
}

export async function getSignalHistory(pairAddress) {
    try {
        const tokenDoc = await TokenData.findOne({ pairAddress }, { signalHistory: 1 });
        return tokenDoc ? tokenDoc.signalHistory : [];
    } catch (error) {
        console.error(`Error fetching signal history for ${pairAddress}:`, error);
        return [];
    }
}

