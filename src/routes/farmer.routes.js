const express = require("express")
const {upload} = require("../middlewares/multer.middleware.js")
const router = express.Router();
const {postStock} = require('../controllers/PostStock.controller.js')
// const {postStock} = require('../controllers/PostStock.controller.js')
// const { upload }= require('../middlewares/multer.middleware.js')
const {authorize,isFarmer} = require('../middlewares/auth.js')

router.post('/poststock',authorize,isFarmer,upload.single("cropImage"),postStock);
router.post('/reqtransporter',)

module.exports = router