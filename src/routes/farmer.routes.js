const express = require("express")
const {upload} = require("../middlewares/multer.middleware.js")
const router = express.Router();
// const {postStock} = require('../controllers/PostStock.controller.js')?
const {requestTransport,tranportReqfarmer,reqFarmer,getNotifications, acceptRequest} = require('../controllers/FarmerTransport.controller.js')
// const {postStock} = require('../controllers/PostStock.controller.js')
// const { upload }= require('../middlewares/multer.middleware.js')
const {postStock} = require('../controllers/FarmerOperations.controller.js')
const {viewBestDeals, viewBestDealsInRange, requestSupply} = require("../controllers/FarmerOperations.controller.js")

const {authorize,isFarmer} = require('../middlewares/auth.js')
const {createReview, getReviews, updateRating, editComment, deleteReview} = require('../controllers/RatingReviewOperations.js')

const {viewFarmerNotifications,acceptRetailerRequest,declineRetailerRequest,viewMyStock,viewPendingRetailerRequests,viewConfirmedRetailer,acceptRetailerRequestFromMyOrders,declineRetailerRequestFromMyOrders} = require("../controllers/FarmerOperations.controller.js")

const {deleteNotification} = require("../controllers/RetailerOperations.controller.js");


// router.post('/poststock',upload.single("cropImage"),postStock);
router.post('/reqtransporter',requestTransport);
router.get('/farmerRequest',tranportReqfarmer);
router.post('/acceptInvite',acceptRequest)
router.post('/sendrequest',reqFarmer);
router.get('/getNotify',getNotifications);


router.post('/poststock',upload.single("cropImage"),postStock);
router.post('/viewbestdeals', viewBestDeals);
router.post('/viewbestdealsinrange', viewBestDealsInRange);
router.get('/mystock', viewMyStock);  
router.post('/requestsupply', requestSupply);

router.get('/notifications', viewFarmerNotifications);  
router.get('/acceptretailerrequest', acceptRetailerRequest);  
router.get('/declineretailerrequest', declineRetailerRequest);  
router.get('/pendingretailerrequests', viewPendingRetailerRequests);  
router.get('/confirmedretailer', viewConfirmedRetailer);  
router.get('/acceptretailerrequestfromorders', acceptRetailerRequestFromMyOrders);  
router.get('/declineretailerrequestfromorders', declineRetailerRequestFromMyOrders);  
router.post('/deletenotification', deleteNotification);  


router.post('/createreview', createReview);
router.post('/updaterating', updateRating);
router.post('/editcomment',  editComment);
router.post('/deletereview', deleteReview);
router.get('/getreviews', getReviews);


module.exports = router