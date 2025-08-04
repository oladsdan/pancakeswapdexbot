// backend/index.js
import express from 'express';
import cors from 'cors';
// import * as marketDataService from './services/marketDataService.js';
// import * as dataService from './services/dataService.js';
// import * as indicatorService from './services/indicatorService.js';
// import * as predictionService from './services/predictionService.js';
// import * as accuracyService from/
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

const content = `
Why Building a DEX Bot is Difficult — and Why That’s Exactly Why It’s Profitable

In the world of centralized exchanges (CEX), trading bots are everywhere. They thrive on structured APIs, order books, and predictable systems. But in the decentralized exchange (DEX) world, it’s a different battlefield. Building a successful DEX bot is like creating a Formula 1 car to race through jungle trails — brutal, complex, but once mastered, almost unbeatable.

Here’s why:

⸻

1. No Central Order Book — You Trade Against Liquidity Pools

In DEXes like Uniswap and PancakeSwap, there are no order books. Trades affect prices directly through liquidity pool formulas (AMMs). A DEX bot must:
	•	Simulate slippage for every trade.
	•	Calculate pool depth impacts.
	•	Predict price shifts from competitor bots.
This is real-time mathematical warfare, not just API fetching.

⸻

2. Speed is Everything — But Blockchains are Slow

On CEX, trades are executed in milliseconds. On DEXes, your bot has to:
	•	Detect arbitrage in seconds.
	•	Submit transactions to the blockchain.
	•	Win the race against other bots before the trade is included in the block.
Gas fees become strategic weapons. Overpay, and profits vanish. Underpay, and your bot loses the race.

⸻

3. The Invisible Battle — MEV, Front-Runners, and Sandwich Attacks

Every profitable transaction becomes a target. Other bots will:
	•	Front-run: Jump ahead by paying higher gas fees.
	•	Sandwich attack: Trap your bot’s trade between two of theirs to drain your profit.
To survive, your bot must be equipped with:
	•	Private transaction relays.
	•	Custom gas bidding strategies.
	•	Advanced mempool monitoring.
This is not coding — it’s defensive engineering at the blockchain level.

⸻

4. Flash Loans — The Double-Edged Sword

Flash loans allow DEX bots to trade with millions in capital, provided the entire sequence is profitable in a single transaction. Powerful? Yes. But it adds complexity:
	•	Every step of the trade must succeed.
	•	If one fails, the entire transaction is reversed.
It’s a zero-margin-for-error environment.

⸻

5. Why This Complexity is an Advantage

The difficulty is the barrier to entry. 99% of traders and developers can’t build DEX bots that survive this environment. Those who do, command:
	•	Unfair access to instant arbitrage profits.
	•	Scalability without holding massive capital (via flash loans).
	•	Market-making dominance in DEX ecosystems.

A successful DEX bot is not just software — it’s a profit machine that operates in a space few can even enter.

⸻

The Opportunity for Investors

Investing in a DEX bot project is investing in:
	•	Early-stage financial infrastructure of DeFi.
	•	Technology that directly captures inefficiencies in real-time.
	•	A battlefield where competition drops off because of sheer complexity.

The path to build it is steep. But once operational, DEX bots generate profits from opportunities invisible to human traders and unreachable to slow bots.

And in DeFi, where the market operates 24/7 without borders, a well-built DEX bot becomes a perpetual profit engine.
`;



// app.get('/api/signals', (req, res) => {
//     // res.json(currentSignals);
//     if (currentSignals.length === 0) {
//         // If no signals but loop is running, implies initial generation is in progress
//         res.status(202).json({ message: "Signals are being generated. Please wait.", status: "generating" });
//     }
//     else {
//         res.json(currentSignals);
//     }
// });

// // Add new API endpoint
// app.get('/api/accuracy-stats', async (req, res) => {
//     try {
//         const stats = await accuracyService.getGlobalAccuracyStats();
//         res.json(stats);
//     } catch (error) {
//         console.error('Error getting accuracy stats:', error);
//         res.status(500).json({ error: 'Failed to get accuracy stats' });
//     }
// });


app.get('/', (req, res) => {
  res.type('text/plain').send(content);
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});