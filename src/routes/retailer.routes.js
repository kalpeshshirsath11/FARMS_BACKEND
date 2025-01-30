const {getStock} = require('../controllers/RetailerOperations.controller.js')
const express = require("express")
const router = express.Router();
exports.router = router;
// const {authorize,isRetailer} = require('../middlewares/auth.js')
const {postRequirement} = require("../controllers/RetailerOperations.controller.js")
const {createReview, getReviews, updateRating, editComment, deleteReview} = require('../controllers/RatingReviewOperations.js')

const {viewNotifications, acceptSupplyRequest, declineSupplyRequest, viewMyOrders,viewPendingRequests, viewSuppliersOfOrder, acceptSupplyRequestFromMyOrders, declineSupplyRequestFromMyOrders} = require("../controllers/RetailerOperations.controller.js")
const {deleteNotification,viewBestFarmerOffers,requestFarmersCrop} = require("../controllers/RetailerOperations.controller.js");



router.post('/postrequirement', postRequirement);  
router.get('/notifications', viewNotifications)  
router.get('/acceptsupplyrequest', acceptSupplyRequest)  
router.get('/declinesupplyrequest', declineSupplyRequest)  
router.get('/viewmyorders', viewMyOrders)  
router.get('/viewpendingrequests', viewPendingRequests)  
router.get('/viewsuppliers', viewSuppliersOfOrder)  
router.get('/acceptsupplyrequestfromorders', acceptSupplyRequestFromMyOrders)  
router.get('/declinesupplyrequestfromorders', declineSupplyRequestFromMyOrders)
router.post('/deletenotification', deleteNotification);  
router.post('/viewbestfarmeroffers', viewBestFarmerOffers); 
router.post('/requestfarmerscrop', requestFarmersCrop); 

// router.get('/getstock',getStock);
router.post('/createreview',  createReview);
router.post('/updaterating',  updateRating);
router.post('/editcomment',  editComment);
router.post('/deletereview', deleteReview);
router.get('/getreviews', getReviews);

module.exports = router