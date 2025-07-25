// backend/index.js
import express from 'express';
import cors from 'cors';
import * as marketDataService from './services/marketDataService.js';
import * as dataService from './services/dataService.js';
import * as indicatorService from './services/indicatorService.js';
import * as predictionService from './services/predictionService.js';
import * as accuracyService from './services/accuracyService.js';
import * as monitorService from './services/monitorService.js';
import config from './config/default.json' assert { type: 'json' };

const app = express();
const PORT = process.env.PORT || config.apiPort;



// Middleware

const allowedOrigins = [
    'http://localhost:5173', // For your local frontend development
    'http://localhost:3000', // If your frontend runs on 3000 for some reason
    'https://pancakeswapfront.vercel.app',
    "https://pancakeswap-signal.vercel.app",
    "https://signals.securearbitrage.com",

];

const productionFrontendUrl = process.env.FRONTEND_VERCEL_URL;
if (productionFrontendUrl) {
    allowedOrigins.push(productionFrontendUrl);
}

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        // or if the origin is in our allowed list.
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Specify allowed methods
    credentials: true, // If you're sending cookies or authorization headers
    optionsSuccessStatus: 204 // Some legacy browsers (IE11, various SmartTVs) choke on 200
};

app.use(cors(corsOptions));
app.use(express.json());

let currentSignals = [];

function calculateTimeUntilNextPredictionRun() {
    const now = new Date();
    const allowedUTCHours = [1, 5, 9, 13, 17, 21];

    // Create a Date object representing the next potential run time, starting from the current UTC day
    let nextRunTargetDate = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0, 0, 0, 0 // Start of current UTC day at midnight
    ));

    let foundNextHourToday = false;
    // Iterate through allowed hours to find the first one that is in the future relative to 'now'
    for (const hour of allowedUTCHours) {
        nextRunTargetDate.setUTCHours(hour); // Set to this allowed hour on the current day

        if (nextRunTargetDate.getTime() > now.getTime()) {
            foundNextHourToday = true;
            break;
        }
    }

    if (!foundNextHourToday) {
        nextRunTargetDate.setUTCDate(now.getUTCDate() + 1); // Move to next calendar day
        nextRunTargetDate.setUTCHours(allowedUTCHours[0]); // Set to the first allowed hour (01:00 UTC)
    }

    // Calculate the difference in milliseconds
    const timeUntilNext = nextRunTargetDate.getTime() - now.getTime();

    const MIN_DELAY_MS = 1000; // 1 second minimum delay
    return Math.max(MIN_DELAY_MS, timeUntilNext);
}




async function predictionGenerationLoop() {
   console.log(`\n--- [${new Date().toISOString()}] Starting Prediction Generation Loop ---`);

    // Get all unique pair addresses that have been initialized and have data in the database
    const allPairAddresses = await dataService.getAllPairAddresses();

    if (allPairAddresses.length === 0) {
        console.log("No token pair addresses found in the database for prediction generation. Skipping.");
        return;
    }

    for (const pairAddress of allPairAddresses) {
        try {
            // The predictionService.generatePrediction should internally fetch
            // the necessary historical data from the database using the pairAddress.
            console.log(`Generating prediction for pair address: ${pairAddress}...`);
            const predictionResults = await predictionService.generatePrediction(pairAddress);
            // console.log(predictionResults);

            // Store the newly generated prediction data in the database
            await dataService.updatePredictionData(pairAddress, predictionResults);

        } catch (error) {
            console.error(`Error generating prediction for pair address ${pairAddress}:`, error);
        }
    }
    console.log(`--- Prediction Generation Loop Finished ---`);
}
async function schedulePredictionLoop() {
    await predictionGenerationLoop(); // Execute the prediction logic now

    const timeToWait = calculateTimeUntilNextPredictionRun();
    const minutesToWait = Math.round(timeToWait / 1000 / 60); // Convert to minutes for logging
    console.log(`Next prediction generation scheduled in approximately ${minutesToWait} minutes.`);

    setTimeout(schedulePredictionLoop, timeToWait); // Schedule the next execution
}


async function signalGenerationLoop() {
    console.log(`\n--- [${new Date().toISOString()}] Starting Signal Generation Loop (Inference Only) ---`);
    const allSignals = [];
    const seenSymbols = new Set();

    function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
    }

    for (const tokenConfig of config.monitoredTokens) {

        const tokenSymbol = tokenConfig.symbol.toUpperCase();
        if (seenSymbols.has(tokenSymbol)) {
            console.log(`[Skip Duplicate] Already processed ${tokenSymbol}, skipping...`);
            continue;
        }
        seenSymbols.add(tokenSymbol);


        let signalResult = {
            signal: "Hold",
            pairName: tokenConfig.symbol,
            pairAddress: tokenConfig.address,
            currentPrice: 'N/A',
            currentVolume: 'N/A',
            currentLiquidity: 'N/A',
            rsi: 'N/A',
            macd: 'N/A',
            macdSignal: 'N/A',
            macdHistogram: 'N/A',
            priceChangeShort: 'N/A',
            volumeIncrease: 'N/A',
            liquidity: 'N/A',
            pumpedRecently: 'N/A',
            signalUpdate: { time: 'N/A', price: 'N/A' },
            timeTakenFor1_6_percent: 'N/A',
            signalDetails: [],
            lstmPrediction: 'N/A',
            xgboostPrediction: 'N/A',
            combinedPrediction: 'N/A',
            predictedTime: 'N/A',
            expiryTime: 'N/A'
        };

        try {
            const marketData = await marketDataService.getMarketData(tokenConfig);

            if (!marketData) {
                console.warn(`No market data found for ${tokenConfig.symbol}. Skipping signal generation.`);
                signalResult.signal = "Error";
                signalResult.signalDetails.push(`No market data found.`);
                allSignals.push(signalResult);
                continue;
            }

            const { pairAddress, chainId, baseToken, quoteToken, pairName, currentPrice, currentVolume, currentLiquidity, historicalPrices } = marketData;

           
             await dataService.initializeTokenData({
                pairAddress,
                chainId: "bsc",
                baseToken: { address: baseToken.address, symbol: baseToken.symbol },
                quoteToken,
                pairName,
                targetTokenAddress: tokenConfig.address,
                targetTokenSymbol: tokenConfig.symbol,
                targetTokenName: tokenConfig.name,
            });
            
            // 3. Store current market data historically in MongoDB
            await dataService.updateMarketData(pairAddress, currentPrice, currentVolume, currentLiquidity, historicalPrices);

            if (currentPrice !== null && !isNaN(currentPrice)) {
                signalResult.signalUpdate = {
                    time: new Date().toISOString(), // Current timestamp
                    price: parseFloat(signalResult.currentPrice) // Use the formatted price
                };
            }

            // Generate combined signal based on current and historical data from DB
            signalResult = await indicatorService.generateCombinedSignal(
                pairAddress,
                currentPrice, // Pass the number directly
                currentVolume, // Pass the number directly
                currentLiquidity, // Pass the number directly
                pairName
            );


            // Fetch the latest prediction results from the database
            const tokenDocWithPrediction = await dataService.getTokenData(pairAddress);


            // Call the prediction service for INFERENCE ONLY
            // const predictionResults = await predictionService.generatePrediction(pairAddress);

            if(tokenDocWithPrediction){

                // console.log("this is tokenwithprediction",tokenDocWithPrediction)

                signalResult.lstmPrediction = tokenDocWithPrediction.latestLstmPrediction  !== null ? tokenDocWithPrediction.latestLstmPrediction.toFixed(8) : 'N/A';
                signalResult.xgboostPrediction = tokenDocWithPrediction.latestXgboostPrediction  !== null ? tokenDocWithPrediction.latestXgboostPrediction.toFixed(8) : 'N/A';
                signalResult.combinedPrediction = tokenDocWithPrediction.latestCombinedPrediction  !== null ? tokenDocWithPrediction.latestCombinedPrediction.toFixed(8) : 'N/A';
                //then we pass the time
                signalResult.predictedTime = tokenDocWithPrediction.predictionPredictedTime
                signalResult.expiryTime = tokenDocWithPrediction.predictionExpiryTime
               if (tokenDocWithPrediction.latestCombinedPrediction !== null && !isNaN(tokenDocWithPrediction.latestCombinedPrediction)) {
                    signalResult.signalDetails.push(`Prediction Status: Prediction available from ${signalResult.predictedTime}.`);
                } else {
                    signalResult.signalDetails.push(`Prediction Status: No recent prediction available.`);
                }
                
                // signalResult.target_diff_percent = tokenDocWithPrediction.target_diff_percent;
                signalResult.target_price_usdt = tokenDocWithPrediction.target_price_usdt;
                signalResult.currentPriceAtPredicition = tokenDocWithPrediction.PriceOfTokenAtPrediction;
                
            } else {
                 signalResult.signalDetails.push(`Prediction Status: No token document found for prediction.`);
            }

            
            // Add predictions to the signalResult

            // signalResult.predictedTime = predictionResults.predictedTime;
            // signalResult.expiryTime = predictionResults.expiryTime;
            // if (signalResult.lstmPrediction !== null && signalResult.lstmPrediction !== 'N/A' ||
            //         signalResult.combinedPrediction !== null && signalResult.combinedPrediction !== 'N/A') {
            //         signalResult.predictedTime = predictionResults.predictedTime;
            //         signalResult.expiryTime = predictionResults.expiryTime;
            // }else{
            //     signalResult.predictedTime = 'N/A';
            //     signalResult.expiryTime =  'N/A';
            // }
                // if (
                //         signalResult.lstmPrediction !== 'N/A' &&
                //         signalResult.lstmPrediction !== 'NaN' ||
                //         signalResult.combinedPrediction !== 'N/A' &&
                //         signalResult.combinedPrediction !== 'NaN'
                //     ) {
                //         signalResult.predictedTime = predictionResults.predictedTime;
                //         signalResult.expiryTime = predictionResults.expiryTime;
                //     } else {
                //         signalResult.predictedTime = 'N/A';
                //         signalResult.expiryTime = 'N/A';
                //

                signalResult.pairAddress = tokenConfig.address;
                // console.log(signalResult);

            allSignals.push(signalResult);
            await dataService.updateSignalHistory(pairAddress, signalResult);

        } catch (error) {
            console.error(`Error processing ${tokenConfig.symbol}:`, error);
            signalResult.signal = "Error";
            signalResult.signalDetails.push(`An unexpected error occurred: ${error.message}`);
            allSignals.push(signalResult);
        }

        await delay(300);
    }

    currentSignals = allSignals;
    console.log(`--- Signal Generation Loop Finished. ${allSignals.length} signals processed. ---`);
    console.log("signal completed", currentSignals.length)
}

// API Endpoint
app.get('/api/signals', (req, res) => {
    // res.json(currentSignals);
    if (currentSignals.length === 0) {
        // If no signals but loop is running, implies initial generation is in progress
        res.status(202).json({ message: "Signals are being generated. Please wait.", status: "generating" });
    }
    else {
        res.json(currentSignals);
    }
});

// Add new API endpoint
app.get('/api/accuracy-stats', async (req, res) => {
    try {
        const stats = await accuracyService.getGlobalAccuracyStats();
        res.json(stats);
    } catch (error) {
        console.error('Error getting accuracy stats:', error);
        res.status(500).json({ error: 'Failed to get accuracy stats' });
    }
});

async function startSignalGeneratorAndApi() {
    console.log('Starting signal generator and API server...');

    // 1. Initial database connection (keep this awaited)
    await dataService.connectDb();
    // await dataService.cleanupInvalidTokens()

    // 2. Start Express API server first, so it's immediately available
    app.listen(PORT, () => {
        console.log(`API Server listening on port ${PORT}`);
        console.log(`Access signals at http://localhost:${PORT}/api/signals`);
        console.log(`Remember to also start your React frontend in a separate terminal`);
    }).on('error', (err) => {
        console.error('Failed to start API server:', err.message);
        if (err.code === 'EADDRINUSE') {
            console.error(`Port ${PORT} is already in use. Please close the other application or choose a different port.`);
        }
        process.exit(1); // Exit if server cannot start
    });

    // 3. Load prediction models (keep this awaited)
    await predictionService.loadModels();

    // 4. Initial training for models if they were not loaded (e.g., first run)
    // Add a slight delay to ensure DB is fully ready and initial data might be fetched.
    setTimeout(async () => {
        if (!predictionService.hasModelsLoaded()) {
            console.log("Models not loaded at startup, performing initial training...");
            await predictionService.retrainModels(); // Initial training after a delay
        }
        schedulePredictionLoop(); // Call the updated prediction loop
    }, config.initialModelTrainingDelayMs || 5000); // Default to 5 seconds if not in config

    // 5. Schedule periodic model retraining
    setInterval(predictionService.retrainModels, config.modelRetrainIntervalMs);


     // Schedule the new prediction generation loop to run every hour
    // Make sure 'predictionRetrainIntervalMs' is defined in your config/default.json
    // setInterval(predictionGenerationLoop, config.modelRetrainIntervalMs || 14400000); // Default to 4 hour if not set


    setInterval(() => {
        monitorService.checkPriceHits();
    }, 60000); // Check every minute

    // Schedule cleanup (e.g., in index.js)
    setInterval(() => {
        monitorService.cleanupExpiredMonitors();
    }, 3600000);

    //this rotates every4hours
    setInterval(accuracyService.rotateAccuracyPeriods, 4 * 60 * 60 * 1000);


    // 6. Initiate the first signal generation loop.
    // Do NOT await this call. Let it run in the background.
    console.log('Initiating first signal generation. Signals will be available soon...');
    signalGenerationLoop();

    // 7. Schedule subsequent signal generation runs
    setInterval(signalGenerationLoop, config.refreshIntervalMs);
}

startSignalGeneratorAndApi();