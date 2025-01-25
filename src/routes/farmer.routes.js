const express = require("express")
const {upload} = require("../middlewares/multer.middleware.js")
const router = express.Router();
// const {postStock} = require('../controllers/PostStock.controller.js')?
const {requestTransport,tranportReqfarmer,reqFarmer} = require('../controllers/FarmerTransport.controller.js')
// const {postStock} = require('../controllers/PostStock.controller.js')
// const { upload }= require('../middlewares/multer.middleware.js')
const {postStock} = require('../controllers/FarmerOperations.controller.js')
const {viewBestDeals, viewBestDealsInRange} = require("../controllers/FarmerOperations.controller.js")
const {viewMyStock} = require("../controllers/FarmerOperations.controller.js")

const {authorize,isFarmer} = require('../middlewares/auth.js')
const {createReview, getReviews, updateRating, editComment, deleteReview} = require('../controllers/RatingReviewOperations.js')


// router.post('/poststock',upload.single("cropImage"),postStock);
router.post('/reqtransporter',requestTransport);
router.get('/farmerRequest',tranportReqfarmer);
router.post('/sendrequest',reqFarmer);


router.post('/poststock',upload.single("cropImage"),postStock);
router.post('/viewbestdeals', viewBestDeals);
router.post('/viewbestdealsinrange', viewBestDealsInRange);
router.post('/mystock', viewMyStock);

router.post('/createreview', createReview);
router.post('/updaterating', updateRating);
router.post('/editcomment',  editComment);
router.post('/deletereview', deleteReview);
router.get('/getreviews', getReviews);


module.exports = router