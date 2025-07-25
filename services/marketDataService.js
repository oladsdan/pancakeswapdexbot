import { request, gql } from 'graphql-request';
import axios from 'axios';
import config from '../config/default.json' assert { type: 'json' };
// import Moralis from 'moralis'; // Still imported, but its price use is now strictly dependent on Alchemy success

// Dexscreener Config
// const DEXSCREENER_API_SEARCH_BASE_URL = config.dexscreenerApiSearchBaseUrl;
// New Dexscreener endpoint for token pairs by address
const DEXSCREENER_TOKEN_PAIRS_BASE_URL = `https://api.dexscreener.com/token-pairs/v1/bsc`;

// Alchemy Config
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY; // Ensure you set this in your environment variables
const ALCHEMY_PRICES_BASE_URL = "https://api.g.alchemy.com/prices/v1";
// New: Alchemy Historical Prices Endpoint
const ALCHEMY_HISTORICAL_PRICES_BASE_URL = "https://api.g.alchemy.com/prices/v1";

const quoteSymbol = config.preferredQuoteTokenSymbols.map(s => s.toUpperCase());

const THEGRAPH_API_KEY = process.env.SUBGRAPH_API_KEY; // Ensure you set this in your environment variables
const PANCAKESWAP_V3_SUBGRAPH_URL = 'https://gateway.thegraph.com/api/subgraphs/id/Hv1GncLY5docZoGtXjo4kwbTvxm3MAhVZqBZE4sUT9eZ';

const SUBGRAPH_HEADERS = {
    'Authorization': `Bearer ${THEGRAPH_API_KEY}`,
};

const QUOTE_TOKEN_ADDRESSES = Object.values(config.quoteTokenMap).map(address => address.toLowerCase());
// Use config for historical data days
// const HISTORICAL_DATA_DAYS = config.historicalDataDays;
const HISTORICAL_DATA_DAYS =60;




// Utility function for safe float parsing
function safeParseFloat(value) {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
}

// GraphQL query for PancakeSwap V3 Subgraph to get volume and liquidity
const GET_PAIR_DATA_QUERY = gql`
    query GetPairData($pairAddress: ID!) {
        pool(id: $pairAddress) {
            totalValueLockedUSD
            volumeUSD
        }
    }
`;

// fetches data from alchemy den proceed to dexscreener
export async function getMarketData(tokenConfig) {
    const { address: targetTokenAddress, symbol: targetTokenSymbol, name: targetTokenName } = tokenConfig;
    const lowerCaseTokenAddress = targetTokenAddress.toLowerCase();

    let currentPriceFinal = null;
    let currentVolumeFinal = null;
    let currentLiquidityFinal = null;
    let fetchedPairDetails = null; // To store essential pair info from Dexscreener
    let historicalPrices = []; // Initialize historical prices array

    // Map chainId for Alchemy (e.g., 'bsc' to 'bnb-mainnet')
    const alchemyNetwork = config.targetChainId === 'bsc' ? 'bnb-mainnet' : config.targetChainId; // Add more mappings if needed

    // --- 1. Attempt to fetch current price from Alchemy ---
    if (ALCHEMY_API_KEY) {
        try {
            console.log(`Attempting to fetch current price from Alchemy for ${targetTokenSymbol}...`);
            const alchemyResponse = await axios.post(
                `${ALCHEMY_PRICES_BASE_URL}/${ALCHEMY_API_KEY}/tokens/by-address`,
                {
                    addresses: [{ network: alchemyNetwork, address: targetTokenAddress }]
                },
                { timeout: 10000 }
            );



            const responseData = alchemyResponse.data?.data;

            if (Array.isArray(responseData) && responseData.length > 0) {
                const tokenEntry = responseData[0];
                const usdPriceObj = tokenEntry.prices?.find(p => p.currency.toLowerCase() === 'usd');

                if (usdPriceObj && usdPriceObj.value) {
                    currentPriceFinal = safeParseFloat(usdPriceObj.value);
                    console.log(`Current price fetched from Alchemy for ${targetTokenSymbol}: ${currentPriceFinal}`);
                } else {
                    console.warn(`Alchemy did not return USD price data for ${targetTokenSymbol}.`);
                }
            } else {
                console.warn(`Alchemy response missing 'data' array or is empty for ${targetTokenSymbol}.`);
            }
        } catch (alchemyError) {
            console.error(`Alchemy current price fetch failed for ${targetTokenSymbol}:`, alchemyError.message);
        }
    } else {
        console.warn('ALCHEMY_API_KEY is not set. Skipping Alchemy current price fetch.');
    }

    // --- STRICT CONDITION: If current price is not obtained from Alchemy, stop here ---
    if (currentPriceFinal === null) {
        console.error(`Alchemy failed to get current price for ${targetTokenSymbol}. Skipping further data fetches.`);
        return null;
    }


    if (ALCHEMY_API_KEY) {
        try {
            console.log(`Attempting to fetch historical prices from Alchemy for ${targetTokenSymbol} (last ${HISTORICAL_DATA_DAYS} days)...`);
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - HISTORICAL_DATA_DAYS);

            const alchemyHistoricalResponse = await axios.post(
                `${ALCHEMY_HISTORICAL_PRICES_BASE_URL}/${ALCHEMY_API_KEY}/tokens/historical`,
                {

                    network: alchemyNetwork,
                    address: targetTokenAddress,
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString()
                },
                { timeout: 15000 }
            );
            

            const responseData = alchemyHistoricalResponse.data?.data;

            if (Array.isArray(responseData)) {
                historicalPrices = responseData.map(p => ({
                    price: safeParseFloat(p.value),
                    timestamp: new Date(p.timestamp)
                })).filter(p => p.price !== null);

                historicalPrices.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

                console.log(`Fetched ${historicalPrices.length} historical price points from Alchemy for ${targetTokenSymbol}.`);
            } else {
                console.warn(`Alchemy did not return valid historical price data array for ${targetTokenSymbol}.`);
            }
        } catch (alchemyHistoricalError) {
            console.error(`Alchemy historical price fetch failed for ${targetTokenSymbol}:`, alchemyHistoricalError.message);
        }
    }



    // --- 3. Attempt to fetch pair info, volume, and liquidity from Dexscreener ---
    // This is attempted ONLY if Alchemy successfully provided a current price.
    try {
        console.log(`Attempting to fetch pair info, volume, and liquidity from Dexscreener for ${targetTokenSymbol}...`);
        const response = await axios.get(
            `${DEXSCREENER_TOKEN_PAIRS_BASE_URL}/${targetTokenAddress}`,
            { timeout: 10000 }
        );

        // if (dexscreenerResponse.data && dexscreenerResponse.data.pairs && dexscreenerResponse.data.pairs.length > 0) {
        //     // Filter for PancakeSwap pairs with WBNB as the preferred quote token
        //    const pancakeswapWBNBPairs = response.data.filter(pair => {
        //                    const isPancakeSwap = pair.dexId && pair.dexId.toLowerCase() === 'pancakeswap';
        //                    const isWBNBQuote = pair.quoteToken?.symbol?.toUpperCase() === 'WBNB';
        //                    const isCorrectWBNBAddress = pair.quoteToken?.address?.toLowerCase() === config.quoteTokenMap.WBNB.toLowerCase();
           
        //                    return isPancakeSwap && isWBNBQuote && isCorrectWBNBAddress;
        //                });
           

        //     if (pancakeswapWBNBPairs.length > 0) {
        //         // Sort by liquidity (USD) to prioritize the most liquid pair
        //         const mostLiquidPair = pancakeswapWBNBPairs.sort((a, b) => {
        //             const liquidityA = safeParseFloat(a.liquidity?.usd || 0);
        //             const liquidityB = safeParseFloat(b.liquidity?.usd || 0);
        //             return liquidityB - liquidityA;
        //         })[0];

        //         fetchedPairDetails = mostLiquidPair; // Store the selected Dexscreener pair

        //         // Populate volume and liquidity
        //         currentVolumeFinal = safeParseFloat(fetchedPairDetails.volume?.h24);
        //         currentLiquidityFinal = safeParseFloat(fetchedPairDetails.liquidity?.usd);
        //         console.log(`Volume and Liquidity fetched from Dexscreener for ${targetTokenSymbol}.`);

        //     } else {
        //         console.warn(`No suitable PancakeSwap WBNB pair found on Dexscreener for ${targetTokenSymbol}.`);
        //     }
        // } else {
        //     console.warn(`Dexscreener did not return pair data for ${targetTokenSymbol}.`);
        // }

        if (!response.data || response.data.length === 0) {
            console.warn(`No pairs found on Dexscreener for token address: ${targetTokenAddress}`);
            return null;
            }

            
                const pancakeswapWBNBPairs = response.data.filter(pair => {
                const isPancakeSwap = pair.dexId && pair.dexId.toLowerCase() === 'pancakeswap';
                const isWBNBQuote = pair.quoteToken?.symbol?.toUpperCase() === 'WBNB';
                const isCorrectWBNBAddress = pair.quoteToken?.address?.toLowerCase() === config.quoteTokenMap.WBNB.toLowerCase();

                return isPancakeSwap && isWBNBQuote && isCorrectWBNBAddress;
            });

            if (pancakeswapWBNBPairs.length === 0) {
                console.warn(`No PancakeSwap WBNB pairs found for token address: ${targetTokenAddress}`);
                return null;
            }

             const mostLiquidPair = pancakeswapWBNBPairs.sort((a, b) => {
                const liquidityA = safeParseFloat(a.liquidity?.usd || 0);
                const liquidityB = safeParseFloat(b.liquidity?.usd || 0);
                return liquidityB - liquidityA;
            })[0];

            fetchedPairDetails = mostLiquidPair; // Store the selected Dexscreener pair

            currentVolumeFinal = safeParseFloat(fetchedPairDetails.volume?.h24) || null;
            currentLiquidityFinal = safeParseFloat(fetchedPairDetails.liquidity?.usd) || null;



    } catch (dexscreenerError) {
        console.error(`Dexscreener fetch failed for ${targetTokenSymbol}:`, dexscreenerError.message);
    }

    // --- 4. Attempt to fetch volume and liquidity from Subgraph (if needed) ---
    // This runs ONLY if we successfully identified a pair from Dexscreener AND
    // Alchemy provided a price, but volume/liquidity are still missing.
    if (fetchedPairDetails && (currentVolumeFinal === null || currentLiquidityFinal === null) && THEGRAPH_API_KEY) {
        try {
            console.log(`Attempting to fetch volume/liquidity from Subgraph for ${targetTokenSymbol}...`);
            const subgraphResponse = await request({
                url: PANCAKESWAP_V3_SUBGRAPH_URL,
                document: GET_PAIR_DATA_QUERY,
                variables: { pairAddress: fetchedPairDetails.pairAddress.toLowerCase() }, // Subgraph IDs are often lowercase
                requestHeaders: SUBGRAPH_HEADERS
            });

            if (subgraphResponse.pool) {
                if (currentVolumeFinal === null && subgraphResponse.pool.volumeUSD) {
                    currentVolumeFinal = safeParseFloat(subgraphResponse.pool.volumeUSD);
                    console.log(`Volume fetched from Subgraph for ${targetTokenSymbol}: ${currentVolumeFinal}`);
                }
                if (currentLiquidityFinal === null && subgraphResponse.pool.totalValueLockedUSD) {
                    currentLiquidityFinal = safeParseFloat(subgraphResponse.pool.totalValueLockedUSD);
                    console.log(`Liquidity fetched from Subgraph for ${targetTokenSymbol}: ${currentLiquidityFinal}`);
                }
            } else {
                console.warn(`Subgraph did not return pool data for ${fetchedPairDetails.pairAddress}.`);
            }
        } catch (subgraphError) {
            console.error(`Subgraph fetch failed for ${targetTokenSymbol}:`, subgraphError.message);
        }
    } else if (!THEGRAPH_API_KEY && fetchedPairDetails && (currentVolumeFinal === null || currentLiquidityFinal === null)) {
        console.warn('SUBGRAPH_API_KEY is not set. Skipping Subgraph fallback for volume/liquidity.');
    }

    // --- Construct the final marketData object if essential data is available ---
    // The strict condition `currentPriceFinal !== null` is already handled at the start.
    if (fetchedPairDetails) {
        const marketData = {
            pairAddress: fetchedPairDetails.pairAddress,
            chainId: fetchedPairDetails.chainId,
            pairName: `${fetchedPairDetails.baseToken.symbol}/${fetchedPairDetails.quoteToken.symbol}`,
            baseToken: { address: fetchedPairDetails.baseToken.address, symbol: fetchedPairDetails.baseToken.symbol },
            quoteToken: { address: fetchedPairDetails.quoteToken.address, symbol: fetchedPairDetails.quoteToken.symbol },
            currentPrice: currentPriceFinal, // Guaranteed to be not null due to early exit condition
            currentVolume: currentVolumeFinal,
            currentLiquidity: currentLiquidityFinal,
            historicalPrices: historicalPrices, // Now populated with Alchemy data
        };
        console.log(`Final market data compiled for ${targetTokenSymbol}.`);
        return marketData;
    } else {
        console.error(`Could not find suitable pair details for ${targetTokenSymbol} after Dexscreener and Subgraph attempts.`);
        return null;
    }
}