const {getStock} = require('../controllers/retailer.controller.js')
const express = require("express")
const Router = express.Router();
const {authorize,isRetailer} = require('../middlewares/auth.js')
Router.get('/getstock',authorize,isRetailer,getStock);

module.exports = Router