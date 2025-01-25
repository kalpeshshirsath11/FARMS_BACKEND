// const {getStock} = require('../controllers/retailer.controller.js')
const express = require("express")
const router = express.Router();
const {requstStatusfunction} = require("../controllers/transporter.controller.js")
const {getReviews} = require('../controllers/RatingReviewOperations.js')
const {getRequest} = require('../controllers/transporter.controller.js')


router.get('/getinfo',getRequest);
// router.get('/getreviews', getReviews);
router.post('/confirmRequest',requstStatusfunction);

module.exports = router 

