const RetailerRequirements = require("../models/RetailerRequirements")
const {getCoordinates} = require("../services/geocodingService.js")
const FarmerStock = require('../models/FarmerStock.js')

exports.postRequirement = async (req, res) => {    
    try{
        const {crop, cropgrade, quantity, price, location} = req.body;
        const retailerID = req.user._id;

        if(!crop || !cropgrade || !quantity || !price || !location){
            return res.status(400).json({
                success:false,
                message:"All fields are required for posting crop requirements."
            })
        }

        if(quantity <= 0){
            return res.status(400).json({
                success:false,
                message:"Quantity cannot be negative or zero."
            })
        }

        if (price <= 0) {
            return res.status(400).json({
              success: false,
              message: "Price per quintal must be a positive value.",
            });
          }

        const locationcoordinates = await getCoordinates(location);
        const longi = locationcoordinates.lon;
        const lati = locationcoordinates.lat;
        // console.log(locationcoordinates);
        if (!locationcoordinates) {
        return res.status(400).json({
            success: false,
            message: "Invalid location. Unable to retrieve coordinates.",
        });
        }

        const newRequirement = await RetailerRequirements.create({
            userId:retailerID,
            crop:crop,
            cropGrade:cropgrade,
            pricePerQuintal:price,
            quantity:quantity,
            location:{
                type:"Point",
                address:location,
                coordinates:[longi, lati]
            }
        });

        return res.status(200).json({
            success:true,
            message:"Your crop requirement has been posted successfully.",
            newRequirement
        })        
    }
    catch(error){
        console.error(error);
        return res.status(500).json({
            success:false,
            message:"An error occured while posting stock requirement."
        })
    }
}


exports.getStock = async(req,res)=>{
    //1.check for authentication and is user retailer using middleweres
    //2. get all stocks from poststock database
    //3.only send usaefull data to a retailer
    const StockData = await FarmerStock.find({});
    return res.status(201).json({
        StockData
    })
}
