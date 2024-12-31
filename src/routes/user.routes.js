const express = require("express")
const router = express.Router();
const {signUpUser,verifyOtp} = require("../controllers/user.controller.js")

router.post("/signin",signUpUser);
router.post("/verifyOtp",verifyOtp);

module.exports = router