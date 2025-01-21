// const {getStock} = require('../controllers/retailer.controller.js')
const express = require("express")
const router = express.Router();
const {getRequest} = require("../controllers/transporter.controller.js")
const {getReviews} = require('../controllers/RatingReviewOperations.js')


router.get('/getinfo',getRequest);
router.get('/getreviews', getReviews);

module.exports = router

