// ecosystem.config.js
module.exports = {
  apps : [{
    name   : "pancakeswapsignal",
    script : "./index.js",
    instances: 1, // Or 'max' for all available CPU cores
    autorestart: true,
    watch: false, // Set to true for development, false for production
    max_memory_restart: '4G', // Restart if memory exceeds 1GB
    env: {
      NODE_ENV: "production",
      PORT: 3020, // Or whatever port is in your config/default.json
      MONGODB_URI: "mongodb://localhost:27017/secure_bot", // <-- REPLACE THIS
      SUBGRAPH_API_KEY: "d389ab06d04a5de3f0115d9a4da59fe8",     // <-- REPLACE THIS
      FRONTEND_VERCEL_URL: "https://pancakeswapfront.vercel.app",
      ALCHEMY_API_KEY:"tJBRXMfo8dezfBWD7VlWB",
      MORALIS_API_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjFmY2U2ODRhLTU5YzAtNDUxOS04ZmM0LWNjOGZmM2RiY2EyZiIsIm9yZ0lkIjoiNDU5MDcwIiwidXNlcklkIjoiNDcyMzAwIiwidHlwZUlkIjoiNGU3OTdjMDAtYWYwYy00NjZhLTllYmUtY2E0NWZiNDAxMTcyIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NTIzOTMzNzksImV4cCI6NDkwODE1MzM3OX0.TVMkSduBlKW1jwDsNN27QKgj0gURVCBV97qtjgL1yvc" 
    }
  }]
};
