const express = require('express');
const axios = require('axios');
const cors = require('cors');
const redis = require('redis');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Redis Client Configuration
const redisClient = redis.createClient({
    url: process.env.REDIS_URL,
    password: process.env.REDIS_PASSWORD,
});

redisClient.on('error', (err) => console.error('[Redis Log] Error:', err));
redisClient.connect().then(() => console.log('[Redis Log] Connected to Redis'));

// Function to get API configuration based on the environment
function getEnvironmentConfig(environment) {
    const isProduction = environment === 'production';

    return {
        API_URL: isProduction
            ? 'https://lobby-service.petros04.com/api/v2/tables/online'
            : 'https://lobby-service.stage.beter.live/api/v2/tables/online',
        X_REQUEST_SIGN: isProduction
            ? '5e2a1a01dd36a23405c767083a9ce93ef4be29e4945326132fb7bc3493a34ef7'
            : '577bec6c6e93272cdc8793b722dd38c909dd477544b487a00ea1e6f5f6798064',
        environment,
    };
}

// Proxy endpoint
app.post('/api/casino-live', async (req, res) => {
    const clientEnvironment = req.headers['x-environment'] || 'development'; // Default to 'development'
    const { API_URL, X_REQUEST_SIGN, environment } = getEnvironmentConfig(clientEnvironment);

    console.log('[Debug Log] Received Environment:', clientEnvironment);
    console.log('[Debug Log] Resolved Environment:', environment);
    console.log('[Debug Log] API_URL:', API_URL);
    console.log('[Debug Log] X_REQUEST_SIGN:', X_REQUEST_SIGN);

    const requestBody = {
        casino: 'wowvegas',
        currencies: ['WOC', 'VBC'],
    };

    const headers = {
        'X-REQUEST-SIGN': X_REQUEST_SIGN,
        'Content-Type': 'application/json',
    };

    const cacheKey = `casinoLive:${environment}`;

    try {
        // Check Redis cache
        const cachedData = await redisClient.get(cacheKey);

        if (cachedData) {
            console.log('[Redis Log] Cache hit for key:', cacheKey);
            return res.json(JSON.parse(cachedData));
        }

        console.log('[Redis Log] Cache miss for key:', cacheKey);

        // Fetch data from API
        const response = await axios.post(API_URL, JSON.stringify(requestBody), { headers });

        console.log('[Debug Log] API Response Status:', response.status);

        // Cache the response in Redis
        await redisClient.set(cacheKey, JSON.stringify(response.data), { EX: 10 });

        res.status(response.status).json(response.data);
    } catch (error) {
        console.error('[Debug Log] API Request Failed:', error.message);

        if (error.response) {
            console.error('[Debug Log] API Error Response:', error.response.data);
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(500).json({ error: 'Failed to fetch data from API' });
        }
    }
});

if (process.env.NODE_ENV !== 'production') {
    const PORT = 8081;
    app.listen(PORT, () => console.log(`Proxy server running on http://localhost:${PORT}`));
}

module.exports = app;
