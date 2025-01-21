const {getStock} = require('../controllers/retailer.controller.js')
const express = require("express")
const router = express.Router();
const {authorize,isRetailer} = require('../middlewares/auth.js')
const {createReview, getReviews, updateRating, editComment, deleteReview} = require('../controllers/RatingReviewOperations.js')


router.get('/getstock',getStock);
router.post('/createreview',  createReview);
router.post('/updaterating',  updateRating);
router.post('/editcomment',  editComment);
router.post('/deletereview', deleteReview);
router.get('/getreviews', getReviews);

module.exports = router