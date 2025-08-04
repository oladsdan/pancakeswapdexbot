import mongoose from 'mongoose';

const tokenDataSchema = new mongoose.Schema({
    // Dexscreener's unique pair address (e.g., from PancakeSwap V2 pool)
    pairAddress: { type: String, required: true, unique: true },
    chainId: { type: String, required: true }, // e.g., 'bsc'

    // Metadata about the pair and its base/quote tokens
    baseTokenAddress: { type: String, required: true }, // e.g., BUSD address
    baseTokenSymbol: { type: String, required: true },
    targetTokenAddress: { type: String, required: true }, // The token we are monitoring
    targetTokenSymbol: { type: String, required: true },
    targetTokenName: { type: String, required: true },
    pairName: { type: String, required: true }, // e.g., WBNB/BUSD
    // target_diff_percent:{type: mongoose.Schema.Types.Mixed},
    target_price_usdt:{type: mongoose.Schema.Types.Mixed},

    PriceOfTokenAtPrediction:{type: mongoose.Schema.Types.Mixed},
    currentPrice:{type: mongoose.Schema.Types.Mixed},
    currentVolume:{type: mongoose.Schema.Types.Mixed},
    currentLiquidity:{type: mongoose.Schema.Types.Mixed},



    // Historical data arrays
    priceHistory: [{
        price: Number, // Price in USD (from Dexscreener)
        timestamp: { type: Date, default: Date.now }
    }],
    volumeHistory: [{
        volume: Number, // 24-hour volume in USD (from Dexscreener)
        timestamp: { type: Date, default: Date.now }
    }],
    liquidityHistory: [{
        liquidity: Number, // Total liquidity in USD (from Dexscreener)
        timestamp: { type: Date, default: Date.now }
    }],
    

    latestLstmPrediction: { type: mongoose.Schema.Types.Mixed, default: 'N/A' },
    latestXgboostPrediction: { type: mongoose.Schema.Types.Mixed, default: 'N/A' },
    latestCombinedPrediction: { type: mongoose.Schema.Types.Mixed, default: 'N/A' },
    predictionPredictedTime: { type: String, default: 'N/A' },
    predictionExpiryTime: { type: String, default: 'N/A' },
    
    targetPriceHistory: [{
        predictedPrice: Number,
        targetPrice: Number,
        currentPriceAtPrediction: Number,
        predictionTime: Date,
        expiryTime: Date,
        hitStatus: {
            type: String,
            enum: ['Not Reached', 'Reached', 'Expired'],
            default: 'Not Reached'
        },
        hitTime: Date,
        actualPriceAtExpiry: Number
    }],

    // Add to TokenData.js schema
    predictionAccuracy: {
        pastHits: { type: Number, default: 0 },
        pastTotal: { type: Number, default: 0 },
        currentHits: { type: Number, default: 0 },
        currentTotal: { type: Number, default: 0 },
        lastPredictionTime: { type: Date, default: Date.now },
        lastResetTime: { type: Date, default: Date.now },
        lastRecordedPredictionStart: Date
    },

     // NEW: Historical signals (updated to include predictions)

    signalHistory: [{
        signal: { type: String, enum: ['Buy', 'Sell', 'Hold', 'Error'], required: true },
        currentPrice: Number,
        currentVolume: Number,
        currentLiquidity: Number,
        rsi: String,
        macd: String,
        macdSignal: String,
        macdHistogram: String,
        priceChangeShort: String,
        volumeIncrease: String,
        liquidity: String,
        pumpedRecently: String,
        tpPercentage: mongoose.Schema.Types.Mixed,
        slPercentage: mongoose.Schema.Types.Mixed,
        riskRewardRatio: mongoose.Schema.Types.Mixed,
        takeProfitPrice: mongoose.Schema.Types.Mixed,
        stopLossPrice: mongoose.Schema.Types.Mixed,
        signalDetails: [String],
        lstmPrediction: mongoose.Schema.Types.Mixed, // New field for LSTM prediction
        xgboostPrediction: mongoose.Schema.Types.Mixed, // New field for XGBoost prediction
        combinedPrediction: mongoose.Schema.Types.Mixed, 
        targetPrice: Number,
        predictionWindow: {
            start: Date,
            end: Date
        },
      
        hitStatus: {
            type: String,
            enum: ['Not Reached', 'Reached', 'Expired'],
            default: 'Not Reached'
        },
        hitTime: Date,
        confidenceScore: Number,
        // riskRewardRatio: Number,
        
        timestamp: { type: Date, default: Date.now }
    }],

    lastUpdated: { type: Date, default: Date.now }
});

// Create indexes for efficient querying
tokenDataSchema.index({ pairAddress: 1 });
tokenDataSchema.index({ targetTokenAddress: 1 });
tokenDataSchema.index({ lastUpdated: 1 }); // Useful for sorting/pruning

tokenDataSchema.index({ 'signalHistory.timestamp': -1 }); // Index for sorting signals by time



const TokenData = mongoose.model('TokenData', tokenDataSchema);

export default TokenData;