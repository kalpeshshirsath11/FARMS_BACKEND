const { ItemAssignmentContextImpl } = require("twilio/lib/rest/numbers/v2/regulatoryCompliance/bundle/itemAssignment");
const { upload } = require("../middlewares/multer.middleware.js");
const FarmerStock = require("../models/FarmerStock.js");
const { uploadOnCloudinary } = require("../utils/uploadToCloudinary.js");
const TransporterDemand = require('../models/TransportRequirements.js')
const retailerDemands = require("../models/RetailerRequirements.js")
const {getCoordinates} = require("../services/geocodingService.js")
const {calculateByRoadDistance} = require("../services/distanceCalculator.js")

require("dotenv").config();

exports.postStock = async (req, res) => {
   try{
    const {cropname, cropgrade, quantity, location} = req.body;  //location should be comma separated village,taluka,district
   
    const farmerDetails = req.user;

    if(!cropname || !cropgrade || !quantity  ){
        return res.status(400).json({
            success:false,
            message:"All fields are required to post stock"
        });
    }

    const quantityValue = Number(quantity);
    if (quantityValue <= 0) {
        return res.status(400).json({
            success: false,
            message: "Quantity must be a positive number",
        });
    }

    const image = req.file.path;
    if(!image){
        return res.json({errr:"Image is required"})
    }

    const uploadedImage = await uploadOnCloudinary(image);
    if (!uploadedImage || !uploadedImage.secure_url) {
        return res.status(500).json({
            success: false,
            message: "Failed to upload crop image to Cloudinary",
        });
    }

    const locationcoordinates = await getCoordinates(location);
    if (!locationcoordinates || locationcoordinates.length !== 2) {
      return res.status(400).json({
        success: false,
        message: "Invalid location. Unable to retrieve coordinates.",
      });
    }
    console.log(locationcoordinates);

    const newStock = await FarmerStock.create({
        userId: farmerDetails._id,
        crop: cropname, 
        cropGrade: cropgrade,
        quantity: quantity,
        image: uploadedImage.secure_url,
        location: {
            type:"Point",
            address:location,
            coordinates:locationcoordinates
        }
    });

    return res.status(200).json({
        success: true,
        stock:newStock,
        message: "Stock posted successfully!",
    });
   } catch(error){
    console.log(error);
    return res.status(500).json({
        success: false,
        message: "Error in posting stock",
    });
   }
};


exports.viewMyStock = async (req, res) => {
    try {
        const farmerDetails = req.user;
        const farmerId = farmerDetails._id;

        const myStock = await FarmerStock.find({ userId: farmerId }).sort({createdAt: -1});  //newest first

        if (!myStock || myStock.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No stocks posted yet.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Farmer stocks fetched successfully.",
            stocks: myStock, 
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Error in fetching stocks posted by farmer.",
        });
    }
};


//MASTER STROKE !
exports.viewBestDeals = async(req, res) => {
    try{
        const {crop, cropgrade, quantity, location} = req.body;  //quantity is qty of stock posted by farmer, location is a string

        if(!crop || !cropgrade || !quantity || !location){
            return res.status(400).json({
                success:false,
                message:"To view best deals, crop, cropgrade, quantity, location are required fields"
            })
        }

        const matchedDemands = await retailerDemands.find({crop:crop, cropGrade:cropgrade});
        if(matchedDemands.length === 0){
            return res.status(404).json({
                success:false,
                message:"No matches found for the uploaded crop. Please try again later."
            })
        }

        const k1 = 0.7, k2 = 0.15, k3 = 0.15;

        const demandsWithScores = await Promise.all(
            matchedDemands.map(async (demand) => {
                const populatedDemand = await demand.populate('userId', 'averageRating');
               

                const priceOffered = populatedDemand.pricePerQuintal;
                const retailerRating = populatedDemand.userId.averageRating;
                const retailerLocation = populatedDemand.location.address;
                

                const distance = await calculateByRoadDistance(retailerLocation, location);
                
                //temporary - 7rs per km
                const profitMargin = (priceOffered * quantity) - (distance * 7);

                const dealScore = parseFloat(
                    (k1 * profitMargin - k2 * distance + k3 * retailerRating).toFixed(2)
                );


                //Return an object for every demand. Array of objects will be created.
                return { demand: populatedDemand, dealScore };
            })
        );
        
        demandsWithScores.sort((a,b) => {
            return b.dealScore - a.dealScore;
        })

        return res.status(200).json({
            success:true,
            message:"Checkout the MOST PROFITABLE DEALS for your crop !",
            demandsWithScores
        })
    } catch(error){
        console.error(error);
        return res.status(500).json({
            success:false,
            message:"Error in finding the best deals."
        })
    }
}


exports.requestTransport = async(req,res)=>{
    //middlewares will check for is farmer uploading or authenticated
    //then farmer will provide information of crop
    //validate user information then upload it to database
    const {departLocation,deliveryLocation,dateOfJourney,capacity} = req.body;
    if(!departLocation || !deliveryLocation || !dateOfJourney || !capacity){
        return res.status(402).json({
            success: false,
            message: "please provide all Information ",

        })
    }
    const farmerDetails = req.user;
    if(!farmerDetails){
        return res.status(402).json({
            message:"farmer doesnt exist",
            success:"false",
        })
    }
    const FarmRequest = await TransporterDemand.create({
        departLocation,
        deliveryLocation,
        dateOfJourney,
        capacity,
        userId:farmerDetails._id
    })

    if(!FarmRequest){
        return res.status(402).json({
            success:false,
            message:"Error in uploading to database",
        })
    }
    return res.status(201).json({
        requestTransport:FarmRequest,
        success:true,
        message:"requestes successfully"
    })

}
