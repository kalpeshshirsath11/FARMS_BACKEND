const jwt = require("jsonwebtoken");
const User = require("../models/User.models.js");

const otpStore = {};

// Load Twilio credentials from environment variables


// Middleware to verify JWT
const verifyJwt = async (req, res, next) => {
    try {
        const token = req.cookies?.accessToken; // Ensure you have cookie-parser middleware
        if (!token) {
            return res.status(401).json({ error: "Token not provided" });
        }

        const decodedToken = await jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const user = await User.findById(decodedToken?._id);

        if (!user) {
            return res.status(401).json({ error: "Invalid token" });
        }

        req.user = user; // Attach user to the request for further use
        next();
    } catch (err) {
        console.error("Error in verifyJwt:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};



module.exports = { verifyJwt };
