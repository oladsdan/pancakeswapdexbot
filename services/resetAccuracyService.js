import mongoose from 'mongoose';
import TokenData from '../models/TokenData.js';
// import { mongoUri } from './config.js'; // Make sure you have your MongoDB URI here

async function resetAccuracy() {
    try {
        await mongoose.connect("mongodb://localhost:27017/secure_bot", {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ Connected to MongoDB');

        const allPairs = await TokenData.find({});
        if (!allPairs.length) {
            console.warn('⚠️ No token data found.');
            return;
        }

        for (const token of allPairs) {
            if (!token.predictionAccuracy) {
                token.predictionAccuracy = {
                    pastHits: 0,
                    pastTotal: 0,
                    currentHits: 0,
                    currentTotal: 0,
                    lastPredictionTime: new Date(),
                    lastResetTime: new Date()
                };
            }

            token.predictionAccuracy.pastHits = 0
            token.predictionAccuracy.pastTotal = 0

            token.predictionAccuracy.currentHits = 0;
            token.predictionAccuracy.currentTotal = 0;
            token.predictionAccuracy.lastResetTime = new Date();

            await token.save();
        }

        console.log(`✅ Reset accuracy for ${allPairs.length} tokens.`);
    } catch (err) {
        console.error('❌ Error resetting accuracy:', err);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
    }
}

resetAccuracy();
