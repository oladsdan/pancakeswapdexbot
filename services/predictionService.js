import * as  tf from "@tensorflow/tfjs-node";
import * as  dataService from './dataService.js';
import * as monitorService from './monitorService.js';
import TI from 'technicalindicators';
import config from '../config/default.json' assert { type: 'json' };
import { XGBoost } from '@fractal-solutions/xgboost-js'; // Correct import for the new package
import * as fs from 'fs/promises'; // For file system operations (saving/loading)
import * as path from 'path';


// Global variables to store models
let lstmModel = null;
let xgboostModel = null; // This will now hold an instance of @fractal-solutions/xgboost-js

// File paths for saving/loading models
const LSTM_MODEL_PATH = 'file://./models/lstm_model';
const XGBOOST_MODEL_PATH = './models/xgboost_model.json';

// function formatTwoDigits(number) {
//     return number < 10 ? '0' + number : number;
// }

export function getRoundedPredictionTime() {
    const now = new Date(); // Get current time
    const allowedUTCHours = [1, 5, 9, 13, 17, 21];

    let predictedDate = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        now.getUTCHours(),
        now.getUTCMinutes(),
        now.getUTCSeconds(),
        now.getUTCMilliseconds()
    ));

    const currentUTCHour = predictedDate.getUTCHours();

    let targetUTCHour = allowedUTCHours[allowedUTCHours.length - 1]; // Default to 21 UTC (for wrap-around)
    let moveBackOneDay = false;

    // Find the latest allowed hour that is less than or equal to the current UTC hour
    let foundInterval = false;
    for (let i = allowedUTCHours.length - 1; i >= 0; i--) {
        if (currentUTCHour >= allowedUTCHours[i]) {
            targetUTCHour = allowedUTCHours[i];
            foundInterval = true;
            break;
        }
    }

    // If no allowed hour is found (meaning currentUTCHour is earlier than the first allowed hour, e.g., 00:XX UTC)
    // then snap to the last allowed hour of the previous day (21:00 UTC of yesterday).
    if (!foundInterval) {
        targetUTCHour = allowedUTCHours[allowedUTCHours.length - 1]; // This sets it to 21 UTC
        moveBackOneDay = true;
    }

    // Set the predictedDate to the calculated target UTC hour and reset minutes, seconds, milliseconds
    predictedDate.setUTCHours(targetUTCHour, 0, 0, 0);

    // If we determined it should be the previous day's interval
    if (moveBackOneDay) {
        predictedDate.setUTCDate(predictedDate.getUTCDate() - 1);
    }

    // Expiry time is predictedDate + 30 minutes
    const expiryDate = new Date(predictedDate.getTime() + (4 * 60 * 60 * 1000));

    return { predictedDate, expiryDate };
}


export function formatForNigeria(date) {
    if (!(date instanceof Date) || isNaN(date)) {
        return 'N/A'; // Handle invalid date inputs
    }

    const options = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false, // Use 24-hour format
        timeZone: 'Africa/Lagos' // Specify the timezone for WAT (UTC+1)
    };

    const formatter = new Intl.DateTimeFormat('en-GB', options);
    const parts = formatter.formatToParts(date);

    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    const hour = parts.find(p => p.type === 'hour').value;
    const minute = parts.find(p => p.type === 'minute').value;
    const second = parts.find(p => p.type === 'second').value;

    return `${year}.${month}.${day} ${hour}:${minute}:${second}`;
}


// export function formatForNigeria(date) {
//     const options = {
//         timeZone: 'Africa/Lagos',
//         year: 'numeric',
//         month: '2-digit',
//         day: '2-digit',
//         hour: '2-digit',
//         minute: '2-digit',
//         second: '2-digit',
//         hour12: false,
//     };
//     const parts = new Intl.DateTimeFormat('en-GB', options).formatToParts(date);
//     const get = (type) => parts.find(p => p.type === type)?.value;

//     return `${get('year')}.${get('month')}.${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
// }


// A function to create the Lstm Dataset
// function createLstmDataset(priceHistory, lookback = config.lstmLookbackPeriod) {
//     const prices = priceHistory.map(d => d.price);
//     const minPrice = Math.min(...prices);
//     const maxPrice = Math.max(...prices);
//     const scaledPrices = prices.map(p => (p - minPrice) / (maxPrice - minPrice));
    
//     const X = []; // Features (sequences)
//     const y = []; // Labels (next price)
//     const stepsAhead = 80 ; // 4 hours

    
//       for (let i = 0; i < scaledPrices.length - lookback - stepsAhead; i++) {
//         X.push(scaledPrices.slice(i, i + lookback));
//         y.push(scaledPrices[i + lookback + stepsAhead]);
//     }

   
//      if (X.length === 0) {
//         return { X: tf.tensor([], [0, lookback, 1]), y: tf.tensor([], [0, 1]), minPrice, maxPrice };
//     }


//     const X_tensor = tf.tensor2d(X).reshape([-1, lookback, 1]);
//     const y_tensor = tf.tensor2d(y, [y.length, 1]);

    
//     return { X: X_tensor, y: y_tensor, minPrice, maxPrice };
// }


// function prepareXgboostData(priceHistory) {
//     const prices = priceHistory.map(d => d.price);
//     const minPrice = Math.min(...prices);
//     const maxPrice = Math.max(...prices);
//     const enrichedData = priceHistory.map(d => ({ ...d }));

//     const rsiPeriod = config.indicatorPeriodRSI;
//     if (prices.length >= rsiPeriod) {
//         const rsiValues = TI.RSI.calculate({ values: prices, period: rsiPeriod });
//         for (let i = 0; i < rsiValues.length; i++) {
//             enrichedData[i + rsiPeriod - 1].rsi = rsiValues[i];
//         }
//     }

//     if (prices.length >= config.macdSlowPeriod) {
//         const macdResults = TI.MACD.calculate({
//             values: prices,
//             fastPeriod: config.macdFastPeriod,
//             slowPeriod: config.macdSlowPeriod,
//             signalPeriod: config.macdSignalPeriod
//         });
//         for (let i = 0; i < macdResults.length; i++) {
//             enrichedData[i + config.macdSlowPeriod - 1].macd = macdResults[i].MACD;
//             enrichedData[i + config.macdSlowPeriod - 1].macdSignal = macdResults[i].signal;
//             enrichedData[i + config.macdSlowPeriod - 1].macdHistogram = macdResults[i].histogram;
//         }
//     }

//     const minRequiredIndicatorLength = Math.max(rsiPeriod, config.macdSlowPeriod);
//     const filteredData = enrichedData.slice(minRequiredIndicatorLength - 1).filter(d =>
//         d.rsi !== undefined && d.macd !== undefined && d.macdSignal !== undefined
//     );

//     const features = [];
//     const labels = [];
//     const stepsAhead = 80;

//     for (let i = 0; i < filteredData.length - stepsAhead; i++) {
//         const currentData = filteredData[i];
//         const nextPrice = filteredData[i + stepsAhead].price;

//         if (typeof currentData.rsi === 'number' && typeof currentData.macd === 'number' && typeof currentData.macdSignal === 'number') {
//             features.push([
//                 currentData.rsi,
//                 currentData.macd,
//                 currentData.macdSignal
//             ]);
//             // labels.push(nextPrice);
//             // Scale the label (price)
//             const scaledLabel = (nextPrice - minPrice) / (maxPrice - minPrice);
//             labels.push(scaledLabel);
//         }
//     }
    

//     // return {
//     //     enrichedData: filteredData,
//     //     X: features,
//     //     y: labels
//     // };
//     return {
//         enrichedData: filteredData,
//         X: features,
//         y: labels,
//         minPrice,
//         maxPrice
//     };
// }


function createLstmDataset(priceHistory, lookback = config.lstmLookbackPeriod) {
    const prices = priceHistory.map(d => d.price);
    const timestamps = priceHistory.map(d => new Date(d.timestamp).getTime());
    const fourHoursMs = 4 * 60 * 60 * 1000;

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const scaledPrices = prices.map(p => (p - minPrice) / (maxPrice - minPrice));

    const X = [];
    const y = [];

    for (let i = 0; i < scaledPrices.length - lookback - 1; i++) {
        const sequence = scaledPrices.slice(i, i + lookback);
        const sequenceTime = timestamps[i + lookback - 1]; // End of input window

        // Find the point closest to 4 hours ahead
        let j = i + lookback;
        while (j < timestamps.length && (timestamps[j] - sequenceTime) < fourHoursMs) {
            j++;
        }

        if (j >= scaledPrices.length) continue;

        const target = scaledPrices[j];

        X.push(sequence);
        y.push(target);
    }

    if (X.length === 0) {
        return {
            X: tf.tensor([], [0, lookback, 1]),
            y: tf.tensor([], [0, 1]),
            minPrice,
            maxPrice
        };
    }

    const X_tensor = tf.tensor2d(X).reshape([-1, lookback, 1]);
    const y_tensor = tf.tensor2d(y, [y.length, 1]);

    return {
        X: X_tensor,
        y: y_tensor,
        minPrice,
        maxPrice
    };
}



function prepareXgboostData(priceHistory) {
    const prices = priceHistory.map(d => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    const enrichedData = priceHistory.map(d => ({ ...d }));

    const rsiPeriod = config.indicatorPeriodRSI;
    const macdFast = config.macdFastPeriod;
    const macdSlow = config.macdSlowPeriod;
    const macdSignal = config.macdSignalPeriod;

    if (prices.length >= rsiPeriod) {
        const rsiValues = TI.RSI.calculate({ values: prices, period: rsiPeriod });
        for (let i = 0; i < rsiValues.length; i++) {
            enrichedData[i + rsiPeriod - 1].rsi = rsiValues[i];
        }
    }

    if (prices.length >= macdSlow) {
        const macdResults = TI.MACD.calculate({
            values: prices,
            fastPeriod: macdFast,
            slowPeriod: macdSlow,
            signalPeriod: macdSignal,
        });
        for (let i = 0; i < macdResults.length; i++) {
            enrichedData[i + macdSlow - 1].macd = macdResults[i].MACD;
            enrichedData[i + macdSlow - 1].macdSignal = macdResults[i].signal;
            enrichedData[i + macdSlow - 1].macdHistogram = macdResults[i].histogram;
        }
    }

    const filteredData = enrichedData.filter(d =>
        d.rsi !== undefined && d.macd !== undefined && d.macdSignal !== undefined
    );

    const features = [];
    const labels = [];
    const fourHoursMs = 4 * 60 * 60 * 1000;

    for (let i = 0; i < filteredData.length - 1; i++) {
        const current = filteredData[i];
        const currentTime = new Date(current.timestamp).getTime();

        // Find the index of the price 4 hours later
        let j = i + 1;
        while (j < filteredData.length) {
            const futureTime = new Date(filteredData[j].timestamp).getTime();
            if (futureTime - currentTime >= fourHoursMs) break;
            j++;
        }

        if (j >= filteredData.length) continue; // No valid future point

        const futurePrice = filteredData[j].price;

        features.push([
            current.rsi,
            current.macd,
            current.macdSignal
        ]);

        const scaledLabel = (futurePrice - minPrice) / (maxPrice - minPrice);
        labels.push(scaledLabel);
    }

    return {
        enrichedData: filteredData,
        X: features,
        y: labels,
        minPrice,
        maxPrice
    };
}




// Function to build the LSTM model
function buildLstmModel(lookback) {
    const model = tf.sequential();
    model.add(tf.layers.lstm({ inputShape: [lookback, 1], units: 50, activation: 'relu', returnSequences: false }));
    model.add(tf.layers.dense({ units: 1 }));

    model.compile({ optimizer: tf.train.adam(), loss: 'meanSquaredError' });
    return model;
}


// Train the LSTM model (called by retrainModels)
async function _trainLstmModel(X_train, y_train, epochs = config.lstmTrainingEpochs) {
    if (!lstmModel) {
        lstmModel = buildLstmModel(X_train.shape[1]);
    }
    console.log('Starting LSTM model training...');
    await lstmModel.fit(X_train, y_train, {
        epochs: epochs,
        callbacks: {
            onEpochEnd: (epoch, logs) => {
                if (epoch % 10 === 0 || epoch === epochs - 1) {
                    console.log(`LSTM Epoch ${epoch + 1}/${epochs}: Loss = ${logs.loss.toFixed(6)}`);
                }
            }
        }
    });
    console.log('LSTM model training complete.');
}

// Make an LSTM prediction
function predictLstm(inputSequence, minPrice, maxPrice) {
    if (!lstmModel) {
        console.warn('LSTM model not trained or loaded. Cannot make prediction.');
        return null;
    }
    // const inputTensor = tf.tensor2d([inputSequence]).reshape([1, inputSequence.length, 1]);
    // const prediction = lstmModel.predict(inputTensor);
    // return prediction.dataSync()[0];
    const scaledSequence = inputSequence.map(p => (p - minPrice) / (maxPrice - minPrice));
    const inputTensor = tf.tensor2d([scaledSequence]).reshape([1, scaledSequence.length, 1]);
    const prediction = lstmModel.predict(inputTensor);
    const scaledPred = prediction.dataSync()[0];

    return scaledPred * (maxPrice - minPrice) + minPrice;

}

// === XGBoost Model functions (Updated for @fractal-solutions/xgboost-js) ===

async function _trainXgboostModel(X_train, y_train) {
    // Options for @fractal-solutions/xgboost-js
    const options = {
        objective: 'reg:squarederror', // Regression task
        numRounds: 100, // Number of boosting rounds (equivalent to n_estimators)
        learningRate: 0.1,
        maxDepth: 3,
        // Add other parameters as needed, e.g., minChildWeight, subsample, colsampleByTree
    };

    console.log('Starting XGBoost model training...');
    // Instantiate a new model for training
    const newXgboostModel = new XGBoost(options);
    await newXgboostModel.fit(X_train, y_train); // Use .fit() for training

    xgboostModel = newXgboostModel; // Assign the newly trained model to the global variable
    console.log('XGBoost model trained.');
}


function predictXgboost(inputFeatures, minPrice, maxPrice) {
    if (!xgboostModel) {
        console.warn('XGBoost model not trained or loaded. Cannot make prediction.');
        return null;
    }

    // @fractal-solutions/xgboost-js's predictBatch expects a 2D array of features.
    // For a single prediction, wrap the inputFeatures in an array.
    // const prediction = xgboostModel.predictBatch([inputFeatures]);
    // return prediction[0]; // Get the single predicted value from the array
    const scaledPrediction = xgboostModel.predictBatch([inputFeatures])[0];
    return scaledPrediction * (maxPrice - minPrice) + minPrice;
}


// -- Model saving and loading (Updated for @fractal-solutions/xgboost-js) --

export async function saveModels() {
    try {
        // Create models directory if it doesn't exist
        const modelsDir = './models';
        await fs.mkdir(modelsDir, { recursive: true });

        if (lstmModel) {
            await lstmModel.save(LSTM_MODEL_PATH);
            console.log('LSTM model saved.');
        } else {
            console.warn('No LSTM model to save.');
        }

        // Save the XGBoost model
        if (xgboostModel) {
            const modelOptions = {
                objective: 'reg:squarederror',
                numRounds: 100,
                learningRate: 0.1,
                maxDepth: 3,
            };
            await fs.writeFile(XGBOOST_MODEL_PATH, JSON.stringify(modelOptions));
            console.log('XGBoost model options saved (model will be retrained on load).');
        } else {
            console.warn('No XGBoost model to save (or no direct trained state save method).');
        }
    } catch (error) {
        console.error('Error saving models:', error);
    }
}

export async function loadModels() {
    try {
        lstmModel = await tf.loadLayersModel(`${LSTM_MODEL_PATH}/model.json`);
        console.log('LSTM model loaded.');
    } catch (error) {
        console.warn('No saved LSTM model found or error loading:', error.message);
        lstmModel = null;
    }

    try {
        const modelOptionsJson = await fs.readFile(XGBOOST_MODEL_PATH, 'utf8');
        const modelOptions = JSON.parse(modelOptionsJson);
        // For @fractal-solutions/xgboost-js, loading means re-instantiating with options.
        // The actual training will happen in `retrainModels`.
        xgboostModel = new XGBoost(modelOptions);
        console.log('XGBoost model options loaded (model will be retrained on first use or scheduled retraining).');
    } catch (error) {
        console.warn('No saved XGBoost model options found or error loading:', error.message);
        xgboostModel = null;
    }
}


// --- NEW: Scheduled Retraining Function ---
export async function retrainModels() {
    console.log('\n--- Starting scheduled model retraining for all tokens ---');
    try {
        const allTokenPairs = await dataService.getAllPairAddresses(); // Assuming you have this helper in dataService
        if (!allTokenPairs || allTokenPairs.length === 0) {
            console.warn('No token pairs found in DB to retrain models.');
            return;
        }

        // Retrain models for each token (this can be optimized for shared models or faster data loading)
        for (const pairAddress of allTokenPairs) {
            try {
                const priceHistory = await dataService.getPriceHistory(pairAddress);
                console.log("this is pricehistory", priceHistory);
                const minOverallData = Math.max(
                    config.historyRetentionLimit,
                    config.lstmLookbackPeriod + 1,
                    config.macdSlowPeriod + 1,
                    config.indicatorPeriodRSI + 1
                );

                if (!priceHistory || priceHistory.length < minOverallData) {
                    console.warn(`Not enough historical data for ${pairAddress} to retrain models. Skipping.`);
                    continue;
                }

                // Prepare data for LSTM
                const { X: lstmX, y: lstmY } = createLstmDataset(priceHistory);
                if (lstmX.shape[0] > 0) {
                    await _trainLstmModel(lstmX, lstmY);
                } else {
                    console.warn(`Insufficient samples for LSTM training for ${pairAddress}. Skipping LSTM retraining.`);
                }

                // Prepare data for XGBoost
                const { X: xgboostX, y: xgboostY } = prepareXgboostData(priceHistory);
                if (xgboostX.length > 0) {
                    await _trainXgboostModel(xgboostX, xgboostY);
                } else {
                    console.warn(`Insufficient samples for XGBoost training for ${pairAddress}. Skipping XGBoost retraining.`);
                }
            } catch (error) {
                console.error(`Error during retraining for ${pairAddress}:`, error);
            }
        }
        await saveModels(); // Save models after retraining
        console.log('--- Model retraining complete and models saved. ---');

    } catch (error) {
        console.error('Error during overall model retraining process:', error);
    }
}


// --- Main Prediction Function (now inference-only) ---
/**
 * Generates a price prediction using a hybrid LSTM + XGBoost approach.
 * This function now *only* performs inference using loaded models.
 * @param {string} pairAddress - The address of the token pair.
 * @returns {object} An object containing prediction results and details.
 */
// export async function generatePrediction(pairAddress) {
//     let lstmPrediction = null;
//     let xgboostPrediction = null;
//         console.log("generating prediction")

//     try {
//         const priceHistory = await dataService.getPriceHistory(pairAddress);

//         const minOverallData = Math.max(
//             config.historyRetentionLimit,
//             config.lstmLookbackPeriod,
//             config.macdSlowPeriod,
//             config.indicatorPeriodRSI
//         );

//         if (!priceHistory || priceHistory.length < minOverallData) {
//             return { combinedPrediction: null, lstmPrediction: null, xgboostPrediction: null, details: 'Not enough historical data for prediction.' };
//             console.log("skipping prediction,not enougn price history")
//         }

//         // --- LSTM Prediction ---
//         if (lstmModel) {
//             const {minPrice, maxPrice} = createLstmDataset(priceHistory)
//             const latestPriceSequence = priceHistory
//                 .map(d => d.price)
//                 .slice(-config.lstmLookbackPeriod);

//             if (latestPriceSequence.length === config.lstmLookbackPeriod) {
//                 lstmPrediction = predictLstm(latestPriceSequence, minPrice, maxPrice);
//             } else {
//                 console.warn(`Insufficient recent data for LSTM prediction for ${pairAddress}.`);
//             }
//         } else {
//             console.warn(`LSTM model not loaded for ${pairAddress}. Skipping LSTM prediction.`);
//         }


//         // --- XGBoost Prediction ---
//         if (xgboostModel) {
//             const { enrichedData, minPrice, maxPrice} = prepareXgboostData(priceHistory);
//             const lastEnrichedData = enrichedData[enrichedData.length - 1];

//             if (lastEnrichedData && typeof lastEnrichedData.rsi === 'number' && typeof lastEnrichedData.macd === 'number' && typeof lastEnrichedData.macdSignal === 'number') {
//                  const latestXgboostFeatures = [
//                     lastEnrichedData.rsi,
//                     lastEnrichedData.macd,
//                     lastEnrichedData.macdSignal
//                 ];
//                 // predictXgboost expects a 2D array for predictBatch
//                 xgboostPrediction = predictXgboost(latestXgboostFeatures, minPrice, maxPrice);
//             } else {
//                 console.warn(`Insufficient recent features for XGBoost prediction for ${pairAddress}.`);
//             }
//         } else {
//             console.warn(`XGBoost model not loaded for ${pairAddress}. Skipping XGBoost prediction.`);
//         }

//         // --- Combine Predictions ---
//         let combinedPrediction = null;
//         let details = '';

//         if (lstmPrediction !== null && xgboostPrediction !== null) {
//             combinedPrediction = (lstmPrediction + xgboostPrediction) / 2;
//             details = 'Combined prediction from LSTM and XGBoost.';
//         } else if (lstmPrediction !== null) {
//             combinedPrediction = lstmPrediction;
//             details = 'Prediction from LSTM only (XGBoost model not ready or data insufficient).';
//         } else if (xgboostPrediction !== null) {
//             combinedPrediction = xgboostPrediction;
//             details = 'Prediction from XGBoost only (LSTM model not ready or data insufficient).';
//         } else {
//             details = 'No valid predictions could be generated from either model.';
//         }


//        const { predictedDate, expiryDate } = getRoundedPredictionTime();

        
//         const predictedTime = formatForNigeria(predictedDate);
//         const expiryTime = formatForNigeria(expiryDate);



//         //calculate target price (1.6% above current)
//         const currentPrice = priceHistory[priceHistory.length-1].price;
//         console.log("at prediction this is currentprice", currentPrice);
//         const targetPrice = currentPrice * 1.016;
//         // const targetDiffPercent = ((targetPrice / currentPrice - 1) * 100).toFixed(2);

//          // Update monitor with new target
//         monitorService.updateMonitorTarget(
//             pairAddress,
//             targetPrice,
//             predictedTime,
//             expiryTime
//         );

//         console.log("monitorService updated")


//         return {
//             combinedPrediction: combinedPrediction,
//             lstmPrediction: lstmPrediction,
//             xgboostPrediction: xgboostPrediction,
//             details: details,
//             // target_price_usdt:targetPrice.toFixed(5),
//             // target_diff_percent: `+${targetDiffPercent}%`,
//             current_price_usdt: currentPrice,
//             predictedTime: predictedTime,
//             expiryTime: expiryTime
//         };

//     } catch (error) {
//         console.error(`Error generating prediction for ${pairAddress}:`, error);
//         return { combinedPrediction: null, lstmPrediction: null, xgboostPrediction: null, details: `Error generating prediction: ${error.message}`,
//         predictedTime: 'N/A',
//         expiryTime: 'N/A' };
        
//     }
// }

export async function generatePrediction(pairAddress) {
    let lstmPrediction = null;
    let xgboostPrediction = null;

    try {
        const priceHistory = await dataService.getPriceHistory(pairAddress);

        const minRequired = Math.max(
            config.historyRetentionLimit,
            config.lstmLookbackPeriod + 1,
            config.macdSlowPeriod + 1,
            config.indicatorPeriodRSI + 1
        );

        if (!priceHistory || priceHistory.length < minRequired) {
            return {
                combinedPrediction: null,
                lstmPrediction: null,
                xgboostPrediction: null,
                details: 'Not enough historical data for prediction.'
            };
        }

        // === LSTM Prediction ===
        if (lstmModel) {
            const prices = priceHistory.map(d => d.price);
            const timestamps = priceHistory.map(d => new Date(d.timestamp).getTime());
            const lookback = config.lstmLookbackPeriod;
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);

            const latestIndex = prices.length - lookback - 1;
            if (latestIndex >= 0) {
                const inputSeq = prices.slice(latestIndex, latestIndex + lookback);
                const scaled = inputSeq.map(p => (p - minPrice) / (maxPrice - minPrice));
                const inputTensor = tf.tensor2d([scaled]).reshape([1, lookback, 1]);

                const pred = lstmModel.predict(inputTensor);
                const scaledPred = pred.dataSync()[0];
                lstmPrediction = scaledPred * (maxPrice - minPrice) + minPrice;
            }
        }

        // === XGBoost Prediction ===
        if (xgboostModel) {
            const { enrichedData, minPrice, maxPrice } = prepareXgboostData(priceHistory);
            const last = enrichedData[enrichedData.length - 1];
            if (last && last.rsi && last.macd && last.macdSignal) {
                const features = [last.rsi, last.macd, last.macdSignal];
                const scaledPrediction = xgboostModel.predictBatch([features])[0];
                xgboostPrediction = scaledPrediction * (maxPrice - minPrice) + minPrice;
            }
        }

        // --- Combine Predictions ---
        let combinedPrediction = null;
        let details = '';

        if (lstmPrediction !== null && xgboostPrediction !== null) {
            combinedPrediction = (lstmPrediction + xgboostPrediction) / 2;
            details = 'Combined prediction from LSTM and XGBoost.';
        } else if (lstmPrediction !== null) {
            combinedPrediction = lstmPrediction;
            details = 'Prediction from LSTM only (XGBoost model not ready or data insufficient).';
        } else if (xgboostPrediction !== null) {
            combinedPrediction = xgboostPrediction;
            details = 'Prediction from XGBoost only (LSTM model not ready or data insufficient).';
        } else {
            details = 'No valid predictions could be generated from either model.';
        }


        // Target logic
        const { predictedDate, expiryDate } = getRoundedPredictionTime();

        
        const predictedTime = formatForNigeria(predictedDate);
        const expiryTime = formatForNigeria(expiryDate);



        //calculate target price (1.6% above current)
        const tokendoc = await dataService.getTokenData(pairAddress);
        const currentPriceofToken = tokendoc.currentPrice; 
        const currentPrice = priceHistory[priceHistory.length-1].price;
        console.log("at prediction this is currentprice", currentPrice);
        const targetPrice =combinedPrediction * 1.02 ;
        // const targetDiffPercent = ((targetPrice / currentPrice - 1) * 100).toFixed(2);

         // Update monitor with new target
        monitorService.updateMonitorTarget(
            pairAddress,
            targetPrice,
            predictedTime,
            expiryTime
        );

        console.log("monitorService updated")


        return {
            combinedPrediction: targetPrice,
            lstmPrediction: lstmPrediction,
            xgboostPrediction: xgboostPrediction,
            details: details,
            // target_price_usdt:targetPrice.toFixed(5),
            // target_diff_percent: `+${targetDiffPercent}%`,
            current_price_usdt: currentPriceofToken,
            predictedTime: predictedTime,
            expiryTime: expiryTime
        };

    } catch (error) {
        console.error(`❌ Error generating prediction for ${pairAddress}:`, error);
        return {
            combinedPrediction: null,
            lstmPrediction: null,
            xgboostPrediction: null,
            details: `Error: ${error.message}`,
            predictedTime: 'N/A',
            expiryTime: 'N/A'
        };
    }
}

export function hasModelsLoaded() {
    return lstmModel !== null && xgboostModel !== null;
}
