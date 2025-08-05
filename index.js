// backend/index.js
import express from 'express';
import cors from 'cors';
import { getLogs, listenToEvents } from './eventListener.js';
import { connectDB } from './models/ConnectDb.js';
import axios from 'axios';


const app = express();
const PORT = process.env.PORT;



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

app.use(cors());
app.use(express.json());

const signals = "https://bot.securearbitrage.com/api/signals";

const content = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>DEX Bot Mechanics</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      background-color: #000000ff;
      color: #ffffff;
    }

    ul {
      padding-left: 20px;
      margin-top: 0.5rem;
      margin-bottom: 0.5rem;
    }
  </style>
</head>
<body>
 <h2><strong>Why Building a DEX Bot is Difficult — and Why That’s Exactly Why It’s Profitable</strong></h2>

<p>In the world of centralized exchanges (CEX), trading bots are everywhere. They thrive on structured APIs, order books, and predictable systems. But in the decentralized exchange (DEX) world, it’s a different battlefield. Building a successful DEX bot is like creating a Formula 1 car to race through jungle trails — brutal, complex, but once mastered, almost unbeatable.</p>

<p>Here’s why:</p>

<hr>

<h3>1. No Central Order Book — You Trade Against Liquidity Pools</h3>
<p>In DEXes like Uniswap and PancakeSwap, there are no order books. Trades affect prices directly through liquidity pool formulas (AMMs). A DEX bot must:</p>
<ul>
  <li>Simulate slippage for every trade.</li>
  <li>Calculate pool depth impacts.</li>
  <li>Predict price shifts from competitor bots.</li>
</ul>
<p>This is real-time mathematical warfare, not just API fetching.</p>

<hr>

<h3>2. Speed is Everything — But Blockchains are Slow</h3>
<p>On CEX, trades are executed in milliseconds. On DEXes, your bot has to:</p>
<ul>
  <li>Detect arbitrage in seconds.</li>
  <li>Submit transactions to the blockchain.</li>
  <li>Win the race against other bots before the trade is included in the block.</li>
</ul>
<p>Gas fees become strategic weapons. Overpay, and profits vanish. Underpay, and your bot loses the race.</p>

<hr>

<h3>3. The Invisible Battle — MEV, Front-Runners, and Sandwich Attacks</h3>
<p>Every profitable transaction becomes a target. Other bots will:</p>
<ul>
  <li>Front-run: Jump ahead by paying higher gas fees.</li>
  <li>Sandwich attack: Trap your bot’s trade between two of theirs to drain your profit.</li>
</ul>
<p>To survive, your bot must be equipped with:</p>
<ul>
  <li>Private transaction relays.</li>
  <li>Custom gas bidding strategies.</li>
  <li>Advanced mempool monitoring.</li>
</ul>
<p>This is not coding — it’s defensive engineering at the blockchain level.</p>

<hr>

<h3>4. Flash Loans — The Double-Edged Sword</h3>
<p>Flash loans allow DEX bots to trade with millions in capital, provided the entire sequence is profitable in a single transaction. Powerful? Yes. But it adds complexity:</p>
<ul>
  <li>Every step of the trade must succeed.</li>
  <li>If one fails, the entire transaction is reversed.</li>
</ul>
<p>It’s a zero-margin-for-error environment.</p>

<hr>

<h3>5. Why This Complexity is an Advantage</h3>
<p>The difficulty is the barrier to entry. 99% of traders and developers can’t build DEX bots that survive this environment. Those who do, command:</p>
<ul>
  <li>Unfair access to instant arbitrage profits.</li>
  <li>Scalability without holding massive capital (via flash loans).</li>
  <li>Market-making dominance in DEX ecosystems.</li>
</ul>
<p>A successful DEX bot is not just software — it’s a profit machine that operates in a space few can even enter.</p>

<hr>

<h3>The Opportunity for Investors</h3>
<p>Investing in a DEX bot project is investing in:</p>
<ul>
  <li>Early-stage financial infrastructure of DeFi.</li>
  <li>Technology that directly captures inefficiencies in real-time.</li>
  <li>A battlefield where competition drops off because of sheer complexity.</li>
</ul>

<p>The path to build it is steep. But once operational, DEX bots generate profits from opportunities invisible to human traders and unreachable to slow bots.</p>

<p>And in DeFi, where the market operates 24/7 without borders, a well-built DEX bot becomes a perpetual profit engine.</p>
</body>
</html>

`;



app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(content);
});

// app.get('/apis/signals', (req, res) => {
//    const currentSignals =axios.get(signals);
//     res.json(currentSignals);

// });

app.get('/apis/signals', async (req, res) => {
  try {
    const response = await axios.get(signals);
    res.json(response.data);
  } catch (err) {
    console.error("❌ Failed to fetch signals:", err.message);
    res.status(500).json({ error: "Failed to fetch signals" });
  }
});

app.get('/apis/contract-status', async (req, res) => {
  try {
    const logs = await getLogs(); // ✅ wait for logs
    res.json(logs);
  } catch (err) {
    console.error("❌ Failed to fetch logs:", err.message);
    res.status(500).json({ error: "Failed to fetch trade logs" });
  }

});

(async () => {
  try {
    await connectDB();               // connect MongoDB
    listenToEvents();                 // start listening to contract events

    app.listen(PORT || 5001, () => {
      console.log(`🚀 API running on port ${PORT || 5001}`);
    });
  } catch (err) {
    console.error("❌ Failed to start app:", err.message);
    process.exit(1); // Exit process on startup failure
  }
})();

// app.listen(PORT, () => {
//   console.log(`Server is running at http://localhost:${PORT}`);
// });