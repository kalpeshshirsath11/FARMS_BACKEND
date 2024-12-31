const User = require("../models/User.models.js");
const twilio = require("twilio");
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")
let otpStore = "";
let user1 = {};
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const signUpUser = async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            contactNumber,
            accountType,
            password,
            additionalDetails,
            profilePhoto,
        } = req.body;

        // Check if required fields are provided
        if (!contactNumber || !password) {
            return res.status(400).json({ error: "Contact number and password are required" });
        }

        // Check if the user already exists
        const existedUser = await User.findOne({ contactNumber });
        if (existedUser) {
            return res.status(409).json({ error: "User already exists" });
        }

        const otp = Math.floor(1000 + Math.random() * 9000); // 4-digit OTP
        console.log(`Generated OTP for ${contactNumber}: ${otp}`);

        // otp stored for further use in verification
        otpStore = otp;
        const e_password = await bcrypt.hash(password,10);

        // Send OTP via Twilio
        await client.messages.create({
            from: "+12316133627", 
            to: contactNumber,
            body: `Your OTP is ${otp}`,
        });

        user1 = {
            firstName,
            lastName,
            contactNumber,
            accountType,
            password:e_password,
            // additionalDetails: additionalDetails || "",
            profilePhoto: profilePhoto || ""
        };

        console.log(user1);
        res.status(200).json({ user: user1 });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;

        

        // otp comparison here
        if (otp && otp === otpStore.toString()) {
           
            otpStore = "" // Clear OTP 
            const user2 = await User.create(user1);
            user1 = {};
            return res.status(201).json(user2);
        } else {
            return res.status(401).json({ error: "Invalid OTP" });
        }
    } catch (err) {
        console.error("Error in verifyOtp:", err);
        return res.status(500).json({ error: "Internal Server Error(probably in database )" });
    }
};

const loginUser = async(req,res)=>{
    const {contactNumber,password} = req.body;

    const user = await User.findOne({contactNumber:contactNumber});
    if(!user){
        return res.json({err:"user not find during login"})
    }
    const flag = await bcrypt.compare(password,user.password); 
    if(!flag){
        return res.json({err:"Error occured during login"});
    }
    const token = await jwt.sign({
        _id:user._id,
        contactNumber:user.contactNumber

    },
    process.env.TOKEN_SECRET,
    {
        expiresIn:process.env.TOKEN_EXPIRY
    }
);
if(!token){
    res.json({err:"problem in token generation"});
}
return res.status(200).cookie("Token",token).json({token:token});


}

const logoutUser = (req, res) => {
    const token = req.cookies.Token; // Corrected syntax to access the cookie
    if (!token) {
        return res.status(400).json({ err: "There is no token" }); // Added status code and fixed typo
    }
    // Clear the cookie and send response
    return res
        .status(200)
        .clearCookie("Token") // Clearing the cookie by name
        .json({ message: "Token deleted" });
};



module.exports = { signUpUser, verifyOtp, loginUser,logoutUser};