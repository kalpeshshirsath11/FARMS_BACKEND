const  FarmerStock = require("../models/FarmerStock.js")

const Transporter = require("../models/TransportRequirements.js");

const getRequest  = async(req,res)=>{
    //get all farmers who want to being transported
    
    const FarmerData = await Transporter.find({});
    console.log(FarmerData);
    return res.status(200).json(FarmerData);
}
module.exports = {getRequest}