import mongoose from "mongoose";


const tradeLogSchema = new mongoose.Schema({
  type: { type: String, enum: ["Buy", "Sell", "Deposit", "Withdrawn", "TokenAdded"], required: true },
  tokenIn: String,
  tokenOut: String,
  token: String,
  name: String,
  amountIn: String,
  amountOut: String,
  amount: String,
  txHash: { type: String, required: true, index: true },
  timestamp: { type: Number, default: Date.now }
});


export default mongoose.model("TradeLog", tradeLogSchema);