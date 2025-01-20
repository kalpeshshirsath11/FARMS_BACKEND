const express = require('express');

const {upload} = require("../middlewares/multer.middleware.js")
const router = express.Router();
const {signUpUser,verifyOtp,loginUser,logoutUser} = require("../controllers/user.controller.js")
const { otpRateLimiter } = require("../middlewares/rateLimiter.js");
const {validateInput} = require("../middlewares/validateInput.js")
// const {validatePassword} = require("../middlewares/validatePassword.js")
const {poststock} = require("../controllers/PostStock.js")
const {authorize, isFarmer} = require("../middlewares/auth.js")
const { calculateByRoadDistance } = require('../controllers/distanceCalculator.js');

const {createReview, getReviews, updateRating, editComment, deleteReview} = require('../controllers/RatingReviewOperations.js')


router.post("/signup",validateInput,upload.single("profile") , signUpUser);
// router.post("/signup", otpRateLimiter, validateInput, upload.single("profilePhoto"), validatePassword, signUpUser);
router.post("/verifyOtp",verifyOtp);
router.post("/login",validateInput, loginUser);
router.post("/logOut",logoutUser);
// router.post("/farmer/poststock", authorize, isFarmer, poststock)   //Some issue here
router.post("/byroad-distance", calculateByRoadDistance)
router.post("/createReview", createReview);

module.exports = router;