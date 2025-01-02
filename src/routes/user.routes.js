const express = require("express")
const router = express.Router();
const {signUpUser,verifyOtp,loginUser,logoutUser} = require("../controllers/user.controller.js")
const { otpRateLimiter } = require("../middlewares/rateLimiter");
const {validateInput} = require("../middlewares/validateInput.js")
const {validatePassword} = require("../middlewares/validatePassword.js")

router.post("/signup", otpRateLimiter,validateInput,validatePassword , signUpUser);
router.post("/verifyOtp",verifyOtp);
router.post("/login",validateInput, loginUser);
router.post("/logOut",logoutUser);

module.exports = router