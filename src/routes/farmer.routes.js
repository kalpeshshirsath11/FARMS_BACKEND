const express = require("express")
const {upload} = require("../middlewares/multer.middleware.js")
const router = express.Router();
const {postStock} = require('../controllers/PostStock.controller.js')
// const {postStock} = require('../controllers/PostStock.controller.js')
// const { upload }= require('../middlewares/multer.middleware.js')
const {authorize,isFarmer} = require('../middlewares/auth.js')
const {createReview, getReviews, updateRating, editComment, deleteReview} = require('../controllers/RatingReviewOperations.js')


router.post('/poststock',upload.single("cropImage"),postStock);
// router.post('/reqtransporter',)
router.post('/createreview', createReview);
router.post('/updaterating', updateRating);
router.post('/editcomment',  editComment);
router.post('/deletereview', deleteReview);
router.get('/getreviews', getReviews);

module.exports = router