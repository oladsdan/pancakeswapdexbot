import {ethers, formatUnits} from 'ethers';
import ABI from "./contracts/AutomatedTradingBot.json" assert { type: "json" };
import TradeLog from './models/TradeLog.js';
import dotenv from 'dotenv';

dotenv.config();

let provider;
let contract;
const tradeLogs = [];

// const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL);
// const provider = new ethers.WebSocketProvider(process.env.BSC_RPC_SOC);
// const contract = new ethers.Contract(process.env.BOT_CONTRACT, ABI, provider);


async function logToDB(data) {
  try {
    await TradeLog.create(data);
  } catch (err) {
    console.error("❌ Failed to save log to DB:", err.message);
  }
}


async function monitorProvider() {
  try {
    await provider.getBlockNumber();
  } catch (err) {
    console.error("❌ Lost connection to provider:", err.message);
    reconnect();
    return;
  }

  setTimeout(monitorProvider, 10000); // Check every 10s
}

function connectProvider() {
  try {
    provider = new ethers.WebSocketProvider(process.env.BSC_RPC_SOC);
    contract = new ethers.Contract(process.env.BOT_CONTRACT, ABI, provider);

    console.log("🔌 Connected to BSC WebSocket provider");

    setupListeners();
    monitorProvider();

    // const ws = provider._websocket;

    //  ws.on('close', (code) => {
    //   console.warn(`⚠️ WebSocket closed with code ${code}. Reconnecting...`);
    //   reconnect();
    // });

    //  provider.on('disconnect', (code) => {
    //   console.warn(`⚠️ WebSocket closed with code ${code}. Reconnecting...`);
    //   reconnect();
    // });

    // provider.on('error', (err) => {
    //   console.error("❌ WebSocket error:", err.message);
    //   reconnect();
    // });

    //  ws.on('error', (err) => {
    //   console.error("❌ WebSocket error:", err.message);
    //   reconnect();
    // });

  } catch (err) {
    console.error("❌ Failed to connect WebSocket provider:", err.message);
    setTimeout(connectProvider, 3000); // Retry
  }
}


function reconnect() {
  setTimeout(() => {
    console.log("🔁 Reconnecting...");
    connectProvider();
  }, 3000);
}




function setupListeners() {
   contract.removeAllListeners(); // Prevent duplicates on reconnect

  contract.on('TokenBought', async (tokenIn, amountIn, tokenOut, amountOut, event) => {
    const readableIn = formatUnits(amountIn, 18);
    const readableOut = formatUnits(amountOut, 18);
    // tradeLogs.push({
    const logs = {
      type: 'Buy',
      tokenIn,
      amountIn: readableIn,
      tokenOut,
      amountOut: readableOut,
      timestamp: Date.now(),
      txHash: event.log.transactionHash,
    };
    console.log(`🟢 BuyExecuted: ${tokenOut}`);
    await logToDB(logs);
  });

  contract.on('TokenSold', async (tokenIn, amountIn, tokenOut,amountOut, event) => {
    const readableIn = formatUnits(amountIn, 18);
    const readableOut = formatUnits(amountOut, 18);
    const logs ={
      type: 'Sell',
      tokenIn,
      amountIn: readableIn,
      tokenOut,
      amountOut: readableOut,
      timestamp: Date.now(),
      txHash: event.log.transactionHash,
    };
    console.log(`🔴 SellExecuted: ${tokenIn}`);
    await logToDB(logs);
  });

  contract.on('TokenAdded', async (token, name, event) => {
    const logs = {
      type: 'TokenAdded',
      token,
      name,
      timestamp: Date.now(),
      txHash: event.log.transactionHash,
    };
    console.log(`➕ TokenAdded: ${name}`);
    await logToDB(logs);
  });

  contract.on('FundsDeposited', async (token, amount, event) => {
    const readableAmount = formatUnits(amount, 18)
    tradeLogs.push({
      type: 'Deposit',
      token,
      amount: readableAmount,
      timestamp: Date.now(),
      txHash: event.transactionHash,
    });
    console.log(`💰 DepositMade: ${readableAmount}`);
    await logToDB(logs);
  });
  
  contract.on('FundsWithdrawn', async (token, amount, event) => {
    const readableAmount = formatUnits(amount, 18)
    const logs ={
      type: 'Withdrawn',
      token,
      amount: readableAmount,
      timestamp: Date.now(),
      txHash: event.log.transactionHash,
    };
    console.log(`💰 WithdrawnMade: ${readableAmount}`);
    await logToDB(logs);
  });

  console.log("✅ Event listeners initialized.");
}

function listenToEvents() {
  connectProvider();
}
// function getLogs() {
//   return tradeLogs.slice(-50).reverse();
// }

async function getLogs() {
  return await TradeLog.find().sort({ timestamp: -1 }).limit(50).lean();
}


export { listenToEvents, getLogs };