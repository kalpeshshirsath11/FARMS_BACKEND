// const {getStock} = require('../controllers/retailer.controller.js')
const express = require("express")
const Router = express.Router();
const {getRequest} = require("../controllers/transporter.controller.js")

Router.get('/getinfo',getRequest);
module.exports = Router

