const express = require("express")
const router = express.Router();
const {signUpUser,verifyOtp,loginUser,logoutUser} = require("../controllers/user.controller.js")

router.post("/signin",signUpUser);
router.post("/verifyOtp",verifyOtp);
router.post("/login",loginUser);
router.post("/logOut",logoutUser);

module.exports = router